import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, initDatabase, seedDatabase, recalculateAccountBalances, syncAccountWithBill, syncAllAccountsWithBills, reloadDatabase } from './db.js';
import { isCreditCardPayment, syncCreditCardPaymentToChecking, deleteLinkedCheckingTransaction } from './creditCardSync.js';
import {
  createTarballBackup,
  listTarballBackups,
  restoreTarballBackup,
  deleteTarballBackup,
  getTarballPath,
  initDailyBackupScheduler,
  backupDir,
  inspectExternalFile,
  restoreFromExternalFile,
  cleanupStagingFiles
} from './backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Prevent caching on all API endpoints so updates take effect immediately
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Initialize DB schema and seed if necessary
initDatabase();
recalculateAccountBalances();
initDailyBackupScheduler(() => db);

// --- Health Check ---
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString(), mascot: '🌸' });
});

// Helper: Calculate monthly sinking funds contribution target combining annual and biannual items
export function calculateMonthlySinkingFundsTotal(annualBills: Array<{ amount: number; frequency?: string; name?: string }>): number {
  if (!annualBills || annualBills.length === 0) return 0;
  
  // 1. Annual bills: amount / 12
  const annuals = annualBills.filter(b => (b.frequency || 'annual') === 'annual');
  const annualMonthly = annuals.reduce((sum, b) => sum + (Number(b.amount) || 0) / 12, 0);

  // 2. Biannual bills:
  // If scheduled installments exist in a 1-year window (e.g. Liberty Mutual Aug & Feb), annual sum / 12 ($218.50).
  // If single 6-month installment entered, amount / 6 ($218.50).
  const biannuals = annualBills.filter(b => b.frequency === 'biannual');
  const biannualGroups: Record<string, number[]> = {};
  for (const b of biannuals) {
    const baseName = (b.name || '').replace(/\s*\([^)]*\)\s*$/g, '').trim().toLowerCase();
    if (!biannualGroups[baseName]) biannualGroups[baseName] = [];
    biannualGroups[baseName].push(Number(b.amount) || 0);
  }

  let biannualMonthly = 0;
  for (const amounts of Object.values(biannualGroups)) {
    if (amounts.length >= 2) {
      biannualMonthly += amounts.reduce((a, c) => a + c, 0) / 12;
    } else if (amounts.length === 1) {
      biannualMonthly += amounts[0] / 6;
    }
  }

  // 3. Other frequencies if present (e.g. monthly, quarterly)
  const others = annualBills.filter(b => b.frequency !== 'annual' && b.frequency !== 'biannual');
  let otherMonthly = 0;
  for (const b of others) {
    const freq = (b.frequency || '').toLowerCase();
    const amt = Number(b.amount) || 0;
    if (freq === 'monthly') otherMonthly += amt;
    else if (freq === 'quarterly') otherMonthly += amt / 3;
    else otherMonthly += amt / 12;
  }

  return Math.round((annualMonthly + biannualMonthly + otherMonthly) * 100) / 100;
}

// Helper: Determine if a bill is a sinking fund or savings allocation to avoid double-counting in Fixed Bills
export function isSinkingFundOrSavingsBill(
  bill: { name?: string; category?: string; is_sinking_fund?: number; notes?: string },
  annualBills: Array<{ name?: string }> = []
): boolean {
  if (!bill) return false;
  if (bill.is_sinking_fund === 1) return true;
  const cat = (bill.category || '').trim().toLowerCase();
  if (cat === 'savings' || cat === 'sinking funds' || cat === 'sinking' || cat === 'annual subscriptions' || cat === 'annual bills') {
    return true;
  }
  const notes = (bill.notes || '').toLowerCase();
  if (notes.includes('[sinking') || notes.includes('sinking fund') || notes.includes('annual subscription')) {
    return true;
  }
  const bName = (bill.name || '').trim().toLowerCase();
  for (const ab of annualBills) {
    const abName = (ab.name || '').trim().toLowerCase();
    const cleanAbName = abName.replace(/\s*\([^)]*\)\s*$/g, '').trim();
    if (bName === abName || bName === cleanAbName) return true;
    if (cleanAbName.length >= 4 && (bName.includes(cleanAbName) || cleanAbName.includes(bName))) return true;
  }
  return false;
}

// Helper: Determine if a bill belongs to Paycheck 1 or Paycheck 2
export function isBillInPaycheck1(bill: any, p1Start = 1, p1End = 15, p2DepositDay?: number | null): boolean {
  if (!bill) return false;

  // 1. Manual Override (High Priority):
  // If a bill has an explicit assigned_check or manual paycheck_assignment (1st Paycheck or 2nd Paycheck),
  // route it directly to that paycheck drawer regardless of due date.
  const assignedCheck = (bill.assigned_check || '').trim().toLowerCase();
  if (assignedCheck) {
    if (
      assignedCheck.startsWith('1st') ||
      assignedCheck.startsWith('first') ||
      assignedCheck === 'check 1' ||
      assignedCheck === 'paycheck 1' ||
      assignedCheck === '1'
    ) {
      return true;
    }
    if (
      assignedCheck.startsWith('2nd') ||
      assignedCheck.startsWith('second') ||
      assignedCheck === 'check 2' ||
      assignedCheck === 'paycheck 2' ||
      assignedCheck === '2'
    ) {
      return false;
    }
  }

  const rawAssignment = (bill.paycheck_assignment || '').trim();
  const pa = rawAssignment.toLowerCase();
  if (pa) {
    const isDefaultCalendarString =
      pa.includes('1st-15th') ||
      pa.includes('16th-31st') ||
      pa.includes('1st - 15th') ||
      pa.includes('16th - 31st') ||
      pa === 'auto' ||
      pa === 'default';

    if (!isDefaultCalendarString) {
      if (
        pa.startsWith('1st') ||
        pa.startsWith('first') ||
        pa === 'check 1' ||
        pa === 'paycheck 1' ||
        pa === '1'
      ) {
        return true;
      }
      if (
        pa.startsWith('2nd') ||
        pa.startsWith('second') ||
        pa === 'check 2' ||
        pa === 'paycheck 2' ||
        pa === '2'
      ) {
        return false;
      }
    }
  }

  // 2. Default: Due Date Hierarchy (Deposit-Driven Boundary)
  const day = Number(bill.due_day) || 1;
  if (p2DepositDay && p2DepositDay > 0 && day >= p2DepositDay) {
    return false;
  }

  const effectiveP1End = (p2DepositDay && p2DepositDay > 0) ? (p2DepositDay - 1) : p1End;
  return day >= p1Start && day <= effectiveP1End;
}

// Universal paycheck/direct deposit transaction detection
function isPaycheckDepositTx(t: any): boolean {
  if (!t) return false;
  const typ = (t.type || '').toLowerCase();
  if (typ !== 'income') return false;

  const desc = (t.description || '').toLowerCase();
  const notes = (t.notes || '').toLowerCase();
  const catList: string[] = Array.isArray(t.category)
    ? t.category.map((c: any) => String(c).toLowerCase().trim())
    : (typeof t.category === 'string' && t.category.trim() ? [t.category.trim().toLowerCase()] : []);

  // Strict exclusions for non-paycheck inflows
  const excludeKeywords = [
    'starting balance',
    'rollover',
    'refund',
    'interest',
    'petty cash',
    'cash deposit',
    'atm deposit'
  ];
  if (excludeKeywords.some(kw => desc.includes(kw) || notes.includes(kw) || catList.some(c => c.includes(kw)))) {
    return false;
  }

  // Paycheck / Direct Deposit keywords
  const depositKeywords = [
    'paycheck',
    'payroll',
    'direct dep',
    'dir dep',
    'dir. dep',
    'direct_dep',
    'direct deposit',
    'salary',
    'wages',
    'stipend',
    'earnings'
  ];

  const hasKeyword = depositKeywords.some(kw =>
    desc.includes(kw) || notes.includes(kw) || catList.some(c => c.includes(kw))
  );
  if (hasKeyword) return true;

  // Also match if category is specifically "Income" (without being a refund/interest/rollover)
  const isIncomeCategory = catList.some(c => c === 'income' || c.startsWith('income ') || c.endsWith(' income'));
  if (isIncomeCategory) return true;

  return false;
}

function isExplicitP1Tx(t: any): boolean {
  if (!t) return false;
  const desc = (t.description || '').toLowerCase();
  const notes = (t.notes || '').toLowerCase();
  const catList: string[] = Array.isArray(t.category)
    ? t.category.map((c: any) => String(c).toLowerCase().trim())
    : (typeof t.category === 'string' && t.category.trim() ? [t.category.trim().toLowerCase()] : []);

  const p1Patterns = [
    'paycheck 1', 'check 1', 'check1', 'p1', 'first paycheck', '1st paycheck',
    'paycheck #1', 'check #1', 'payroll 1', 'payroll #1'
  ];
  return p1Patterns.some(p => desc.includes(p) || notes.includes(p) || catList.some(c => c.includes(p)));
}

function isExplicitP2Tx(t: any): boolean {
  if (!t) return false;
  const desc = (t.description || '').toLowerCase();
  const notes = (t.notes || '').toLowerCase();
  const catList: string[] = Array.isArray(t.category)
    ? t.category.map((c: any) => String(c).toLowerCase().trim())
    : (typeof t.category === 'string' && t.category.trim() ? [t.category.trim().toLowerCase()] : []);

  const p2Patterns = [
    'paycheck 2', 'check 2', 'check2', 'p2', 'second paycheck', '2nd paycheck',
    'paycheck #2', 'check #2', 'payroll 2', 'payroll #2'
  ];
  return p2Patterns.some(p => desc.includes(p) || notes.includes(p) || catList.some(c => c.includes(p)));
}

