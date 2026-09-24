import { Account, Bill, Transaction, Category, PaycheckPlan, OverviewStats, AnnualBill } from '../types';

export interface PayoffStep {
  month: number;
  dateStr: string;
  totalPaid: number;
  totalInterest: number;
  debts: Array<{
    id: string;
    name: string;
    balance: number;
    paidThisMonth: number;
    interestThisMonth: number;
    isPaidOff: boolean;
  }>;
}

/**
 * Calculates the unified monthly sinking funds contribution target from all annual/biannual items.
 * Combines:
 * - Annual subscriptions/bills: amount / 12
 * - Biannual expenses:
 *     If scheduled installments exist in a 1-year window (e.g. Liberty Mutual Aug & Feb), annual sum / 12.
 *     If single 6-month installment entered, amount / 6.
 */
export function calculateMonthlySinkingFundsTotal(annualBills: Array<{ amount: number; frequency?: string; name?: string }>): number {
  if (!annualBills || annualBills.length === 0) return 0;
  
  // 1. Annual bills: amount / 12
  const annuals = annualBills.filter(b => (b.frequency || 'annual') === 'annual');
  const annualMonthly = annuals.reduce((sum, b) => sum + (Number(b.amount) || 0) / 12, 0);

  // 2. Biannual bills
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

/**
 * Determines whether a bill in the master bills list is a sinking fund or savings allocation
 * (e.g., biannual insurance, annual subscriptions, or savings reserve).
 * Such bills MUST NOT be deducted as a lump-sum monthly bill under Fixed Bills in the Waterfall.
 */
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

export interface WaterfallCalculationResult {
  effectiveP1Rollover: number;
  effectiveP1Income: number;
  p1EffectiveInflowMath: number;
  isP1PaidPriorToMonth: boolean;
  scheduledP1PayDate: string;
  scheduledP2PayDate: string;
  effectiveP1FixedBills: number;
  plannedP1Lifestyle: number;
  actualP1Lifestyle: number;
  effectiveP1Lifestyle: number;
  plannedP1ExtraDebt: number;
  actualP1ExtraDebt: number;
  effectiveP1ExtraDebt: number;
  effectiveP1Savings: number;
  effectiveP1RolloverNext: number;
  effectiveP2Rollover: number;
  effectiveP2Income: number;
  effectiveP2FixedBills: number;
  plannedP2Lifestyle: number;
  actualP2Lifestyle: number;
  effectiveP2Lifestyle: number;
  plannedP2ExtraDebt: number;
  actualP2ExtraDebt: number;
  effectiveP2ExtraDebt: number;
  effectiveP2Savings: number;
  effectiveP2Buffer: number;
  effectiveP2Leftover: number;
  leftoverFreeCash: number;
  rawP2Leftover: number;
  p2ZeroSumBuffer: number;
  p2ZeroSumSavings: number;
  p2ZeroSumDebt: number;
  p2ZeroSumTarget: string;
  p2TotalZeroSumAllocated: number;
  p2UnallocatedLeftover: number;
  effectiveP1TransfersIn: number;
  effectiveP1TransfersOut: number;
  p1TransfersInItems: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  p1TransfersOutItems: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  effectiveP2TransfersIn: number;
  effectiveP2TransfersOut: number;
  p2TransfersInItems: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  p2TransfersOutItems: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  totalTransfersIn: number;
  totalTransfersOut: number;
  monthlySinkingFundsTotal: number;
  p2SinkingTransfers: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  p2SinkingTransferTotal: number;
  p2SinkingCleared: boolean;
  checkingEndingBalancePrevMonth?: number;
  totalIncome: number;
  totalFixedBills: number;
  totalLifestyle: number;
  totalExtraDebt: number;
  totalSavings: number;
  totalBuffer: number;
  totalObligations: number;
  clearedP2Date?: string | null;
  clearedP2Day?: number | null;
  preDepositCheckingBalance?: number;
  effectiveP1Period?: string;
  effectiveP2Period?: string;
  effectiveP1BillStart?: number;
  effectiveP1BillEnd?: number;
  effectiveP2BillStart?: number;
  effectiveP2BillEnd?: number;
}

/**
 * Calculates the full sequential Paycheck Waterfall flow and true final Leftover Free Cash.
 * Directly mirrors the Paycheck Waterfall Log calculations and honors manual overrides if set.
 */
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

/**
 * Universal paycheck/direct deposit transaction detection.
 * Broadens recognition beyond literal "paycheck" to include common payroll keywords
 * while strictly excluding non-payroll inflows (starting balance, rollover, refunds, interest, cash gifts, etc.).
 */
export function isPaycheckDepositTx(t: any): boolean {
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

export function isExplicitP1Tx(t: any): boolean {
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

export function isExplicitP2Tx(t: any): boolean {
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

export function calculateFullWaterfall(params: {
  paycheckPlan: PaycheckPlan | null;
  bills?: Bill[];
  accounts?: Account[];
  transactions?: Transaction[];
  categories?: Category[];
  selectedMonth?: string;
  selectedYear?: number;
  annualBills?: AnnualBill[];
  stats?: OverviewStats | null;
}): WaterfallCalculationResult {
  const {
    paycheckPlan,
    bills = [],
    accounts = [],
    transactions = [],
    categories = [],
    annualBills = [],
    selectedMonth = 'Sep',
    selectedYear = 2026,
    stats = null
  } = params;

  // Manual overrides & field state from saved plan
  const manualFields: string[] = paycheckPlan?.manual_fields || [];
  const isManualMode = Boolean(paycheckPlan?.is_manual);
  const isFieldManual = (field: string) => isManualMode || manualFields.includes(field);

  // Paycheck Schedule & Coverage Settings
  const p1_payday_mode = paycheckPlan?.p1_payday_mode || 'prev_month_last_day';
  const p1_payday_day = Number(paycheckPlan?.p1_payday_day ?? 0);
  const p1_bill_start = Number(paycheckPlan?.p1_bill_start ?? 1);
  const p1_bill_end = Number(paycheckPlan?.p1_bill_end ?? 15);

  const p2_payday_mode = paycheckPlan?.p2_payday_mode || 'day_of_month';
  const p2_payday_day = Number(paycheckPlan?.p2_payday_day ?? 15);
  const p2_bill_start = Number(paycheckPlan?.p2_bill_start ?? 16);
  const p2_bill_end = Number(paycheckPlan?.p2_bill_end ?? 31);

  // Checking Account for Buffer & live balance fallback
  const checkingAccount = accounts.find(a => a.id === 'acc_checking' || a.type === 'checking');
  const checkingBalance = checkingAccount ? Number(checkingAccount.balance || 0) : 0;
  const checkingBuffer = checkingAccount ? Number(checkingAccount.buffer || 500) : 500;

  const monthMap: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const curMIdx = monthNames.indexOf(selectedMonth);
  const prevMIdx = curMIdx === 0 ? 11 : (curMIdx > 0 ? curMIdx - 1 : 7);
  const prevYear = curMIdx === 0 ? selectedYear - 1 : selectedYear;
  const prevMonth = monthNames[prevMIdx];
  const prevMNum = monthMap[prevMonth] || '08';
  const lastDayOfPrevMonth = new Date(prevYear, prevMIdx + 1, 0).getDate();
  const prevMonthLastDayStr = `${prevYear}-${prevMNum}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;

  const monthNum = monthMap[selectedMonth] || '09';
  const monthPrefix = `${selectedYear}-${monthNum}`;

  // 1.) Paycheck 1 Starting Rollover Balance from Checking Transaction Ledger
  const checkingAllTxs = transactions.filter(t => 
    t.account_id === 'acc_checking' || t.account_id === 'checking'
  );
  const mLower = (selectedMonth || '').trim().toLowerCase();
  const monthNamesList = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const fullMonthNamesList = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const activeMIdx = monthNamesList.indexOf(mLower);
  const fullMLower = activeMIdx >= 0 ? fullMonthNamesList[activeMIdx] : mLower;

  // Chronologically ordered checking transactions for running balance computation
  const chronCheckingTxs = checkingAllTxs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Rule 3: Base Rollover on Actual Starting Cash:
  // Primary Anchor: Manual rollover entry from checking ledger (e.g. 'Rollover to Sep' = $7,702.59)
  // Secondary Anchor: The ending ledger/bank balance of the previous month.
  const prevMonthTxsAll = chronCheckingTxs.filter(t => t.date && t.date <= prevMonthLastDayStr);
  let actualPrevMonthEndingBalance = 0;

  if (prevMonthTxsAll.length > 0) {
    let runBal = Number(checkingAccount?.starting_balance || 0);
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
    // If no previous month transactions exist, check for active month starting balance tx or account starting balance
    const startBalTx = chronCheckingTxs.find(t => (t.date || '').startsWith(monthPrefix) && (t.description || '').toLowerCase().includes('starting balance'));
    actualPrevMonthEndingBalance = startBalTx 
      ? Number(startBalTx.amount || 0) 
      : Number(checkingAccount?.starting_balance || checkingAccount?.balance || 0);
  }

  // The rollover automatically comes from the end of the month balance:
  const dynamicP1Rollover = actualPrevMonthEndingBalance > 0
    ? actualPrevMonthEndingBalance
    : Number(checkingAccount?.starting_balance || checkingAccount?.balance || 0);
  const effectiveP1Rollover = isFieldManual('p1_rollover') && paycheckPlan?.p1_rollover !== undefined && paycheckPlan?.p1_rollover !== null
    ? Number(paycheckPlan.p1_rollover)
    : dynamicP1Rollover;

  // Paycheck 1 & 2 Inflow / Income from checking ledger
  const checkingIncomeTxs = transactions.filter(t => 
    (t.account_id === 'acc_checking' || t.account_id === 'checking') &&
    (t.type || '').toLowerCase() === 'income' &&
    (t.category || '').trim().toLowerCase() !== 'rollover' &&
    t.date && t.date.startsWith(monthPrefix)
  );

  const prevMonthIncomeTxs = transactions.filter(t =>
    (t.account_id === 'acc_checking' || t.account_id === 'checking') &&
    (t.type || '').toLowerCase() === 'income' &&
    (t.category || '').trim().toLowerCase() !== 'rollover' &&
    t.date && t.date.startsWith(`${prevYear}-${prevMNum}`)
  );

  // Paycheck 1 Inflow:
  // (a) From previous month on last day (e.g. Aug 31) or labeled Paycheck 1
  const p1TxsFromPrevMonth = prevMonthIncomeTxs.filter(t => {
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

  // (b) From active month on or before p1_bill_end
  const p1TxsFromCurMonth = checkingIncomeTxs.filter(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP1Tx(t)) return true;
    if (isExplicitP2Tx(t)) return false;
    const day = parseInt((t.date || '').split('-')[2] || '1', 10);
    return day <= p1_bill_end && day >= p1_bill_start;
  });

  const p1Txs = [...p1TxsFromPrevMonth, ...p1TxsFromCurMonth];

  const p2Txs = checkingIncomeTxs.filter(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP2Tx(t)) return true;
    if (isExplicitP1Tx(t)) return false;
    const day = parseInt((t.date || '').split('-')[2] || '1', 10);
    return day >= Math.min(14, p2_bill_start);
  });

  // Detect cleared mid-month paycheck transaction (Paycheck 2)
  const clearedP2Tx = checkingIncomeTxs.find(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP2Tx(t)) return true;
    if (isExplicitP1Tx(t)) return false;
    const day = parseInt((t.date || '').split('-')[2] || '1', 10);
    return day >= 7;
  });

  const clearedP2Date = clearedP2Tx ? (clearedP2Tx.date || '').replace(/\//g, '-') : (paycheckPlan?.cleared_p2_date ?? null);
  const clearedP2Day = clearedP2Tx ? parseInt((clearedP2Tx.date || '').split('-')[2] || '15', 10) : (paycheckPlan?.cleared_p2_day ?? null);
  const clearedP2Income = clearedP2Tx ? Number(clearedP2Tx.amount || 0) : 0;

  // Exact Pre-Deposit Checking Balance Snapshot (balance right before Paycheck 2 deposit)
  let preDepositCheckingBalance = dynamicP1Rollover;
  if (paycheckPlan?.pre_deposit_checking_balance !== undefined && paycheckPlan.pre_deposit_checking_balance !== null) {
    preDepositCheckingBalance = Number(paycheckPlan.pre_deposit_checking_balance);
  } else if (clearedP2Tx) {
    let runBal = dynamicP1Rollover;
    const p2TxIdx = chronCheckingTxs.findIndex(t => t.id === clearedP2Tx.id);
    for (let i = 0; i < chronCheckingTxs.length; i++) {
      const t = chronCheckingTxs[i];
      if (!t.date || !t.date.startsWith(monthPrefix)) continue;
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

  const effectiveP1BillStart = p1_bill_start;
  const effectiveP1BillEnd = clearedP2Day && clearedP2Day > 0 ? (clearedP2Day - 1) : p1_bill_end;
  const effectiveP2BillStart = clearedP2Day && clearedP2Day > 0 ? clearedP2Day : p2_bill_start;
  const effectiveP2BillEnd = p2_bill_end;

  const effectiveP1Period = clearedP2Day && clearedP2Day > 0 ? `1st - ${clearedP2Day}th` : (paycheckPlan?.p1_period || '1st - 15th');
  const effectiveP2Period = clearedP2Day && clearedP2Day > 0 ? `${clearedP2Day}th - 31st` : (paycheckPlan?.p2_period || '16th - 31st');

  const dynamicP1Income = p1Txs.length > 0
    ? Math.round(p1Txs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100
    : (Number(paycheckPlan?.p1_income || 0) > 0 ? Number(paycheckPlan?.p1_income) : 0);
  const effectiveP1Income = isFieldManual('p1_income') && paycheckPlan?.p1_income !== undefined && paycheckPlan?.p1_income !== null
    ? Number(paycheckPlan.p1_income)
    : dynamicP1Income;

  const isFirstPaycheck = (b: any) => isBillInPaycheck1(b, p1_bill_start, p1_bill_end, clearedP2Day);

  // Fixed Bills: Full obligations directly from budget cards (excluding sinking fund items & savings reserves)
  const fixedBillsMaster = bills.filter(b => !isSinkingFundOrSavingsBill(b, annualBills));
  const p1AllBills = fixedBillsMaster.filter(isFirstPaycheck);
  const p2AllBills = fixedBillsMaster.filter(b => !isFirstPaycheck(b));
  const dynamicP1FixedBills = Math.round(p1AllBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) * 100) / 100;
  const effectiveP1FixedBills = isFieldManual('p1_fixed_bills') && paycheckPlan?.p1_fixed_bills !== undefined && paycheckPlan?.p1_fixed_bills !== null
    ? Number(paycheckPlan.p1_fixed_bills)
    : dynamicP1FixedBills;

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

  const isLifestyleCategory = (catName?: string) => {
    if (!catName) return false;
    const clean = catName.trim().toLowerCase();
    if (clean === 'lifestyle' || clean.includes('lifestyle')) return true;
    return LIFESTYLE_UMBRELLA_CATEGORY_NAMES.some(c => clean === c || clean.startsWith(c));
  };

  const checkingMonthTxs = transactions.filter(t => 
    (t.account_id === 'acc_checking' || t.account_id === 'checking') &&
    (t.date || '').replace(/\//g, '-').startsWith(monthPrefix)
  );

  const isExpenseTx = (type?: string) => {
    const t = (type || '').trim().toLowerCase();
    return t === 'expense' || t === 'payment' || t === 'withdrawal' || t === 'debit';
  };
  const isRefundTx = (type?: string) => {
    const t = (type || '').trim().toLowerCase();
    return t === 'income' || t === 'refund' || t === 'credit' || t === 'deposit';
  };

  // Paycheck 1 Lifestyle Actual Spending from live checking ledger (combined 5 categories):
  const p1LifestyleTxs = checkingMonthTxs.filter(t => {
    const day = getDayOfMonth(t.date);
    const inRange = day >= p1_bill_start && day <= p1_bill_end;
    return inRange && isExpenseTx(t.type) && isLifestyleCategory(t.category);
  });
  const p1LifestyleRefunds = checkingMonthTxs.filter(t => {
    const day = getDayOfMonth(t.date);
    const inRange = day >= p1_bill_start && day <= p1_bill_end;
    return inRange && isRefundTx(t.type) && isLifestyleCategory(t.category);
  });
  const actualP1Lifestyle = Math.max(0, Math.round((
    p1LifestyleTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) -
    p1LifestyleRefunds.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  ) * 100) / 100);

  // Paycheck 2 Lifestyle Actual Spending from live checking ledger (combined 5 categories):
  const p2LifestyleTxs = checkingMonthTxs.filter(t => {
    const day = getDayOfMonth(t.date);
    const inRange = day >= p2_bill_start && day <= p2_bill_end;
    return inRange && isExpenseTx(t.type) && isLifestyleCategory(t.category);
  });
  const p2LifestyleRefunds = checkingMonthTxs.filter(t => {
    const day = getDayOfMonth(t.date);
    const inRange = day >= p2_bill_start && day <= p2_bill_end;
    return inRange && isRefundTx(t.type) && isLifestyleCategory(t.category);
  });
  const actualP2Lifestyle = Math.max(0, Math.round((
    p2LifestyleTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) -
    p2LifestyleRefunds.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  ) * 100) / 100);

  // Dynamic umbrella monthly budget from the 5 categories:
  const umbrellaCategories = (categories || []).filter(c => {
    const clean = (c.name || '').trim().toLowerCase();
    return LIFESTYLE_UMBRELLA_CATEGORY_NAMES.some(u => clean === u || clean.startsWith(u));
  });
  const dynamicUmbrellaMonthlyBudget = Math.round(
    umbrellaCategories.reduce((sum, c) => sum + (Number(c.budget) || 0), 0) * 100
  ) / 100;
  const dynamicPlannedPaycheckLifestyle = dynamicUmbrellaMonthlyBudget > 0
    ? Math.round((dynamicUmbrellaMonthlyBudget / 2) * 100) / 100
    : 650;

  // Planned Lifestyle budget (from manual override or dynamic umbrella budget)
  const plannedP1Lifestyle = isFieldManual('p1_lifestyle') && paycheckPlan?.p1_lifestyle !== undefined && paycheckPlan?.p1_lifestyle !== null
    ? Number(paycheckPlan.p1_lifestyle)
    : dynamicPlannedPaycheckLifestyle;
  const plannedP2Lifestyle = isFieldManual('p2_lifestyle') && paycheckPlan?.p2_lifestyle !== undefined && paycheckPlan?.p2_lifestyle !== null
    ? Number(paycheckPlan.p2_lifestyle)
    : dynamicPlannedPaycheckLifestyle;

  // Live Spending Logic ("The Greater Of" Rule): Deduct whichever is absolute HIGHER: Planned Budget OR Actual Spent
  const effectiveP1Lifestyle = isFieldManual('p1_lifestyle') && paycheckPlan?.p1_lifestyle !== undefined && paycheckPlan?.p1_lifestyle !== null
    ? Math.round(Math.max(Number(paycheckPlan.p1_lifestyle), actualP1Lifestyle) * 100) / 100
    : Math.round(Math.max(plannedP1Lifestyle, actualP1Lifestyle) * 100) / 100;

  // Categories for Extra Debt & Unplanned Spend: Extra Payment & Other / Misc
  const isExtraDebtUnplannedCategory = (catName?: string) => {
    if (!catName) return false;
    const clean = catName.trim().toLowerCase();
    if (clean === 'extra payment' || clean.startsWith('extra payment') || clean === 'extra debt' || clean.startsWith('extra debt')) return true;
    if (clean === 'other / misc' || clean === 'other/misc' || clean.startsWith('other / misc') || clean.startsWith('other/misc')) return true;
    if (clean === 'other' || clean === 'misc' || clean === 'unplanned' || clean.includes('unplanned')) return true;
    return false;
  };

  const isTrueRefundTx = (t: any) => {
    const type = (t.type || '').trim().toLowerCase();
    const desc = (t.description || '').trim().toLowerCase();
    const cat = (t.category || '').trim().toLowerCase();
    return type === 'refund' || cat === 'refunds' || cat === 'refund' || desc.includes('refund');
  };

  // Rule 1: Deduct Actual Unplanned Spending:
  // For each pay period date range, query all checking transactions occurring during that window.
  // Deduct any debit/outflow that is NOT already accounted for in the 'Fixed Bills Assigned' list.
  const normStr = (s: string) => (s || '').trim().toLowerCase();

  const calculateUnplannedOutflows = (startDay: number, endDay: number, periodBills: any[], plannedLifestyle: number) => {
    const periodTxs = checkingMonthTxs.filter(t => {
      const day = getDayOfMonth(t.date);
      return day >= startDay && day <= endDay;
    });

    const exps = periodTxs.filter(t => isExpenseTx(t.type));
    const refs = periodTxs.filter(t => isTrueRefundTx(t));

    const unmatchedTxs: Array<{ id: string; date: string; description: string; amount: number; category: string; reason: string }> = [];
    let lifestylePeriodSpent = 0;

    for (const t of exps) {
      const tid = t.id || '';
      const cClean = normStr(t.category);
      const dClean = normStr(t.description);
      const amt = Number(t.amount || 0);

      // Check if this tx matches a known fixed bill in master bills list (to prevent double-deducting cross-period bills)
      let matchedBill: any = null;
      if (tid.startsWith('tx_bill_')) {
        matchedBill = (params.bills || []).find(b => normStr(b.name) === dClean || normStr(b.name).includes(dClean) || dClean.includes(normStr(b.name)));
      } else if (t.notes && (t.notes.includes('[Bill Auto-Sync') || t.notes.includes('[CC Payment Sync:'))) {
        matchedBill = (params.bills || []).find(b => normStr(b.name) === dClean || dClean.includes(normStr(b.name)) || normStr(b.name).includes(dClean));
      } else {
        matchedBill = (params.bills || []).find(b => normStr(b.name) === dClean || (normStr(b.name).length > 3 && dClean.includes(normStr(b.name))));
      }

      if (matchedBill) {
        const billAmt = Number(matchedBill.amount || 0);
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
      } else if (annualBills.some(ab => {
        const abName = normStr(ab.name);
        const cleanAb = abName.replace(/\s*\([^)]*\)\s*$/g, '').trim();
        return dClean === abName || (cleanAb.length >= 4 && (dClean.includes(cleanAb) || cleanAb.includes(dClean)));
      })) {
        // Funded via Sinking Funds accumulation! Accounted for in Sinking Funds Assigned, not unplanned outflow.
      } else if (isLifestyleCategory(t.category)) {
        lifestylePeriodSpent += amt;
      } else {
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

    const lifestyleRefs = refs.filter(t => isLifestyleCategory(t.category));
    const netLifestyleSpent = Math.max(0, lifestylePeriodSpent - lifestyleRefs.reduce((s, t) => s + Number(t.amount || 0), 0));

    const variableSpendBeyondBudget = Math.max(0, Math.round((netLifestyleSpent - plannedLifestyle) * 100) / 100);
    if (variableSpendBeyondBudget > 0) {
      unmatchedTxs.push({
        id: `var_spend_over_${startDay}_${endDay}`,
        date: `${selectedYear}-${monthNum}-${String(startDay).padStart(2, '0')}`,
        description: `Lifestyle Spending Beyond Budget`,
        amount: variableSpendBeyondBudget,
        category: 'Lifestyle Overage',
        reason: `Variable spend beyond $${plannedLifestyle.toFixed(2)} budget`
      });
    }

    const unplannedRefs = refs.filter(t => !isLifestyleCategory(t.category));
    const totalUnplannedRefunds = unplannedRefs.reduce((s, t) => s + Number(t.amount || 0), 0);

    const baseUnplannedSpent = unmatchedTxs.reduce((s, item) => s + item.amount, 0);
    const actualSpent = Math.max(0, Math.round((baseUnplannedSpent - totalUnplannedRefunds) * 100) / 100);

    return actualSpent;
  };

  const actualP1ExtraDebt = calculateUnplannedOutflows(p1_bill_start, p1_bill_end, p1AllBills, plannedP1Lifestyle);
  const actualP2ExtraDebt = calculateUnplannedOutflows(p2_bill_start, p2_bill_end, p2AllBills, plannedP2Lifestyle);

  // Dynamic Extra Debt monthly budget from Extra Payment ($500 -> $250/paycheck):
  const extraPaymentCategory = (categories || []).find(c => {
    const clean = (c.name || '').trim().toLowerCase();
    return clean === 'extra payment' || c.id === 'cat_extra';
  });
  const dynamicExtraDebtMonthlyBudget = extraPaymentCategory ? Number(extraPaymentCategory.budget || 0) : 500;
  const dynamicPlannedPaycheckExtraDebt = dynamicExtraDebtMonthlyBudget > 0
    ? Math.round((dynamicExtraDebtMonthlyBudget / 2) * 100) / 100
    : 250;

  // Planned Extra Debt budget (from manual override or dynamic monthly planner budget)
  const plannedP1ExtraDebt = manualFields.includes('p1_extra_debt') && paycheckPlan?.p1_extra_debt !== undefined && paycheckPlan?.p1_extra_debt !== null
    ? Number(paycheckPlan.p1_extra_debt)
    : dynamicPlannedPaycheckExtraDebt;
  const plannedP2ExtraDebt = manualFields.includes('p2_extra_debt') && paycheckPlan?.p2_extra_debt !== undefined && paycheckPlan?.p2_extra_debt !== null
    ? Number(paycheckPlan.p2_extra_debt)
    : dynamicPlannedPaycheckExtraDebt;

  // Live Spending Logic ("The Greater Of" Rule) for Extra Debt:
  const effectiveP1ExtraDebt = manualFields.includes('p1_extra_debt') && paycheckPlan?.p1_extra_debt !== undefined && paycheckPlan?.p1_extra_debt !== null
    ? Math.round(Math.max(Number(paycheckPlan.p1_extra_debt), actualP1ExtraDebt) * 100) / 100
    : Math.round(Math.max(plannedP1ExtraDebt, actualP1ExtraDebt) * 100) / 100;

  const effectiveP2ExtraDebt = manualFields.includes('p2_extra_debt') && paycheckPlan?.p2_extra_debt !== undefined && paycheckPlan?.p2_extra_debt !== null
    ? Math.round(Math.max(Number(paycheckPlan.p2_extra_debt), actualP2ExtraDebt) * 100) / 100
    : Math.round(Math.max(plannedP2ExtraDebt, actualP2ExtraDebt) * 100) / 100;

  // Savings 1:
  const savingsCategory = (categories || []).find(c => (c.name || '').trim().toLowerCase() === 'savings')
    || stats?.budgetSummary?.categories?.find(c => (c.name || '').trim().toLowerCase() === 'savings');
  const dynamicP1Savings = savingsCategory && savingsCategory.budget !== undefined && savingsCategory.budget !== null
    ? Number(savingsCategory.budget)
    : (Number(paycheckPlan?.p1_savings || 0) > 0 ? Number(paycheckPlan?.p1_savings) : 100);
  const effectiveP1Savings = isFieldManual('p1_savings') && paycheckPlan?.p1_savings !== undefined && paycheckPlan?.p1_savings !== null
    ? Number(paycheckPlan.p1_savings)
    : dynamicP1Savings;

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
      const a = accounts.find(acc => acc.id === acctMatch[1]);
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
      const a = accounts.find(acc => acc.id === acctMatch[1]);
      if (a?.name) return a.name;
    }
    return 'Savings 🌸';
  };

  const p1TransferTxs = checkingTransfers.filter(t => {
    const day = getDayOfMonth(t.date);
    return day >= p1_bill_start && day <= p1_bill_end;
  });

  const p2TransferTxs = checkingTransfers.filter(t => {
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

  // Scheduled monthly checking-to-savings transfers on/around 15th matching Sinking Funds:
  const p2SinkingTransfersTxs = checkingTransfers.filter(t => !isTransferIn(t) && isSinkingFundTransfer(t) && getDayOfMonth(t.date) >= 14);
  const p2SinkingTransferTotal = Math.round(p2SinkingTransfersTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;

  // Other outbound transfers in P2 (excluding sinking fund transfers so they are NOT double counted):
  const p2OtherTransfersOutTxs = p2TransfersOutTxs.filter(t => !isSinkingFundTransfer(t));

  const dynamicP1TransfersIn = Math.round(p1TransfersInTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;
  const dynamicP1TransfersOut = Math.round(p1TransfersOutTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;
  const dynamicP2TransfersIn = Math.round(p2TransfersInTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;
  const dynamicP2TransfersOut = Math.round(p2OtherTransfersOutTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;

  const p1TransfersInItems = p1TransfersInTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: getTransferSource(t),
    destination: 'Checking 🌸',
    notes: t.notes
  }));

  const p1TransfersOutItems = p1TransfersOutTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: 'Checking 🌸',
    destination: getTransferDestination(t),
    notes: t.notes
  }));

  const p2TransfersInItems = p2TransfersInTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: getTransferSource(t),
    destination: 'Checking 🌸',
    notes: t.notes
  }));

  const p2TransfersOutItems = p2OtherTransfersOutTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: 'Checking 🌸',
    destination: getTransferDestination(t),
    notes: t.notes
  }));

  const p2SinkingTransfersItems = p2SinkingTransfersTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: 'Checking 🌸',
    destination: getTransferDestination(t),
    notes: t.notes
  }));

  const effectiveP1TransfersIn = isFieldManual('p1_transfers_in') && paycheckPlan?.p1_transfers_in !== undefined && paycheckPlan?.p1_transfers_in !== null
    ? Number(paycheckPlan.p1_transfers_in)
    : dynamicP1TransfersIn;
  const effectiveP1TransfersOut = isFieldManual('p1_transfers_out') && paycheckPlan?.p1_transfers_out !== undefined && paycheckPlan?.p1_transfers_out !== null
    ? Number(paycheckPlan.p1_transfers_out)
    : dynamicP1TransfersOut;
  const effectiveP2TransfersIn = isFieldManual('p2_transfers_in') && paycheckPlan?.p2_transfers_in !== undefined && paycheckPlan?.p2_transfers_in !== null
    ? Number(paycheckPlan.p2_transfers_in)
    : dynamicP2TransfersIn;
  const effectiveP2TransfersOut = isFieldManual('p2_transfers_out') && paycheckPlan?.p2_transfers_out !== undefined && paycheckPlan?.p2_transfers_out !== null
    ? Number(paycheckPlan.p2_transfers_out)
    : dynamicP2TransfersOut;

  const p1TotalObligations = Math.round((effectiveP1FixedBills + effectiveP1Lifestyle + effectiveP1ExtraDebt + effectiveP1Savings + effectiveP1TransfersOut) * 100) / 100;

  const activeMonthFirstDayStr = `${selectedYear}-${monthNum}-01`;
  const scheduledP1PayDate = (p1_payday_mode === 'prev_month_last_day' || p1_payday_day === 0)
    ? `${prevMonth} ${lastDayOfPrevMonth}`
    : `${selectedMonth} ${p1_payday_day || 1}`;
  const scheduledP2PayDate = clearedP2Date 
    ? `${selectedMonth} ${clearedP2Day}` 
    : `${selectedMonth} ${p2_payday_day || 15}`;

  // Paycheck 1 Timing Rule: Arrives on last day of prior month (e.g. Aug 31 for Sep).
  // Because this cash is already inside the physical account on the 1st (as part of the Starting Rollover balance),
  // set its mathematical addition line on the Waterfall to $0.00 to avoid double-counting.
  const isP1PaidPriorToMonth = (p1_payday_mode === 'prev_month_last_day' || p1_payday_day === 0);
  const p1EffectiveInflowMath = isP1PaidPriorToMonth ? 0 : effectiveP1Income;

  // Rollover to Paycheck 2:
  const dynamicP1RolloverNext = Math.round((effectiveP1Rollover + p1EffectiveInflowMath + effectiveP1TransfersIn - p1TotalObligations) * 100) / 100;
  const effectiveP1RolloverNext = isFieldManual('p1_rollover_next') && paycheckPlan?.p1_rollover_next !== undefined && paycheckPlan?.p1_rollover_next !== null
    ? Number(paycheckPlan.p1_rollover_next)
    : dynamicP1RolloverNext;

  // Paycheck 2 Rollover:
  const effectiveP2Rollover = isFieldManual('p2_rollover') && paycheckPlan?.p2_rollover !== undefined && paycheckPlan?.p2_rollover !== null
    ? Number(paycheckPlan.p2_rollover)
    : effectiveP1RolloverNext;

  // Paycheck 2 Inflow:
  const dynamicP2Income = clearedP2Tx
    ? clearedP2Income
    : (p2Txs.length > 0
        ? Math.round(p2Txs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100
        : (Number(paycheckPlan?.p2_income || 0) > 0 ? Number(paycheckPlan?.p2_income) : 0));
  const effectiveP2Income = isFieldManual('p2_income') && paycheckPlan?.p2_income !== undefined && paycheckPlan?.p2_income !== null
    ? Number(paycheckPlan.p2_income)
    : dynamicP2Income;

  // Paycheck 2 Fixed Bills:
  const dynamicP2FixedBills = Math.round(p2AllBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) * 100) / 100;
  const effectiveP2FixedBills = isFieldManual('p2_fixed_bills') && paycheckPlan?.p2_fixed_bills !== undefined && paycheckPlan?.p2_fixed_bills !== null
    ? Number(paycheckPlan.p2_fixed_bills)
    : dynamicP2FixedBills;

  // Paycheck 2 Lifestyle ("The Greater Of" Rule):
  const effectiveP2Lifestyle = isFieldManual('p2_lifestyle') && paycheckPlan?.p2_lifestyle !== undefined && paycheckPlan?.p2_lifestyle !== null
    ? Math.round(Math.max(Number(paycheckPlan.p2_lifestyle), actualP2Lifestyle) * 100) / 100
    : Math.round(Math.max(plannedP2Lifestyle, actualP2Lifestyle) * 100) / 100;

  // Paycheck 2 Sinking Funds Assigned: Dynamically pulls monthly contribution total from Sinking Funds tab
  const dynamicMonthlySinkingFunds = calculateMonthlySinkingFundsTotal(annualBills);
  const dynamicP2Savings = dynamicMonthlySinkingFunds;
  const effectiveP2Savings = manualFields.includes('p2_savings') && paycheckPlan?.p2_savings !== undefined && paycheckPlan?.p2_savings !== null
    ? Number(paycheckPlan.p2_savings)
    : dynamicP2Savings;
  const p2SinkingCleared = p2SinkingTransferTotal >= effectiveP2Savings || (p2SinkingTransferTotal > 0);

  const dynamicP2Buffer = checkingBuffer;
  const effectiveP2Buffer = isFieldManual('p2_checking_buffer') && paycheckPlan?.p2_checking_buffer !== undefined && paycheckPlan?.p2_checking_buffer !== null
    ? Number(paycheckPlan.p2_checking_buffer)
    : dynamicP2Buffer;

  const p2TotalObligations = Math.round((effectiveP2FixedBills + effectiveP2Lifestyle + effectiveP2ExtraDebt + effectiveP2Savings + effectiveP2Buffer + effectiveP2TransfersOut) * 100) / 100;

  // Paycheck 2 Leftover Free Cash:
  const dynamicP2Leftover = Math.round((
    effectiveP2Rollover +
    effectiveP2Income +
    effectiveP2TransfersIn -
    p2TotalObligations
  ) * 100) / 100;
  const effectiveP2Leftover = isFieldManual('p2_leftover') && paycheckPlan?.p2_leftover !== undefined && paycheckPlan?.p2_leftover !== null
    ? Number(paycheckPlan.p2_leftover)
    : dynamicP2Leftover;

  // Zero-Sum Allocation calculations:
  const p2ZeroSumBuffer = Number(paycheckPlan?.p2_zero_sum_buffer || 0);
  const p2ZeroSumSavings = Number(paycheckPlan?.p2_zero_sum_savings || 0);
  const p2ZeroSumDebt = Number(paycheckPlan?.p2_zero_sum_debt || 0);
  const p2ZeroSumTarget = paycheckPlan?.p2_zero_sum_target || 'debt_overpayment';
  const p2TotalZeroSumAllocated = Math.round((p2ZeroSumBuffer + p2ZeroSumSavings + p2ZeroSumDebt) * 100) / 100;
  const p2UnallocatedLeftover = Math.round((effectiveP2Leftover - p2TotalZeroSumAllocated) * 100) / 100;

  // Combined Monthly Totals:
  const totalIncome = Math.round((effectiveP1Income + effectiveP2Income) * 100) / 100;
  const totalTransfersIn = Math.round((effectiveP1TransfersIn + effectiveP2TransfersIn) * 100) / 100;
  const totalTransfersOut = Math.round((effectiveP1TransfersOut + effectiveP2TransfersOut) * 100) / 100;
  const totalFixedBills = Math.round((effectiveP1FixedBills + effectiveP2FixedBills) * 100) / 100;
  const totalLifestyle = Math.round((effectiveP1Lifestyle + effectiveP2Lifestyle) * 100) / 100;
  const totalExtraDebt = Math.round((effectiveP1ExtraDebt + effectiveP2ExtraDebt) * 100) / 100;
  const totalSavings = Math.round((effectiveP1Savings + effectiveP2Savings) * 100) / 100;
  const totalBuffer = effectiveP2Buffer;
  const totalObligations = Math.round((totalFixedBills + totalLifestyle + totalExtraDebt + totalSavings + totalBuffer + totalTransfersOut) * 100) / 100;

  return {
    effectiveP1Rollover,
    effectiveP1Income,
    p1EffectiveInflowMath,
    isP1PaidPriorToMonth,
    scheduledP1PayDate,
    scheduledP2PayDate,
    effectiveP1FixedBills,
    plannedP1Lifestyle,
    actualP1Lifestyle,
    effectiveP1Lifestyle,
    plannedP1ExtraDebt,
    actualP1ExtraDebt,
    effectiveP1ExtraDebt,
    effectiveP1Savings,
    effectiveP1RolloverNext,
    effectiveP2Rollover,
    effectiveP2Income,
    effectiveP2FixedBills,
    plannedP2Lifestyle,
    actualP2Lifestyle,
    effectiveP2Lifestyle,
    plannedP2ExtraDebt,
    actualP2ExtraDebt,
    effectiveP2ExtraDebt,
    effectiveP2Savings,
    effectiveP2Buffer,
    effectiveP2Leftover,
    leftoverFreeCash: effectiveP2Leftover,
    rawP2Leftover: dynamicP2Leftover,
    p2ZeroSumBuffer,
    p2ZeroSumSavings,
    p2ZeroSumDebt,
    p2ZeroSumTarget,
    p2TotalZeroSumAllocated,
    p2UnallocatedLeftover,
    effectiveP1TransfersIn,
    effectiveP1TransfersOut,
    p1TransfersInItems,
    p1TransfersOutItems,
    effectiveP2TransfersIn,
    effectiveP2TransfersOut,
    p2TransfersInItems,
    p2TransfersOutItems,
    totalTransfersIn,
    totalTransfersOut,
    monthlySinkingFundsTotal: dynamicMonthlySinkingFunds,
    p2SinkingTransfers: p2SinkingTransfersItems,
    p2SinkingTransferTotal,
    p2SinkingCleared,
    checkingEndingBalancePrevMonth: dynamicP1Rollover,
    totalIncome,
    totalFixedBills,
    totalLifestyle,
    totalExtraDebt,
    totalSavings,
    totalBuffer,
    totalObligations,
    clearedP2Date,
    clearedP2Day,
    preDepositCheckingBalance,
    effectiveP1Period,
    effectiveP2Period,
    effectiveP1BillStart,
    effectiveP1BillEnd,
    effectiveP2BillStart,
    effectiveP2BillEnd,
  };
}

/**
 * Returns the exact final 'Leftover Free Cash' variable matching the Paycheck Waterfall Log.
 */
export function calculateWaterfallLeftover(params: {
  paycheckPlan: PaycheckPlan | null;
  accounts: Account[];
  bills: Bill[];
  transactions: Transaction[];
  categories?: Category[];
  selectedMonth?: string;
  selectedYear?: number;
  stats?: OverviewStats | null;
}): number {
  return calculateFullWaterfall(params).leftoverFreeCash;
}

export function calculateDebtPayoff(
  accounts: Account[],
  extraMonthly: number,
  strategy: 'snowball' | 'avalanche' | 'highest_balance'
) {
  const debtAccounts = accounts
    .filter(a => (a.type === 'credit_card' || a.type === 'loan' || a.type === 'auto_loan') && a.balance > 0)
    .map(a => ({
      ...a,
      currentBal: a.balance,
      minPay: a.min_payment || 25,
      aprRate: a.apr || 18,
      totalInterestPaid: 0,
      paidOffMonth: 0,
    }));

  if (strategy === 'snowball') {
    debtAccounts.sort((a, b) => a.currentBal - b.currentBal);
  } else if (strategy === 'avalanche') {
    debtAccounts.sort((a, b) => b.aprRate - a.aprRate);
  } else if (strategy === 'highest_balance') {
    debtAccounts.sort((a, b) => b.currentBal - a.currentBal);
  }

  let month = 0;
  let snowballPot = extraMonthly;
  let totalCumulativeInterest = 0;
  const history: PayoffStep[] = [];

  const now = new Date(2026, 7, 1); // Start August 2026

  while (debtAccounts.some(d => d.currentBal > 0) && month < 180) {
    month++;
    const stepDate = new Date(now.getFullYear(), now.getMonth() + month, 1);
    const dateStr = stepDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    let extraLeft = snowballPot;
    const stepDebts: PayoffStep['debts'] = [];

    // 1. Pay minimums and calculate interest
    for (const d of debtAccounts) {
      if (d.currentBal <= 0) {
        stepDebts.push({
          id: d.id,
          name: d.name,
          balance: 0,
          paidThisMonth: 0,
          interestThisMonth: 0,
          isPaidOff: true,
        });
        continue;
      }

      const monthlyInterest = (d.currentBal * (d.aprRate / 100)) / 12;
      d.currentBal += monthlyInterest;
      d.totalInterestPaid += monthlyInterest;
      totalCumulativeInterest += monthlyInterest;

      const minPay = Math.min(d.currentBal, d.minPay);
      d.currentBal -= minPay;

      let extraPaidOnThis = 0;
      if (d.currentBal <= 0 && d.paidOffMonth === 0) {
        d.paidOffMonth = month;
        snowballPot += d.minPay;
      }

      stepDebts.push({
        id: d.id,
        name: d.name,
        balance: Math.max(0, d.currentBal),
        paidThisMonth: minPay,
        interestThisMonth: monthlyInterest,
        isPaidOff: d.currentBal <= 0,
      });
    }

    // 2. Apply extra snowball/avalanche payment across targets until extraLeft is exhausted or all debts are paid
    while (extraLeft > 0.01) {
      const target = debtAccounts.find(d => d.currentBal > 0);
      if (!target) break;

      const extraPay = Math.min(target.currentBal, extraLeft);
      target.currentBal -= extraPay;
      extraLeft -= extraPay;

      const targetStep = stepDebts.find(s => s.id === target.id);
      if (targetStep) {
        targetStep.paidThisMonth += extraPay;
        targetStep.balance = Math.max(0, target.currentBal);
      }

      if (target.currentBal <= 0 && target.paidOffMonth === 0) {
        target.paidOffMonth = month;
        snowballPot += target.minPay;
      }
    }

    history.push({
      month,
      dateStr,
      totalPaid: stepDebts.reduce((sum, s) => sum + s.paidThisMonth, 0),
      totalInterest: totalCumulativeInterest,
      debts: stepDebts,
    });
  }

  return {
    totalMonths: month,
    totalInterest: totalCumulativeInterest,
    debtAccounts,
    history,
  };
}