// Helper to compute or retrieve the Paycheck Waterfall Plan for an active month
function getPaycheckPlanForMonth(month: string, year: number, mode: 'worst_case' | 'live_actuals' = 'worst_case') {
  const monthKey = `${month} ${year}`;

  const allAnnualBills = db.prepare('SELECT * FROM annual_bills').all() as any[];
  const dynamicMonthlySinkingFunds = calculateMonthlySinkingFundsTotal(allAnnualBills);

  let row = db.prepare('SELECT * FROM paycheck_plan WHERE month = ?').get(monthKey) as any;

  if (!row) {
    row = {
      id: 0,
      month: monthKey,
      p1_period: '1st - 15th',
      p1_rollover: 0,
      p1_income: 0,
      p1_fixed_bills: 0,
      p1_lifestyle: 0,
      p1_savings: 0,
      p1_rollover_next: 0,
      p2_period: '16th - 31st',
      p2_rollover: 0,
      p2_income: 0,
      p2_fixed_bills: 0,
      p2_lifestyle: 0,
      p2_savings: dynamicMonthlySinkingFunds,
      p2_checking_buffer: 500,
      p2_leftover: 0,
      is_manual: 0,
      manual_fields: '[]',
      p1_payday_mode: 'prev_month_last_day',
      p1_payday_day: 0,
      p1_bill_start: 1,
      p1_bill_end: 15,
      p2_payday_mode: 'day_of_month',
      p2_payday_day: 15,
      p2_bill_start: 16,
      p2_bill_end: 31
    };
  }

  let manualFields: string[] = [];
  try {
    const rawVal = row.manual_fields;
    if (Array.isArray(rawVal)) {
      manualFields = rawVal;
    } else if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"')) {
        const parsed = JSON.parse(trimmed);
        manualFields = Array.isArray(parsed)
          ? parsed
          : (typeof parsed === 'string' && parsed.trim().length > 0 ? [parsed.trim()] : []);
      } else if (trimmed.length > 0) {
        manualFields = [trimmed];
      }
    }
  } catch {
    manualFields = typeof row.manual_fields === 'string' && row.manual_fields.trim().length > 0
      ? [row.manual_fields.trim()]
      : [];
  }
  if (!Array.isArray(manualFields)) {
    manualFields = typeof manualFields === 'string' && (manualFields as string).trim().length > 0
      ? [(manualFields as string).trim()]
      : [];
  }
  const isManualMode = Number(row.is_manual || 0) === 1;
  const isFieldManual = (field: string) => isManualMode || (Array.isArray(manualFields) ? manualFields.includes(field) : false);

  // Paycheck Schedule & Coverage Settings
  const p1_payday_mode = row.p1_payday_mode || 'prev_month_last_day';
  const p1_payday_day = Number(row.p1_payday_day ?? 0);
  const p1_bill_start = Number(row.p1_bill_start ?? 1);
  const p1_bill_end = Number(row.p1_bill_end ?? 15);

  const p2_payday_mode = row.p2_payday_mode || 'day_of_month';
  const p2_payday_day = Number(row.p2_payday_day ?? 15);
  const p2_bill_start = Number(row.p2_bill_start ?? 16);
  const p2_bill_end = Number(row.p2_bill_end ?? 31);

  const checkingAcc = db.prepare("SELECT * FROM accounts WHERE id = 'acc_checking' OR type = 'checking'").get() as any;
  const checkingBalance = checkingAcc ? Number(checkingAcc.balance || 0) : Number(row.p1_rollover || 0);
  const checkingBuffer = checkingAcc ? Number(checkingAcc.buffer || 500) : 500;
  const spendableChecking = Math.max(0, Math.round((checkingBalance - checkingBuffer) * 100) / 100);

  const monthMap: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const curMIdx = monthNames.indexOf(month);
  const prevMIdx = curMIdx === 0 ? 11 : (curMIdx > 0 ? curMIdx - 1 : 7);
  const prevYear = curMIdx === 0 ? year - 1 : year;
  const prevMonth = monthNames[prevMIdx];
  const prevMNum = monthMap[prevMonth] || '08';
  const lastDayOfPrevMonth = new Date(prevYear, prevMIdx + 1, 0).getDate();
  const prevMonthLastDayStr = `${prevYear}-${prevMNum}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;

  const mNum = monthMap[month] || '08';
  const activeMonthPrefix = `${year}-${mNum}`;

  const checkingMonthTxs = db.prepare(`
    SELECT * FROM transactions 
    WHERE account_id IN ('acc_checking', 'checking')
      AND date LIKE '${activeMonthPrefix}%'
  `).all() as any[];

  const prevMonthTxs = db.prepare(`
    SELECT * FROM transactions 
    WHERE account_id IN ('acc_checking', 'checking')
      AND date LIKE '${prevYear}-${prevMNum}%'
  `).all() as any[];

  const allCheckingTxs = db.prepare(`
    SELECT * FROM transactions 
    WHERE account_id IN ('acc_checking', 'checking')
    ORDER BY date ASC
  `).all() as any[];

  // Chronologically ordered checking transactions for running balance computation
  const chronCheckingTxs = (db.prepare(`
    SELECT * FROM transactions 
    WHERE account_id IN ('acc_checking', 'checking') 
    ORDER BY (CASE WHEN sort_order IS NOT NULL AND sort_order > 0 THEN 0 ELSE 1 END), sort_order ASC, date DESC, created_at DESC
  `).all() as any[]).reverse();

  // Rule 3: Base Rollover on Actual Starting Cash:
  // The rollover automatically comes from the actual end of month balance of the previous month.
  const prevMonthTxsAll = chronCheckingTxs.filter(t => t.date && t.date <= prevMonthLastDayStr);
  let actualPrevMonthEndingBalance = 0;

  if (prevMonthTxsAll.length > 0) {
    let runBal = Number(checkingAcc?.starting_balance || 0);
    for (const t of chronCheckingTxs) {
      if (t.date > prevMonthLastDayStr) break;
      const typ = (t.type || '').toLowerCase();
      const desc = (t.description || '').trim().toLowerCase();
      const amt = Number(t.amount || 0);
      if (desc.includes('starting balance')) continue;
      if (typ === 'income' && !desc.includes('rollover')) {
        runBal += amt;
      } else if (typ === 'expense' || typ === 'payment' || typ === 'withdrawal' || typ === 'debit') {
        runBal -= amt;
      } else if (typ === 'transfer') {
        const notesStr = (t.notes || '').toLowerCase();
        const isDep = notesStr.includes('[transfer: in') || notesStr.includes('[transfer in') || notesStr.includes('deposit') || desc.startsWith('transfer from') || desc.includes('(from ');
        if (isDep) runBal += amt;
        else runBal -= amt;
      }
    }
    actualPrevMonthEndingBalance = Math.round(runBal * 100) / 100;
  } else {
    // If no previous month transactions exist (e.g. very first month recorded), check for active month starting balance tx or account starting balance
    const startBalTx = chronCheckingTxs.find(t => (t.date || '').startsWith(activeMonthPrefix) && (t.description || '').toLowerCase().includes('starting balance'));
    actualPrevMonthEndingBalance = startBalTx 
      ? Number(startBalTx.amount || 0) 
      : Number(checkingAcc?.starting_balance || checkingAcc?.balance || 0);
  }

  // The rollover automatically comes from the end of the month balance:
  const dyn_p1_rollover = actualPrevMonthEndingBalance > 0
    ? actualPrevMonthEndingBalance
    : Number(checkingAcc?.starting_balance || checkingAcc?.balance || 0);

  const checkingIncomeTxs = checkingMonthTxs.filter(t => 
    (t.type || '').toLowerCase() === 'income' && (t.category || '').trim().toLowerCase() !== 'rollover'
  );

  // Detect cleared mid-month paycheck transaction (Paycheck 2)
  const clearedP2Tx = checkingIncomeTxs.find(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP2Tx(t)) return true;
    if (isExplicitP1Tx(t)) return false;
    const day = parseInt((t.date || '').split('-')[2] || '1', 10);
    return day >= 7;
  });

  const clearedP2Date = clearedP2Tx ? (clearedP2Tx.date || '').replace(/\//g, '-') : null;
  const clearedP2Day = clearedP2Tx ? parseInt((clearedP2Tx.date || '').split('-')[2] || '15', 10) : null;
  const clearedP2Income = clearedP2Tx ? Number(clearedP2Tx.amount || 0) : 0;

  // Exact Pre-Deposit Checking Balance Snapshot (balance right before Paycheck 2 deposit)
  let preDepositCheckingBalance = dyn_p1_rollover;
  if (clearedP2Tx) {
    let runBal = dyn_p1_rollover;
    const p2TxIdx = chronCheckingTxs.findIndex(t => t.id === clearedP2Tx.id);
    for (let i = 0; i < chronCheckingTxs.length; i++) {
      const t = chronCheckingTxs[i];
      if (!t.date || !t.date.startsWith(activeMonthPrefix)) continue;
      if (i >= p2TxIdx) break;
      const typ = (t.type || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const notes = (t.notes || '').toLowerCase();
      const amt = Number(t.amount || 0);
      if (desc.includes('starting balance')) continue;
      if (typ === 'income' && !desc.includes('rollover')) {
        runBal += amt;
      } else if (typ === 'expense' || typ === 'payment' || typ === 'withdrawal' || typ === 'debit') {
        runBal -= amt;
      } else if (typ === 'transfer') {
        const isDep = notes.includes('[transfer: in') || notes.includes('[transfer in') || notes.includes('deposit') || desc.startsWith('transfer from') || desc.includes('(from ');
        if (isDep) runBal += amt;
        else runBal -= amt;
      }
    }
    preDepositCheckingBalance = Math.round(runBal * 100) / 100;
  }

  const effective_p1_bill_start = p1_bill_start;
  const effective_p1_bill_end = clearedP2Day && clearedP2Day > 0 ? (clearedP2Day - 1) : p1_bill_end;
  const effective_p2_bill_start = clearedP2Day && clearedP2Day > 0 ? clearedP2Day : p2_bill_start;
  const effective_p2_bill_end = p2_bill_end;

  const effective_p1_period = clearedP2Day && clearedP2Day > 0
    ? `1st - ${clearedP2Day}th`
    : (row.p1_period || '1st - 15th');
  const effective_p2_period = clearedP2Day && clearedP2Day > 0
    ? `${clearedP2Day}th - 31st`
    : (row.p2_period || '16th - 31st');

  const p2TxIdx = clearedP2Tx ? chronCheckingTxs.findIndex(x => x.id === clearedP2Tx.id) : -1;
  const isPeriod1Tx = (t: any) => {
    if (clearedP2Tx && p2TxIdx >= 0) {
      const idx = chronCheckingTxs.findIndex(x => x.id === t.id);
      return idx >= 0 && idx < p2TxIdx;
    }
    const day = getDayOfMonth(t.date);
    return day >= p1_bill_start && day <= p1_bill_end;
  };
  const isPeriod2Tx = (t: any) => {
    if (clearedP2Tx && p2TxIdx >= 0) {
      const idx = chronCheckingTxs.findIndex(x => x.id === t.id);
      return idx >= 0 && idx > p2TxIdx;
    }
    const day = getDayOfMonth(t.date);
    return day >= p2_bill_start && day <= p2_bill_end;
  };

  const isFirstPaycheck = (b: any) => isBillInPaycheck1(b, p1_bill_start, p1_bill_end, clearedP2Day);

  const allBills = db.prepare('SELECT * FROM bills').all() as any[];
  const paidCol = `paid_${month.toLowerCase()}`;
  // Exclude periodic bills (such as biannual insurance) and savings reserves funded via sinking fund accumulation
  const fixedBillsMaster = allBills.filter(b => !isSinkingFundOrSavingsBill(b, allAnnualBills));
  const p1AllBills = fixedBillsMaster.filter(b => isFirstPaycheck(b));
  const p1FixedBills = Math.round(p1AllBills.reduce((sum, b) => sum + Number(b.amount || 0), 0) * 100) / 100;
  const p1UnpaidBills = p1AllBills.filter(b => Number(b[paidCol] || 0) !== 1);
  const p1PaidBills = p1AllBills.filter(b => Number(b[paidCol] || 0) === 1);
  const p1UnpaidTotal = Math.round(p1UnpaidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0) * 100) / 100;
  const p1PaidTotal = Math.round(p1PaidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0) * 100) / 100;

  const p2AllBills = fixedBillsMaster.filter(b => !isFirstPaycheck(b));
  const p2FixedBills = Math.round(p2AllBills.reduce((sum, b) => sum + Number(b.amount || 0), 0) * 100) / 100;
  const p2UnpaidBills = p2AllBills.filter(b => Number(b[paidCol] || 0) !== 1);
  const p2PaidBills = p2AllBills.filter(b => Number(b[paidCol] || 0) === 1);
  const p2UnpaidTotal = Math.round(p2UnpaidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0) * 100) / 100;
  const p2PaidTotal = Math.round(p2PaidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0) * 100) / 100;

  // Paycheck 1 Inflow:
  // (a) From previous month on last day (e.g. Aug 31) or labeled Paycheck 1
  const p1TxsFromPrevMonth = prevMonthTxs.filter(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP1Tx(t)) return true;
    if (isExplicitP2Tx(t)) return false;
    const dStr = (t.date || '').replace(/\//g, '-');
    const day = parseInt(dStr.split('-')[2] || '1', 10);

    if (p1_payday_mode === 'prev_month_last_day') {
      if (dStr === prevMonthLastDayStr) return true;
      if (day >= lastDayOfPrevMonth - 2) return true;
    } else if (p1_payday_day > 0 && day === p1_payday_day) {
      return true;
    }
    return false;
  });

  // (b) From active month on or before effective_p1_bill_end
  const p1TxsFromCurMonth = checkingIncomeTxs.filter(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP1Tx(t)) return true;
    if (isExplicitP2Tx(t)) return false;
    const day = parseInt((t.date || '').split('-')[2] || '1', 10);
    return day <= effective_p1_bill_end && day >= p1_bill_start;
  });

  const p1Txs = [...p1TxsFromPrevMonth, ...p1TxsFromCurMonth];
  const dyn_p1_income = p1Txs.length > 0
    ? Math.round(p1Txs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100
    : (Number(row.p1_income || 0) > 0 ? Number(row.p1_income) : 0);

  const p2Txs = checkingIncomeTxs.filter(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP2Tx(t)) return true;
    if (isExplicitP1Tx(t)) return false;
    const day = parseInt((t.date || '').split('-')[2] || '1', 10);
    return day >= Math.min(14, effective_p2_bill_start);
  });
  const dyn_p2_income = clearedP2Tx
    ? clearedP2Income
    : (p2Txs.length > 0
        ? Math.round(p2Txs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100
        : (Number(row.p2_income || 0) > 0 ? Number(row.p2_income) : 0));

  const dyn_p1_fixed_bills = p1FixedBills;
  const dyn_p2_fixed_bills = p2FixedBills;

  const savBudgetRow = db.prepare(`
    SELECT COALESCE(mcb.budget, c.budget) as budget
    FROM categories c
    LEFT JOIN monthly_category_budgets mcb 
      ON mcb.category_id = c.id AND mcb.year = ? AND mcb.month = ?
    WHERE LOWER(TRIM(c.name)) = 'savings'
  `).get(year, month) as any;
  const dyn_p1_savings = savBudgetRow && savBudgetRow.budget !== undefined && savBudgetRow.budget !== null
    ? Number(savBudgetRow.budget)
    : (Number(row.p1_savings) > 0 ? Number(row.p1_savings) : 100);
  const dyn_p2_savings = dynamicMonthlySinkingFunds;
  const dyn_p2_buffer = checkingBuffer;

  // Helper to extract day of month
  const getDayOfMonth = (dStr: string) => {
    if (!dStr) return 1;
    const clean = dStr.replace(/\//g, '-');
    const parts = clean.split('-');
    return parseInt(parts[2] || '1', 10);
  };

  // Five specific budget categories for the Lifestyle Umbrella Group:
  const LIFESTYLE_UMBRELLA_CATEGORY_NAMES = [
    'groceries',
    'gas',
    'entertainment',
    'takeout',
    'chicken feed',
  ];

  const isLifestyleCategory = (catName?: string | string[]) => {
    if (!catName) return false;
    const catList = Array.isArray(catName)
      ? catName.map(c => String(c).trim().toLowerCase())
      : (typeof catName === 'string' && catName.trim() ? [catName.trim().toLowerCase()] : []);
    return catList.some(clean => {
      if (clean === 'lifestyle' || clean.includes('lifestyle')) return true;
      return Array.isArray(LIFESTYLE_UMBRELLA_CATEGORY_NAMES)
        ? (LIFESTYLE_UMBRELLA_CATEGORY_NAMES.includes(clean) || LIFESTYLE_UMBRELLA_CATEGORY_NAMES.some(c => clean === c || clean.startsWith(c) || c.includes(clean)))
        : false;
    });
  };

  // Dynamically query the 5 budget categories for this month:
  const umbrellaCatRows = db.prepare(`
    SELECT c.name, c.icon, COALESCE(mcb.budget, c.budget) as budget
    FROM categories c
    LEFT JOIN monthly_category_budgets mcb 
      ON mcb.category_id = c.id AND mcb.year = ? AND mcb.month = ?
    WHERE LOWER(TRIM(c.name)) IN ('groceries', 'gas', 'entertainment', 'takeout', 'chicken feed')
  `).all(year, month) as any[];

  // Dynamic combined monthly planned budget for the 5 categories:
  const dyn_umbrella_monthly_budget = Math.round(
    umbrellaCatRows.reduce((sum, r) => sum + Number(r.budget || 0), 0) * 100
  ) / 100;
  const dyn_umbrella_per_paycheck = dyn_umbrella_monthly_budget > 0
    ? Math.round((dyn_umbrella_monthly_budget / 2) * 100) / 100
    : 650;

  const planned_p1_lifestyle = isFieldManual('p1_lifestyle') && row.p1_lifestyle !== undefined && row.p1_lifestyle !== null
    ? Number(row.p1_lifestyle)
    : dyn_umbrella_per_paycheck;

  const planned_p2_lifestyle = isFieldManual('p2_lifestyle') && row.p2_lifestyle !== undefined && row.p2_lifestyle !== null
    ? Number(row.p2_lifestyle)
    : dyn_umbrella_per_paycheck;

  const isExpenseTx = (type?: string) => {
    const t = (type || '').trim().toLowerCase();
    return t === 'expense' || t === 'payment' || t === 'withdrawal' || t === 'debit';
  };
  const isRefundTx = (type?: string) => {
    const t = (type || '').trim().toLowerCase();
    return t === 'income' || t === 'refund' || t === 'credit' || t === 'deposit';
  };

  const getCategorySpentInRange = (catMatch: string, startDay: number, endDay: number, isP1: boolean = true) => {
    const exps = checkingMonthTxs.filter(t => {
      const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
        ? (isP1 ? isPeriod1Tx(t) : isPeriod2Tx(t))
        : (getDayOfMonth(t.date) >= startDay && getDayOfMonth(t.date) <= endDay);
      const clean = (t.category || '').trim().toLowerCase();
      return matchPeriod && isExpenseTx(t.type) && (clean === catMatch || clean.startsWith(catMatch));
    });
    const refs = checkingMonthTxs.filter(t => {
      const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
        ? (isP1 ? isPeriod1Tx(t) : isPeriod2Tx(t))
        : (getDayOfMonth(t.date) >= startDay && getDayOfMonth(t.date) <= endDay);
      const clean = (t.category || '').trim().toLowerCase();
      return matchPeriod && isRefundTx(t.type) && (clean === catMatch || clean.startsWith(catMatch));
    });
    return Math.max(0, Math.round((
      exps.reduce((sum, t) => sum + Number(t.amount || 0), 0) -
      refs.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    ) * 100) / 100);
  };

  const lifestyle_umbrella_categories = [
    { name: 'Groceries', icon: '🛒', match: 'groceries' },
    { name: 'Gas', icon: '⛽', match: 'gas' },
    { name: 'Entertainment', icon: '🎮', match: 'entertainment' },
    { name: 'Takeout', icon: '🍱', match: 'takeout' },
    { name: 'Chicken Feed', icon: '🐔', match: 'chicken feed' },
  ].map(cat => {
    const r = umbrellaCatRows.find(row => (row.name || '').trim().toLowerCase().startsWith(cat.match));
    const monthly_budget = r ? Number(r.budget || 0) : 0;
    const p1_budget = Math.round((monthly_budget / 2) * 100) / 100;
    const p2_budget = Math.round((monthly_budget / 2) * 100) / 100;
    const p1_spent = getCategorySpentInRange(cat.match, p1_bill_start, p1_bill_end, true);
    const p2_spent = getCategorySpentInRange(cat.match, p2_bill_start, p2_bill_end, false);
    return {
      name: cat.name,
      icon: r?.icon || cat.icon,
      monthly_budget,
      p1_budget,
      p2_budget,
      p1_spent,
      p2_spent,
    };
  });

  // Paycheck 1 Lifestyle Actual Spending from live checking ledger (combined 5 categories):
  const p1LifestyleTxs = checkingMonthTxs.filter(t => {
    const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
      ? isPeriod1Tx(t)
      : (getDayOfMonth(t.date) >= p1_bill_start && getDayOfMonth(t.date) <= p1_bill_end);
    return matchPeriod && isExpenseTx(t.type) && isLifestyleCategory(t.category);
  });
  const p1LifestyleRefunds = checkingMonthTxs.filter(t => {
    const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
      ? isPeriod1Tx(t)
      : (getDayOfMonth(t.date) >= p1_bill_start && getDayOfMonth(t.date) <= p1_bill_end);
    return matchPeriod && isRefundTx(t.type) && isLifestyleCategory(t.category);
  });
  const p1_lifestyle_spent = Math.max(0, Math.round((
    p1LifestyleTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) -
    p1LifestyleRefunds.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  ) * 100) / 100);

  // Paycheck 2 Lifestyle Actual Spending from live checking ledger (combined 5 categories):
  const p2LifestyleTxs = checkingMonthTxs.filter(t => {
    const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
      ? isPeriod2Tx(t)
      : (getDayOfMonth(t.date) >= p2_bill_start && getDayOfMonth(t.date) <= p2_bill_end);
    return matchPeriod && isExpenseTx(t.type) && isLifestyleCategory(t.category);
  });
  const p2LifestyleRefunds = checkingMonthTxs.filter(t => {
    const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
      ? isPeriod2Tx(t)
      : (getDayOfMonth(t.date) >= p2_bill_start && getDayOfMonth(t.date) <= p2_bill_end);
    return matchPeriod && isRefundTx(t.type) && isLifestyleCategory(t.category);
  });
  const p2_lifestyle_spent = Math.max(0, Math.round((
    p2LifestyleTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) -
    p2LifestyleRefunds.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  ) * 100) / 100);

  // Live Spending Logic ("The Greater Of" Rule): Deduct whichever is absolute HIGHER: Combined Planned Budget OR Combined Actual Spent
  const dyn_p1_lifestyle = Math.round(Math.max(planned_p1_lifestyle, p1_lifestyle_spent) * 100) / 100;
  const dyn_p2_lifestyle = Math.round(Math.max(planned_p2_lifestyle, p2_lifestyle_spent) * 100) / 100;

  // Categories for Extra Debt & Unplanned Spend: Extra Payment & Other / Misc
  const UNPLANNED_CATEGORY_NAMES = ['extra payment', 'extra debt', 'other / misc', 'other/misc', 'other', 'misc', 'unplanned'];
  const isExtraDebtUnplannedCategory = (catName?: string | string[]) => {
    if (!catName) return false;
    const catList = Array.isArray(catName)
      ? catName.map(c => String(c).trim().toLowerCase())
      : (typeof catName === 'string' && catName.trim() ? [catName.trim().toLowerCase()] : []);
    return catList.some(clean => {
      if (Array.isArray(UNPLANNED_CATEGORY_NAMES) ? UNPLANNED_CATEGORY_NAMES.includes(clean) : false) return true;
      if (clean === 'extra payment' || clean.startsWith('extra payment') || clean === 'extra debt' || clean.startsWith('extra debt')) return true;
      if (clean === 'other / misc' || clean === 'other/misc' || clean.startsWith('other / misc') || clean.startsWith('other/misc')) return true;
      if (clean === 'other' || clean === 'misc' || clean === 'unplanned' || clean.includes('unplanned')) return true;
      return false;
    });
  };

  const isTrueRefundTx = (t: any) => {
    const type = (t.type || '').toString().trim().toLowerCase();
    const desc = (t.description || '').toString().trim().toLowerCase();
    const catList = Array.isArray(t.category)
      ? t.category.map((c: any) => String(c).trim().toLowerCase())
      : (typeof t.category === 'string' && t.category.trim() ? [t.category.trim().toLowerCase()] : []);
    const isRefundCat = Array.isArray(catList) ? (catList.includes('refund') || catList.includes('refunds') || catList.some(c => c.includes('refund'))) : false;
    return type === 'refund' || isRefundCat || desc.includes('refund');
  };

  // Dynamically query the 2 categories (Extra Payment, Other / Misc) from Monthly Budget Planner:
  const extraDebtCatRows = db.prepare(`
    SELECT c.id, c.name, c.icon, COALESCE(mcb.budget, c.budget) as budget
    FROM categories c
    LEFT JOIN monthly_category_budgets mcb 
      ON mcb.category_id = c.id AND mcb.year = ? AND mcb.month = ?
    WHERE LOWER(TRIM(c.name)) IN ('extra payment', 'other / misc')
       OR c.id IN ('cat_extra', 'cat_other')
  `).all(year, month) as any[];

  const extraPaymentRow = extraDebtCatRows.find(r => (r.name || '').trim().toLowerCase() === 'extra payment' || r.id === 'cat_extra');
  const dyn_extra_debt_monthly_budget = extraPaymentRow ? Number(extraPaymentRow.budget || 0) : 500;
  const dyn_extra_debt_per_paycheck = dyn_extra_debt_monthly_budget > 0
    ? Math.round((dyn_extra_debt_monthly_budget / 2) * 100) / 100
    : 250;

  const planned_p1_extra_debt = isFieldManual('p1_extra_debt') && row.p1_extra_debt !== undefined && row.p1_extra_debt !== null
    ? Number(row.p1_extra_debt)
    : dyn_extra_debt_per_paycheck;

  const planned_p2_extra_debt = isFieldManual('p2_extra_debt') && row.p2_extra_debt !== undefined && row.p2_extra_debt !== null
    ? Number(row.p2_extra_debt)
    : dyn_extra_debt_per_paycheck;

  const getExtraDebtSpentInRange = (catMatch: string, startDay: number, endDay: number, isP1: boolean = true) => {
    const exps = checkingMonthTxs.filter(t => {
      const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
        ? (isP1 ? isPeriod1Tx(t) : isPeriod2Tx(t))
        : (getDayOfMonth(t.date) >= startDay && getDayOfMonth(t.date) <= endDay);
      const clean = (t.category || '').trim().toLowerCase();
      return matchPeriod && isExpenseTx(t.type) && (clean === catMatch || clean.startsWith(catMatch) || clean.includes(catMatch));
    });
    const refs = checkingMonthTxs.filter(t => {
      const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
        ? (isP1 ? isPeriod1Tx(t) : isPeriod2Tx(t))
        : (getDayOfMonth(t.date) >= startDay && getDayOfMonth(t.date) <= endDay);
      const clean = (t.category || '').trim().toLowerCase();
      return matchPeriod && isTrueRefundTx(t) && (clean === catMatch || clean.startsWith(catMatch) || clean.includes(catMatch));
    });
    return Math.max(0, Math.round((
      exps.reduce((sum, t) => sum + Number(t.amount || 0), 0) -
      refs.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    ) * 100) / 100);
  };

  const extra_debt_categories = [
    { name: 'Extra Payment', icon: '✨', match: 'extra' },
    { name: 'Other / Misc', icon: '🍰', match: 'other' },
  ].map(cat => {
    const r = extraDebtCatRows.find(row => (row.name || '').trim().toLowerCase().includes(cat.match) || (row.id || '').toLowerCase().includes(cat.match));
    const monthly_budget = r ? Number(r.budget || 0) : 0;
    const p1_budget = Math.round((monthly_budget / 2) * 100) / 100;
    const p2_budget = Math.round((monthly_budget / 2) * 100) / 100;
    const p1_spent = getExtraDebtSpentInRange(cat.match, p1_bill_start, p1_bill_end, true);
    const p2_spent = getExtraDebtSpentInRange(cat.match, p2_bill_start, p2_bill_end, false);
    return {
      name: cat.name,
      icon: r?.icon || cat.icon,
      monthly_budget,
      p1_budget,
      p2_budget,
      p1_spent,
      p2_spent,
    };
  });

  // Rule 1: Deduct Actual Unplanned Spending:
  // For each pay period date range, query all checking transactions/ledger entries occurring during that window.
  // Deduct any debit/outflow that is NOT already accounted for in the 'Fixed Bills Assigned' list
  // (e.g., extra credit card payments, manual transfers, variable spend beyond budget).
  const calculateUnplannedOutflows = (startDay: number, endDay: number, periodBills: any[], plannedLifestyle: number, isP1: boolean = true) => {
    const safePeriodBills = Array.isArray(periodBills) ? periodBills : (periodBills ? [periodBills] : []);
    const safeAllBills = Array.isArray(allBills) ? allBills : (allBills ? [allBills] : []);
    const safeAnnualBills = Array.isArray(allAnnualBills) ? allAnnualBills : (allAnnualBills ? [allAnnualBills] : []);

    const periodTxs = checkingMonthTxs.filter(t => {
      if (clearedP2Tx && p2TxIdx >= 0) {
        return isP1 ? isPeriod1Tx(t) : isPeriod2Tx(t);
      }
      const day = getDayOfMonth(t.date);
      return day >= startDay && day <= endDay;
    });

    const exps = periodTxs.filter(t => isExpenseTx(t.type));
    const refs = periodTxs.filter(t => isTrueRefundTx(t));

    const norm = (s: string) => (s || '').trim().toLowerCase();
    const unmatchedTxs: Array<{ id: string; date: string; description: string; amount: number; category: string; reason: string }> = [];
    let lifestylePeriodSpent = 0;
    let clearedBillsSpent = 0;

    for (const t of exps) {
      const tid = t.id || '';
      const cClean = norm(t.category);
      const dClean = norm(t.description);
      const amt = Number(t.amount || 0);

      // Check if this tx matches a known fixed bill in safeAllBills or safePeriodBills (to prevent double-deducting cross-period bills)
      let matchedBill: any = null;
      if (tid.startsWith('tx_bill_')) {
        matchedBill = safeAllBills.find(b => norm(b.name) === dClean || norm(b.name).includes(dClean) || dClean.includes(norm(b.name)));
      } else if (t.notes && (t.notes.includes('[Bill Auto-Sync') || t.notes.includes('[CC Payment Sync:'))) {
        matchedBill = safeAllBills.find(b => norm(b.name) === dClean || dClean.includes(norm(b.name)) || norm(b.name).includes(dClean));
      } else {
        matchedBill = safeAllBills.find(b => norm(b.name) === dClean || (norm(b.name).length > 3 && dClean.includes(norm(b.name))));
      }

      if (matchedBill) {
        const billAmt = Number(matchedBill.amount || 0);
        clearedBillsSpent += Math.min(amt, billAmt);
        if (amt > billAmt + 0.01) {
          const extraAmt = Math.round((amt - billAmt) * 100) / 100;
          unmatchedTxs.push({
            id: tid,
            date: t.date,
            description: t.description,
            amount: extraAmt,
            category: t.category,
            reason: `Extra payment over ${matchedBill.name} ($${billAmt.toFixed(2)})`
          });
        }
        // billAmt portion is accounted for in Fixed Bills Assigned!
      } else if (safeAnnualBills.some(ab => {
        const abName = norm(ab.name);
        const cleanAb = abName.replace(/\s*\([^)]*\)\s*$/g, '').trim();
        return dClean === abName || (cleanAb.length >= 4 && (dClean.includes(cleanAb) || cleanAb.includes(dClean)));
      })) {
        // Funded via Sinking Funds accumulation! Accounted for in Sinking Funds Assigned, not unplanned outflow.
      } else if (isLifestyleCategory(t.category)) {
        lifestylePeriodSpent += amt;
      } else {
        // Not a bill, not in lifestyle -> Unplanned Outflow (e.g. extra debt, manual transfer, non-bill expense)
        unmatchedTxs.push({
          id: tid,
          date: t.date,
          description: t.description,
          amount: amt,
          category: t.category,
          reason: `Unplanned ${t.category}`
        });
      }
    }

    // Lifestyle refunds during period
    const lifestyleRefs = refs.filter(t => isLifestyleCategory(t.category));
    const netLifestyleSpent = Math.max(0, lifestylePeriodSpent - lifestyleRefs.reduce((s, t) => s + Number(t.amount || 0), 0));

    // Variable spend beyond budget (overage beyond planned lifestyle budget)
    const variableSpendBeyondBudget = Math.max(0, Math.round((netLifestyleSpent - plannedLifestyle) * 100) / 100);
    if (variableSpendBeyondBudget > 0) {
      unmatchedTxs.push({
        id: `var_spend_over_${startDay}_${endDay}`,
        date: `${year}-${mNum}-${String(startDay).padStart(2, '0')}`,
        description: `Lifestyle Spending Beyond Budget`,
        amount: variableSpendBeyondBudget,
        category: 'Lifestyle Overage',
        reason: `Variable spend beyond $${plannedLifestyle.toFixed(2)} budget`
      });
    }

    // Unplanned refunds (refunds not in lifestyle)
    const unplannedRefs = refs.filter(t => !isLifestyleCategory(t.category));
    const totalUnplannedRefunds = unplannedRefs.reduce((s, t) => s + Number(t.amount || 0), 0);

    const baseUnplannedSpent = unmatchedTxs.reduce((s, item) => s + item.amount, 0);
    const actualSpent = Math.max(0, Math.round((baseUnplannedSpent - totalUnplannedRefunds) * 100) / 100);

    return {
      actualSpent,
      txs: unmatchedTxs,
      clearedBillsSpent: Math.round(clearedBillsSpent * 100) / 100
    };
  };

  const p1Unplanned = calculateUnplannedOutflows(p1_bill_start, p1_bill_end, p1AllBills, planned_p1_lifestyle, true);
  const p1_extra_debt_spent = p1Unplanned.actualSpent;
  const p1_unplanned_txs = p1Unplanned.txs;

  const p2Unplanned = calculateUnplannedOutflows(p2_bill_start, p2_bill_end, p2AllBills, planned_p2_lifestyle, false);
  const isP2ExtraDebtManual = Array.isArray(manualFields) ? manualFields.includes('p2_extra_debt') : false;
  const isP1ExtraDebtManual = Array.isArray(manualFields) ? manualFields.includes('p1_extra_debt') : false;
  const p2_extra_debt_spent = p2Unplanned.actualSpent;
  const p2_unplanned_txs = p2Unplanned.txs;

  // Live Spending Logic ("The Greater Of" Rule) for Unplanned Outflows / Extra Debt Paid:
  const dyn_p1_extra_debt = Math.round(Math.max(planned_p1_extra_debt, p1_extra_debt_spent) * 100) / 100;
  const dyn_p2_extra_debt = Math.round(Math.max(planned_p2_extra_debt, p2_extra_debt_spent) * 100) / 100;

  const effective_p1_extra_debt = isP1ExtraDebtManual && row.p1_extra_debt !== undefined && row.p1_extra_debt !== null
    ? Math.round(Math.max(Number(row.p1_extra_debt), p1_extra_debt_spent) * 100) / 100
    : dyn_p1_extra_debt;

  const effective_p2_extra_debt = isP2ExtraDebtManual && row.p2_extra_debt !== undefined && row.p2_extra_debt !== null
    ? Math.round(Math.max(Number(row.p2_extra_debt), p2_extra_debt_spent) * 100) / 100
    : dyn_p2_extra_debt;

  const effective_p1_rollover = isFieldManual('p1_rollover') && row.p1_rollover !== undefined && row.p1_rollover !== null
    ? Number(row.p1_rollover)
    : dyn_p1_rollover;

  const effective_p1_income = isFieldManual('p1_income') && row.p1_income !== undefined && row.p1_income !== null
    ? Number(row.p1_income)
    : dyn_p1_income;

  const effective_p1_fixed_bills = isFieldManual('p1_fixed_bills') && row.p1_fixed_bills !== undefined && row.p1_fixed_bills !== null
    ? Number(row.p1_fixed_bills)
    : dyn_p1_fixed_bills;

  const effective_p1_lifestyle = isFieldManual('p1_lifestyle') && row.p1_lifestyle !== undefined && row.p1_lifestyle !== null
    ? Math.round(Math.max(Number(row.p1_lifestyle), p1_lifestyle_spent) * 100) / 100
    : dyn_p1_lifestyle;

  const effective_p1_savings = isFieldManual('p1_savings') && row.p1_savings !== undefined && row.p1_savings !== null
    ? Number(row.p1_savings)
    : dyn_p1_savings;

  const activeMonthFirstDayStr = `${year}-${mNum}-01`;
  const scheduledP1PayDate = (p1_payday_mode === 'prev_month_last_day' || p1_payday_day === 0)
    ? `${prevMonth} ${lastDayOfPrevMonth}`
    : `${month} ${p1_payday_day || 1}`;
  const scheduledP2PayDate = clearedP2Date
    ? `${month} ${clearedP2Day}`
    : `${month} ${p2_payday_day || 15}`;

  // Paycheck 1 Timing Rule: Arrives on last day of prior month (e.g. Aug 31 for Sep).
  // Because this cash is already inside the physical account on the 1st (as part of the Starting Rollover balance),
  // set its mathematical addition line on the Waterfall to $0.00 to avoid double-counting.
  const isP1PaidPriorToMonth = (p1_payday_mode === 'prev_month_last_day' || p1_payday_day === 0);
  const p1EffectiveInflowMath = isP1PaidPriorToMonth ? 0 : effective_p1_income;

  // --- Checking Account Transfers (Cash Flow Modifiers) ---
  const checkingTransfers = checkingMonthTxs.filter(t => (t.type || '').toLowerCase() === 'transfer');

  const isTransferIn = (t: any) => {
    const notesStr = (t.notes || '').toLowerCase();
    const descStr = (t.description || '').toLowerCase();
    const catStr = (t.category || '').toLowerCase();
    return notesStr.includes('[transfer: in') || 
           notesStr.includes('[transfer in') || 
           notesStr.includes('deposit') || 
           descStr.includes('(from ') || 
           descStr.startsWith('transfer from') ||
           catStr.includes('transfer in');
  };

  const getTransferSource = (t: any) => {
    const desc = t.description || '';
    const fromMatch = desc.match(/\(from\s+([^)]+)\)/i);
    if (fromMatch) return fromMatch[1].trim();
    const notes = t.notes || '';
    const acctMatch = notes.match(/<-\s+([a-zA-Z0-9_-]+)/);
    if (acctMatch) {
      const a = (db.prepare('SELECT name FROM accounts WHERE id = ?').get(acctMatch[1]) as any);
      if (a?.name) return a.name;
    }
    return 'Savings 🌸';
  };

  const getTransferDestination = (t: any) => {
    const desc = t.description || '';
    const toMatch = desc.match(/\(to\s+([^)]+)\)/i);
    if (toMatch) return toMatch[1].trim();
    const notes = t.notes || '';
    const acctMatch = notes.match(/->\s+([a-zA-Z0-9_-]+)/);
    if (acctMatch) {
      const a = (db.prepare('SELECT name FROM accounts WHERE id = ?').get(acctMatch[1]) as any);
      if (a?.name) return a.name;
    }
    return 'Savings 🌸';
  };

  const p1TransferTxs = checkingTransfers.filter(t => {
    if (clearedP2Tx && p2TxIdx >= 0) {
      return isPeriod1Tx(t);
    }
    const day = getDayOfMonth(t.date);
    return day >= p1_bill_start && day <= p1_bill_end;
  });

  const p2TransferTxs = checkingTransfers.filter(t => {
    if (clearedP2Tx && p2TxIdx >= 0) {
      return isPeriod2Tx(t);
    }
    const day = getDayOfMonth(t.date);
    return day >= p2_bill_start && day <= p2_bill_end;
  });

  const p1TransfersInTxs = p1TransferTxs.filter(t => isTransferIn(t));
  const p1TransfersOutTxs = p1TransferTxs.filter(t => !isTransferIn(t));
  const p2TransfersInTxs = p2TransferTxs.filter(t => isTransferIn(t));
  const p2TransfersOutTxs = p2TransferTxs.filter(t => !isTransferIn(t));

  // Helper to identify transfers to Savings (Sinking Funds Transfer)
  const isSinkingFundTransfer = (t: any) => {
    if (isTransferIn(t)) return false;
    const descStr = (t.description || '').toLowerCase();
    const notesStr = (t.notes || '').toLowerCase();
    const catStr = (t.category || '').toLowerCase();
    const dest = getTransferDestination(t).toLowerCase();
    const isToSavings = dest.includes('savings') ||
                        notesStr.includes('-> acc_savings') ||
                        notesStr.includes('-> savings') ||
                        descStr.includes('(to savings') ||
                        descStr.includes('to savings') ||
                        catStr.includes('saving') ||
                        catStr.includes('sinking');
    if (!isToSavings) return false;
    if (descStr.includes('vacation') || notesStr.includes('vacation') || descStr.includes('emergency') || descStr.includes('car')) {
      return false;
    }
    const day = getDayOfMonth(t.date);
    const isSinkingText = descStr.includes('annual') ||
                          descStr.includes('sinking') ||
                          notesStr.includes('annual') ||
                          notesStr.includes('sinking') ||
                          descStr.includes('insurance') ||
                          descStr.includes('subscription');
    return isSinkingText || (day >= 14 && day <= 18 && (descStr.includes('transfer to savings') || catStr.includes('saving') || descStr.includes('monthly savings')));
  };

  // Scheduled monthly checking-to-savings transfer on the 15th matching Sinking Funds:
  const p2SinkingTransfers = checkingTransfers.filter(t => !isTransferIn(t) && isSinkingFundTransfer(t) && getDayOfMonth(t.date) >= 14);
  const p2SinkingTransfersTotal = Math.round(p2SinkingTransfers.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;

  // Other outbound transfers in P2 (excluding sinking fund transfers so they are NOT double counted):
  const p2OtherTransfersOutTxs = p2TransfersOutTxs.filter(t => !isSinkingFundTransfer(t));

  const dyn_p1_transfers_in = Math.round(p1TransfersInTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;
  const dyn_p1_transfers_out = Math.round(p1TransfersOutTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;
  const dyn_p2_transfers_in = Math.round(p2TransfersInTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;
  const dyn_p2_transfers_out = Math.round(p2OtherTransfersOutTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;

  const p1_transfers_in_items = p1TransfersInTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: getTransferSource(t),
    destination: 'Checking 🌸',
    notes: t.notes
  }));

  const p1_transfers_out_items = p1TransfersOutTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: 'Checking 🌸',
    destination: getTransferDestination(t),
    notes: t.notes
  }));

  const p2_transfers_in_items = p2TransfersInTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: getTransferSource(t),
    destination: 'Checking 🌸',
    notes: t.notes
  }));

  const p2_transfers_out_items = p2OtherTransfersOutTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: 'Checking 🌸',
    destination: getTransferDestination(t),
    notes: t.notes
  }));

  const p2_sinking_transfers_items = p2SinkingTransfers.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: 'Checking 🌸',
    destination: getTransferDestination(t),
    notes: t.notes
  }));

  const effective_p1_transfers_in = isFieldManual('p1_transfers_in') && row.p1_transfers_in !== undefined && row.p1_transfers_in !== null
    ? Number(row.p1_transfers_in)
    : dyn_p1_transfers_in;
  const effective_p1_transfers_out = isFieldManual('p1_transfers_out') && row.p1_transfers_out !== undefined && row.p1_transfers_out !== null
    ? Number(row.p1_transfers_out)
    : dyn_p1_transfers_out;
  const effective_p2_transfers_in = isFieldManual('p2_transfers_in') && row.p2_transfers_in !== undefined && row.p2_transfers_in !== null
    ? Number(row.p2_transfers_in)
    : dyn_p2_transfers_in;
  const effective_p2_transfers_out = isFieldManual('p2_transfers_out') && row.p2_transfers_out !== undefined && row.p2_transfers_out !== null
    ? Number(row.p2_transfers_out)
    : dyn_p2_transfers_out;

  const p1_total_obligations = Math.round((effective_p1_fixed_bills + effective_p1_lifestyle + effective_p1_extra_debt + effective_p1_savings + effective_p1_transfers_out) * 100) / 100;
  const dyn_p1_rollover_next = Math.round((effective_p1_rollover + p1EffectiveInflowMath + effective_p1_transfers_in - p1_total_obligations) * 100) / 100;
  const effective_p1_rollover_next = isFieldManual('p1_rollover_next') && row.p1_rollover_next !== undefined && row.p1_rollover_next !== null
    ? Number(row.p1_rollover_next)
    : dyn_p1_rollover_next;

  const effective_p2_rollover = isFieldManual('p2_rollover') && row.p2_rollover !== undefined && row.p2_rollover !== null
    ? Number(row.p2_rollover)
    : effective_p1_rollover_next;

  const effective_p2_income = isFieldManual('p2_income') && row.p2_income !== undefined && row.p2_income !== null
    ? Number(row.p2_income)
    : dyn_p2_income;

  const effective_p2_fixed_bills = isFieldManual('p2_fixed_bills') && row.p2_fixed_bills !== undefined && row.p2_fixed_bills !== null
    ? Number(row.p2_fixed_bills)
    : dyn_p2_fixed_bills;

  const effective_p2_lifestyle = isFieldManual('p2_lifestyle') && row.p2_lifestyle !== undefined && row.p2_lifestyle !== null
    ? Math.round(Math.max(Number(row.p2_lifestyle), p2_lifestyle_spent) * 100) / 100
    : dyn_p2_lifestyle;

  const isP2SavingsManual = Array.isArray(manualFields) ? manualFields.includes('p2_savings') : false;
  const effective_p2_savings = isP2SavingsManual && row.p2_savings !== undefined && row.p2_savings !== null
    ? Number(row.p2_savings)
    : dyn_p2_savings;

  const p2_sinking_cleared = p2SinkingTransfersTotal >= effective_p2_savings || (p2SinkingTransfersTotal > 0);

  const effective_p2_buffer = isFieldManual('p2_checking_buffer') && row.p2_checking_buffer !== undefined && row.p2_checking_buffer !== null
    ? Number(row.p2_checking_buffer)
    : dyn_p2_buffer;

  const p2_total_obligations = Math.round((effective_p2_fixed_bills + effective_p2_lifestyle + effective_p2_extra_debt + effective_p2_savings + effective_p2_buffer + effective_p2_transfers_out) * 100) / 100;
  const dyn_p2_leftover = Math.round((effective_p2_rollover + effective_p2_income + effective_p2_transfers_in - p2_total_obligations) * 100) / 100;
  const effective_p2_leftover = isFieldManual('p2_leftover') && row.p2_leftover !== undefined && row.p2_leftover !== null
    ? Number(row.p2_leftover)
    : dyn_p2_leftover;

  // Rule 2: Enforce Zero-Sum Allocation:
  // 'Leftover Free Cash' should not be an open-ended rollover.
  // Add an allocation step at the bottom of the pay period where any remaining balance is explicitly assigned to a target.
  const p2_zero_sum_buffer = Number(row.p2_zero_sum_buffer || 0);
  const p2_zero_sum_savings = Number(row.p2_zero_sum_savings || 0);
  const p2_zero_sum_debt = Number(row.p2_zero_sum_debt || 0);
  const p2_zero_sum_target = row.p2_zero_sum_target || 'debt_overpayment';
  const p2_total_zero_sum_allocated = Math.round((p2_zero_sum_buffer + p2_zero_sum_savings + p2_zero_sum_debt) * 100) / 100;
  const p2_unallocated_leftover = Math.round((effective_p2_leftover - p2_total_zero_sum_allocated) * 100) / 100;

  const total_income = Math.round((effective_p1_income + effective_p2_income) * 100) / 100;
  const total_transfers_in = Math.round((effective_p1_transfers_in + effective_p2_transfers_in) * 100) / 100;
  const total_transfers_out = Math.round((effective_p1_transfers_out + effective_p2_transfers_out) * 100) / 100;
  const total_fixed_bills = Math.round((effective_p1_fixed_bills + effective_p2_fixed_bills) * 100) / 100;
  const total_lifestyle = Math.round((effective_p1_lifestyle + effective_p2_lifestyle) * 100) / 100;
  const total_extra_debt = Math.round((effective_p1_extra_debt + effective_p2_extra_debt) * 100) / 100;
  const total_savings = Math.round((effective_p1_savings + effective_p2_savings) * 100) / 100;
  const total_buffer = effective_p2_buffer;
  const total_obligations = Math.round((total_fixed_bills + total_lifestyle + total_extra_debt + total_savings + total_buffer + total_transfers_out) * 100) / 100;
  const total_remainder = effective_p2_leftover;

  // --- Live Actuals Calculations ---
  // Live Actuals mode strictly uses cleared transactions and executed transfers to date.
  // Unspent lifestyle allowances, unpaid pending bills, and unexecuted savings transfers remain in running cash balance.
  const p1_savings_spent = Math.round(
    checkingMonthTxs.filter(t => {
      const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
        ? isPeriod1Tx(t)
        : (getDayOfMonth(t.date) >= p1_bill_start && getDayOfMonth(t.date) <= p1_bill_end);
      const cat = (t.category || '').toLowerCase();
      return matchPeriod && (t.type === 'Expense' || t.type === 'Payment') && cat.includes('saving');
    }).reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100
  ) / 100;

  // For Paycheck 2, cleared savings matches executed sinking fund transfers on or around the 15th
  const p2_savings_spent = p2SinkingTransfersTotal;

  const live_p1_income = isP1PaidPriorToMonth ? 0 : dyn_p1_income;
  const live_p1_transfers_in = dyn_p1_transfers_in;
  const live_p1_fixed_bills = p1Unplanned.clearedBillsSpent;
  const live_p1_lifestyle = p1_lifestyle_spent;
  const live_p1_extra_debt = p1_extra_debt_spent;
  const live_p1_savings = p1_savings_spent;
  const live_p1_transfers_out = dyn_p1_transfers_out;
  const live_p1_total_obligations = Math.round((
    live_p1_fixed_bills +
    live_p1_lifestyle +
    live_p1_extra_debt +
    live_p1_savings +
    live_p1_transfers_out
  ) * 100) / 100;
  const live_p1_rollover_next = clearedP2Tx
    ? preDepositCheckingBalance
    : Math.round((
        effective_p1_rollover +
        live_p1_income +
        live_p1_transfers_in -
        live_p1_total_obligations
      ) * 100) / 100;

  const live_p2_rollover = clearedP2Tx
    ? preDepositCheckingBalance
    : live_p1_rollover_next;
  const live_p2_income = clearedP2Tx
    ? clearedP2Income
    : (p2Txs.length > 0
        ? Math.round(p2Txs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100
        : 0);
  const live_p2_transfers_in = dyn_p2_transfers_in;
  const live_p2_fixed_bills = p2Unplanned.clearedBillsSpent;
  const live_p2_lifestyle = p2_lifestyle_spent;
  const live_p2_extra_debt = p2_extra_debt_spent;
  const live_p2_savings = p2_savings_spent;
  const live_p2_buffer = 0; // Buffer remains in physical cash
  const live_p2_transfers_out = dyn_p2_transfers_out;
  const live_p2_total_obligations = Math.round((
    live_p2_fixed_bills +
    live_p2_lifestyle +
    live_p2_extra_debt +
    live_p2_savings +
    live_p2_buffer +
    live_p2_transfers_out
  ) * 100) / 100;
  const live_p2_leftover = Math.round((
    live_p2_rollover +
    live_p2_income +
    live_p2_transfers_in -
    live_p2_total_obligations
  ) * 100) / 100;

  const live_actuals_data = {
    p1_rollover: effective_p1_rollover,
    p1_income: live_p1_income,
    p1_transfers_in: live_p1_transfers_in,
    p1_fixed_bills: live_p1_fixed_bills,
    p1_lifestyle: live_p1_lifestyle,
    p1_extra_debt: live_p1_extra_debt,
    p1_savings: live_p1_savings,
    p1_transfers_out: live_p1_transfers_out,
    p1_total_obligations: live_p1_total_obligations,
    p1_rollover_next: live_p1_rollover_next,
    p2_rollover: live_p2_rollover,
    p2_income: live_p2_income,
    p2_transfers_in: live_p2_transfers_in,
    p2_fixed_bills: live_p2_fixed_bills,
    p2_lifestyle: live_p2_lifestyle,
    p2_extra_debt: live_p2_extra_debt,
    p2_savings: live_p2_savings,
    p2_checking_buffer: live_p2_buffer,
    p2_transfers_out: live_p2_transfers_out,
    p2_total_obligations: live_p2_total_obligations,
    p2_leftover: live_p2_leftover,
    total_income: Math.round(((isP1PaidPriorToMonth ? 0 : dyn_p1_income) + live_p2_income) * 100) / 100,
    total_transfers_in: Math.round((live_p1_transfers_in + live_p2_transfers_in) * 100) / 100,
    total_transfers_out: Math.round((live_p1_transfers_out + live_p2_transfers_out) * 100) / 100,
    total_fixed_bills: Math.round((live_p1_fixed_bills + live_p2_fixed_bills) * 100) / 100,
    total_lifestyle: Math.round((live_p1_lifestyle + live_p2_lifestyle) * 100) / 100,
    total_extra_debt: Math.round((live_p1_extra_debt + live_p2_extra_debt) * 100) / 100,
    total_savings: Math.round((live_p1_savings + live_p2_savings) * 100) / 100,
    total_buffer: live_p2_buffer,
    total_obligations: Math.round((live_p1_total_obligations + live_p2_total_obligations) * 100) / 100,
    total_remainder: live_p2_leftover,
  };

  const worst_case_data = {
    p1_rollover: effective_p1_rollover,
    p1_income: effective_p1_income,
    p1_transfers_in: effective_p1_transfers_in,
    p1_fixed_bills: effective_p1_fixed_bills,
    p1_lifestyle: effective_p1_lifestyle,
    p1_extra_debt: effective_p1_extra_debt,
    p1_savings: effective_p1_savings,
    p1_transfers_out: effective_p1_transfers_out,
    p1_total_obligations,
    p1_rollover_next: effective_p1_rollover_next,
    p2_rollover: effective_p2_rollover,
    p2_income: effective_p2_income,
    p2_transfers_in: effective_p2_transfers_in,
    p2_fixed_bills: effective_p2_fixed_bills,
    p2_lifestyle: effective_p2_lifestyle,
    p2_extra_debt: effective_p2_extra_debt,
    p2_savings: effective_p2_savings,
    p2_checking_buffer: effective_p2_buffer,
    p2_transfers_out: effective_p2_transfers_out,
    p2_total_obligations,
    p2_leftover: effective_p2_leftover,
    total_income,
    total_transfers_in,
    total_transfers_out,
    total_fixed_bills,
    total_lifestyle,
    total_extra_debt,
    total_savings,
    total_buffer,
    total_obligations,
    total_remainder,
  };

  const isLiveActualsMode = mode === 'live_actuals';

  return {
    ...row,
    month: monthKey,
    mode,
    live_actuals: live_actuals_data,
    worst_case: worst_case_data,
    p1_period: effective_p1_period,
    p1_rollover: isLiveActualsMode ? live_actuals_data.p1_rollover : effective_p1_rollover,
    checking_ledger_rollover: dyn_p1_rollover,
    rollover_tx: null,
    live_checking_balance: checkingBalance,
    checking_balance: checkingBalance,
    spendable_checking: spendableChecking,
    p1_income: isLiveActualsMode ? live_actuals_data.p1_income : effective_p1_income,
    p1_fixed_bills: isLiveActualsMode ? live_actuals_data.p1_fixed_bills : effective_p1_fixed_bills,
    p1_total_fixed_bills: p1FixedBills,
    p1_lifestyle_planned: planned_p1_lifestyle,
    p1_lifestyle_spent,
    p1_lifestyle: isLiveActualsMode ? live_actuals_data.p1_lifestyle : effective_p1_lifestyle,
    p1_extra_debt_planned: planned_p1_extra_debt,
    p1_extra_debt_spent: p1_extra_debt_spent,
    p1_extra_debt: isLiveActualsMode ? live_actuals_data.p1_extra_debt : effective_p1_extra_debt,
    p1_unplanned_outflows_planned: planned_p1_extra_debt,
    p1_unplanned_outflows_spent: p1_extra_debt_spent,
    p1_unplanned_outflows: isLiveActualsMode ? live_actuals_data.p1_extra_debt : effective_p1_extra_debt,
    p1_savings: isLiveActualsMode ? live_actuals_data.p1_savings : effective_p1_savings,
    p1_transfers_in: isLiveActualsMode ? live_actuals_data.p1_transfers_in : effective_p1_transfers_in,
    p1_transfers_out: isLiveActualsMode ? live_actuals_data.p1_transfers_out : effective_p1_transfers_out,
    p1_transfers_in_items,
    p1_transfers_out_items,
    p1_total_obligations: isLiveActualsMode ? live_actuals_data.p1_total_obligations : p1_total_obligations,
    p1_unpaid_fixed_bills: p1UnpaidTotal,
    p1_paid_fixed_bills: p1PaidTotal,
    p1_unpaid_count: p1UnpaidBills.length,
    p1_paid_count: p1PaidBills.length,
    p1_total_bills_count: p1AllBills.length,
    p1_rollover_next: isLiveActualsMode ? live_actuals_data.p1_rollover_next : effective_p1_rollover_next,
    p2_period: effective_p2_period,
    p2_rollover: isLiveActualsMode ? live_actuals_data.p2_rollover : effective_p2_rollover,
    p2_income: isLiveActualsMode ? live_actuals_data.p2_income : effective_p2_income,
    cleared_p2_tx: clearedP2Tx ? {
      id: clearedP2Tx.id,
      date: clearedP2Tx.date,
      amount: Number(clearedP2Tx.amount || 0),
      description: clearedP2Tx.description
    } : null,
    cleared_p2_date: clearedP2Date || null,
    cleared_p2_day: clearedP2Day || null,
    pre_deposit_checking_balance: preDepositCheckingBalance,
    p2_fixed_bills: isLiveActualsMode ? live_actuals_data.p2_fixed_bills : effective_p2_fixed_bills,
    p2_total_fixed_bills: p2FixedBills,
    p2_lifestyle_planned: planned_p2_lifestyle,
    p2_lifestyle_spent,
    p2_lifestyle: isLiveActualsMode ? live_actuals_data.p2_lifestyle : effective_p2_lifestyle,
    p2_extra_debt_planned: planned_p2_extra_debt,
    p2_extra_debt_spent: p2_extra_debt_spent,
    p2_extra_debt: isLiveActualsMode ? live_actuals_data.p2_extra_debt : effective_p2_extra_debt,
    p2_unplanned_outflows_planned: planned_p2_extra_debt,
    p2_unplanned_outflows_spent: p2_extra_debt_spent,
    p2_unplanned_outflows: isLiveActualsMode ? live_actuals_data.p2_extra_debt : effective_p2_extra_debt,
    p2_savings: isLiveActualsMode ? live_actuals_data.p2_savings : effective_p2_savings,
    monthly_sinking_funds_total: dynamicMonthlySinkingFunds,
    p2_sinking_transfers: p2_sinking_transfers_items,
    p2_sinking_transfer_total: p2SinkingTransfersTotal,
    p2_sinking_cleared,
    p2_checking_buffer: isLiveActualsMode ? live_actuals_data.p2_checking_buffer : effective_p2_buffer,
    p2_transfers_in: isLiveActualsMode ? live_actuals_data.p2_transfers_in : effective_p2_transfers_in,
    p2_transfers_out: isLiveActualsMode ? live_actuals_data.p2_transfers_out : effective_p2_transfers_out,
    p2_transfers_in_items,
    p2_transfers_out_items,
    p2_total_obligations: isLiveActualsMode ? live_actuals_data.p2_total_obligations : p2_total_obligations,
    p2_unpaid_fixed_bills: p2UnpaidTotal,
    p2_paid_fixed_bills: p2PaidTotal,
    p2_unpaid_count: p2UnpaidBills.length,
    p2_paid_count: p2PaidBills.length,
    p2_total_bills_count: p2AllBills.length,
    p2_leftover: isLiveActualsMode ? live_actuals_data.p2_leftover : effective_p2_leftover,
    p2_raw_leftover: isLiveActualsMode ? live_actuals_data.p2_leftover : dyn_p2_leftover,
    p2_zero_sum_buffer,
    p2_zero_sum_savings,
    p2_zero_sum_debt,
    p2_zero_sum_target,
    p2_total_zero_sum_allocated,
    p2_unallocated_leftover: isLiveActualsMode ? live_actuals_data.p2_leftover : p2_unallocated_leftover,
    unplanned_outflows_txs: {
      p1: p1_unplanned_txs,
      p2: p2_unplanned_txs,
    },
    checking_ending_balance_prev_month: dyn_p1_rollover,
    prev_month_label: `${prevMonth} ${lastDayOfPrevMonth}`,
    is_p1_paid_prior_to_month: isP1PaidPriorToMonth ? 1 : 0,
    p1_effective_inflow_math: isLiveActualsMode ? live_actuals_data.p1_income : p1EffectiveInflowMath,
    p1_scheduled_pay_date: scheduledP1PayDate,
    p2_scheduled_pay_date: scheduledP2PayDate,
    total_income: isLiveActualsMode ? live_actuals_data.total_income : total_income,
    total_transfers_in: isLiveActualsMode ? live_actuals_data.total_transfers_in : total_transfers_in,
    total_transfers_out: isLiveActualsMode ? live_actuals_data.total_transfers_out : total_transfers_out,
    total_fixed_bills: isLiveActualsMode ? live_actuals_data.total_fixed_bills : total_fixed_bills,
    total_all_fixed_bills: Math.round((p1FixedBills + p2FixedBills) * 100) / 100,
    total_lifestyle: isLiveActualsMode ? live_actuals_data.total_lifestyle : total_lifestyle,
    total_extra_debt: isLiveActualsMode ? live_actuals_data.total_extra_debt : total_extra_debt,
    total_unplanned_outflows: isLiveActualsMode ? live_actuals_data.total_extra_debt : total_extra_debt,
    total_savings: isLiveActualsMode ? live_actuals_data.total_savings : total_savings,
    total_buffer: isLiveActualsMode ? live_actuals_data.total_buffer : total_buffer,
    total_obligations: isLiveActualsMode ? live_actuals_data.total_obligations : total_obligations,
    total_remainder: isLiveActualsMode ? live_actuals_data.total_remainder : total_remainder,
    is_manual: isManualMode ? 1 : 0,
    manual_fields: manualFields,
    lifestyle_umbrella_categories,
    extra_debt_categories,
    dynamic_values: {
      p1_rollover: dyn_p1_rollover,
      p1_income: dyn_p1_income,
      p1_transfers_in: dyn_p1_transfers_in,
      p1_transfers_out: dyn_p1_transfers_out,
      p1_effective_inflow_math: p1EffectiveInflowMath,
      p1_fixed_bills: dyn_p1_fixed_bills,
      p1_lifestyle_planned: planned_p1_lifestyle,
      p1_lifestyle_spent,
      p1_lifestyle: dyn_p1_lifestyle,
      p1_extra_debt_planned: planned_p1_extra_debt,
      p1_extra_debt_spent: p1_extra_debt_spent,
      p1_extra_debt: dyn_p1_extra_debt,
      p1_savings: dyn_p1_savings,
      p1_rollover_next: clearedP2Tx ? preDepositCheckingBalance : dyn_p1_rollover_next,
      p2_rollover: clearedP2Tx ? preDepositCheckingBalance : dyn_p1_rollover_next,
      p2_income: clearedP2Tx ? clearedP2Income : dyn_p2_income,
      cleared_p2_date: clearedP2Date || null,
      cleared_p2_day: clearedP2Day || null,
      pre_deposit_checking_balance: preDepositCheckingBalance,
      p2_transfers_in: dyn_p2_transfers_in,
      p2_transfers_out: dyn_p2_transfers_out,
      p2_fixed_bills: dyn_p2_fixed_bills,
      p2_lifestyle_planned: planned_p2_lifestyle,
      p2_lifestyle_spent,
      p2_lifestyle: dyn_p2_lifestyle,
      p2_extra_debt_planned: planned_p2_extra_debt,
      p2_extra_debt_spent: p2_extra_debt_spent,
      p2_extra_debt: dyn_p2_extra_debt,
      p2_savings: dyn_p2_savings,
      monthly_sinking_funds_total: dynamicMonthlySinkingFunds,
      p2_checking_buffer: dyn_p2_buffer,
      p2_leftover: dyn_p2_leftover,
      total_extra_debt,
      total_transfers_in,
      total_transfers_out,
    }
  };
}

// --- Overview / Stats ---
app.get('/api/stats/overview', (req: Request, res: Response) => {
  try {
    const month = (req.query.month as string) || 'Sep';
    const year = parseInt((req.query.year as string) || '2026', 10);

    const categories = db.prepare(`
      SELECT c.id, c.name, c.icon, c.color, c.sort_order,
             COALESCE(mcb.budget, c.budget) as budget,
             COALESCE(mcb.is_hidden, c.is_hidden, 0) as is_hidden
      FROM categories c
      LEFT JOIN monthly_category_budgets mcb 
        ON mcb.category_id = c.id AND mcb.year = ? AND mcb.month = ?
      WHERE COALESCE(mcb.is_hidden, c.is_hidden, 0) = 0
      ORDER BY c.sort_order ASC
    `).all(year, month) as any[];
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY sort_order ASC').all() as any[];
    const bills = db.prepare('SELECT * FROM bills ORDER BY due_day ASC').all() as any[];
    const annualBills = db.prepare('SELECT * FROM annual_bills').all() as any[];
    const txs = db.prepare('SELECT * FROM transactions ORDER BY date DESC, created_at DESC').all() as any[];
    const paycheck = getPaycheckPlanForMonth(month, year);

    const monthMap: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
      'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    const monthNum = monthMap[month] || '08';
    const monthPrefix = `${year}-${monthNum}`;
    const colName = `paid_${month.toLowerCase()}`;

    // Calculate category actuals for the SELECTED month
    const categoryTotals: Record<string, number> = {};
    const norm = (s: string) => (s || '').trim().toLowerCase();

    for (const cat of categories) {
      categoryTotals[norm(cat.name)] = 0;
    }

    // 1. Paid bills for the selected month column
    for (const b of bills) {
      if (b[colName] === 1) {
        const key = norm(b.category);
        categoryTotals[key] = (categoryTotals[key] || 0) + Number(b.amount || 0);
      }
    }

    // 2. Transactions for that specific month across all accounts (checking, savings, petty, credit cards)
    const paidBillsInMonth = bills.filter(b => b[colName] === 1);
    const paidBillNames = new Set(paidBillsInMonth.map(b => norm(b.name)));

    for (const t of txs) {
      if (!t.date || !t.date.startsWith(monthPrefix)) continue;
      const catKey = norm(t.category);
      if (!catKey) continue;
      const amt = Number(t.amount || 0);
      if (amt <= 0) continue;

      const acc = accounts.find(a => a.id === t.account_id);
      const isBankAcc = t.account_id === 'acc_checking' || t.account_id === 'acc_savings' || t.account_id === 'acc_petty';
      const isCC = acc?.type === 'credit_card';

      if (isBankAcc) {
        // Checking / Savings / Petty Cash
        // A) Avoid double counting auto-synced bill transactions with Step 1
        if (t.notes && t.notes.includes('[Bill Auto-Sync')) {
          continue;
        }

        // B) Credit Card payment synced from CC ([CC Payment Sync: ...])
        // If the corresponding credit card bill was already counted in Step 1 as a paid bill,
        // do not double-count it under Debt Repayment
        if (t.notes && t.notes.includes('[CC Payment Sync:')) {
          const cleanDesc = norm(t.description).replace('payment to ', '').trim();
          const isBillCounted = Array.from(paidBillNames).some(bName => 
            cleanDesc.includes(bName) || bName.includes(cleanDesc)
          );
          if (isBillCounted) {
            continue;
          }
        }

        // Add regular expenses / withdrawals from checking / savings / petty cash
        if (t.type === 'Expense' || t.type === 'Payment' || (t.type === 'Track Only' && catKey !== 'rollover')) {
          categoryTotals[catKey] = (categoryTotals[catKey] || 0) + amt;
        }
      } else if (isCC) {
        // Credit Card Ledger
        const isPayment = isCreditCardPayment(acc, t);
        const isRefund = catKey.includes('refund') || norm(t.description).includes('refund');
        const isStartingBalance = norm(t.description).includes('starting balance');

        if (isStartingBalance) {
          // Starting balances are baseline calibrations, not monthly spending
          continue;
        }

        if (isPayment) {
          // Credit card payments pay down revolving card balance.
          // They are debt paydown transfers, NOT living expenses (e.g. not groceries, gas, etc.).
          // Cash outflow is already captured in the Checking Ledger.
          // If a payment was made directly on CC without a linked checking transaction and without a paid bill in Step 1,
          // count towards Debt Repayment once:
          const isSyncedToChecking = Boolean(t.linked_transaction_id);
          if (!isSyncedToChecking) {
            const cleanAccName = norm(acc.name);
            const isBillCounted = Array.from(paidBillNames).some(bName => 
              cleanAccName.includes(bName) || bName.includes(cleanAccName)
            );
            if (!isBillCounted) {
              categoryTotals['debt repayment'] = (categoryTotals['debt repayment'] || 0) + amt;
            }
          }
        } else if (isRefund) {
          // Merchant refund on credit card reduces category spend if mapped
          if (catKey !== 'refunds' && categoryTotals[catKey] !== undefined) {
            categoryTotals[catKey] = Math.max(0, (categoryTotals[catKey] || 0) - amt);
          }
        } else if (t.type === 'Expense') {
          // Credit card charge (real-time spending on groceries, gas, shopping, utilities, etc.):
          // Directly add to the corresponding category's Actual column on the Monthly Budget Planner!
          categoryTotals[catKey] = (categoryTotals[catKey] || 0) + amt;
        }
      }
    }

    // Checking balance & buffer
    const checkingAcc = accounts.find(a => a.id === 'acc_checking');
    const checkingBal = checkingAcc ? checkingAcc.balance : 0;
    const checkingBuffer = checkingAcc ? checkingAcc.buffer : 500;
    const spendableChecking = Math.max(0, checkingBal - checkingBuffer);

    // Savings balance
    const savingsAcc = accounts.find(a => a.id === 'acc_savings');
    const savingsBal = savingsAcc ? savingsAcc.balance : 0;

    // Petty cash balance
    const pettyAcc = accounts.find(a => a.id === 'acc_petty');
    const pettyBal = pettyAcc ? pettyAcc.balance : 0;

    // Debt totals
    const revolvingDebts = accounts.filter(a => a.category === 'revolving');
    const autoDebts = accounts.filter(a => a.category === 'auto_loan' || a.category === 'personal_loan');
    
    const revolvingTotal = revolvingDebts.reduce((sum, a) => sum + (a.balance || 0), 0);
    const autoTotal = autoDebts.reduce((sum, a) => sum + (a.balance || 0), 0);
    const totalDebt = revolvingTotal + autoTotal;

    // Monthly Budget Categories: all non-income categories
    const nonBudgetCats = ['income', 'refunds', 'rollover', 'paycheck 1', 'paycheck 2', 'interest earned', 'transfer'];
    const safeNonBudgetCats = Array.isArray(nonBudgetCats) ? nonBudgetCats : [nonBudgetCats];
    const mainCategories = categories.filter(c => !(Array.isArray(safeNonBudgetCats) ? safeNonBudgetCats.includes(norm(c.name)) : false));

    let totalBudget = 0;
    let totalActual = 0;
    const budgetCategories = mainCategories.map(cat => {
      const budget = Number(cat.budget) || 0;
      const actual = Math.round((Number(categoryTotals[norm(cat.name)]) || 0) * 100) / 100;
      const diff = Math.round((budget - actual) * 100) / 100;
      const delta = budget > 0 ? (actual / budget) : (actual > 0 ? 1 : 0);
      totalBudget += budget;
      totalActual += actual;
      return {
        ...cat,
        actual,
        difference: diff,
        delta
      };
    });

    // Bills Paid vs Total for the selected month
    const totalBillsCount = bills.length;
    const billsPaidCount = bills.filter(b => b[colName] === 1).length;
    const totalBillsAmount = bills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const billsPaidAmount = bills.filter(b => b[colName] === 1).reduce((sum, b) => sum + Number(b.amount || 0), 0);

    res.json({
      checking: {
        balance: checkingBal,
        buffer: checkingBuffer,
        spendable: spendableChecking
      },
      savings: {
        balance: savingsBal
      },
      pettyCash: {
        balance: pettyBal
      },
      debt: {
        revolving: revolvingTotal,
        auto: autoTotal,
        total: totalDebt,
        accountsCount: revolvingDebts.length + autoDebts.length
      },
      budgetSummary: {
        totalBudget: Math.round(totalBudget * 100) / 100,
        totalActual: Math.round(totalActual * 100) / 100,
        totalDifference: Math.round((totalBudget - totalActual) * 100) / 100,
        delta: totalBudget > 0 ? (totalActual / totalBudget) : 0,
        categories: budgetCategories
      },
      billsSummary: {
        totalCount: totalBillsCount,
        paidCount: billsPaidCount,
        totalAmount: totalBillsAmount,
        paidAmount: billsPaidAmount,
        dueAmount: totalBillsAmount - billsPaidAmount
      },
      paycheckPlan: paycheck
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Categories ---
app.get('/api/categories', (req: Request, res: Response) => {
  try {
    const month = req.query.month as string;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const budgetOnly = req.query.budget_only === 'true';

    if (budgetOnly && month && year) {
      const rows = db.prepare(`
        SELECT c.id, c.name, c.icon, c.color, c.sort_order,
               COALESCE(mcb.budget, c.budget) as budget,
               COALESCE(mcb.is_hidden, c.is_hidden, 0) as is_hidden
        FROM categories c
        LEFT JOIN monthly_category_budgets mcb 
          ON mcb.category_id = c.id AND mcb.year = ? AND mcb.month = ?
        WHERE COALESCE(mcb.is_hidden, c.is_hidden, 0) = 0
        ORDER BY c.sort_order ASC
      `).all(year, month);
      res.json(rows);
      return;
    }

    // Default: ALWAYS return all categories so transaction category selection dropdowns have every category available!
    const rows = db.prepare(`
      SELECT c.id, c.name, c.icon, c.color, c.sort_order, c.budget, c.is_hidden
      FROM categories c
      ORDER BY c.sort_order ASC
    `).all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', (req: Request, res: Response) => {
  try {
    const { name, icon = '🌸', budget = 0, color = '#7d3c4c', month, year } = req.body;
    const existing = db.prepare('SELECT * FROM categories WHERE LOWER(name) = ?').get(name.trim().toLowerCase()) as any;

    if (existing) {
      // Unhide category and activate for this month's budget
      db.prepare('UPDATE categories SET is_hidden = 0, icon = ?, color = ? WHERE id = ?').run(icon, color, existing.id);
      if (month && year) {
        db.prepare(`
          INSERT INTO monthly_category_budgets (category_id, year, month, budget, is_hidden)
          VALUES (?, ?, ?, ?, 0)
          ON CONFLICT(category_id, year, month) DO UPDATE SET is_hidden = 0, budget = excluded.budget
        `).run(existing.id, Number(year), month, Number(budget));
      }
      res.json({ success: true, id: existing.id });
      return;
    }

    const count = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as any).c;
    const id = `cat_${Date.now()}`;
    db.prepare('INSERT INTO categories (id, name, icon, budget, color, sort_order, is_hidden) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .run(id, name.trim(), icon, budget, color, count + 1);

    if (month && year && budget !== undefined) {
      db.prepare(`
        INSERT INTO monthly_category_budgets (category_id, year, month, budget, is_hidden)
        VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(category_id, year, month) DO UPDATE SET budget = excluded.budget, is_hidden = 0
      `).run(id, Number(year), month, Number(budget));
    }

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', (req: Request, res: Response) => {
  try {
    const { name, icon, budget, color, month, year } = req.body;
    const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id as string) as any;
    if (!current) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    const newName = name !== undefined ? name.trim() : current.name;
    const newIcon = icon !== undefined ? icon.trim() : current.icon;
    const newColor = color !== undefined ? color : current.color;

    db.prepare('UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?')
      .run(newName, newIcon, newColor, (req.params.id as string));

    // If category name was renamed, cascade update transactions and bills
    if (newName && current.name && newName !== current.name) {
      db.prepare('UPDATE transactions SET category = ? WHERE category = ?').run(newName, current.name);
      db.prepare('UPDATE bills SET category = ? WHERE category = ?').run(newName, current.name);
    }

    if (budget !== undefined) {
      if (month && year) {
        db.prepare(`
          INSERT INTO monthly_category_budgets (category_id, year, month, budget)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(category_id, year, month) DO UPDATE SET budget = excluded.budget
        `).run(req.params.id as string, Number(year), month, Number(budget));
      } else {
        db.prepare('UPDATE categories SET budget = ? WHERE id = ?').run(Number(budget), (req.params.id as string));
      }

      // If updating Savings category, also sync the recurring Savings bill
      if (req.params.id === 'cat_sav' || newName.toLowerCase() === 'savings') {
        db.prepare("UPDATE bills SET amount = ? WHERE id = 'bill_21' OR LOWER(name) = 'savings'").run(Number(budget));
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const month = req.query.month as string;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const scope = (req.query.scope as string) || (month && year ? 'month' : 'all');

    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
    if (!cat) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    if (scope === 'month' && month && year) {
      // Remove row strictly from this specific month's budget planner
      db.prepare(`
        INSERT INTO monthly_category_budgets (category_id, year, month, budget, is_hidden)
        VALUES (?, ?, ?, 0, 1)
        ON CONFLICT(category_id, year, month) DO UPDATE SET is_hidden = 1, budget = 0
      `).run(id, year, month);
      console.log(`🌸 Removed row for category "${cat.name}" from ${month} ${year} monthly budget.`);
    } else {
      // Remove row from all monthly budgets
      db.prepare('UPDATE categories SET is_hidden = 1 WHERE id = ?').run(id);
      db.prepare('UPDATE monthly_category_budgets SET is_hidden = 1, budget = 0 WHERE category_id = ?').run(id);
      console.log(`🌸 Removed row for category "${cat.name}" from all monthly budgets.`);
    }

    // Transactions and Bills are 100% PRESERVED. They are NEVER deleted or reassigned!
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories-reorder', (req: Request, res: Response) => {
  try {
    const { order } = req.body; // array of category ids
    if (!Array.isArray(order)) {
      res.status(400).json({ error: 'Invalid order array' });
      return;
    }
    const update = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
    const tx = db.transaction(() => {
      order.forEach((id: string, idx: number) => {
        update.run(idx, id);
      });
    });
    tx();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Accounts & Debts ---
app.get('/api/accounts', (req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM accounts ORDER BY sort_order ASC').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/accounts/:id', (req: Request, res: Response) => {
  try {
    const current = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id as string) as any;
    if (!current) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const { name, balance, starting_balance, min_payment, apr, due_day, buffer, icon, category } = req.body;
    const finalName = name !== undefined ? name : current.name;
    const finalMinPayment = min_payment !== undefined ? min_payment : current.min_payment;
    const finalDueDay = due_day !== undefined ? due_day : current.due_day;

    db.prepare(`
      UPDATE accounts 
      SET name = ?, balance = ?, starting_balance = ?, min_payment = ?, apr = ?, due_day = ?, buffer = ?, icon = ?, category = ? 
      WHERE id = ?
    `).run(
      finalName,
      balance !== undefined ? balance : current.balance,
      starting_balance !== undefined ? starting_balance : current.starting_balance,
      finalMinPayment,
      apr !== undefined ? apr : current.apr,
      finalDueDay,
      buffer !== undefined ? buffer : current.buffer,
      icon !== undefined ? icon : current.icon,
      category !== undefined ? category : current.category,
      (req.params.id as string)
    );
    recalculateAccountBalances((req.params.id as string) as string);

    // Automatically sync updated minimum payment & due day to corresponding bill in Monthly Bills!
    if (min_payment !== undefined || due_day !== undefined || name !== undefined) {
      syncAccountWithBill((req.params.id as string), finalName, Number(finalMinPayment), finalDueDay);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/accounts-reorder', (req: Request, res: Response) => {
  try {
    const { order } = req.body; // array of account ids
    if (!Array.isArray(order)) {
      res.status(400).json({ error: 'Invalid order array' });
      return;
    }
    const update = db.prepare('UPDATE accounts SET sort_order = ? WHERE id = ?');
    const tx = db.transaction(() => {
      order.forEach((id: string, idx: number) => {
        update.run(idx + 1, id);
      });
    });
    tx();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bills ---
app.get('/api/bills', (req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM bills ORDER BY (CASE WHEN sort_order IS NOT NULL AND sort_order > 0 THEN 0 ELSE 1 END), sort_order ASC, due_day ASC').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bills', (req: Request, res: Response) => {
  try {
    const { name, due_day, category, amount, paycheck_assignment, assigned_check, auto_pay, notes } = req.body;
    const finalAssignment = paycheck_assignment || assigned_check || (due_day <= 15 ? 'Paycheck 1 (1st-15th)' : 'Paycheck 2 (16th-31st)');
    const finalAssignedCheck = assigned_check || (
      paycheck_assignment && !paycheck_assignment.includes('(1st-15th)') && !paycheck_assignment.includes('(16th-31st)')
        ? paycheck_assignment
        : null
    );
    const id = `bill_${Date.now()}`;
    const maxSort = (db.prepare('SELECT MAX(sort_order) as m FROM bills').get() as any)?.m || 0;
    db.prepare(`
      INSERT INTO bills (id, name, due_day, category, amount, paycheck_assignment, assigned_check, auto_pay, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, due_day, category, amount, finalAssignment, finalAssignedCheck, auto_pay ? 1 : 0, notes || '', maxSort + 1);
    res.json({ id, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/bills-reorder', (req: Request, res: Response) => {
  try {
    const { order } = req.body; // array of bill ids
    if (!Array.isArray(order) || order.length === 0) {
      res.status(400).json({ error: 'Invalid order array' });
      return;
    }
    const update = db.prepare('UPDATE bills SET sort_order = ? WHERE id = ?');
    const tx = db.transaction(() => {
      order.forEach((id: string, idx: number) => {
        update.run(idx + 1, id);
      });
    });
    tx();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/bills/:id/toggle-paid', (req: Request, res: Response) => {
  try {
    const { month, year = 2026 } = req.body; // e.g. Aug, Sep, Oct, Nov, Dec
    const billId = req.params.id as string;
    const colName = `paid_${month.toLowerCase()}`;
    
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId) as any;
    if (!bill) {
      res.status(404).json({ error: 'Bill not found' });
      return;
    }

    const currentVal = bill[colName] || 0;
    const newVal = currentVal === 1 ? 0 : 1;
    
    // Month number mapping (Aug -> 08)
    const monthMap: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
      'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    const monthNum = monthMap[month] || '08';
    const dayStr = String(bill.due_day || 1).padStart(2, '0');
    const txDate = `${year}-${monthNum}-${dayStr}`;
    const syncTag = `[Bill Auto-Sync: ${billId}_${year}_${month}]`;

    const tx = db.transaction(() => {
      // 1. Update bill paid status
      db.prepare(`UPDATE bills SET ${colName} = ? WHERE id = ?`).run(newVal, billId);

      if (newVal === 1) {
        // 2. Marked as PAID -> Insert into Checking Ledger if not already present
        const existing = db.prepare('SELECT id FROM transactions WHERE notes LIKE ?').get(`%${syncTag}%`) as any;
        if (!existing) {
          const txId = `tx_bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          
          // Determine account: default checking, unless track only
          const isTrackOnly = bill.name.includes('(comes out of');
          const ttype = isTrackOnly ? 'Track Only' : 'Expense';
          
          // Shift existing sort_order to place this new bill transaction at the very top of the ledger
          db.prepare('UPDATE transactions SET sort_order = sort_order + 1 WHERE account_id = ? AND sort_order > 0').run('acc_checking');

          db.prepare(`
            INSERT INTO transactions (id, account_id, date, description, category, type, amount, notes, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            txId,
            'acc_checking',
            txDate,
            bill.name,
            bill.category,
            ttype,
            Number(bill.amount),
            syncTag
          );
        }
      } else {
        // 3. Marked as UNPAID -> Remove auto-synced transaction from checking
        db.prepare('DELETE FROM transactions WHERE notes LIKE ?').run(`%${syncTag}%`);
      }
    });

    tx();
    recalculateAccountBalances('acc_checking');
    res.json({ success: true, newVal, billName: bill.name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/bills/:id', (req: Request, res: Response) => {
  try {
    const current = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id as string) as any;
    if (!current) {
      res.status(404).json({ error: 'Bill not found' });
      return;
    }
    const { name, due_day, category, amount, paycheck_assignment, assigned_check, auto_pay, notes } = req.body;
    const nextAssignment = paycheck_assignment !== undefined ? paycheck_assignment : current.paycheck_assignment;
    const nextAssignedCheck = assigned_check !== undefined
      ? assigned_check
      : (paycheck_assignment !== undefined
          ? (paycheck_assignment && !paycheck_assignment.includes('(1st-15th)') && !paycheck_assignment.includes('(16th-31st)') ? paycheck_assignment : null)
          : current.assigned_check);

    db.prepare(`
      UPDATE bills 
      SET name = ?, due_day = ?, category = ?, amount = ?, paycheck_assignment = ?, assigned_check = ?, auto_pay = ?, notes = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name : current.name,
      due_day !== undefined ? due_day : current.due_day,
      category !== undefined ? category : current.category,
      amount !== undefined ? amount : current.amount,
      nextAssignment,
      nextAssignedCheck,
      auto_pay !== undefined ? (auto_pay ? 1 : 0) : current.auto_pay,
      notes !== undefined ? notes : current.notes,
      (req.params.id as string)
    );

    // If updating recurring Savings bill, also sync the Savings category budget
    if (current.id === 'bill_21' || current.name.toLowerCase() === 'savings') {
      if (amount !== undefined) {
        db.prepare("UPDATE categories SET budget = ? WHERE id = 'cat_sav' OR LOWER(name) = 'savings'").run(Number(amount));
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/bills/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM bills WHERE id = ?').run((req.params.id as string));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Auto-sync paid annual bills with Checking Ledger
function syncAnnualBillTransaction(bill: any, isPaid: boolean) {
  const syncTag = `[Annual Bill Auto-Sync: ${bill.id}]`;
  if (isPaid) {
    // 1. Check if transaction with this sync tag already exists
    const existingSync = db.prepare('SELECT id FROM transactions WHERE notes LIKE ?').get(`%${syncTag}%`) as any;
    if (existingSync) {
      db.prepare('UPDATE transactions SET date = ?, description = ?, amount = ? WHERE id = ?').run(
        bill.due_date || new Date().toISOString().slice(0, 10),
        bill.name,
        Number(bill.amount),
        existingSync.id
      );
      return;
    }

    // 2. Check if an existing un-tagged checking transaction matches this annual bill (e.g. historical seed)
    const cleanName = bill.name.replace(/\s*\([^)]*\)\s*$/g, '').trim().toLowerCase();
    const existingUntagged = db.prepare(`
      SELECT id, notes FROM transactions 
      WHERE account_id = 'acc_checking' 
        AND (LOWER(description) = LOWER(?) OR LOWER(description) = ?)
        AND ABS(amount - ?) < 0.01
        AND (notes IS NULL OR notes NOT LIKE '%[Annual Bill Auto-Sync:%')
      LIMIT 1
    `).get(bill.name, cleanName, Number(bill.amount)) as any;

    if (existingUntagged) {
      const newNotes = existingUntagged.notes ? `${existingUntagged.notes} ${syncTag}` : syncTag;
      db.prepare('UPDATE transactions SET notes = ? WHERE id = ?').run(newNotes, existingUntagged.id);
      return;
    }

    // 3. Insert fresh transaction into acc_checking
    const txId = `tx_ann_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let cat = 'Subscriptions';
    const bNameLower = bill.name.toLowerCase();
    if (bNameLower.includes('insurance') || bNameLower.includes('liberty')) {
      cat = 'Insurance';
    } else if (bNameLower.includes('annual') || bNameLower.includes('sinking') || bNameLower.includes('sam')) {
      cat = 'Annual Subscriptions (Savings)';
    }

    const txDate = bill.due_date && /^\d{4}-\d{2}-\d{2}$/.test(bill.due_date)
      ? bill.due_date
      : new Date().toISOString().slice(0, 10);

    db.prepare('UPDATE transactions SET sort_order = sort_order + 1 WHERE account_id = ? AND sort_order > 0').run('acc_checking');

    db.prepare(`
      INSERT INTO transactions (id, account_id, date, description, category, type, amount, notes, sort_order)
      VALUES (?, 'acc_checking', ?, ?, ?, 'Expense', ?, ?, 1)
    `).run(
      txId,
      txDate,
      bill.name,
      cat,
      Number(bill.amount),
      syncTag
    );
  } else {
    // Marked unpaid -> delete auto-synced transaction from checking
    db.prepare('DELETE FROM transactions WHERE notes LIKE ?').run(`%${syncTag}%`);
  }
}

// --- Annual & Biannual Bills (Sinking Funds) ---
app.get('/api/annual-bills', (req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM annual_bills ORDER BY due_date ASC').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/annual-bills', (req: Request, res: Response) => {
  try {
    const { name, due_date, amount, frequency, notes, is_paid } = req.body;
    const id = `ann_${Date.now()}`;
    const paidVal = is_paid ? 1 : 0;
    db.prepare('INSERT INTO annual_bills (id, name, due_date, amount, frequency, notes, is_paid) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, due_date, Number(amount), frequency || 'annual', notes || '', paidVal);

    if (paidVal === 1) {
      const newBill = { id, name, due_date, amount: Number(amount), frequency: frequency || 'annual', notes, is_paid: 1 };
      syncAnnualBillTransaction(newBill, true);
      recalculateAccountBalances('acc_checking');
    }
    res.json({ id, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/annual-bills/:id', (req: Request, res: Response) => {
  try {
    const current = db.prepare('SELECT * FROM annual_bills WHERE id = ?').get(req.params.id as string) as any;
    if (!current) {
      res.status(404).json({ error: 'Annual bill not found' });
      return;
    }
    const { name, due_date, amount, frequency, notes, is_paid } = req.body;
    const nextPaid = is_paid !== undefined ? (is_paid ? 1 : 0) : current.is_paid;
    db.prepare(`
      UPDATE annual_bills
      SET name = ?, due_date = ?, amount = ?, frequency = ?, notes = ?, is_paid = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name : current.name,
      due_date !== undefined ? due_date : current.due_date,
      amount !== undefined ? Number(amount) : current.amount,
      frequency !== undefined ? frequency : current.frequency,
      notes !== undefined ? notes : current.notes,
      nextPaid,
      (req.params.id as string)
    );

    const updatedBill = db.prepare('SELECT * FROM annual_bills WHERE id = ?').get(req.params.id as string) as any;
    syncAnnualBillTransaction(updatedBill, nextPaid === 1);
    recalculateAccountBalances('acc_checking');

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/annual-bills/:id/toggle-paid', (req: Request, res: Response) => {
  try {
    const bill = db.prepare('SELECT * FROM annual_bills WHERE id = ?').get((req.params.id as string)) as any;
    if (!bill) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const newVal = bill.is_paid === 1 ? 0 : 1;
    
    db.transaction(() => {
      db.prepare('UPDATE annual_bills SET is_paid = ? WHERE id = ?').run(newVal, bill.id);
      const updated = { ...bill, is_paid: newVal };
      syncAnnualBillTransaction(updated, newVal === 1);
    })();

    recalculateAccountBalances('acc_checking');
    res.json({ success: true, is_paid: newVal, billName: bill.name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/annual-bills/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const syncTag = `[Annual Bill Auto-Sync: ${id}]`;
    db.transaction(() => {
      db.prepare('DELETE FROM annual_bills WHERE id = ?').run(id);
      db.prepare('DELETE FROM transactions WHERE notes LIKE ?').run(`%${syncTag}%`);
    })();
    recalculateAccountBalances('acc_checking');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Transactions ---
app.get('/api/transactions', (req: Request, res: Response) => {
  try {
    const { account_id } = req.query;
    let query = 'SELECT * FROM transactions';
    const params: any[] = [];
    if (account_id) {
      query += ' WHERE account_id = ?';
      params.push(account_id);
    }
    query += ' ORDER BY (CASE WHEN sort_order IS NOT NULL AND sort_order > 0 THEN 0 ELSE 1 END), sort_order ASC, date DESC, created_at DESC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/transactions-reorder', (req: Request, res: Response) => {
  try {
    const { account_id, order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      res.status(400).json({ error: 'Invalid order array' });
      return;
    }

    const updateStmt = db.prepare('UPDATE transactions SET sort_order = ? WHERE id = ?');
    const tx = db.transaction(() => {
      order.forEach((id: string, idx: number) => {
        updateStmt.run(idx + 1, id);
      });
    });
    tx();

    if (account_id) {
      recalculateAccountBalances(account_id);
    } else {
      recalculateAccountBalances();
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Linked Transfer Logic (Zero-Sum Execution) ---
function executeLinkedTransfer({
  source_account_id,
  destination_account_id,
  amount,
  date,
  description,
  notes
}: {
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  date?: string;
  description?: string;
  notes?: string;
}) {
  if (!source_account_id || !destination_account_id) {
    throw new Error('Both Source and Destination accounts are required for a transfer.');
  }
  if (source_account_id === destination_account_id) {
    throw new Error('Source Account and Destination Account cannot be the same.');
  }
  const numAmount = Math.round(Math.abs(Number(amount)) * 100) / 100;
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Transfer amount must be greater than zero.');
  }

  const sourceAcc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(source_account_id) as any;
  const destAcc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(destination_account_id) as any;

  if (!sourceAcc || !destAcc) {
    throw new Error('One or both transfer accounts could not be found.');
  }

  const txDate = date || new Date().toISOString().split('T')[0];
  const userDesc = (description || '').trim();
  const sourceDesc = userDesc 
    ? (userDesc.toLowerCase().includes('transfer') ? userDesc : `${userDesc} (to ${destAcc.name})`) 
    : `Transfer to ${destAcc.name}`;
  const destDesc = userDesc 
    ? (userDesc.toLowerCase().includes('transfer') ? userDesc : `${userDesc} (from ${sourceAcc.name})`) 
    : `Transfer from ${sourceAcc.name}`;

  const userNotes = (notes || '').trim();
  const sourceNotes = userNotes ? `${userNotes} [Transfer: Out -> ${destAcc.id}]` : `[Transfer: Out -> ${destAcc.id}]`;
  const destNotes = userNotes ? `${userNotes} [Transfer: In <- ${sourceAcc.id}]` : `[Transfer: In <- ${sourceAcc.id}]`;

  const sourceId = `tx_xfer_${Date.now()}_out_${Math.random().toString(36).substring(2, 6)}`;
  const destId = `tx_xfer_${Date.now()}_in_${Math.random().toString(36).substring(2, 6)}`;

  const runTx = db.transaction(() => {
    db.prepare('UPDATE transactions SET sort_order = sort_order + 1 WHERE account_id = ? AND sort_order > 0').run(sourceAcc.id);
    db.prepare('UPDATE transactions SET sort_order = sort_order + 1 WHERE account_id = ? AND sort_order > 0').run(destAcc.id);

    // Negative withdrawal in source account
    db.prepare(`
      INSERT INTO transactions (id, account_id, date, description, category, type, amount, notes, sort_order, linked_transaction_id)
      VALUES (?, ?, ?, ?, 'Transfer', 'Transfer', ?, ?, 1, ?)
    `).run(sourceId, sourceAcc.id, txDate, sourceDesc, numAmount, sourceNotes, destId);

    // Positive deposit in destination account
    db.prepare(`
      INSERT INTO transactions (id, account_id, date, description, category, type, amount, notes, sort_order, linked_transaction_id)
      VALUES (?, ?, ?, ?, 'Transfer', 'Transfer', ?, ?, 1, ?)
    `).run(destId, destAcc.id, txDate, destDesc, numAmount, destNotes, sourceId);
  });

  runTx();

  recalculateAccountBalances(sourceAcc.id);
  recalculateAccountBalances(destAcc.id);

  return {
    success: true,
    source_transaction_id: sourceId,
    destination_transaction_id: destId,
  };
}

app.post('/api/transfers', (req: Request, res: Response) => {
  try {
    const result = executeLinkedTransfer(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/transactions', (req: Request, res: Response) => {
  try {
    const { account_id, destination_account_id, date, description, category, type, amount, notes } = req.body;
    
    // If this is a Transfer with a destination account, execute linked zero-sum transfer!
    if (type === 'Transfer' && destination_account_id) {
      const result = executeLinkedTransfer({
        source_account_id: account_id,
        destination_account_id,
        amount,
        date,
        description,
        notes
      });
      return res.json({ id: result.source_transaction_id, ...result });
    }

    const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    // Shift existing sort_order to place this new transaction at the top
    db.prepare('UPDATE transactions SET sort_order = sort_order + 1 WHERE account_id = ? AND sort_order > 0').run(account_id);

    db.prepare(`
      INSERT INTO transactions (id, account_id, date, description, category, type, amount, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, account_id, date, description, category, type, Number(amount), notes || '');

    recalculateAccountBalances(account_id);

    // Automate credit card payment synchronization to Checking Ledger
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id) as any;
    if (account && account.type === 'credit_card' && isCreditCardPayment(account, { type, category, description })) {
      syncCreditCardPaymentToChecking({
        id,
        account_id,
        date,
        amount: Number(amount),
        description,
        category,
        type,
        notes
      });
    }

    res.json({ id, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions/bulk', (req: Request, res: Response) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      res.status(400).json({ error: 'No transactions provided' });
      return;
    }

    const insert = db.prepare(`
      INSERT INTO transactions (id, account_id, date, description, category, type, amount, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const affectedAccounts = new Set<string>();
    const count = transactions.length;
    const processedTxs: any[] = [];

    const tx = db.transaction(() => {
      // Group by account to shift sort orders
      for (const t of transactions) {
        affectedAccounts.add(t.account_id);
      }
      for (const accId of affectedAccounts) {
        const accCount = transactions.filter(t => t.account_id === accId).length;
        db.prepare('UPDATE transactions SET sort_order = sort_order + ? WHERE account_id = ? AND sort_order > 0').run(accCount, accId);
      }

      let accIndexMap: Record<string, number> = {};
      for (const t of transactions) {
        const id = t.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        accIndexMap[t.account_id] = (accIndexMap[t.account_id] || 0) + 1;
        insert.run(id, t.account_id, t.date, t.description, t.category, t.type, Number(t.amount), t.notes || '', accIndexMap[t.account_id]);
        processedTxs.push({ ...t, id });
      }
    });

    tx();

    for (const accId of affectedAccounts) {
      recalculateAccountBalances(accId);
    }

    // Auto-sync any bulk-imported credit card payments to Checking Ledger
    for (const t of processedTxs) {
      const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(t.account_id) as any;
      if (account && account.type === 'credit_card' && isCreditCardPayment(account, t)) {
        syncCreditCardPaymentToChecking(t);
      }
    }

    res.json({ success: true, count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/transactions/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get((req.params.id as string)) as any;
    if (!existing) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    const account_id = req.body.account_id || existing.account_id;
    const date = req.body.date || existing.date;
    const description = req.body.description !== undefined ? req.body.description : existing.description;
    const category = req.body.category || existing.category;
    const type = req.body.type || existing.type;
    const amount = req.body.amount !== undefined ? Number(req.body.amount) : existing.amount;
    const notes = req.body.notes !== undefined ? req.body.notes : existing.notes;

    db.prepare(`
      UPDATE transactions
      SET account_id = ?, date = ?, description = ?, category = ?, type = ?, amount = ?, notes = ?
      WHERE id = ?
    `).run(account_id, date, description, category, type, amount, notes || '', (req.params.id as string));

    recalculateAccountBalances(account_id);
    if (existing.account_id !== account_id) {
      recalculateAccountBalances(existing.account_id);
    }

    // Credit Card payment update or deletion in Checking
    const targetAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id) as any;
    const isPaymentNow = targetAccount && targetAccount.type === 'credit_card' && isCreditCardPayment(targetAccount, { type, category, description });

    if (isPaymentNow) {
      // Amount, date, or card was edited: update or create the linked checking entry
      syncCreditCardPaymentToChecking({
        id: (req.params.id as string),
        account_id,
        date,
        amount,
        description,
        category,
        type,
        notes,
        linked_transaction_id: existing.linked_transaction_id
      });
    } else if (existing.type !== 'Transfer') {
      // If it was changed to a purchase/charge or moved to non-CC account, remove any linked checking entry
      deleteLinkedCheckingTransaction((req.params.id as string));
    }

    // Linked Transfer synchronization
    if (existing.type === 'Transfer' && existing.linked_transaction_id) {
      const linkedTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(existing.linked_transaction_id) as any;
      if (linkedTx) {
        if (type === 'Transfer') {
          // Keep linked transaction in sync for amount and date
          const cleanNotes = (notes !== undefined ? notes : existing.notes || '').replace(/\[Transfer: (?:Out ->|In <-) [^\]]+\]/g, '').trim();
          const isExistingOut = (existing.notes || '').includes('[Transfer: Out');
          const linkedNotes = isExistingOut
            ? (cleanNotes ? `${cleanNotes} [Transfer: In <- ${account_id}]` : `[Transfer: In <- ${account_id}]`)
            : (cleanNotes ? `${cleanNotes} [Transfer: Out -> ${account_id}]` : `[Transfer: Out -> ${account_id}]`);

          db.prepare(`
            UPDATE transactions
            SET date = ?, amount = ?, notes = ?
            WHERE id = ?
          `).run(date, amount, linkedNotes, linkedTx.id);

          recalculateAccountBalances(linkedTx.account_id);
        } else {
          // Type was changed away from Transfer: unlink
          db.prepare('UPDATE transactions SET linked_transaction_id = NULL WHERE id = ?').run(linkedTx.id);
          db.prepare('UPDATE transactions SET linked_transaction_id = NULL WHERE id = ?').run(existing.id);
          recalculateAccountBalances(linkedTx.account_id);
        }
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', (req: Request, res: Response) => {
  try {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get((req.params.id as string)) as any;
    if (tx) {
      const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(tx.account_id) as any;

      if (account && account.type === 'credit_card') {
        // Automatically delete the linked checking withdrawal
        deleteLinkedCheckingTransaction(tx.id);
      } else if (tx.type === 'Transfer' && tx.linked_transaction_id) {
        // Automatically delete the linked transfer leg to preserve zero-sum balance
        const linkedTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx.linked_transaction_id) as any;
        if (linkedTx) {
          db.prepare('DELETE FROM transactions WHERE id = ?').run(linkedTx.id);
          recalculateAccountBalances(linkedTx.account_id);
        }
      } else if (tx.linked_transaction_id) {
        // If deleting from checking side, unlink the credit card transaction
        db.prepare('UPDATE transactions SET linked_transaction_id = NULL WHERE id = ?').run(tx.linked_transaction_id);
      }

      db.prepare('DELETE FROM transactions WHERE id = ?').run((req.params.id as string));
      recalculateAccountBalances(tx.account_id);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Paycheck Plan ---
app.get('/api/paycheck', (req: Request, res: Response) => {
  try {
    const month = (req.query.month as string) || 'Aug';
    const year = parseInt((req.query.year as string) || '2026', 10);
    const mode = ((req.query.mode as string) || 'worst_case') as 'worst_case' | 'live_actuals';
    const plan = getPaycheckPlanForMonth(month, year, mode);
    res.json(plan);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/paycheck', (req: Request, res: Response) => {
  try {
    const p = req.body;
    const monthKey = p.month || 'Aug 2026';
    const manualFieldsStr = typeof p.manual_fields === 'string' 
      ? p.manual_fields 
      : JSON.stringify(p.manual_fields || []);
    const isManual = p.is_manual ? 1 : 0;

    // Schedule & coverage settings
    const p1_payday_mode = p.p1_payday_mode || 'prev_month_last_day';
    const p1_payday_day = Number(p.p1_payday_day ?? 0);
    const p1_bill_start = Number(p.p1_bill_start ?? 1);
    const p1_bill_end = Number(p.p1_bill_end ?? 15);
    const p2_payday_mode = p.p2_payday_mode || 'day_of_month';
    const p2_payday_day = Number(p.p2_payday_day ?? 15);
    const p2_bill_start = Number(p.p2_bill_start ?? 16);
    const p2_bill_end = Number(p.p2_bill_end ?? 31);

    // Sinking funds dynamic default
    const allAnnualBills = db.prepare('SELECT * FROM annual_bills').all() as any[];
    const defaultP2Savings = calculateMonthlySinkingFundsTotal(allAnnualBills);
    let manualFieldsArr: string[] = [];
    if (Array.isArray(p.manual_fields)) {
      manualFieldsArr = p.manual_fields;
    } else if (typeof p.manual_fields === 'string') {
      try {
        const parsed = JSON.parse(manualFieldsStr);
        manualFieldsArr = Array.isArray(parsed)
          ? parsed
          : (typeof parsed === 'string' && parsed.trim().length > 0 ? [parsed.trim()] : [p.manual_fields.trim()]);
      } catch {
        manualFieldsArr = p.manual_fields.trim() ? [p.manual_fields.trim()] : [];
      }
    }
    if (!Array.isArray(manualFieldsArr)) {
      manualFieldsArr = typeof manualFieldsArr === 'string' && (manualFieldsArr as string).trim().length > 0
        ? [(manualFieldsArr as string).trim()]
        : [];
    }
    const isP2SavingsManual = Array.isArray(manualFieldsArr) ? manualFieldsArr.includes('p2_savings') : false;
    const p2SavingsToSave = isP2SavingsManual && p.p2_savings !== undefined 
      ? Number(p.p2_savings) 
      : defaultP2Savings;

    // Check if record exists for this month
    const existing = db.prepare('SELECT * FROM paycheck_plan WHERE month = ?').get(monthKey) as any;
    if (existing) {
      db.prepare(`
        UPDATE paycheck_plan
        SET p1_period = ?, p1_rollover = ?, p1_income = ?, p1_fixed_bills = ?, p1_lifestyle = ?, p1_savings = ?, p1_rollover_next = ?,
            p2_period = ?, p2_rollover = ?, p2_income = ?, p2_fixed_bills = ?, p2_lifestyle = ?, p2_savings = ?, p2_checking_buffer = ?, p2_leftover = ?,
            is_manual = ?, manual_fields = ?,
            p1_payday_mode = ?, p1_payday_day = ?, p1_bill_start = ?, p1_bill_end = ?,
            p2_payday_mode = ?, p2_payday_day = ?, p2_bill_start = ?, p2_bill_end = ?,
            p1_extra_debt = ?, p2_extra_debt = ?,
            p2_zero_sum_buffer = ?, p2_zero_sum_savings = ?, p2_zero_sum_debt = ?, p2_zero_sum_target = ?,
            p1_transfers_in = ?, p1_transfers_out = ?, p2_transfers_in = ?, p2_transfers_out = ?
        WHERE id = ?
      `).run(
        p.p1_period || existing.p1_period || '1st - 15th',
        p.p1_rollover !== undefined ? Number(p.p1_rollover) : Number(existing.p1_rollover || 0),
        p.p1_income !== undefined ? Number(p.p1_income) : Number(existing.p1_income || 0),
        p.p1_fixed_bills !== undefined ? Number(p.p1_fixed_bills) : Number(existing.p1_fixed_bills || 0),
        p.p1_lifestyle !== undefined ? Number(p.p1_lifestyle) : Number(existing.p1_lifestyle ?? 625),
        p.p1_savings !== undefined ? Number(p.p1_savings) : Number(existing.p1_savings ?? 100),
        p.p1_rollover_next !== undefined ? Number(p.p1_rollover_next) : Number(existing.p1_rollover_next || 0),
        p.p2_period || existing.p2_period || '16th - 31st',
        p.p2_rollover !== undefined ? Number(p.p2_rollover) : Number(existing.p2_rollover || 0),
        p.p2_income !== undefined ? Number(p.p2_income) : Number(existing.p2_income || 0),
        p.p2_fixed_bills !== undefined ? Number(p.p2_fixed_bills) : Number(existing.p2_fixed_bills || 0),
        p.p2_lifestyle !== undefined ? Number(p.p2_lifestyle) : Number(existing.p2_lifestyle ?? 625),
        p2SavingsToSave,
        p.p2_checking_buffer !== undefined ? Number(p.p2_checking_buffer) : Number(existing.p2_checking_buffer ?? 500),
        p.p2_leftover !== undefined ? Number(p.p2_leftover) : Number(existing.p2_leftover || 0),
        p.is_manual !== undefined ? isManual : Number(existing.is_manual || 0),
        p.manual_fields !== undefined ? manualFieldsStr : (existing.manual_fields || '[]'),
        p.p1_payday_mode || existing.p1_payday_mode || 'prev_month_last_day',
        p.p1_payday_day !== undefined ? Number(p.p1_payday_day) : Number(existing.p1_payday_day ?? 0),
        p.p1_bill_start !== undefined ? Number(p.p1_bill_start) : Number(existing.p1_bill_start ?? 1),
        p.p1_bill_end !== undefined ? Number(p.p1_bill_end) : Number(existing.p1_bill_end ?? 15),
        p.p2_payday_mode || existing.p2_payday_mode || 'day_of_month',
        p.p2_payday_day !== undefined ? Number(p.p2_payday_day) : Number(existing.p2_payday_day ?? 15),
        p.p2_bill_start !== undefined ? Number(p.p2_bill_start) : Number(existing.p2_bill_start ?? 16),
        p.p2_bill_end !== undefined ? Number(p.p2_bill_end) : Number(existing.p2_bill_end ?? 31),
        p.p1_extra_debt !== undefined ? (p.p1_extra_debt !== null ? Number(p.p1_extra_debt) : null) : (existing.p1_extra_debt !== undefined ? existing.p1_extra_debt : null),
        p.p2_extra_debt !== undefined ? (p.p2_extra_debt !== null ? Number(p.p2_extra_debt) : null) : (existing.p2_extra_debt !== undefined ? existing.p2_extra_debt : null),
        p.p2_zero_sum_buffer !== undefined ? Number(p.p2_zero_sum_buffer) : Number(existing.p2_zero_sum_buffer || 0),
        p.p2_zero_sum_savings !== undefined ? Number(p.p2_zero_sum_savings) : Number(existing.p2_zero_sum_savings || 0),
        p.p2_zero_sum_debt !== undefined ? Number(p.p2_zero_sum_debt) : Number(existing.p2_zero_sum_debt || 0),
        p.p2_zero_sum_target !== undefined ? String(p.p2_zero_sum_target) : (existing.p2_zero_sum_target || 'debt_overpayment'),
        p.p1_transfers_in !== undefined ? (p.p1_transfers_in !== null ? Number(p.p1_transfers_in) : null) : (existing.p1_transfers_in !== undefined ? existing.p1_transfers_in : null),
        p.p1_transfers_out !== undefined ? (p.p1_transfers_out !== null ? Number(p.p1_transfers_out) : null) : (existing.p1_transfers_out !== undefined ? existing.p1_transfers_out : null),
        p.p2_transfers_in !== undefined ? (p.p2_transfers_in !== null ? Number(p.p2_transfers_in) : null) : (existing.p2_transfers_in !== undefined ? existing.p2_transfers_in : null),
        p.p2_transfers_out !== undefined ? (p.p2_transfers_out !== null ? Number(p.p2_transfers_out) : null) : (existing.p2_transfers_out !== undefined ? existing.p2_transfers_out : null),
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO paycheck_plan (
          month, p1_period, p1_rollover, p1_income, p1_fixed_bills, p1_lifestyle, p1_savings, p1_rollover_next,
          p2_period, p2_rollover, p2_income, p2_fixed_bills, p2_lifestyle, p2_savings, p2_checking_buffer, p2_leftover,
          is_manual, manual_fields,
          p1_payday_mode, p1_payday_day, p1_bill_start, p1_bill_end,
          p2_payday_mode, p2_payday_day, p2_bill_start, p2_bill_end,
          p1_extra_debt, p2_extra_debt,
          p2_zero_sum_buffer, p2_zero_sum_savings, p2_zero_sum_debt, p2_zero_sum_target,
          p1_transfers_in, p1_transfers_out, p2_transfers_in, p2_transfers_out
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        monthKey,
        p.p1_period || '1st - 15th',
        Number(p.p1_rollover || 0),
        Number(p.p1_income || 0),
        Number(p.p1_fixed_bills || 0),
        p.p1_lifestyle !== undefined ? Number(p.p1_lifestyle) : 625,
        p.p1_savings !== undefined ? Number(p.p1_savings) : 100,
        Number(p.p1_rollover_next || 0),
        p.p2_period || '16th - 31st',
        Number(p.p2_rollover || 0),
        Number(p.p2_income || 0),
        Number(p.p2_fixed_bills || 0),
        p.p2_lifestyle !== undefined ? Number(p.p2_lifestyle) : 625,
        p2SavingsToSave,
        p.p2_checking_buffer !== undefined ? Number(p.p2_checking_buffer) : 500,
        Number(p.p2_leftover || 0),
        isManual,
        manualFieldsStr,
        p1_payday_mode,
        p1_payday_day,
        p1_bill_start,
        p1_bill_end,
        p2_payday_mode,
        p2_payday_day,
        p2_bill_start,
        p2_bill_end,
        p.p1_extra_debt !== undefined ? (p.p1_extra_debt !== null ? Number(p.p1_extra_debt) : null) : null,
        p.p2_extra_debt !== undefined ? (p.p2_extra_debt !== null ? Number(p.p2_extra_debt) : null) : null,
        Number(p.p2_zero_sum_buffer || 0),
        Number(p.p2_zero_sum_savings || 0),
        Number(p.p2_zero_sum_debt || 0),
        String(p.p2_zero_sum_target || 'debt_overpayment'),
        p.p1_transfers_in !== undefined ? (p.p1_transfers_in !== null ? Number(p.p1_transfers_in) : null) : null,
        p.p1_transfers_out !== undefined ? (p.p1_transfers_out !== null ? Number(p.p1_transfers_out) : null) : null,
        p.p2_transfers_in !== undefined ? (p.p2_transfers_in !== null ? Number(p.p2_transfers_in) : null) : null,
        p.p2_transfers_out !== undefined ? (p.p2_transfers_out !== null ? Number(p.p2_transfers_out) : null) : null
      );
    }

    // Keep Monthly Budget in sync if p1_savings was edited
    if (p.p1_savings !== undefined) {
      const parts = (p.month || '').split(' ');
      const m = parts[0] || 'Aug';
      const y = parseInt(parts[1] || '2026', 10);
      const cat = db.prepare("SELECT id FROM categories WHERE LOWER(TRIM(name)) = 'savings'").get() as any;
      if (cat) {
        db.prepare(`
          INSERT INTO monthly_category_budgets (category_id, year, month, budget)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(category_id, year, month) DO UPDATE SET budget = excluded.budget
        `).run(cat.id, y, m, Number(p.p1_savings));
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Goals ---
app.get('/api/goals', (req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM goals ORDER BY target_date ASC').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/goals', (req: Request, res: Response) => {
  try {
    const { name, target_amount, current_amount, target_date, category, color, icon, type } = req.body;
    const id = `g_${Date.now()}`;
    db.prepare('INSERT INTO goals (id, name, target_amount, current_amount, target_date, category, color, icon, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, target_amount, current_amount || 0, target_date || null, category || 'General', color || '#f472b6', icon || '🎯', type || 'goal');
    res.json({ id, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/goals/:id', (req: Request, res: Response) => {
  try {
    const current = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id as string) as any;
    if (!current) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }
    const { name, target_amount, current_amount, target_date, category, color, icon, type } = req.body;
    db.prepare(`
      UPDATE goals 
      SET name = ?, target_amount = ?, current_amount = ?, target_date = ?, category = ?, color = ?, icon = ?, type = ? 
      WHERE id = ?
    `).run(
      name !== undefined ? name : current.name,
      target_amount !== undefined ? target_amount : current.target_amount,
      current_amount !== undefined ? current_amount : current.current_amount,
      target_date !== undefined ? target_date : current.target_date,
      category !== undefined ? category : current.category,
      color !== undefined ? color : current.color,
      icon !== undefined ? icon : current.icon,
      type !== undefined ? type : (current.type || 'goal'),
      (req.params.id as string)
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/goals/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM goals WHERE id = ?').run((req.params.id as string));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Debt Snowball & Projections ---
app.get('/api/projections', (req: Request, res: Response) => {
  try {
    const accounts = db.prepare("SELECT * FROM accounts WHERE type IN ('credit_card', 'loan', 'auto_loan')").all() as any[];
    const extraSnowballMonthly = Number(req.query.extraSnowball) || 500;
    const strategy = (req.query.strategy as string) || 'snowball'; // snowball vs avalanche

    // Sort accounts according to strategy
    const sorted = [...accounts].filter(a => a.balance > 0);
    if (strategy === 'snowball') {
      sorted.sort((a, b) => a.balance - b.balance);
    } else {
      sorted.sort((a, b) => b.apr - a.apr);
    }

    // Calculate snowball schedule
    let currentSnowballPool = extraSnowballMonthly;
    const schedule: any[] = [];
    let currentMonth = 0;
    const debtsState = sorted.map(d => ({
      id: d.id,
      name: d.name,
      balance: d.balance,
      min_payment: d.min_payment || 25,
      apr: d.apr || 20,
      isPaid: false,
      paidMonth: 0,
      totalInterest: 0
    }));

    let allPaid = false;
    while (!allPaid && currentMonth < 120) { // cap at 10 years
      currentMonth++;
      let extraForThisMonth = currentSnowballPool;

      for (const d of debtsState) {
        if (d.balance <= 0) {
          d.isPaid = true;
          continue;
        }

        // Apply interest
        const monthlyRate = (d.apr / 100) / 12;
        const interest = d.balance * monthlyRate;
        d.balance += interest;
        d.totalInterest += interest;

        // Apply minimum payment
        const payment = Math.min(d.balance, d.min_payment);
        d.balance -= payment;

        if (d.balance <= 0) {
          d.isPaid = true;
          d.paidMonth = currentMonth;
          currentSnowballPool += d.min_payment; // Add min payment to snowball pool!
        }
      }

      // Apply extra snowball to the first unpaid debt
      const targetDebt = debtsState.find(d => d.balance > 0);
      if (targetDebt) {
        const extraPay = Math.min(targetDebt.balance, extraForThisMonth);
        targetDebt.balance -= extraPay;
        if (targetDebt.balance <= 0) {
          targetDebt.isPaid = true;
          targetDebt.paidMonth = currentMonth;
          currentSnowballPool += targetDebt.min_payment;
        }
      }

      allPaid = debtsState.every(d => d.balance <= 0);
    }

    // Multi-year compound interest savings projection (3.1% APY)
    const annualProjections: any[] = [];
    const month = (req.query.month as string) || 'Sep';
    const year = parseInt(req.query.year as string, 10) || 2026;

    // Fetch dynamic savings budget for active month/year
    const savingsCat = db.prepare(`
      SELECT COALESCE(mcb.budget, c.budget) as budget
      FROM categories c
      LEFT JOIN monthly_category_budgets mcb 
        ON mcb.category_id = c.id AND mcb.year = ? AND mcb.month = ?
      WHERE c.id = 'cat_sav' OR LOWER(c.name) = 'savings'
      LIMIT 1
    `).get(year, month) as { budget?: number } | undefined;

    const currentYearMonthlyContribution = (savingsCat?.budget !== undefined) ? Number(savingsCat.budget) : 100.0;
    
    // Future years contribution comes from simulator, defaulting to current monthly budget
    const futureMonthlyContribution = req.query.savingsContribution !== undefined
      ? parseFloat(req.query.savingsContribution as string) || 0
      : currentYearMonthlyContribution;

    const monthsList = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthMap: Record<string, number> = {
      'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
      'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
    };
    const selectedMonthNum = monthMap[month] || 9;

    // Fetch savings account(s)
    const savingsAccounts = db.prepare(`
      SELECT id, balance, starting_balance 
      FROM accounts 
      WHERE type = 'savings' OR id = 'acc_savings'
    `).all() as any[];

    const savingsAccountIds = savingsAccounts.map(a => a.id);
    const totalCurrentSavingsBalance = savingsAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);

    // Fetch all transactions for savings accounts for selected year
    const savingsTxsInYear = savingsAccountIds.length > 0
      ? db.prepare(`
          SELECT * FROM transactions 
          WHERE account_id IN (${savingsAccountIds.map(() => '?').join(',')})
            AND date LIKE ?
          ORDER BY date ASC, created_at ASC
        `).all(...savingsAccountIds, `${year}-%`) as any[]
      : [];

    // Calculate starting balance prior to base tracking year
    const earliestTx = db.prepare("SELECT MIN(date) as minDate FROM transactions WHERE date IS NOT NULL AND date != ''").get() as any;
    let baseTrackingYear = 2026;
    let baseTrackingMonth = 8;
    if (earliestTx?.minDate) {
      const parts = String(earliestTx.minDate).split('-');
      if (parts.length >= 2) {
        baseTrackingYear = parseInt(parts[0], 10) || 2026;
        baseTrackingMonth = parseInt(parts[1], 10) || 8;
      }
    }

    const savingsTxsPriorToBase = savingsAccountIds.length > 0
      ? db.prepare(`
          SELECT * FROM transactions 
          WHERE account_id IN (${savingsAccountIds.map(() => '?').join(',')})
            AND date < ?
        `).all(...savingsAccountIds, `${baseTrackingYear}-01-01`) as any[]
      : [];

    let baseStartingBalance = savingsAccounts.reduce((sum, a) => sum + Number(a.starting_balance || 0), 0);
    for (const t of savingsTxsPriorToBase) {
      if (t.type === 'Income') baseStartingBalance += Number(t.amount || 0);
      else if (t.type === 'Expense') baseStartingBalance -= Number(t.amount || 0);
      else if (t.type === 'Transfer') {
        const notesStr = (t.notes || '').toLowerCase();
        const isDep = notesStr.includes('[transfer: in') || notesStr.includes('[transfer in') || (t.description || '').toLowerCase().includes('(from ');
        if (isDep) baseStartingBalance += Number(t.amount || 0);
        else baseStartingBalance -= Number(t.amount || 0);
      }
    }

    // Multi-year compound interest savings projection (3.1% APY)
    const apy = 0.031;
    let runningBalance = baseStartingBalance;
    const startCalcYear = Math.min(baseTrackingYear, year);
    const endCalcYear = year + 4;
    const yearResults: Record<number, any> = {};

    for (let y = startCalcYear; y <= endCalcYear; y++) {
      const savingsTxsInY = savingsAccountIds.length > 0
        ? db.prepare(`
            SELECT * FROM transactions 
            WHERE account_id IN (${savingsAccountIds.map(() => '?').join(',')})
              AND date LIKE ?
            ORDER BY date ASC, created_at ASC
          `).all(...savingsAccountIds, `${y}-%`) as any[]
        : [];

      const startBalForYear = runningBalance;
      let yearContribSum = 0;
      let yearActualsYTD = 0;
      let yearProjectedRemaining = 0;
      let remainingCount = 0;
      const breakdown: Record<string, { actual: number; projected: number; isActual: boolean }> = {};

      for (let m = 1; m <= 12; m++) {
        const mCode = monthsList[m - 1];
        const mStr = String(m).padStart(2, '0');
        const prefix = `${y}-${mStr}`;
        
        const txsInMonth = savingsTxsInY.filter(t => t.date && t.date.startsWith(prefix));
        let netMonth = 0;
        for (const t of txsInMonth) {
          if (t.type === 'Income') netMonth += Number(t.amount || 0);
          else if (t.type === 'Expense') netMonth -= Number(t.amount || 0);
          else if (t.type === 'Transfer') {
            const notesStr = (t.notes || '').toLowerCase();
            const isDep = notesStr.includes('[transfer: in') || notesStr.includes('[transfer in') || (t.description || '').toLowerCase().includes('(from ');
            if (isDep) netMonth += Number(t.amount || 0);
            else netMonth -= Number(t.amount || 0);
          }
        }

        let monthVal = 0;
        let isActual = false;

        if (y === baseTrackingYear) {
          if (m < baseTrackingMonth) {
            // Untracked months prior to base tracking month
            monthVal = 0;
            isActual = false;
          } else if (m === baseTrackingMonth) {
            // Base tracking month actuals
            monthVal = netMonth;
            isActual = true;
            yearActualsYTD += netMonth;
          } else {
            // Months after base tracking month
            const hasTxs = txsInMonth.length > 0;
            monthVal = hasTxs ? netMonth : currentYearMonthlyContribution;
            isActual = hasTxs;
            if (hasTxs) {
              yearActualsYTD += netMonth;
            } else {
              yearProjectedRemaining += monthVal;
              remainingCount++;
            }
          }
        } else {
          // Future or other years (y > baseTrackingYear)
          const hasTxs = txsInMonth.length > 0;
          monthVal = hasTxs ? netMonth : (y === year ? currentYearMonthlyContribution : futureMonthlyContribution);
          isActual = hasTxs;
          if (hasTxs) {
            yearActualsYTD += netMonth;
          } else {
            yearProjectedRemaining += monthVal;
            remainingCount++;
          }
        }

        breakdown[mCode] = { actual: netMonth, projected: monthVal, isActual };
        yearContribSum += monthVal;

        if (y > baseTrackingYear) {
          runningBalance = (runningBalance + monthVal) * (1 + apy / 12);
        }
      }

      if (y === baseTrackingYear) {
        runningBalance = runningBalance + yearContribSum;
      }

      yearResults[y] = {
        yearLabel: y,
        startBalance: Math.round(startBalForYear * 100) / 100,
        annualContribution: Math.round(yearContribSum * 100) / 100,
        projectedBalance: Math.round(runningBalance * 100) / 100,
        actualYearToDate: Math.round(yearActualsYTD * 100) / 100,
        projectedRemaining: Math.round(yearProjectedRemaining * 100) / 100,
        remainingMonthsCount: remainingCount,
        monthlyBreakdown: breakdown
      };
    }

    // Populate the 5-year simulation starting from current live Savings Account balance (Year 0 baseline)
    let simCurrentBalance = totalCurrentSavingsBalance;
    const simMonthlyRate = apy / 12;

    for (let yr = 1; yr <= 5; yr++) {
      const startBal = simCurrentBalance;
      let yrInterest = 0;
      for (let m = 0; m < 12; m++) {
        simCurrentBalance += futureMonthlyContribution;
        const interest = simCurrentBalance * simMonthlyRate;
        simCurrentBalance += interest;
        yrInterest += interest;
      }
      const annualContrib = futureMonthlyContribution * 12;
      annualProjections.push({
        year: yr,
        yearLabel: `Year ${yr}`,
        startBalance: Math.round(startBal * 100) / 100,
        monthlyContribution: futureMonthlyContribution,
        annualContribution: annualContrib,
        interestEarned: Math.round(yrInterest * 100) / 100,
        expectedReturn: apy,
        projectedBalance: Math.round(simCurrentBalance * 100) / 100,
      });
    }

    const activeYearInfo = yearResults[year];

    res.json({
      totalDebt: debtsState.reduce((sum, d) => sum + d.balance, 0),
      monthsToDebtFree: currentMonth,
      debtOrder: debtsState.map(d => ({
        id: d.id,
        name: d.name,
        monthsToPayoff: d.paidMonth || currentMonth,
        totalInterest: Math.round(d.totalInterest * 100) / 100
      })),
      savingsProjections: annualProjections,
      currentYearSavings: {
        activeMonthBudget: currentYearMonthlyContribution,
        annualizedRate: activeYearInfo.annualContribution,
        totalYearProjected: activeYearInfo.annualContribution,
        actualYearToDate: activeYearInfo.actualYearToDate,
        projectedRemaining: activeYearInfo.projectedRemaining,
        remainingMonthsCount: activeYearInfo.remainingMonthsCount,
        monthlyBreakdown: activeYearInfo.monthlyBreakdown,
        initialBalance: activeYearInfo.startBalance
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Backup & Restore ---
app.get('/api/backup/export-json', (req: Request, res: Response) => {
  try {
    const categories = db.prepare('SELECT * FROM categories').all();
    const accounts = db.prepare('SELECT * FROM accounts').all();
    const bills = db.prepare('SELECT * FROM bills').all();
    const annualBills = db.prepare('SELECT * FROM annual_bills').all();
    const transactions = db.prepare('SELECT * FROM transactions').all();
    const goals = db.prepare('SELECT * FROM goals').all();
    const monthlyCategoryBudgets = db.prepare('SELECT * FROM monthly_category_budgets').all();
    const paycheckPlan = db.prepare('SELECT * FROM paycheck_plan').all();

    res.json({
      version: '2.0',
      exportedAt: new Date().toISOString(),
      categories,
      accounts,
      bills,
      annualBills,
      transactions,
      goals,
      monthlyCategoryBudgets,
      paycheckPlan
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function importJsonData(data: any): void {
  if (!data.categories || !data.accounts) {
    throw new Error('Invalid backup format: Missing categories or accounts');
  }

  const tx = db.transaction(() => {
    if (data.categories) {
      db.exec('DELETE FROM categories');
      const insert = db.prepare('INSERT INTO categories (id, name, icon, budget, color, sort_order, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?)');
      data.categories.forEach((c: any, i: number) => insert.run(c.id, c.name, c.icon, c.budget, c.color, c.sort_order ?? i, c.is_hidden ? 1 : 0));
    }
    if (data.accounts) {
      db.exec('DELETE FROM accounts');
      const insert = db.prepare('INSERT INTO accounts (id, name, type, balance, starting_balance, min_payment, apr, due_day, buffer, icon, category, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      data.accounts.forEach((a: any, i: number) => insert.run(a.id, a.name, a.type, a.balance, a.starting_balance, a.min_payment, a.apr, a.due_day, a.buffer, a.icon, a.category, a.sort_order ?? i));
    }
    if (data.bills) {
      db.exec('DELETE FROM bills');
      const insert = db.prepare('INSERT INTO bills (id, name, due_day, category, amount, paycheck_assignment, paid_aug, paid_sep, paid_oct, paid_nov, paid_dec, auto_pay, notes, sort_order, assigned_check) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      data.bills.forEach((b: any) => insert.run(
        b.id, b.name, b.due_day, b.category, b.amount, b.paycheck_assignment,
        b.paid_aug || 0, b.paid_sep || 0, b.paid_oct || 0, b.paid_nov || 0, b.paid_dec || 0,
        b.auto_pay ? 1 : 0, b.notes || '',
        b.sort_order || 0, b.assigned_check || null
      ));
    }
    if (data.annualBills) {
      db.exec('DELETE FROM annual_bills');
      const insert = db.prepare('INSERT INTO annual_bills (id, name, due_date, amount, is_paid, frequency, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
      data.annualBills.forEach((ab: any) => insert.run(ab.id, ab.name, ab.due_date, ab.amount, ab.is_paid ? 1 : 0, ab.frequency, ab.notes || ''));
    }
    if (data.transactions) {
      db.exec('DELETE FROM transactions');
      const insert = db.prepare('INSERT INTO transactions (id, account_id, date, description, category, type, amount, running_balance, notes, created_at, sort_order, linked_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      data.transactions.forEach((t: any) => insert.run(
        t.id, t.account_id, t.date, t.description, t.category, t.type, t.amount, t.running_balance, t.notes || '',
        t.created_at || new Date().toISOString(), t.sort_order || 0, t.linked_transaction_id || null
      ));
    }
    if (data.goals) {
      db.exec('DELETE FROM goals');
      const insert = db.prepare('INSERT INTO goals (id, name, target_amount, current_amount, target_date, category, color, icon, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      data.goals.forEach((g: any) => insert.run(g.id, g.name, g.target_amount, g.current_amount, g.target_date, g.category, g.color, g.icon, g.type || 'goal'));
    }
    if (data.monthlyCategoryBudgets) {
      db.exec('DELETE FROM monthly_category_budgets');
      const insert = db.prepare('INSERT INTO monthly_category_budgets (category_id, year, month, budget, is_hidden) VALUES (?, ?, ?, ?, ?)');
      data.monthlyCategoryBudgets.forEach((m: any) => insert.run(m.category_id, m.year, m.month, m.budget, m.is_hidden ? 1 : 0));
    }
    if (data.paycheckPlan) {
      db.exec('DELETE FROM paycheck_plan');
      const plans = Array.isArray(data.paycheckPlan) ? data.paycheckPlan : [data.paycheckPlan];
      const insert = db.prepare(`
        INSERT INTO paycheck_plan (
          id, month, p1_period, p1_rollover, p1_income, p1_fixed_bills, p1_lifestyle, p1_savings, p1_rollover_next,
          p2_period, p2_rollover, p2_income, p2_fixed_bills, p2_lifestyle, p2_savings, p2_checking_buffer, p2_leftover,
          is_manual, manual_fields,
          p1_payday_mode, p1_payday_day, p1_bill_start, p1_bill_end,
          p2_payday_mode, p2_payday_day, p2_bill_start, p2_bill_end,
          p1_extra_debt, p2_extra_debt,
          p2_zero_sum_buffer, p2_zero_sum_savings, p2_zero_sum_debt, p2_zero_sum_target,
          p1_transfers_in, p1_transfers_out, p2_transfers_in, p2_transfers_out
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `);
      plans.forEach((p: any) => {
        if (!p) return;
        insert.run(
          p.id || null, p.month, p.p1_period || '1st - 15th', Number(p.p1_rollover || 0), Number(p.p1_income || 0), Number(p.p1_fixed_bills || 0), Number(p.p1_lifestyle ?? 625), Number(p.p1_savings ?? 100), Number(p.p1_rollover_next || 0),
          p.p2_period || '16th - 31st', Number(p.p2_rollover || 0), Number(p.p2_income || 0), Number(p.p2_fixed_bills || 0), Number(p.p2_lifestyle ?? 625), Number(p.p2_savings ?? 152.25), Number(p.p2_checking_buffer ?? 500), Number(p.p2_leftover || 0),
          p.is_manual ? 1 : 0, typeof p.manual_fields === 'string' ? p.manual_fields : JSON.stringify(p.manual_fields || []),
          p.p1_payday_mode || 'prev_month_last_day', Number(p.p1_payday_day ?? 0), Number(p.p1_bill_start ?? 1), Number(p.p1_bill_end ?? 15),
          p.p2_payday_mode || 'day_of_month', Number(p.p2_payday_day ?? 15), Number(p.p2_bill_start ?? 16), Number(p.p2_bill_end ?? 31),
          p.p1_extra_debt !== undefined && p.p1_extra_debt !== null ? Number(p.p1_extra_debt) : null,
          p.p2_extra_debt !== undefined && p.p2_extra_debt !== null ? Number(p.p2_extra_debt) : null,
          Number(p.p2_zero_sum_buffer || 0), Number(p.p2_zero_sum_savings || 0), Number(p.p2_zero_sum_debt || 0), p.p2_zero_sum_target || 'debt_overpayment',
          p.p1_transfers_in !== undefined && p.p1_transfers_in !== null ? Number(p.p1_transfers_in) : null,
          p.p1_transfers_out !== undefined && p.p1_transfers_out !== null ? Number(p.p1_transfers_out) : null,
          p.p2_transfers_in !== undefined && p.p2_transfers_in !== null ? Number(p.p2_transfers_in) : null,
          p.p2_transfers_out !== undefined && p.p2_transfers_out !== null ? Number(p.p2_transfers_out) : null
        );
      });
    }
  });

  tx();
  recalculateAccountBalances();
}

app.post('/api/backup/import-json', (req: Request, res: Response) => {
  try {
    importJsonData(req.body);
    res.json({ success: true, message: 'Data imported successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Tarball Database Backups ---
app.get('/api/backup/list', async (_req: Request, res: Response) => {
  try {
    const list = await listTarballBackups();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/create-tarball', async (_req: Request, res: Response) => {
  try {
    const backup = await createTarballBackup(db, 'manual_instant');
    res.json({ success: true, backup });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/restore-tarball', async (req: Request, res: Response) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      res.status(400).json({ error: 'Filename is required' });
      return;
    }
    const result = await restoreTarballBackup(filename, (extractedDbPath) => {
      reloadDatabase(extractedDbPath);
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup/download-tarball/:filename', (req: Request, res: Response) => {
  try {
    const filePath = getTarballPath(req.params.filename as string);
    if (!filePath) {
      res.status(404).json({ error: 'Backup file not found' });
      return;
    }
    res.download(filePath, req.params.filename as string);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/backup/delete-tarball/:filename', (req: Request, res: Response) => {
  try {
    const success = deleteTarballBackup(req.params.filename as string);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- External Backup Upload, Inspection & Restoration Routes ---
app.post('/api/backup/stage-upload', async (req: Request, res: Response) => {
  try {
    cleanupStagingFiles();
    const rawFilename = (req.headers['x-filename'] as string) || `backup_${Date.now()}.tar.gz`;
    const filename = decodeURIComponent(rawFilename);
    const token = `stage_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const safeName = path.basename(filename);
    const stagePath = path.join(backupDir, `.${token}_${safeName}`);

    const writeStream = fs.createWriteStream(stagePath);
    await new Promise<void>((resolve, reject) => {
      req.pipe(writeStream);
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
      req.on('error', reject);
    });

    const inspection = inspectExternalFile(stagePath, safeName);
    res.json({ token, stageFilename: safeName, inspection });
  } catch (err: any) {
    console.error('Error staging backup upload:', err);
    res.status(400).json({ error: err.message || 'Failed to process backup file' });
  }
});

app.post('/api/backup/confirm-stage-restore', async (req: Request, res: Response) => {
  try {
    const { token, stageFilename } = req.body;
    if (!token || !stageFilename) {
      res.status(400).json({ error: 'Token and stageFilename are required' });
      return;
    }

    const safeFilename = path.basename(stageFilename);
    const safeToken = path.basename(token);
    const stagePath = path.join(backupDir, `.${safeToken}_${safeFilename}`);

    if (!fs.existsSync(stagePath)) {
      res.status(404).json({ error: 'Staged backup file expired or not found. Please upload again.' });
      return;
    }

    const result = await restoreFromExternalFile(
      stagePath,
      safeFilename,
      (newDbPath) => {
        reloadDatabase(newDbPath);
      },
      (jsonData) => {
        importJsonData(jsonData);
      }
    );

    try {
      if (fs.existsSync(stagePath)) fs.unlinkSync(stagePath);
      if (fs.existsSync(stagePath + '-wal')) fs.unlinkSync(stagePath + '-wal');
      if (fs.existsSync(stagePath + '-shm')) fs.unlinkSync(stagePath + '-shm');
    } catch {}

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to restore backup' });
  }
});

app.post('/api/backup/inspect-server-path', (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'Server file path is required' });
      return;
    }
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: `File not found at path: ${resolvedPath}` });
      return;
    }
    const inspection = inspectExternalFile(resolvedPath, path.basename(resolvedPath));
    res.json({ inspection, resolvedPath });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/backup/restore-server-path', async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'Server file path is required' });
      return;
    }
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: `File not found at path: ${resolvedPath}` });
      return;
    }

    const result = await restoreFromExternalFile(
      resolvedPath,
      path.basename(resolvedPath),
      (newDbPath) => {
        reloadDatabase(newDbPath);
      },
      (jsonData) => {
        importJsonData(jsonData);
      }
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to restore backup' });
  }
});

app.post('/api/backup/reset-seed', (req: Request, res: Response) => {
  try {
    const seedFile = path.join(__dirname, '..', 'seed_data.json');
    if (!fs.existsSync(seedFile)) {
      res.status(400).json({ error: 'No seed_data.json template found. To restore data, please use a database backup file.' });
      return;
    }
    seedDatabase();
    recalculateAccountBalances();
    res.json({ success: true, message: 'Reset to initial data successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend static build in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get('*', (req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Endpoint not found' });
  } else {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log('🌸 Kawaii Budget Server running on http://localhost:' + PORT);
});
