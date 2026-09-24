import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Receipt, Calendar, SlidersHorizontal, Edit3, RotateCcw, Sparkles, Check, X, Clock, Settings, HelpCircle, ArrowDownLeft, ArrowUpRight, ArrowRightLeft } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, formatSignedCurrency, getOrdinalSuffix } from '../../utils/formatters';
import { api } from '../../api/client';
import { isBillInPaycheck1, calculateMonthlySinkingFundsTotal, isSinkingFundOrSavingsBill, isPaycheckDepositTx, isExplicitP1Tx, isExplicitP2Tx } from '../../utils/calculations';
import { SakuraIcon } from '../common/SakuraIcon';

export const PaycheckAllocatorView: React.FC = () => {
  const { paycheckPlan, bills = [], annualBills = [], accounts = [], transactions = [], categories = [], stats, selectedMonth, selectedYear, setSelectedMonth, setSelectedYear, refreshData, showToast } = useBudget();
  const [isEditing, setIsEditing] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [viewMode, setViewMode] = useState<'log' | 'cards'>('log');
  const [waterfallMode, setWaterfallMode] = useState<'worst_case' | 'live_actuals' | 'reconciliation'>('worst_case');
  const [showP1BillsModal, setShowP1BillsModal] = useState(false);
  const [showP2BillsModal, setShowP2BillsModal] = useState(false);
  const [showP1BillsLog, setShowP1BillsLog] = useState(false);
  const [showP2BillsLog, setShowP2BillsLog] = useState(false);
  const [showP1LifestyleLog, setShowP1LifestyleLog] = useState(false);
  const [showP2LifestyleLog, setShowP2LifestyleLog] = useState(false);
  const [showP1ExtraDebtLog, setShowP1ExtraDebtLog] = useState(false);
  const [showP2ExtraDebtLog, setShowP2ExtraDebtLog] = useState(false);
  const [showP1TransfersInLog, setShowP1TransfersInLog] = useState(false);
  const [showP1TransfersOutLog, setShowP1TransfersOutLog] = useState(false);
  const [showP2TransfersInLog, setShowP2TransfersInLog] = useState(false);
  const [showP2TransfersOutLog, setShowP2TransfersOutLog] = useState(false);
  const [showP2SinkingLog, setShowP2SinkingLog] = useState(false);

  // Paycheck Schedule & Coverage Settings from Plan
  const p1PaydayMode = paycheckPlan?.p1_payday_mode || 'prev_month_last_day';
  const p1PaydayDay = Number(paycheckPlan?.p1_payday_day ?? 0);
  const p1BillStart = Number(paycheckPlan?.p1_bill_start ?? 1);
  const p1BillEnd = Number(paycheckPlan?.p1_bill_end ?? 15);

  const p2PaydayMode = paycheckPlan?.p2_payday_mode || 'day_of_month';
  const p2PaydayDay = Number(paycheckPlan?.p2_payday_day ?? 15);
  const p2BillStart = Number(paycheckPlan?.p2_bill_start ?? 16);
  const p2BillEnd = Number(paycheckPlan?.p2_bill_end ?? 31);

  // 1. Data Source: Locate the user's assigned/current Checking account balance
  const checkingAccount = accounts.find(a => a.id === 'acc_checking' || a.type === 'checking');
  const checkingBalance = checkingAccount ? Number(checkingAccount.balance || 0) : Number(paycheckPlan?.p1_rollover || 0);

  // 2. Data Source: Dynamic Paycheck 1 & Paycheck 2 Inflow from checking ledger
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

  const mNum = monthMap[selectedMonth] || '08';
  const monthNum = mNum;
  const activeMonthPrefix = `${selectedYear}-${mNum}`;

  // Helper to extract day of month
  const getDayOfMonth = (dStr: string) => {
    if (!dStr) return 1;
    const clean = dStr.replace(/\//g, '-');
    const parts = clean.split('-');
    return parseInt(parts[2] || '1', 10);
  };

  const isExpenseTx = (type?: string) => {
    const t = (type || '').trim().toLowerCase();
    return t === 'expense' || t === 'payment' || t === 'withdrawal' || t === 'debit';
  };
  const isRefundTx = (type?: string) => {
    const t = (type || '').trim().toLowerCase();
    return t === 'income' || t === 'refund' || t === 'credit' || t === 'deposit';
  };

  const isTrueRefundTx = (t: any) => {
    const type = (t.type || '').trim().toLowerCase();
    const desc = (t.description || '').trim().toLowerCase();
    const cat = (t.category || '').trim().toLowerCase();
    return type === 'refund' || cat === 'refunds' || cat === 'refund' || desc.includes('refund');
  };

  const checkingMonthTxs = transactions.filter(t => 
    (t.account_id === 'acc_checking' || t.account_id === 'checking') && 
    (t.date || '').replace(/\//g, '-').startsWith(activeMonthPrefix)
  );

  const chronCheckingTxs = [...checkingMonthTxs].sort((a, b) => {
    const da = (a.date || '').replace(/\//g, '-');
    const db = (b.date || '').replace(/\//g, '-');
    if (da !== db) return da.localeCompare(db);
    return (a.id || '').localeCompare(b.id || '');
  });

  const prevMonthIncomeTxs = transactions.filter(t => 
    (t.account_id === 'acc_checking' || t.account_id === 'checking') && 
    (t.type || '').toLowerCase() === 'income' && 
    (t.category || '').trim().toLowerCase() !== 'rollover' &&
    (t.date || '').replace(/\//g, '-').startsWith(`${prevYear}-${prevMNum}`)
  );

  // 1.) Rollover from Checking Transaction Ledger:
  // Filter for the specific row where Category matches Rollover (or Track Only) for the active month
  const checkingAllTxs = transactions.filter(t => 
    t.account_id === 'acc_checking' || t.account_id === 'checking'
  );

  const checkingIncomeTxs = checkingMonthTxs.filter(t => 
    (t.type || '').toLowerCase() === 'income' && (t.category || '').trim().toLowerCase() !== 'rollover'
  );

  const localClearedP2Tx = checkingIncomeTxs.find(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP2Tx(t)) return true;
    if (isExplicitP1Tx(t)) return false;
    const day = parseInt((t.date || '').split('-')[2] || '1', 10);
    return day >= 7;
  });

  const clearedP2Tx = paycheckPlan?.cleared_p2_tx || localClearedP2Tx || null;
  const clearedP2Date = paycheckPlan?.cleared_p2_date || (clearedP2Tx ? clearedP2Tx.date : null);
  const clearedP2Day = paycheckPlan?.cleared_p2_day || (clearedP2Date ? parseInt(clearedP2Date.split('-')[2] || '1', 10) : null);
  const clearedP2Income = clearedP2Tx ? Number(clearedP2Tx.amount || 0) : 0;
  const preDepositCheckingBalance = paycheckPlan?.pre_deposit_checking_balance !== undefined && paycheckPlan?.pre_deposit_checking_balance !== null
    ? Number(paycheckPlan.pre_deposit_checking_balance)
    : null;

  const p2TxIdx = clearedP2Tx ? chronCheckingTxs.findIndex(x => x.id === clearedP2Tx.id) : -1;
  const isPeriod1Tx = (t: any) => {
    if (clearedP2Tx && p2TxIdx >= 0) {
      const idx = chronCheckingTxs.findIndex(x => x.id === t.id);
      return idx >= 0 && idx < p2TxIdx;
    }
    const day = getDayOfMonth(t.date);
    return day >= p1BillStart && day <= p1BillEnd;
  };
  const isPeriod2Tx = (t: any) => {
    if (clearedP2Tx && p2TxIdx >= 0) {
      const idx = chronCheckingTxs.findIndex(x => x.id === t.id);
      return idx >= 0 && idx > p2TxIdx;
    }
    const day = getDayOfMonth(t.date);
    return day >= p2BillStart && day <= p2BillEnd;
  };

  const effectiveP1BillStart = p1BillStart;
  const effectiveP1BillEnd = clearedP2Day && clearedP2Day > 0 ? (clearedP2Day - 1) : p1BillEnd;
  const effectiveP2BillStart = clearedP2Day && clearedP2Day > 0 ? clearedP2Day : p2BillStart;
  const effectiveP2BillEnd = p2BillEnd;

  // Paycheck 1 Inflow:
  // (a) Arriving on the last day of previous month (or last 2 days)
  const p1TxsFromPrevMonth = prevMonthIncomeTxs.filter(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP1Tx(t)) return true;
    if (isExplicitP2Tx(t)) return false;
    const dStr = (t.date || '').replace(/\//g, '-');
    const day = parseInt(dStr.split('-')[2] || '1', 10);

    if (p1PaydayMode === 'prev_month_last_day') {
      if (dStr === prevMonthLastDayStr) return true;
      if (day >= lastDayOfPrevMonth - 2) return true;
    } else if (p1PaydayDay > 0 && day === p1PaydayDay) {
      return true;
    }
    return false;
  });

  // (b) Arriving in active month within Paycheck 1 window
  const p1TxsFromCurMonth = checkingIncomeTxs.filter(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP1Tx(t)) return true;
    if (isExplicitP2Tx(t)) return false;
    const day = parseInt((t.date || '').split('-')[2] || '1', 10);
    return day <= effectiveP1BillEnd && day >= effectiveP1BillStart;
  });

  const p1Txs = [...p1TxsFromPrevMonth, ...p1TxsFromCurMonth];

  const p2Txs = checkingIncomeTxs.filter(t => {
    if (!isPaycheckDepositTx(t)) return false;
    if (isExplicitP2Tx(t)) return true;
    if (isExplicitP1Tx(t)) return false;
    const day = parseInt((t.date || '').split('-')[2] || '1', 10);
    return day >= Math.min(14, effectiveP2BillStart);
  });

  const isFirstPaycheck = (b: any) => isBillInPaycheck1(b, p1BillStart, p1BillEnd, clearedP2Day);

  const activeMonthKey = `paid_${selectedMonth.toLowerCase()}` as keyof (typeof bills)[0];

  // --- Total Obligations & Paid Status Breakdown ---
  // Exclude bills that are sinking funds or savings allocations (e.g. biannual insurance, annual subs, savings reserve)
  // so they are not deducted as lump-sum monthly fixed bills in the waterfall:
  const fixedBillsMaster = bills.filter(b => !isSinkingFundOrSavingsBill(b, annualBills));

  // Paycheck 1 Bills:
  const p1AllBills = fixedBillsMaster.filter(isFirstPaycheck);
  const p1TotalFixedBills = Math.round(p1AllBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) * 100) / 100;
  const p1PaidBills = p1AllBills.filter(b => Number(b[activeMonthKey] || 0) === 1);
  const p1UnpaidBills = p1AllBills.filter(b => Number(b[activeMonthKey] || 0) !== 1);
  const p1PaidTotal = Math.round(p1PaidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) * 100) / 100;
  const p1UnpaidTotal = Math.round(p1UnpaidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) * 100) / 100;

  // Paycheck 2 Bills:
  const p2AllBills = fixedBillsMaster.filter(b => !isFirstPaycheck(b));
  const p2TotalFixedBills = Math.round(p2AllBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) * 100) / 100;
  const p2PaidBills = p2AllBills.filter(b => Number(b[activeMonthKey] || 0) === 1);
  const p2UnpaidBills = p2AllBills.filter(b => Number(b[activeMonthKey] || 0) !== 1);
  const p2PaidTotal = Math.round(p2PaidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) * 100) / 100;
  const p2UnpaidTotal = Math.round(p2UnpaidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) * 100) / 100;

  // Combined Bills:
  const totalFixedBills = Math.round((p1TotalFixedBills + p2TotalFixedBills) * 100) / 100;
  const totalPaidBills = Math.round((p1PaidTotal + p2PaidTotal) * 100) / 100;
  const totalUnpaidBills = Math.round((p1UnpaidTotal + p2UnpaidTotal) * 100) / 100;
  const totalPaidCount = p1PaidBills.length + p2PaidBills.length;
  const totalBillsCount = fixedBillsMaster.length;

  // Manual overrides & field state from saved plan
  const manualFields: string[] = Array.isArray(paycheckPlan?.manual_fields)
    ? paycheckPlan.manual_fields
    : (typeof paycheckPlan?.manual_fields === 'string'
        ? (() => { try { return JSON.parse(paycheckPlan.manual_fields); } catch { return []; } })()
        : []);
  const isManualMode = Boolean(paycheckPlan?.is_manual);
  const isFieldManual = (field: string) => isManualMode || manualFields.includes(field);


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

  const getCategorySpentInRange = (catMatch: string, startDay: number, endDay: number, isP1: boolean = true) => {
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

  // 1.) Paycheck 1 Starting Rollover Balance:
  // Automatically comes from the end of month balance of the previous month (August 31 ending balance = $5,835.07).
  let prevMonthEndingLedgerBalance = 0;
  if (paycheckPlan?.checking_ending_balance_prev_month !== undefined && paycheckPlan?.checking_ending_balance_prev_month !== null) {
    prevMonthEndingLedgerBalance = Number(paycheckPlan.checking_ending_balance_prev_month);
  } else if (checkingAccount && transactions && transactions.length > 0) {
    const priorCheckingTxs = transactions.filter(t => {
      const acctId = t.account_id || (t as any).accountId;
      if (acctId !== checkingAccount.id && (t as any).account !== checkingAccount.name) return false;
      const d = (t.date || '').replace(/\//g, '-');
      return d <= prevMonthLastDayStr;
    }).sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : (a.id || '').localeCompare(b.id || '')));

    let runningBal = Number(checkingAccount.starting_balance || 0);
    for (const t of priorCheckingTxs) {
      const typ = (t.type || '').toLowerCase();
      const desc = (t.description || '').trim().toLowerCase();
      const amt = Number(t.amount || 0);
      if (desc.includes('starting balance')) continue;
      if (typ === 'income' && !desc.includes('rollover')) {
        runningBal += amt;
      } else if (typ === 'expense' || typ === 'payment' || typ === 'withdrawal' || typ === 'debit') {
        runningBal -= amt;
      }
    }
    prevMonthEndingLedgerBalance = Math.round(runningBal * 100) / 100;
  }

  const dynamicP1Rollover = prevMonthEndingLedgerBalance > 0
    ? prevMonthEndingLedgerBalance
    : (checkingAccount ? Number(checkingAccount.starting_balance || 0) : 0);

  const effectiveP1Rollover = isFieldManual('p1_rollover') && paycheckPlan?.p1_rollover !== undefined && paycheckPlan?.p1_rollover !== null
    ? Number(paycheckPlan.p1_rollover)
    : dynamicP1Rollover;

  // Paycheck 1 Inflow / Income:
  const dynamicP1Income = p1Txs.length > 0
    ? Math.round(p1Txs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100
    : (Number(paycheckPlan?.p1_income || 0) > 0 ? Number(paycheckPlan?.p1_income) : 0);
  const effectiveP1Income = isFieldManual('p1_income') && paycheckPlan?.p1_income !== undefined && paycheckPlan?.p1_income !== null
    ? Number(paycheckPlan.p1_income)
    : dynamicP1Income;

  // Paycheck 1 Fixed Bills:
  const dynamicP1FixedBills = p1TotalFixedBills;
  const effectiveP1FixedBills = isFieldManual('p1_fixed_bills') && paycheckPlan?.p1_fixed_bills !== undefined && paycheckPlan?.p1_fixed_bills !== null
    ? Number(paycheckPlan.p1_fixed_bills)
    : dynamicP1FixedBills;

  // Paycheck 1 Lifestyle Actual Spending from live checking ledger (combined 5 categories):
  const p1LifestyleTxs = checkingMonthTxs.filter(t => {
    const matchPeriod = (clearedP2Tx && p2TxIdx >= 0) ? isPeriod1Tx(t) : (getDayOfMonth(t.date) >= p1BillStart && getDayOfMonth(t.date) <= p1BillEnd);
    return matchPeriod && isExpenseTx(t.type) && isLifestyleCategory(t.category);
  });
  const p1LifestyleRefunds = checkingMonthTxs.filter(t => {
    const matchPeriod = (clearedP2Tx && p2TxIdx >= 0) ? isPeriod1Tx(t) : (getDayOfMonth(t.date) >= p1BillStart && getDayOfMonth(t.date) <= p1BillEnd);
    return matchPeriod && isRefundTx(t.type) && isLifestyleCategory(t.category);
  });
  const actualP1Lifestyle = Math.max(0, Math.round((
    p1LifestyleTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) -
    p1LifestyleRefunds.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  ) * 100) / 100);

  // Paycheck 2 Lifestyle Actual Spending from live checking ledger (combined 5 categories):
  const p2LifestyleTxs = checkingMonthTxs.filter(t => {
    const matchPeriod = (clearedP2Tx && p2TxIdx >= 0) ? isPeriod2Tx(t) : (getDayOfMonth(t.date) >= p2BillStart && getDayOfMonth(t.date) <= p2BillEnd);
    return matchPeriod && isExpenseTx(t.type) && isLifestyleCategory(t.category);
  });
  const p2LifestyleRefunds = checkingMonthTxs.filter(t => {
    const matchPeriod = (clearedP2Tx && p2TxIdx >= 0) ? isPeriod2Tx(t) : (getDayOfMonth(t.date) >= p2BillStart && getDayOfMonth(t.date) <= p2BillEnd);
    return matchPeriod && isRefundTx(t.type) && isLifestyleCategory(t.category);
  });
  const actualP2Lifestyle = Math.max(0, Math.round((
    p2LifestyleTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) -
    p2LifestyleRefunds.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  ) * 100) / 100);

  // Dynamic umbrella monthly budget from the 5 categories:
  const umbrellaCatRows = (categories || []).filter(c => {
    const clean = (c.name || '').trim().toLowerCase();
    return LIFESTYLE_UMBRELLA_CATEGORY_NAMES.some(u => clean === u || clean.startsWith(u));
  });
  const dynUmbrellaMonthlyBudget = Math.round(
    umbrellaCatRows.reduce((sum, c) => sum + (Number(c.budget) || 0), 0) * 100
  ) / 100;
  const dynUmbrellaPerPaycheck = dynUmbrellaMonthlyBudget > 0
    ? Math.round((dynUmbrellaMonthlyBudget / 2) * 100) / 100
    : 650;

  // Planned Lifestyle budget amounts (from manual override or dynamic umbrella budget)
  const plannedP1Lifestyle = isFieldManual('p1_lifestyle') && paycheckPlan?.p1_lifestyle !== undefined && paycheckPlan?.p1_lifestyle !== null
    ? Number(paycheckPlan.p1_lifestyle)
    : dynUmbrellaPerPaycheck;
  const plannedP2Lifestyle = isFieldManual('p2_lifestyle') && paycheckPlan?.p2_lifestyle !== undefined && paycheckPlan?.p2_lifestyle !== null
    ? Number(paycheckPlan.p2_lifestyle)
    : dynUmbrellaPerPaycheck;

  // Live Spending Logic ("The Greater Of" Rule): Deduct whichever value is absolute HIGHER: Planned Budget OR Actual Spent
  const effectiveP1Lifestyle = isFieldManual('p1_lifestyle') && paycheckPlan?.p1_lifestyle !== undefined && paycheckPlan?.p1_lifestyle !== null
    ? Math.round(Math.max(Number(paycheckPlan.p1_lifestyle), actualP1Lifestyle) * 100) / 100
    : Math.round(Math.max(plannedP1Lifestyle, actualP1Lifestyle) * 100) / 100;

  const umbrellaCategoryDetails = [
    { name: 'Groceries', icon: '🛒', match: 'groceries' },
    { name: 'Gas', icon: '⛽', match: 'gas' },
    { name: 'Entertainment', icon: '🎮', match: 'entertainment' },
    { name: 'Takeout', icon: '🍱', match: 'takeout' },
    { name: 'Chicken Feed', icon: '🐔', match: 'chicken feed' },
  ].map(item => {
    const catObj = umbrellaCatRows.find(c => (c.name || '').trim().toLowerCase().startsWith(item.match));
    const monthly = catObj ? Number(catObj.budget || 0) : 0;
    const perCheck = Math.round((monthly / 2) * 100) / 100;
    const p1Spent = getCategorySpentInRange(item.match, p1BillStart, p1BillEnd, true);
    const p2Spent = getCategorySpentInRange(item.match, p2BillStart, p2BillEnd, false);
    return {
      ...item,
      icon: catObj?.icon || item.icon,
      monthlyBudget: monthly,
      perCheckBudget: perCheck,
      p1Spent,
      p2Spent,
    };
  });

  // Categories for Extra Debt & Unplanned Spend: Extra Payment & Other / Misc
  const normStr = (s: string) => (s || '').trim().toLowerCase();

  const extraPaymentCatRow = (categories || []).find(c => {
    const clean = (c.name || '').trim().toLowerCase();
    return clean === 'extra payment' || c.id === 'cat_extra';
  });
  const dynExtraDebtMonthlyBudget = extraPaymentCatRow ? Number(extraPaymentCatRow.budget || 0) : 500;
  const dynExtraDebtPerPaycheck = dynExtraDebtMonthlyBudget > 0
    ? Math.round((dynExtraDebtMonthlyBudget / 2) * 100) / 100
    : 250;

  const plannedP1ExtraDebt = manualFields.includes('p1_extra_debt') && paycheckPlan?.p1_extra_debt !== undefined && paycheckPlan?.p1_extra_debt !== null
    ? Number(paycheckPlan.p1_extra_debt)
    : dynExtraDebtPerPaycheck;
  const plannedP2ExtraDebt = manualFields.includes('p2_extra_debt') && paycheckPlan?.p2_extra_debt !== undefined && paycheckPlan?.p2_extra_debt !== null
    ? Number(paycheckPlan.p2_extra_debt)
    : dynExtraDebtPerPaycheck;

  // Rule 1: Deduct Actual Unplanned Spending:
  // For each pay period date range, query all transactions/ledger entries that occurred during that window.
  // Deduct any debit/outflow that is NOT already accounted for in the 'Fixed Bills Assigned' list
  // (e.g., extra credit card payments, manual transfers, variable spend beyond budget) as an 'Unplanned Outflows / Extra Debt Paid' deduction line.
  const calculateUnplannedOutflows = (startDay: number, endDay: number, periodBills: any[], plannedLifestyle: number, isP1: boolean = true) => {
    const periodTxs = checkingMonthTxs.filter(t => {
      if (clearedP2Tx && p2TxIdx >= 0) {
        return isP1 ? isPeriod1Tx(t) : isPeriod2Tx(t);
      }
      const day = getDayOfMonth(t.date);
      return day >= startDay && day <= endDay;
    });

    const exps = periodTxs.filter(t => isExpenseTx(t.type));
    const refs = periodTxs.filter(t => isTrueRefundTx(t));

    const unmatchedTxs: Array<{ id: string; date: string; description: string; amount: number; category: string; reason: string }> = [];
    let lifestylePeriodSpent = 0;
    let clearedBillsSpent = 0;

    for (const t of exps) {
      const tid = t.id || '';
      const dClean = normStr(t.description);
      const amt = Number(t.amount || 0);

      // Check if this tx matches a known fixed bill in master bills list (to prevent double-deducting cross-period bills)
      let matchedBill: any = null;
      if (tid.startsWith('tx_bill_')) {
        matchedBill = bills.find(b => normStr(b.name) === dClean || normStr(b.name).includes(dClean) || dClean.includes(normStr(b.name)));
      } else if (t.notes && (t.notes.includes('[Bill Auto-Sync') || t.notes.includes('[CC Payment Sync:'))) {
        matchedBill = bills.find(b => normStr(b.name) === dClean || dClean.includes(normStr(b.name)) || normStr(b.name).includes(dClean));
      } else {
        matchedBill = bills.find(b => normStr(b.name) === dClean || (normStr(b.name).length > 3 && dClean.includes(normStr(b.name))));
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

    return {
      actualSpent,
      txs: unmatchedTxs,
      clearedBillsSpent: Math.round(clearedBillsSpent * 100) / 100
    };
  };

  const p1Unplanned = calculateUnplannedOutflows(p1BillStart, p1BillEnd, p1AllBills, plannedP1Lifestyle, true);
  const p1UnplannedTxs = (paycheckPlan?.unplanned_outflows_txs?.p1 && paycheckPlan.unplanned_outflows_txs.p1.length > 0)
    ? paycheckPlan.unplanned_outflows_txs.p1
    : p1Unplanned.txs;
  const p1TxSum = Array.isArray(p1UnplannedTxs) && p1UnplannedTxs.length > 0
    ? Math.round(p1UnplannedTxs.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0) * 100) / 100
    : 0;
  const actualP1ExtraDebt = p1TxSum > 0
    ? p1TxSum
    : (paycheckPlan?.p1_unplanned_outflows_spent !== undefined && paycheckPlan?.p1_unplanned_outflows_spent !== null
        ? Number(paycheckPlan.p1_unplanned_outflows_spent)
        : p1Unplanned.actualSpent);

  const p2Unplanned = calculateUnplannedOutflows(p2BillStart, p2BillEnd, p2AllBills, plannedP2Lifestyle, false);
  const p2UnplannedTxs = (paycheckPlan?.unplanned_outflows_txs?.p2 && paycheckPlan.unplanned_outflows_txs.p2.length > 0)
    ? paycheckPlan.unplanned_outflows_txs.p2
    : p2Unplanned.txs;
  const p2TxSum = Array.isArray(p2UnplannedTxs) && p2UnplannedTxs.length > 0
    ? Math.round(p2UnplannedTxs.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0) * 100) / 100
    : 0;
  const actualP2ExtraDebt = (p2TxSum > 0 ? p2TxSum : (paycheckPlan?.p2_unplanned_outflows_spent !== undefined && paycheckPlan?.p2_unplanned_outflows_spent !== null ? Number(paycheckPlan.p2_unplanned_outflows_spent) : p2Unplanned.actualSpent));

  // Live Spending Logic ("The Greater Of" Rule) for Unplanned Outflows / Extra Debt Paid:
  const effectiveP1ExtraDebt = manualFields.includes('p1_extra_debt') && paycheckPlan?.p1_extra_debt !== undefined && paycheckPlan?.p1_extra_debt !== null
    ? Math.round(Math.max(Number(paycheckPlan.p1_extra_debt), actualP1ExtraDebt) * 100) / 100
    : Math.round(Math.max(plannedP1ExtraDebt, actualP1ExtraDebt) * 100) / 100;

  const effectiveP2ExtraDebt = manualFields.includes('p2_extra_debt') && paycheckPlan?.p2_extra_debt !== undefined && paycheckPlan?.p2_extra_debt !== null
    ? Math.round(Math.max(Number(paycheckPlan.p2_extra_debt), actualP2ExtraDebt) * 100) / 100
    : Math.round(Math.max(plannedP2ExtraDebt, actualP2ExtraDebt) * 100) / 100;

  const extraDebtCategoryDetails = [
    { name: 'Extra Payment', icon: '✨', match: 'extra' },
    { name: 'Other / Misc', icon: '🍰', match: 'other' },
  ].map(item => {
    const catObj = (categories || []).find(c => (c.name || '').trim().toLowerCase().includes(item.match) || (c.id || '').toLowerCase().includes(item.match));
    const monthly = catObj ? Number(catObj.budget || 0) : 0;
    const perCheck = Math.round((monthly / 2) * 100) / 100;
    const p1Spent = getCategorySpentInRange(item.match, p1BillStart, p1BillEnd, true);
    const p2Spent = getCategorySpentInRange(item.match, p2BillStart, p2BillEnd, false);
    return {
      ...item,
      icon: catObj?.icon || item.icon,
      monthlyBudget: monthly,
      perCheckBudget: perCheck,
      p1Spent,
      p2Spent,
    };
  });

  // Paycheck 1 Savings:
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
    if (clearedP2Tx && p2TxIdx >= 0) return isPeriod1Tx(t);
    const day = getDayOfMonth(t.date);
    return day >= p1BillStart && day <= p1BillEnd;
  });

  const p2TransferTxs = checkingTransfers.filter(t => {
    if (clearedP2Tx && p2TxIdx >= 0) return isPeriod2Tx(t);
    const day = getDayOfMonth(t.date);
    return day >= p2BillStart && day <= p2BillEnd;
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

  const dynamicP1TransfersIn = Math.round(p1TransfersInTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;
  const dynamicP1TransfersOut = Math.round(p1TransfersOutTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;
  const dynamicP2TransfersIn = Math.round(p2TransfersInTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;
  const dynamicP2TransfersOut = Math.round(p2OtherTransfersOutTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100;

  const p1TransfersInItems = paycheckPlan?.p1_transfers_in_items || p1TransfersInTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: getTransferSource(t),
    destination: 'Checking 🌸',
    notes: t.notes
  }));

  const p1TransfersOutItems = paycheckPlan?.p1_transfers_out_items || p1TransfersOutTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: 'Checking 🌸',
    destination: getTransferDestination(t),
    notes: t.notes
  }));

  const p2TransfersInItems = paycheckPlan?.p2_transfers_in_items || p2TransfersInTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: getTransferSource(t),
    destination: 'Checking 🌸',
    notes: t.notes
  }));

  const p2TransfersOutItems = paycheckPlan?.p2_transfers_out_items || p2OtherTransfersOutTxs.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: Number(t.amount || 0),
    source: 'Checking 🌸',
    destination: getTransferDestination(t),
    notes: t.notes
  }));

  const p2SinkingTransfersItems = paycheckPlan?.p2_sinking_transfers || p2SinkingTransfers.map(t => ({
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
    : (paycheckPlan?.p1_transfers_in !== undefined ? Number(paycheckPlan.p1_transfers_in) : dynamicP1TransfersIn);
  const effectiveP1TransfersOut = isFieldManual('p1_transfers_out') && paycheckPlan?.p1_transfers_out !== undefined && paycheckPlan?.p1_transfers_out !== null
    ? Number(paycheckPlan.p1_transfers_out)
    : (paycheckPlan?.p1_transfers_out !== undefined ? Number(paycheckPlan.p1_transfers_out) : dynamicP1TransfersOut);
  const effectiveP2TransfersIn = isFieldManual('p2_transfers_in') && paycheckPlan?.p2_transfers_in !== undefined && paycheckPlan?.p2_transfers_in !== null
    ? Number(paycheckPlan.p2_transfers_in)
    : (paycheckPlan?.p2_transfers_in !== undefined ? Number(paycheckPlan.p2_transfers_in) : dynamicP2TransfersIn);
  const effectiveP2TransfersOut = isFieldManual('p2_transfers_out') && paycheckPlan?.p2_transfers_out !== undefined && paycheckPlan?.p2_transfers_out !== null
    ? Number(paycheckPlan.p2_transfers_out)
    : (paycheckPlan?.p2_transfers_out !== undefined ? Number(paycheckPlan.p2_transfers_out) : dynamicP2TransfersOut);

  const p1TotalObligations = Math.round((effectiveP1FixedBills + effectiveP1Lifestyle + effectiveP1ExtraDebt + effectiveP1Savings + effectiveP1TransfersOut) * 100) / 100;

  // Identify Pay Date Timing: Check scheduled pay date for Paycheck 1 & Paycheck 2
  const activeMonthFirstDayStr = `${selectedYear}-${monthNum}-01`;
  const scheduledP1PayDate = (p1PaydayMode === 'prev_month_last_day' || p1PaydayDay === 0)
    ? `${prevMonth} ${lastDayOfPrevMonth}`
    : `${selectedMonth} ${p1PaydayDay || 1}`;
  const scheduledP2PayDate = clearedP2Date
    ? `${selectedMonth} ${clearedP2Day}`
    : `${selectedMonth} ${p2PaydayDay || 15}`;

  // Paycheck 1 Timing Rule: Arrives on last day of prior month (e.g. Aug 31 for Sep).
  // Because this cash is already inside the physical account on the 1st (as part of the Starting Rollover balance),
  const isP1PaidPriorToMonth = (p1PaydayMode === 'prev_month_last_day' || p1PaydayDay === 0);
  const p1EffectiveInflowMath = isP1PaidPriorToMonth ? 0 : effectiveP1Income;

  // Paycheck 1 Rollover to Paycheck 2:
  const dynamicP1RolloverNext = Math.round((
    effectiveP1Rollover +
    p1EffectiveInflowMath +
    effectiveP1TransfersIn -
    p1TotalObligations
  ) * 100) / 100;
  const effectiveP1RolloverNext = isFieldManual('p1_rollover_next') && paycheckPlan?.p1_rollover_next !== undefined && paycheckPlan?.p1_rollover_next !== null
    ? Number(paycheckPlan.p1_rollover_next)
    : dynamicP1RolloverNext;

  const effectiveP1Period = clearedP2Day && clearedP2Day > 0
    ? `1st - ${clearedP2Day}th`
    : (paycheckPlan?.p1_period || '1st - 15th');
  const effectiveP2Period = clearedP2Day && clearedP2Day > 0
    ? `${clearedP2Day}th - 31st`
    : (paycheckPlan?.p2_period || '16th - 31st');

  // Paycheck 2 Rollover (from Paycheck 1):
  const dynamicP2Rollover = clearedP2Tx && preDepositCheckingBalance !== null ? preDepositCheckingBalance : effectiveP1RolloverNext;
  const effectiveP2Rollover = isFieldManual('p2_rollover') && paycheckPlan?.p2_rollover !== undefined && paycheckPlan?.p2_rollover !== null
    ? Number(paycheckPlan.p2_rollover)
    : dynamicP2Rollover;

  // Paycheck 2 Inflow / Income:
  const dynamicP2Income = clearedP2Tx
    ? clearedP2Income
    : (p2Txs.length > 0
        ? Math.round(p2Txs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100
        : (Number(paycheckPlan?.p2_income || 0) > 0 ? Number(paycheckPlan?.p2_income) : 0));
  const effectiveP2Income = isFieldManual('p2_income') && paycheckPlan?.p2_income !== undefined && paycheckPlan?.p2_income !== null
    ? Number(paycheckPlan.p2_income)
    : dynamicP2Income;

  // Paycheck 2 Fixed Bills:
  const dynamicP2FixedBills = p2TotalFixedBills;
  const effectiveP2FixedBills = isFieldManual('p2_fixed_bills') && paycheckPlan?.p2_fixed_bills !== undefined && paycheckPlan?.p2_fixed_bills !== null
    ? Number(paycheckPlan.p2_fixed_bills)
    : dynamicP2FixedBills;

  // Paycheck 2 Lifestyle ("The Greater Of" Rule):
  const effectiveP2Lifestyle = isFieldManual('p2_lifestyle') && paycheckPlan?.p2_lifestyle !== undefined && paycheckPlan?.p2_lifestyle !== null
    ? Math.round(Math.max(Number(paycheckPlan.p2_lifestyle), actualP2Lifestyle) * 100) / 100
    : Math.round(Math.max(plannedP2Lifestyle, actualP2Lifestyle) * 100) / 100;

  const dynamicMonthlySinkingFunds = annualBills && annualBills.length > 0
    ? calculateMonthlySinkingFundsTotal(annualBills)
    : (paycheckPlan?.monthly_sinking_funds_total ?? calculateMonthlySinkingFundsTotal(annualBills));
  const dynamicP2Savings = dynamicMonthlySinkingFunds;
  const isP2SavingsManual = manualFields.includes('p2_savings') && paycheckPlan?.p2_savings !== undefined && paycheckPlan?.p2_savings !== null;
  const effectiveP2Savings = isP2SavingsManual
    ? Number(paycheckPlan.p2_savings)
    : dynamicP2Savings;

  // Dynamic Sinking Targets Breakdown for UI cards and drawers:
  const sinkingTargetBreakdown = useMemo(() => {
    const items: Array<{
      id: string;
      icon: string;
      name: string;
      yearlyTarget: number;
      monthlyReserve: number;
      frequencyLabel: string;
      details?: string;
    }> = [];

    // 1. Biannual groups:
    const biannuals = annualBills.filter(b => b.frequency === 'biannual');
    const biannualGroups: Record<string, typeof biannuals> = {};
    for (const b of biannuals) {
      const baseName = (b.name || '').replace(/\s*\([^)]*\)\s*$/g, '').trim() || 'Biannual Expense';
      if (!biannualGroups[baseName]) biannualGroups[baseName] = [];
      biannualGroups[baseName].push(b);
    }

    for (const [baseName, group] of Object.entries(biannualGroups)) {
      const totalAmt = group.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      const yearlyTarget = group.length === 1 ? totalAmt * 2 : totalAmt;
      const monthlyReserve = Math.round((yearlyTarget / 12) * 100) / 100;
      items.push({
        id: `biannual-${baseName}`,
        icon: '🛡️',
        name: baseName,
        yearlyTarget,
        monthlyReserve,
        frequencyLabel: 'Biannual (2x/yr)',
        details: `${group.length} installment${group.length > 1 ? 's' : ''}`
      });
    }

    // 2. Annual subscriptions/bills:
    const annuals = annualBills.filter(b => (b.frequency || 'annual') === 'annual');
    if (annuals.length > 0) {
      const totalAnnual = annuals.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      const monthlyAnnual = Math.round((totalAnnual / 12) * 100) / 100;
      items.push({
        id: 'annual-subs',
        icon: '🌸',
        name: `Annual Subscriptions (${annuals.length} ${annuals.length === 1 ? 'Service' : 'Services'})`,
        yearlyTarget: totalAnnual,
        monthlyReserve: monthlyAnnual,
        frequencyLabel: 'Annual (1x/yr)',
        details: annuals.map(a => a.name).join(', ')
      });
    }

    // 3. Other frequencies:
    const others = annualBills.filter(b => b.frequency !== 'annual' && b.frequency !== 'biannual');
    for (const b of others) {
      const amt = Number(b.amount) || 0;
      const freq = (b.frequency || '').toLowerCase();
      let monthlyReserve = Math.round((amt / 12) * 100) / 100;
      let yearlyTarget = amt;
      if (freq === 'monthly') {
        monthlyReserve = amt;
        yearlyTarget = amt * 12;
      } else if (freq === 'quarterly') {
        monthlyReserve = Math.round((amt / 3) * 100) / 100;
        yearlyTarget = amt * 4;
      }
      items.push({
        id: `other-${b.id}`,
        icon: '📦',
        name: b.name,
        yearlyTarget,
        monthlyReserve,
        frequencyLabel: b.frequency || 'Recurring',
        details: b.notes || ''
      });
    }

    return items;
  }, [annualBills]);
  const p2SinkingCleared = p2SinkingTransfersTotal >= effectiveP2Savings || (p2SinkingTransfersTotal > 0);
  const dynamicP2Buffer = checkingAccount ? Number(checkingAccount.buffer || 500) : 500;
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

  // Rule 2: Enforce Zero-Sum Allocation:
  // 'Leftover Free Cash' should not be an open-ended rollover.
  // Add an allocation step at the bottom of the pay period where any remaining balance is explicitly assigned to a target.
  const p2ZeroSumBuffer = Number(paycheckPlan?.p2_zero_sum_buffer || 0);
  const p2ZeroSumSavings = Number(paycheckPlan?.p2_zero_sum_savings || 0);
  const p2ZeroSumDebt = Number(paycheckPlan?.p2_zero_sum_debt || 0);
  const p2ZeroSumTarget = paycheckPlan?.p2_zero_sum_target || 'debt_overpayment';
  const p2TotalZeroSumAllocated = Math.round((p2ZeroSumBuffer + p2ZeroSumSavings + p2ZeroSumDebt) * 100) / 100;
  // --- Live Actuals Computations ---
  const clearedP1FixedBills = p1Unplanned.clearedBillsSpent ?? paycheckPlan?.live_actuals?.p1_fixed_bills ?? p1PaidTotal;
  const clearedP2FixedBills = p2Unplanned.clearedBillsSpent ?? paycheckPlan?.live_actuals?.p2_fixed_bills ?? p2PaidTotal;

  const actualP1Savings = Math.round(
    checkingMonthTxs.filter(t => {
      const matchPeriod = (clearedP2Tx && p2TxIdx >= 0)
        ? isPeriod1Tx(t)
        : (getDayOfMonth(t.date) >= p1BillStart && getDayOfMonth(t.date) <= p1BillEnd);
      const cat = (t.category || '').toLowerCase();
      return matchPeriod && isExpenseTx(t.type) && cat.includes('saving');
    }).reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100
  ) / 100;

  // For Paycheck 2, cleared savings matches executed sinking fund transfers on or around the 15th
  const actualP2Savings = p2SinkingTransfersTotal;

  const isLiveActuals = waterfallMode === 'live_actuals';

  // --- Active Waterfall Flow Variables (Worst-Case Projection vs Live Actuals) ---
  // Paycheck 1 Active Values:
  const activeP1Rollover = effectiveP1Rollover;
  const activeP1Income = isLiveActuals 
    ? (isP1PaidPriorToMonth ? 0 : dynamicP1Income) 
    : p1EffectiveInflowMath;
  const activeP1TransfersIn = isLiveActuals ? dynamicP1TransfersIn : effectiveP1TransfersIn;
  const activeP1FixedBills = isLiveActuals ? clearedP1FixedBills : effectiveP1FixedBills;
  const activeP1Lifestyle = isLiveActuals ? actualP1Lifestyle : effectiveP1Lifestyle;
  const activeP1ExtraDebt = isLiveActuals ? actualP1ExtraDebt : effectiveP1ExtraDebt;
  const activeP1Savings = isLiveActuals ? actualP1Savings : effectiveP1Savings;
  const activeP1TransfersOut = isLiveActuals ? dynamicP1TransfersOut : effectiveP1TransfersOut;

  const activeP1TotalObligations = Math.round((
    activeP1FixedBills +
    activeP1Lifestyle +
    activeP1ExtraDebt +
    activeP1Savings +
    activeP1TransfersOut
  ) * 100) / 100;

  const activeP1RolloverNext = isLiveActuals
    ? (clearedP2Tx && preDepositCheckingBalance !== null ? preDepositCheckingBalance : Math.round((activeP1Rollover + (isP1PaidPriorToMonth ? 0 : activeP1Income) + activeP1TransfersIn - activeP1TotalObligations) * 100) / 100)
    : effectiveP1RolloverNext;

  // Paycheck 2 Active Values:
  const activeP2Rollover = isLiveActuals
    ? (clearedP2Tx && preDepositCheckingBalance !== null ? preDepositCheckingBalance : activeP1RolloverNext)
    : effectiveP2Rollover;
  const activeP2Income = isLiveActuals
    ? (clearedP2Tx ? clearedP2Income : (p2Txs.length > 0 ? Math.round(p2Txs.reduce((sum, t) => sum + Number(t.amount || 0), 0) * 100) / 100 : 0))
    : effectiveP2Income;
  const activeP2TransfersIn = isLiveActuals ? dynamicP2TransfersIn : effectiveP2TransfersIn;
  const activeP2FixedBills = isLiveActuals ? clearedP2FixedBills : effectiveP2FixedBills;
  const activeP2Lifestyle = isLiveActuals ? actualP2Lifestyle : effectiveP2Lifestyle;
  const activeP2ExtraDebt = isLiveActuals ? actualP2ExtraDebt : effectiveP2ExtraDebt;
  const activeP2Savings = isLiveActuals ? actualP2Savings : effectiveP2Savings;
  const activeP2Buffer = isLiveActuals ? 0 : effectiveP2Buffer; // Buffer remains in physical cash in Live Actuals
  const activeP2TransfersOut = isLiveActuals ? dynamicP2TransfersOut : effectiveP2TransfersOut;

  const activeP2TotalObligations = Math.round((
    activeP2FixedBills +
    activeP2Lifestyle +
    activeP2ExtraDebt +
    activeP2Savings +
    activeP2Buffer +
    activeP2TransfersOut
  ) * 100) / 100;

  const activeP2Leftover = isLiveActuals
    ? Math.round((activeP2Rollover + activeP2Income + activeP2TransfersIn - activeP2TotalObligations) * 100) / 100
    : effectiveP2Leftover;

  const p2UnallocatedLeftover = Math.round((activeP2Leftover - p2TotalZeroSumAllocated) * 100) / 100;

  const handleQuickAllocate = async (target: 'debt' | 'savings' | 'buffer' | 'split_50_50' | 'reset') => {
    let newBuffer = 0;
    let newSavings = 0;
    let newDebt = 0;
    let newTarget = 'debt_overpayment';

    const available = Math.max(0, activeP2Leftover);

    if (target === 'debt') {
      newDebt = available;
      newTarget = 'debt_overpayment';
    } else if (target === 'savings') {
      newSavings = available;
      newTarget = 'general_savings';
    } else if (target === 'buffer') {
      newBuffer = available;
      newTarget = 'checking_buffer';
    } else if (target === 'split_50_50') {
      newDebt = Math.round((available / 2) * 100) / 100;
      newSavings = Math.round((available - newDebt) * 100) / 100;
      newTarget = 'split';
    } else if (target === 'reset') {
      newBuffer = 0;
      newSavings = 0;
      newDebt = 0;
      newTarget = 'debt_overpayment';
    }

    try {
      await api.updatePaycheckPlan({
        id: paycheckPlan?.id || 1,
        p2_zero_sum_buffer: newBuffer,
        p2_zero_sum_savings: newSavings,
        p2_zero_sum_debt: newDebt,
        p2_zero_sum_target: newTarget,
      });
      await refreshData();
      showToast(target === 'reset' ? 'Zero-sum allocations cleared' : 'Zero-sum allocation applied! ✨');
    } catch {
      showToast('Error saving zero-sum allocation');
    }
  };

  // Combined Monthly Totals:
  const totalIncome = Math.round((effectiveP1Income + effectiveP2Income) * 100) / 100;
  const totalTransfersIn = Math.round((effectiveP1TransfersIn + effectiveP2TransfersIn) * 100) / 100;
  const totalTransfersOut = Math.round((effectiveP1TransfersOut + effectiveP2TransfersOut) * 100) / 100;
  const totalAssignedFixedBills = Math.round((effectiveP1FixedBills + effectiveP2FixedBills) * 100) / 100;
  const totalLifestyle = Math.round((effectiveP1Lifestyle + effectiveP2Lifestyle) * 100) / 100;
  const totalExtraDebt = Math.round((effectiveP1ExtraDebt + effectiveP2ExtraDebt) * 100) / 100;
  const totalSavings = Math.round((effectiveP1Savings + effectiveP2Savings) * 100) / 100;
  const totalBuffer = effectiveP2Buffer;
  const totalMonthlyObligations = Math.round((totalAssignedFixedBills + totalLifestyle + totalExtraDebt + totalSavings + totalBuffer + totalTransfersOut) * 100) / 100;
  const totalNetFreeCash = effectiveP2Leftover;

  // Active Monthly Totals:
  const activeTotalIncome = isLiveActuals
    ? Math.round(((isP1PaidPriorToMonth ? 0 : activeP1Income) + activeP2Income) * 100) / 100
    : totalIncome;
  const activeTotalTransfersIn = Math.round((activeP1TransfersIn + activeP2TransfersIn) * 100) / 100;
  const activeTotalTransfersOut = Math.round((activeP1TransfersOut + activeP2TransfersOut) * 100) / 100;
  const activeTotalAssignedFixedBills = Math.round((activeP1FixedBills + activeP2FixedBills) * 100) / 100;
  const activeTotalLifestyle = Math.round((activeP1Lifestyle + activeP2Lifestyle) * 100) / 100;
  const activeTotalExtraDebt = Math.round((activeP1ExtraDebt + activeP2ExtraDebt) * 100) / 100;
  const activeTotalSavings = Math.round((activeP1Savings + activeP2Savings) * 100) / 100;
  const activeTotalBuffer = activeP2Buffer;
  const activeTotalMonthlyObligations = Math.round((
    activeTotalAssignedFixedBills +
    activeTotalLifestyle +
    activeTotalExtraDebt +
    activeTotalSavings +
    activeTotalBuffer +
    activeTotalTransfersOut
  ) * 100) / 100;
  const activeTotalNetFreeCash = activeP2Leftover;

  // Running Waterfall Balances for Paycheck 1:
  const p1Step0 = activeP1Rollover;
  const p1Step1 = Math.round((p1Step0 + (isP1PaidPriorToMonth ? 0 : activeP1Income)) * 100) / 100;
  const p1StepTransferIn = Math.round((p1Step1 + activeP1TransfersIn) * 100) / 100;
  const p1Step2 = Math.round((p1StepTransferIn - activeP1FixedBills) * 100) / 100;
  const p1Step3 = Math.round((p1Step2 - activeP1Lifestyle) * 100) / 100;
  const p1Step4 = Math.round((p1Step3 - activeP1ExtraDebt) * 100) / 100;
  const p1Step5 = Math.round((p1Step4 - activeP1Savings) * 100) / 100;
  const p1StepTransferOut = Math.round((p1Step5 - activeP1TransfersOut) * 100) / 100;

  // Running Waterfall Balances for Paycheck 2 (Cascaded underneath Paycheck 1):
  const p2Step0 = activeP2Rollover;
  const p2Step1 = Math.round((p2Step0 + activeP2Income) * 100) / 100;
  const p2StepTransferIn = Math.round((p2Step1 + activeP2TransfersIn) * 100) / 100;
  const p2Step2 = Math.round((p2StepTransferIn - activeP2FixedBills) * 100) / 100;
  const p2Step3 = Math.round((p2Step2 - activeP2Lifestyle) * 100) / 100;
  const p2Step4 = Math.round((p2Step3 - activeP2ExtraDebt) * 100) / 100;
  const p2Step5 = Math.round((p2Step4 - activeP2Savings) * 100) / 100;
  const p2Step6 = Math.round((p2Step5 - activeP2Buffer) * 100) / 100;
  const p2StepTransferOut = Math.round((p2Step6 - activeP2TransfersOut) * 100) / 100;

  const [form, setForm] = useState<any>({
    id: paycheckPlan?.id || 1,
    month: `${selectedMonth} ${selectedYear}`,
    p1_period: effectiveP1Period,
    p1_payday_mode: p1PaydayMode,
    p1_payday_day: p1PaydayDay,
    p1_bill_start: p1BillStart,
    p1_bill_end: p1BillEnd,
    p1_rollover: effectiveP1Rollover,
    p1_income: effectiveP1Income,
    p1_transfers_in: effectiveP1TransfersIn,
    p1_fixed_bills: effectiveP1FixedBills,
    p1_lifestyle: plannedP1Lifestyle,
    p1_extra_debt: plannedP1ExtraDebt,
    p1_savings: effectiveP1Savings,
    p1_transfers_out: effectiveP1TransfersOut,
    p1_rollover_next: effectiveP1RolloverNext,
    p2_period: effectiveP2Period,
    p2_payday_mode: p2PaydayMode,
    p2_payday_day: p2PaydayDay,
    p2_bill_start: p2BillStart,
    p2_bill_end: p2BillEnd,
    p2_rollover: effectiveP2Rollover,
    p2_income: effectiveP2Income,
    p2_transfers_in: effectiveP2TransfersIn,
    p2_fixed_bills: effectiveP2FixedBills,
    p2_lifestyle: plannedP2Lifestyle,
    p2_extra_debt: plannedP2ExtraDebt,
    p2_savings: effectiveP2Savings,
    p2_checking_buffer: effectiveP2Buffer,
    p2_transfers_out: effectiveP2TransfersOut,
    p2_leftover: effectiveP2Leftover,
    p2_zero_sum_buffer: Number(paycheckPlan?.p2_zero_sum_buffer || 0),
    p2_zero_sum_savings: Number(paycheckPlan?.p2_zero_sum_savings || 0),
    p2_zero_sum_debt: Number(paycheckPlan?.p2_zero_sum_debt || 0),
    p2_zero_sum_target: paycheckPlan?.p2_zero_sum_target || 'debt_overpayment',
    is_manual: isManualMode ? 1 : 0,
    manual_fields: manualFields ? [...manualFields] : [],
  });

  const [scheduleForm, setScheduleForm] = useState({
    p1_payday_mode: p1PaydayMode,
    p1_payday_day: p1PaydayDay,
    p1_bill_start: p1BillStart,
    p1_bill_end: p1BillEnd,
    p2_payday_mode: p2PaydayMode,
    p2_payday_day: p2PaydayDay,
    p2_bill_start: p2BillStart,
    p2_bill_end: p2BillEnd,
  });

  useEffect(() => {
    if (paycheckPlan && !isEditing) {
      setForm({
        id: paycheckPlan?.id || 1,
        month: `${selectedMonth} ${selectedYear}`,
        p1_period: effectiveP1Period,
        p1_payday_mode: p1PaydayMode,
        p1_payday_day: p1PaydayDay,
        p1_bill_start: p1BillStart,
        p1_bill_end: p1BillEnd,
        p1_rollover: effectiveP1Rollover,
        p1_income: effectiveP1Income,
        p1_transfers_in: effectiveP1TransfersIn,
        p1_fixed_bills: effectiveP1FixedBills,
        p1_lifestyle: plannedP1Lifestyle,
        p1_extra_debt: plannedP1ExtraDebt,
        p1_savings: effectiveP1Savings,
        p1_transfers_out: effectiveP1TransfersOut,
        p1_rollover_next: effectiveP1RolloverNext,
        p2_period: effectiveP2Period,
        p2_payday_mode: p2PaydayMode,
        p2_payday_day: p2PaydayDay,
        p2_bill_start: p2BillStart,
        p2_bill_end: p2BillEnd,
        p2_rollover: effectiveP2Rollover,
        p2_income: effectiveP2Income,
        p2_transfers_in: effectiveP2TransfersIn,
        p2_fixed_bills: effectiveP2FixedBills,
        p2_lifestyle: plannedP2Lifestyle,
        p2_extra_debt: plannedP2ExtraDebt,
        p2_savings: effectiveP2Savings,
        p2_checking_buffer: effectiveP2Buffer,
        p2_transfers_out: effectiveP2TransfersOut,
        p2_leftover: effectiveP2Leftover,
        p2_zero_sum_buffer: Number(paycheckPlan?.p2_zero_sum_buffer || 0),
        p2_zero_sum_savings: Number(paycheckPlan?.p2_zero_sum_savings || 0),
        p2_zero_sum_debt: Number(paycheckPlan?.p2_zero_sum_debt || 0),
        p2_zero_sum_target: paycheckPlan?.p2_zero_sum_target || 'debt_overpayment',
        is_manual: isManualMode ? 1 : 0,
        manual_fields: manualFields ? [...manualFields] : [],
      });
      setScheduleForm({
        p1_payday_mode: p1PaydayMode,
        p1_payday_day: p1PaydayDay,
        p1_bill_start: p1BillStart,
        p1_bill_end: p1BillEnd,
        p2_payday_mode: p2PaydayMode,
        p2_payday_day: p2PaydayDay,
        p2_bill_start: p2BillStart,
        p2_bill_end: p2BillEnd,
      });
    }
  }, [paycheckPlan, annualBills, selectedMonth, selectedYear, isEditing]);

  const previewP1Bills = bills.filter(b => isBillInPaycheck1(b, Number(scheduleForm.p1_bill_start || 1), Number(scheduleForm.p1_bill_end || 15)));
  const previewP2Bills = bills.filter(b => !isBillInPaycheck1(b, Number(scheduleForm.p1_bill_start || 1), Number(scheduleForm.p1_bill_end || 15)));
  const previewP1Total = Math.round(previewP1Bills.reduce((s, b) => s + (Number(b.amount) || 0), 0) * 100) / 100;
  const previewP2Total = Math.round(previewP2Bills.reduce((s, b) => s + (Number(b.amount) || 0), 0) * 100) / 100;

  const handleOpenScheduleModal = () => {
    setScheduleForm({
      p1_payday_mode: paycheckPlan?.p1_payday_mode || 'prev_month_last_day',
      p1_payday_day: Number(paycheckPlan?.p1_payday_day ?? 0),
      p1_bill_start: Number(paycheckPlan?.p1_bill_start ?? 1),
      p1_bill_end: Number(paycheckPlan?.p1_bill_end ?? 15),
      p2_payday_mode: paycheckPlan?.p2_payday_mode || 'day_of_month',
      p2_payday_day: Number(paycheckPlan?.p2_payday_day ?? 15),
      p2_bill_start: Number(paycheckPlan?.p2_bill_start ?? 16),
      p2_bill_end: Number(paycheckPlan?.p2_bill_end ?? 31),
    });
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const p1S = Number(scheduleForm.p1_bill_start) || 1;
      const p1E = Number(scheduleForm.p1_bill_end) || 15;
      const p2S = Number(scheduleForm.p2_bill_start) || 16;
      const p2E = Number(scheduleForm.p2_bill_end) || 31;

      const newP1Period = `${p1S}${getOrdinalSuffix(p1S).slice(-2)} - ${p1E}${getOrdinalSuffix(p1E).slice(-2)}`;
      const newP2Period = `${p2S}${getOrdinalSuffix(p2S).slice(-2)} - ${p2E}${getOrdinalSuffix(p2E).slice(-2)}`;

      await api.updatePaycheckPlan({
        ...paycheckPlan,
        month: `${selectedMonth} ${selectedYear}`,
        p1_period: newP1Period,
        p2_period: newP2Period,
        p1_payday_mode: scheduleForm.p1_payday_mode,
        p1_payday_day: Number(scheduleForm.p1_payday_day || 0),
        p1_bill_start: p1S,
        p1_bill_end: p1E,
        p2_payday_mode: scheduleForm.p2_payday_mode,
        p2_payday_day: Number(scheduleForm.p2_payday_day || 15),
        p2_bill_start: p2S,
        p2_bill_end: p2E,
      });
      await refreshData(selectedMonth, selectedYear);
      setShowScheduleModal(false);
      showToast('🌸 Paycheck schedule & coverage periods updated!');
    } catch (err: any) {
      showToast(`Error updating schedule: ${err.message}`);
    }
  };

  const handleResetScheduleDefaults = () => {
    setScheduleForm({
      p1_payday_mode: 'prev_month_last_day',
      p1_payday_day: 0,
      p1_bill_start: 1,
      p1_bill_end: 15,
      p2_payday_mode: 'day_of_month',
      p2_payday_day: 15,
      p2_bill_start: 16,
      p2_bill_end: 31,
    });
  };

  if (!paycheckPlan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 bg-white/80 backdrop-blur-sm rounded-3xl border border-[#ebd0d9] shadow-kawaii p-8 text-center animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#7d3c4c] to-[#9f5264] flex items-center justify-center shadow-lg shadow-rose-900/15 animate-bounce">
          <SakuraIcon className="w-9 h-9" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-extrabold text-[#7d3c4c] font-cute">Loading Paycheck Waterfall...</h3>
          <p className="text-xs text-[#64748b]">Fetching coverage periods, checking flows &amp; bills for {selectedMonth} {selectedYear}...</p>
        </div>
        <button
          onClick={() => refreshData(selectedMonth, selectedYear)}
          className="text-xs font-bold text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#faebef] border border-[#ebd0d9] px-4 py-2 rounded-2xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
        >
          <span>🔄</span> Refresh Plan
        </button>
      </div>
    );
  }

  const handleReassignBill = async (bill: any, targetCheck: '1st Paycheck' | '2nd Paycheck') => {
    try {
      await api.updateBill(bill.id, {
        paycheck_assignment: targetCheck,
        assigned_check: targetCheck,
      });
      await refreshData();
      showToast(`Assigned "${bill.name}" to ${targetCheck === '1st Paycheck' ? 'Check 1' : 'Check 2'} 🌸`);
    } catch (err) {
      showToast('Failed to update bill assignment');
    }
  };

  const handleStartEdit = () => {
    setForm({
      id: paycheckPlan?.id || 1,
      month: `${selectedMonth} ${selectedYear}`,
      p1_period: effectiveP1Period,
      p1_payday_mode: paycheckPlan.p1_payday_mode || 'prev_month_last_day',
      p1_payday_day: Number(paycheckPlan.p1_payday_day ?? 0),
      p1_bill_start: Number(paycheckPlan.p1_bill_start ?? 1),
      p1_bill_end: Number(paycheckPlan.p1_bill_end ?? 15),
      p1_rollover: effectiveP1Rollover,
      p1_income: effectiveP1Income,
      p1_transfers_in: effectiveP1TransfersIn,
      p1_fixed_bills: effectiveP1FixedBills,
      p1_lifestyle: plannedP1Lifestyle,
      p1_extra_debt: plannedP1ExtraDebt,
      p1_savings: effectiveP1Savings,
      p1_transfers_out: effectiveP1TransfersOut,
      p1_rollover_next: effectiveP1RolloverNext,
      p2_period: effectiveP2Period,
      p2_payday_mode: paycheckPlan.p2_payday_mode || 'day_of_month',
      p2_payday_day: Number(paycheckPlan.p2_payday_day ?? 15),
      p2_bill_start: Number(paycheckPlan.p2_bill_start ?? 16),
      p2_bill_end: Number(paycheckPlan.p2_bill_end ?? 31),
      p2_rollover: effectiveP2Rollover,
      p2_income: effectiveP2Income,
      p2_transfers_in: effectiveP2TransfersIn,
      p2_fixed_bills: effectiveP2FixedBills,
      p2_lifestyle: plannedP2Lifestyle,
      p2_extra_debt: plannedP2ExtraDebt,
      p2_savings: effectiveP2Savings,
      p2_checking_buffer: effectiveP2Buffer,
      p2_transfers_out: effectiveP2TransfersOut,
      p2_leftover: effectiveP2Leftover,
      p2_zero_sum_buffer: Number(paycheckPlan.p2_zero_sum_buffer || 0),
      p2_zero_sum_savings: Number(paycheckPlan.p2_zero_sum_savings || 0),
      p2_zero_sum_debt: Number(paycheckPlan.p2_zero_sum_debt || 0),
      p2_zero_sum_target: paycheckPlan.p2_zero_sum_target || 'debt_overpayment',
      is_manual: paycheckPlan.is_manual ? 1 : 0,
      manual_fields: paycheckPlan.manual_fields ? [...paycheckPlan.manual_fields] : [],
    });
    setIsEditing(true);
  };

  const markFieldManual = (fieldName: string, value: any) => {
    const fields = new Set(form.manual_fields || []);
    fields.add(fieldName);
    setForm({
      ...form,
      [fieldName]: value,
      manual_fields: Array.from(fields),
    });
  };

  const syncFieldDynamic = (fieldName: string, dynamicVal: any) => {
    const fields = new Set(form.manual_fields || []);
    fields.delete(fieldName);
    setForm({
      ...form,
      [fieldName]: dynamicVal,
      manual_fields: Array.from(fields),
    });
  };

  const autoCalculateForm = () => {
    const p1InflowMath = isP1PaidPriorToMonth ? 0 : (Number(form.p1_income) || 0);
    const p1TransfersInMath = Number(form.p1_transfers_in) || 0;
    const p1TransfersOutMath = Number(form.p1_transfers_out) || 0;
    const p1LifeDeduction = Math.max(Number(form.p1_lifestyle) || 0, actualP1Lifestyle);
    const p1ExtraDebtDeduction = Math.max(Number(form.p1_extra_debt) || 0, actualP1ExtraDebt);
    const p1Obligations = Math.round(((Number(form.p1_fixed_bills) || 0) + p1LifeDeduction + p1ExtraDebtDeduction + (Number(form.p1_savings) || 0) + p1TransfersOutMath) * 100) / 100;
    const p1Next = Math.round(((Number(form.p1_rollover) || 0) + p1InflowMath + p1TransfersInMath - p1Obligations) * 100) / 100;
    const p2Start = p1Next;
    const p2TransfersInMath = Number(form.p2_transfers_in) || 0;
    const p2TransfersOutMath = Number(form.p2_transfers_out) || 0;
    const p2LifeDeduction = Math.max(Number(form.p2_lifestyle) || 0, actualP2Lifestyle);
    const p2ExtraDebtDeduction = Math.max(Number(form.p2_extra_debt) || 0, actualP2ExtraDebt);
    const p2Obligations = Math.round(((Number(form.p2_fixed_bills) || 0) + p2LifeDeduction + p2ExtraDebtDeduction + (Number(form.p2_savings) || 0) + (Number(form.p2_checking_buffer) || 0) + p2TransfersOutMath) * 100) / 100;
    const p2End = Math.round((p2Start + (Number(form.p2_income) || 0) + p2TransfersInMath - p2Obligations) * 100) / 100;

    setForm({
      ...form,
      p1_rollover_next: p1Next,
      p2_rollover: p2Start,
      p2_leftover: p2End,
    });
    showToast('Waterfall math auto-calculated! ✨');
  };

  const syncAllDynamic = () => {
    setForm({
      ...form,
      p1_rollover: dynamicP1Rollover,
      p1_income: dynamicP1Income,
      p1_transfers_in: dynamicP1TransfersIn,
      p1_fixed_bills: dynamicP1FixedBills,
      p1_lifestyle: plannedP1Lifestyle,
      p1_extra_debt: dynExtraDebtPerPaycheck,
      p1_savings: dynamicP1Savings,
      p1_transfers_out: dynamicP1TransfersOut,
      p2_income: dynamicP2Income,
      p2_transfers_in: dynamicP2TransfersIn,
      p2_fixed_bills: dynamicP2FixedBills,
      p2_lifestyle: plannedP2Lifestyle,
      p2_extra_debt: dynExtraDebtPerPaycheck,
      p2_checking_buffer: dynamicP2Buffer,
      p2_transfers_out: dynamicP2TransfersOut,
      p2_zero_sum_buffer: 0,
      p2_zero_sum_savings: 0,
      p2_zero_sum_debt: 0,
      p2_zero_sum_target: 'debt_overpayment',
      manual_fields: [],
      is_manual: 0,
    });
    showToast('Reset all fields to live dynamic sync 🔄');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updatePaycheckPlan(form);
      setIsEditing(false);
      await refreshData();
      showToast('Paycheck waterfall plan saved! 🌸');
    } catch {
      showToast('Error saving plan');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Title & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
            <span>🎀</span> Paycheck Waterfall &amp; Allocation Log
          </h2>
          <p className="text-xs text-rose-400 font-medium mt-1">
            Active for <span className="font-bold text-[#7d3c4c]">{selectedMonth} {selectedYear}</span> • Total obligations per check, remainders &amp; totals in one log
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Active Month Dropdown */}
          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-2xl border border-[#ebd0d9] shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-[#7d3c4c]" />
            <span className="text-[11px] font-bold text-[#52212e] font-cute">Month:</span>
            <select
              value={`${selectedMonth}-${selectedYear}`}
              onChange={(e) => {
                const [m, y] = e.target.value.split('-');
                setSelectedMonth(m);
                setSelectedYear(parseInt(y, 10));
              }}
              className="text-xs font-extrabold font-cute text-[#7d3c4c] bg-transparent outline-none cursor-pointer"
            >
              {[
                { code: 'Jan', name: `Jan ${selectedYear}` },
                { code: 'Feb', name: `Feb ${selectedYear}` },
                { code: 'Mar', name: `Mar ${selectedYear}` },
                { code: 'Apr', name: `Apr ${selectedYear}` },
                { code: 'May', name: `May ${selectedYear}` },
                { code: 'Jun', name: `Jun ${selectedYear}` },
                { code: 'Jul', name: `Jul ${selectedYear}` },
                { code: 'Aug', name: `Aug ${selectedYear}` },
                { code: 'Sep', name: `Sep ${selectedYear}` },
                { code: 'Oct', name: `Oct ${selectedYear}` },
                { code: 'Nov', name: `Nov ${selectedYear}` },
                { code: 'Dec', name: `Dec ${selectedYear}` },
              ].map((item) => (
                <option key={item.code} value={`${item.code}-${selectedYear}`}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          {/* Three-State View Toggle: [ Worst-Case | Live Actuals | Monthly Reconciliation ] */}
          <div className="inline-flex p-1 bg-white rounded-2xl border border-[#ebd0d9] shadow-2xs">
            <button
              type="button"
              onClick={() => setWaterfallMode('worst_case')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                waterfallMode === 'worst_case'
                  ? 'bg-rose-100/80 text-[#7d3c4c] shadow-2xs border border-rose-200 font-extrabold'
                  : 'text-[#8c6b73] hover:text-[#52212e]'
              }`}
              title="Worst-Case Projection: Full planned obligations deducted to show guaranteed floor"
            >
              Worst-Case
            </button>
            <button
              type="button"
              onClick={() => setWaterfallMode('live_actuals')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                waterfallMode === 'live_actuals'
                  ? 'bg-emerald-600 text-white shadow-2xs font-extrabold'
                  : 'text-[#8c6b73] hover:text-[#52212e]'
              }`}
              title="Live Actuals: Cleared checking transactions, executed transfers & physical cash"
            >
              Live Actuals
            </button>
            <button
              type="button"
              onClick={() => setWaterfallMode('reconciliation')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                waterfallMode === 'reconciliation'
                  ? 'bg-[#7d3c4c] text-white shadow-2xs font-extrabold'
                  : 'text-[#8c6b73] hover:text-[#52212e]'
              }`}
              title="Monthly Reconciliation & Zero-Sum Cash Allocation"
            >
              Monthly Reconciliation
            </button>
          </div>

          {/* Mode Indicator Badge (shown only when manual overrides are active) */}
          {(isManualMode || manualFields.length > 0) && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs font-bold shadow-2xs" title="Custom manual values active on this paycheck waterfall">
              <Edit3 className="w-3 h-3 text-amber-700" />
              <span>{isManualMode ? 'Full Manual Mode' : `${manualFields.length} Manual Override${manualFields.length !== 1 ? 's' : ''}`}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleOpenScheduleModal}
            className="px-3.5 py-1.5 rounded-2xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer border bg-white hover:bg-[#faedf1] border-[#ebd0d9] text-[#7d3c4c]"
            title="Configure when paydays occur and what bill periods they cover"
          >
            <Calendar className="w-3.5 h-3.5 text-[#7d3c4c]" />
            <span>⚙️ Payday Schedule &amp; Periods</span>
          </button>

          <button
            onClick={() => {
              if (isEditing) {
                setIsEditing(false);
              } else {
                handleStartEdit();
              }
            }}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer border ${
              isEditing
                ? 'bg-rose-100 text-rose-800 border-rose-300'
                : 'bg-white hover:bg-[#faedf1] border-[#ebd0d9] text-[#7d3c4c]'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>{isEditing ? 'Close Editor' : '✏️ Edit Waterfall Values'}</span>
          </button>
        </div>
      </div>

      {/* Top Metric Cards: Summary Totals At a Glance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Inflow */}
        <div className="bg-white rounded-3xl p-4 border border-[#e4e0e2] shadow-kawaii">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#52212e]">Total Monthly Inflow</span>
            <span className="text-xs">💵</span>
          </div>
          <div className="font-mono font-extrabold text-xl text-emerald-600 mt-2">
            +{formatCurrency(activeTotalIncome)}
          </div>
          <div className="text-[10px] text-[#8c6b73] font-medium mt-1 flex items-center gap-1">
            <span>P1: {formatCurrency(isP1PaidPriorToMonth ? 0 : activeP1Income)}</span>
            <span>•</span>
            <span>P2: {formatCurrency(activeP2Income)}</span>
          </div>
        </div>

        {/* Total Obligations */}
        <div className="bg-white rounded-3xl p-4 border border-[#e4e0e2] shadow-kawaii">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#52212e]">Total Obligations</span>
            <span className="text-xs">📋</span>
          </div>
          <div className="font-mono font-extrabold text-xl text-rose-600 mt-2">
            -{formatCurrency(activeTotalMonthlyObligations)}
          </div>
          <div className="text-[10px] text-[#8c6b73] font-medium mt-1">
            Bills: {formatCurrency(activeTotalAssignedFixedBills)} • Life/Extra/Sav: {formatCurrency(activeTotalLifestyle + activeTotalExtraDebt + activeTotalSavings)}
          </div>
        </div>

        {/* Net Leftover Free Cash */}
        <div className="bg-white rounded-3xl p-4 border border-[#e4e0e2] shadow-kawaii">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#52212e]">{isLiveActuals ? 'Live Free Cash (Checking)' : 'Leftover Free Cash'}</span>
            <span className="text-xs">{isLiveActuals ? '🏦' : '✨'}</span>
          </div>
          <div className={`font-mono font-extrabold text-xl mt-2 ${activeTotalNetFreeCash >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {formatCurrency(activeTotalNetFreeCash)}
          </div>
          <div className="text-[10px] text-[#8c6b73] font-medium mt-1">
            {isLiveActuals ? 'Live Physical Checking Balance' : 'True Guaranteed Cash Floor'}
          </div>
        </div>

        {/* Paid Progress */}
        <div className="bg-white rounded-3xl p-4 border border-[#e4e0e2] shadow-kawaii">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#52212e]">Bills Status ({selectedMonth})</span>
            <span className="text-[10px] font-bold text-[#7d3c4c] bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              {totalPaidCount}/{totalBillsCount} Paid
            </span>
          </div>
          <div className="font-mono font-extrabold text-lg text-[#1f242e] mt-2">
            {formatCurrency(totalPaidBills)} <span className="text-xs text-[#8c6b73] font-sans font-medium">paid</span>
          </div>
          <div className="text-[10px] text-rose-600 font-medium mt-1">
            {formatCurrency(totalUnpaidBills)} remaining unpaid
          </div>
        </div>
      </div>

      {/* Payday Schedule & Coverage Periods Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-[#ebd0d9] shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#ebd0d9]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#fdf2f4] flex items-center justify-center text-xl border border-[#f8ccd6] shadow-2xs shrink-0">
                  🗓️
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
                    Paycheck Schedule &amp; Coverage Settings
                  </h3>
                  <p className="text-xs text-[#8c6b73]">
                    Configure when each paycheck arrives and what bill due-date periods they fund ({selectedMonth} {selectedYear})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="p-2 text-[#8c6b73] hover:text-[#7d3c4c] hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explanatory Info Card */}
            <div className="p-4 bg-gradient-to-r from-rose-50/70 via-purple-50/50 to-pink-50/70 rounded-2xl border border-rose-100/80 text-xs text-[#52212e] space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-[#7d3c4c]">
                <Sparkles className="w-4 h-4 text-rose-500" />
                <span>How Payday Tracking Works:</span>
              </div>
              <p className="leading-relaxed">
                <SakuraIcon className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" /> <strong>Paycheck 1</strong> arrives on the <strong>last day of the previous month</strong> (e.g. {prevMonth} {lastDayOfPrevMonth} for {selectedMonth}) to fund bills due from the <strong>1st to the 15th</strong>.<br />
                💜 <strong>Paycheck 2</strong> arrives on the <strong>15th of the active month</strong> to fund bills due from the <strong>16th to the end of the month</strong>.
              </p>
            </div>

            {/* Schedule Form */}
            <form onSubmit={handleSaveSchedule} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Paycheck 1 Configuration Card */}
                <div className="p-5 bg-[#fdf6f8]/70 rounded-2xl border border-[#ebd0d9] space-y-4">
                  <div className="flex items-center justify-between border-b border-rose-100 pb-2.5">
                    <h4 className="font-extrabold text-[#7d3c4c] text-sm font-cute flex items-center gap-2">
                      <SakuraIcon className="w-4 h-4 shrink-0" /> Paycheck 1 Timing &amp; Coverage
                    </h4>
                    <span className="text-[10px] font-bold text-rose-600 bg-white px-2 py-0.5 rounded-full border border-rose-200">
                      Early Month Bills
                    </span>
                  </div>

                  {/* Payday Mode */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#52212e] block">When Payday 1 Arrives:</label>
                    <div className="space-y-1.5">
                      <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-[#ebd0d9] cursor-pointer hover:bg-rose-50/40 transition-colors">
                        <input
                          type="radio"
                          name="p1_payday_mode"
                          checked={scheduleForm.p1_payday_mode === 'prev_month_last_day'}
                          onChange={() => setScheduleForm({ ...scheduleForm, p1_payday_mode: 'prev_month_last_day' })}
                          className="mt-0.5 text-rose-600 focus:ring-rose-400"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-[#1f242e] block">Last Day of Prev Month (Default)</span>
                          <span className="text-[11px] text-[#8c6b73]">
                            Paid {prevMonth} {lastDayOfPrevMonth} ({prevMonthLastDayStr}) to fund {selectedMonth}
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-[#ebd0d9] cursor-pointer hover:bg-rose-50/40 transition-colors">
                        <input
                          type="radio"
                          name="p1_payday_mode"
                          checked={scheduleForm.p1_payday_mode === 'day_of_month'}
                          onChange={() => setScheduleForm({ ...scheduleForm, p1_payday_mode: 'day_of_month', p1_payday_day: scheduleForm.p1_payday_day || 1 })}
                          className="mt-0.5 text-rose-600 focus:ring-rose-400"
                        />
                        <div className="text-xs flex-1">
                          <span className="font-bold text-[#1f242e] block">Specific Day of Month</span>
                          {scheduleForm.p1_payday_mode === 'day_of_month' && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[11px] text-[#52212e]">Arrives on Day:</span>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={scheduleForm.p1_payday_day || 1}
                                onChange={e => setScheduleForm({ ...scheduleForm, p1_payday_day: parseInt(e.target.value, 10) || 1 })}
                                className="w-16 px-2 py-1 bg-[#fdf6f8] border border-[#ebd0d9] rounded-lg text-xs font-mono font-bold text-center"
                              />
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Bill Due Dates Window */}
                  <div className="space-y-1.5 pt-2 border-t border-rose-100">
                    <label className="text-xs font-bold text-[#52212e] block">Bill Due Dates Covered:</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8c6b73]">From Day</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={scheduleForm.p1_bill_start}
                        onChange={e => setScheduleForm({ ...scheduleForm, p1_bill_start: parseInt(e.target.value, 10) || 1 })}
                        className="w-16 px-2.5 py-1 bg-white border border-[#ebd0d9] rounded-xl text-xs font-mono font-bold text-center"
                      />
                      <span className="text-xs text-[#8c6b73]">to Day</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={scheduleForm.p1_bill_end}
                        onChange={e => setScheduleForm({ ...scheduleForm, p1_bill_end: parseInt(e.target.value, 10) || 15 })}
                        className="w-16 px-2.5 py-1 bg-white border border-[#ebd0d9] rounded-xl text-xs font-mono font-bold text-center"
                      />
                    </div>
                  </div>

                  {/* Live Preview Indicator */}
                  <div className="p-2.5 bg-white rounded-xl border border-rose-100 text-[11px] space-y-1 text-[#52212e]">
                    <div className="font-bold flex items-center justify-between">
                      <span>Assigned Bills Preview:</span>
                      <span className="font-mono text-rose-600">{formatCurrency(previewP1Total)}</span>
                    </div>
                    <div className="text-[10px] text-[#8c6b73]">
                      Covers {previewP1Bills.length} bills due between {scheduleForm.p1_bill_start}{getOrdinalSuffix(scheduleForm.p1_bill_start).slice(-2)} and {scheduleForm.p1_bill_end}{getOrdinalSuffix(scheduleForm.p1_bill_end).slice(-2)}
                    </div>
                  </div>
                </div>

                {/* Paycheck 2 Configuration Card */}
                <div className="p-5 bg-purple-50/40 rounded-2xl border border-purple-200/80 space-y-4">
                  <div className="flex items-center justify-between border-b border-purple-100 pb-2.5">
                    <h4 className="font-extrabold text-purple-900 text-sm font-cute flex items-center gap-2">
                      <span>💜</span> Paycheck 2 Timing &amp; Coverage
                    </h4>
                    <span className="text-[10px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded-full border border-purple-200">
                      Mid-to-End Month
                    </span>
                  </div>

                  {/* Payday Mode */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#52212e] block">When Payday 2 Arrives:</label>
                    <div className="space-y-1.5">
                      <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-purple-200 cursor-pointer hover:bg-purple-50/40 transition-colors">
                        <input
                          type="radio"
                          name="p2_payday_mode"
                          checked={scheduleForm.p2_payday_day === 15}
                          onChange={() => setScheduleForm({ ...scheduleForm, p2_payday_mode: 'day_of_month', p2_payday_day: 15 })}
                          className="mt-0.5 text-purple-600 focus:ring-purple-400"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-[#1f242e] block">15th of the Month (Default)</span>
                          <span className="text-[11px] text-[#8c6b73]">
                            Paid on {selectedMonth} 15th to fund bills 16th to end of month
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-purple-200 cursor-pointer hover:bg-purple-50/40 transition-colors">
                        <input
                          type="radio"
                          name="p2_payday_mode"
                          checked={scheduleForm.p2_payday_day !== 15}
                          onChange={() => setScheduleForm({ ...scheduleForm, p2_payday_mode: 'day_of_month', p2_payday_day: scheduleForm.p2_payday_day !== 15 ? scheduleForm.p2_payday_day : 16 })}
                          className="mt-0.5 text-purple-600 focus:ring-purple-400"
                        />
                        <div className="text-xs flex-1">
                          <span className="font-bold text-[#1f242e] block">Custom Day of Month</span>
                          {scheduleForm.p2_payday_day !== 15 && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[11px] text-[#52212e]">Arrives on Day:</span>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={scheduleForm.p2_payday_day || 16}
                                onChange={e => setScheduleForm({ ...scheduleForm, p2_payday_day: parseInt(e.target.value, 10) || 16 })}
                                className="w-16 px-2 py-1 bg-purple-50 border border-purple-200 rounded-lg text-xs font-mono font-bold text-center"
                              />
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Bill Due Dates Window */}
                  <div className="space-y-1.5 pt-2 border-t border-purple-100">
                    <label className="text-xs font-bold text-[#52212e] block">Bill Due Dates Covered:</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8c6b73]">From Day</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={scheduleForm.p2_bill_start}
                        onChange={e => setScheduleForm({ ...scheduleForm, p2_bill_start: parseInt(e.target.value, 10) || 16 })}
                        className="w-16 px-2.5 py-1 bg-white border border-purple-200 rounded-xl text-xs font-mono font-bold text-center"
                      />
                      <span className="text-xs text-[#8c6b73]">to Day</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={scheduleForm.p2_bill_end}
                        onChange={e => setScheduleForm({ ...scheduleForm, p2_bill_end: parseInt(e.target.value, 10) || 31 })}
                        className="w-16 px-2.5 py-1 bg-white border border-purple-200 rounded-xl text-xs font-mono font-bold text-center"
                      />
                    </div>
                  </div>

                  {/* Live Preview Indicator */}
                  <div className="p-2.5 bg-white rounded-xl border border-purple-100 text-[11px] space-y-1 text-[#52212e]">
                    <div className="font-bold flex items-center justify-between">
                      <span>Assigned Bills Preview:</span>
                      <span className="font-mono text-purple-700">{formatCurrency(previewP2Total)}</span>
                    </div>
                    <div className="text-[10px] text-[#8c6b73]">
                      Covers {previewP2Bills.length} bills due between {scheduleForm.p2_bill_start}{getOrdinalSuffix(scheduleForm.p2_bill_start).slice(-2)} and {scheduleForm.p2_bill_end}{getOrdinalSuffix(scheduleForm.p2_bill_end).slice(-2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#ebd0d9]">
                <button
                  type="button"
                  onClick={handleResetScheduleDefaults}
                  className="px-3.5 py-2 text-xs font-bold text-[#7d3c4c] hover:bg-rose-50 border border-[#ebd0d9] rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Reset to default schedule (Last day of prev month + 15th)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Standard Defaults</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 text-xs font-bold text-[#8c6b73] hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-[#7d3c4c] hover:bg-[#6a313f] rounded-xl shadow-md shadow-rose-900/15 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Schedule Settings</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Allocations Mode */}
      {isEditing && (
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 border-2 border-[#ebd0d9] shadow-kawaii space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#ebd0d9]">
            <div>
              <h3 className="text-lg font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
                <span>✏️</span> Edit Paycheck Waterfall Values ({selectedMonth} {selectedYear})
              </h3>
              <p className="text-xs text-[#8c6b73] mt-0.5">
                Manually edit any balance, income, obligation, period label, or savings reserve. Custom inputs are preserved as overrides.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={autoCalculateForm}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Auto-calculate downstream balances and leftover cash from current values"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Calculate Math</span>
              </button>
              <button
                type="button"
                onClick={syncAllDynamic}
                className="px-3 py-1.5 bg-[#fdf6f8] hover:bg-[#faedf1] text-[#7d3c4c] border border-[#ebd0d9] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Reset all numbers to live ledger and budget card values"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All to Live Dynamic Sync</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Paycheck 1 */}
            <div className="p-5 bg-[#fdf6f8]/50 rounded-2xl border border-[#ebd0d9] space-y-4">
              <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                <h4 className="font-extrabold text-[#1f242e] text-sm font-cute flex items-center gap-2">
                  <SakuraIcon className="w-4 h-4 shrink-0" /> Paycheck 1 Settings
                </h4>
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-[#52212e]">Period Label:</label>
                  <input
                    type="text"
                    value={form.p1_period}
                    onChange={e => setForm({ ...form, p1_period: e.target.value })}
                    className="w-28 px-2 py-0.5 border border-[#ebd0d9] rounded-lg text-xs font-cute bg-white text-center"
                    placeholder="1st - 15th"
                  />
                </div>
              </div>

              {/* P1: Payday Timing & Coverage */}
              <div className="p-3 bg-white rounded-xl border border-[#ebd0d9] space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-[#52212e] text-[11px]">Payday 1 Arrival:</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={form.p1_payday_mode}
                      onChange={e => setForm({ ...form, p1_payday_mode: e.target.value })}
                      className="px-2 py-0.5 border border-[#ebd0d9] rounded-lg text-xs bg-[#fdf6f8] font-cute"
                    >
                      <option value="prev_month_last_day">Last Day of Prev Month ({prevMonthLastDayStr})</option>
                      <option value="day_of_month">Specific Day of Month</option>
                    </select>
                    {form.p1_payday_mode === 'day_of_month' && (
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={form.p1_payday_day || 1}
                        onChange={e => setForm({ ...form, p1_payday_day: parseInt(e.target.value, 10) || 1 })}
                        className="w-12 px-1.5 py-0.5 border border-[#ebd0d9] rounded text-xs font-mono text-center font-bold"
                        title="Day of Month"
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-rose-50 flex-wrap">
                  <span className="font-bold text-[#52212e] text-[11px]">Covers Bills Due:</span>
                  <div className="flex items-center gap-1.5 font-cute text-xs">
                    <span className="text-[#8c6b73]">Day</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={form.p1_bill_start}
                      onChange={e => setForm({ ...form, p1_bill_start: parseInt(e.target.value, 10) || 1 })}
                      className="w-12 px-1.5 py-0.5 border border-[#ebd0d9] rounded text-xs font-mono text-center font-bold"
                    />
                    <span className="text-[#8c6b73]">to Day</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={form.p1_bill_end}
                      onChange={e => setForm({ ...form, p1_bill_end: parseInt(e.target.value, 10) || 15 })}
                      className="w-12 px-1.5 py-0.5 border border-[#ebd0d9] rounded text-xs font-mono text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* P1: Starting Rollover */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Starting Rollover Balance</label>
                    {(form.manual_fields || []).includes('p1_rollover') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Live Ledger</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p1_rollover', dynamicP1Rollover)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Ledger ({formatCurrency(dynamicP1Rollover)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p1_rollover}
                  onChange={e => markFieldManual('p1_rollover', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-rose-400"
                />
              </div>

              {/* P1: Inflow */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Paycheck 1 Inflow (Income)</label>
                    {(form.manual_fields || []).includes('p1_income') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Checking</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p1_income', dynamicP1Income)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Checking ({formatCurrency(dynamicP1Income)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p1_income}
                  onChange={e => markFieldManual('p1_income', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-rose-400"
                />
                {isP1PaidPriorToMonth && (
                  <p className="text-[10px] text-rose-600 font-medium mt-1 flex items-center gap-1">
                    <SakuraIcon className="w-3 h-3 shrink-0" /> Paid {scheduledP1PayDate}: Inflow is already included in Starting Rollover ($0.00 waterfall addition)
                  </p>
                )}
              </div>

              {/* P1: Transfer In (Cash Infusion) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Transfer In (Cash Infusion)</label>
                    {(form.manual_fields || []).includes('p1_transfers_in') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Checking Transfers</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p1_transfers_in', dynamicP1TransfersIn)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Transfers ({formatCurrency(dynamicP1TransfersIn)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p1_transfers_in}
                  onChange={e => markFieldManual('p1_transfers_in', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-rose-400"
                />
              </div>

              {/* P1: Fixed Bills */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Fixed Bills Assigned</label>
                    {(form.manual_fields || []).includes('p1_fixed_bills') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Card</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p1_fixed_bills', dynamicP1FixedBills)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Card ({formatCurrency(dynamicP1FixedBills)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p1_fixed_bills}
                  onChange={e => markFieldManual('p1_fixed_bills', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-rose-400"
                />
              </div>

              {/* P1: Lifestyle Budget (Umbrella Group: Groceries, Gas, Entertainment, Takeout, Chicken Feed) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label className="text-xs font-bold text-[#52212e]">Lifestyle Budget Assigned</label>
                    {(form.manual_fields || []).includes('p1_lifestyle') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-[#7d3c4c] bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">☂️ 5 Categories</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => syncFieldDynamic('p1_lifestyle', dynUmbrellaPerPaycheck)}
                      className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Sync Umbrella ({formatCurrency(dynUmbrellaPerPaycheck)})</span>
                    </button>
                    <span className="text-[10px] text-[#8c6b73]">
                      Live Spent: {formatCurrency(actualP1Lifestyle)}
                    </span>
                  </div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p1_lifestyle}
                  onChange={e => markFieldManual('p1_lifestyle', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-rose-400"
                />
                <div className="mt-1 text-[10px] text-[#8c6b73] flex items-center gap-1.5 flex-wrap">
                  <span>Pools:</span>
                  {umbrellaCategoryDetails.map(c => (
                    <span key={c.name} className="bg-rose-50/80 px-1.5 py-0.2 rounded border border-rose-100 text-[#52212e]">
                      {c.icon} {c.name} (${c.perCheckBudget})
                    </span>
                  ))}
                </div>
                {actualP1Lifestyle > (Number(form.p1_lifestyle) || 0) && (
                  <p className="text-[10px] text-rose-600 font-bold mt-1">
                    ⚠️ Live spending ({formatCurrency(actualP1Lifestyle)}) exceeds planned ({formatCurrency(form.p1_lifestyle)}). The Greater Of rule will deduct {formatCurrency(actualP1Lifestyle)}.
                  </p>
                )}
              </div>

              {/* P1: Unplanned Outflows / Extra Debt Paid */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label className="text-xs font-bold text-[#52212e]">Unplanned Outflows / Extra Debt Paid</label>
                    {(form.manual_fields || []).includes('p1_extra_debt') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-[#7d3c4c] bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">⚡ 2 Categories</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => syncFieldDynamic('p1_extra_debt', dynExtraDebtPerPaycheck)}
                      className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Sync Planner ({formatCurrency(dynExtraDebtPerPaycheck)})</span>
                    </button>
                    <span className="text-[10px] text-[#8c6b73]">
                      Live Spent: {formatCurrency(actualP1ExtraDebt)}
                    </span>
                  </div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p1_extra_debt}
                  onChange={e => markFieldManual('p1_extra_debt', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-rose-400"
                />
                <div className="mt-1 text-[10px] text-[#8c6b73] flex items-center gap-1.5 flex-wrap">
                  <span>Pools:</span>
                  {extraDebtCategoryDetails.map(c => (
                    <span key={c.name} className="bg-rose-50/80 px-1.5 py-0.2 rounded border border-rose-100 text-[#52212e]">
                      {c.icon} {c.name} (${c.perCheckBudget})
                    </span>
                  ))}
                </div>
                {actualP1ExtraDebt > (Number(form.p1_extra_debt) || 0) && (
                  <p className="text-[10px] text-rose-600 font-bold mt-1">
                    ⚠️ Live spending ({formatCurrency(actualP1ExtraDebt)}) exceeds planned ({formatCurrency(form.p1_extra_debt)}). The Greater Of rule will deduct {formatCurrency(actualP1ExtraDebt)}.
                  </p>
                )}
              </div>

              {/* P1: Savings Assigned */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Savings Assigned</label>
                    {(form.manual_fields || []).includes('p1_savings') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Monthly Budget</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p1_savings', dynamicP1Savings)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Budget ({formatCurrency(dynamicP1Savings)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p1_savings}
                  onChange={e => markFieldManual('p1_savings', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-rose-400"
                />
              </div>

              {/* P1: Transfer Out (Cash Drain) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Transfer Out (Cash Drain)</label>
                    {(form.manual_fields || []).includes('p1_transfers_out') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-rose-800 bg-rose-100/80 px-1.5 py-0.2 rounded border border-rose-300">⚡ Checking Transfers</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p1_transfers_out', dynamicP1TransfersOut)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Transfers ({formatCurrency(dynamicP1TransfersOut)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p1_transfers_out}
                  onChange={e => markFieldManual('p1_transfers_out', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-rose-400"
                />
              </div>

              {/* P1: Rollover to Paycheck 2 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Rollover to Paycheck 2 (Remainder)</label>
                    {(form.manual_fields || []).includes('p1_rollover_next') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-rose-800 bg-rose-100/80 px-1.5 py-0.2 rounded border border-rose-300">⚡ Auto-Cascaded</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const p1Obs = (form.p1_fixed_bills || 0) + (form.p1_lifestyle || 0) + (form.p1_extra_debt || 0) + (form.p1_savings || 0) + (form.p1_transfers_out || 0);
                      const calc = (form.p1_rollover || 0) + (form.p1_income || 0) + (form.p1_transfers_in || 0) - p1Obs;
                      const res = Math.round(calc * 100) / 100;
                      syncFieldDynamic('p1_rollover_next', res);
                      syncFieldDynamic('p2_rollover', res);
                    }}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto-Calculate</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p1_rollover_next}
                  onChange={e => {
                    const val = parseFloat(e.target.value) || 0;
                    markFieldManual('p1_rollover_next', val);
                    if (!form.manual_fields?.includes('p2_rollover')) {
                      setForm((prev: any) => ({ ...prev, p2_rollover: val }));
                    }
                  }}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-rose-400"
                />
              </div>
            </div>

            {/* Paycheck 2 */}
            <div className="p-5 bg-purple-50/30 rounded-2xl border border-purple-200/70 space-y-4">
              <div className="flex items-center justify-between border-b border-purple-100 pb-2">
                <h4 className="font-extrabold text-[#1f242e] text-sm font-cute flex items-center gap-2">
                  <SakuraIcon className="w-4 h-4 shrink-0" /> Paycheck 2 Settings
                </h4>
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-[#52212e]">Period Label:</label>
                  <input
                    type="text"
                    value={form.p2_period}
                    onChange={e => setForm({ ...form, p2_period: e.target.value })}
                    className="w-28 px-2 py-0.5 border border-[#ebd0d9] rounded-lg text-xs font-cute bg-white text-center"
                    placeholder="16th - 31st"
                  />
                </div>
              </div>

              {/* P2: Payday Timing & Coverage */}
              <div className="p-3 bg-white rounded-xl border border-purple-200 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-[#52212e] text-[11px]">Payday 2 Arrival:</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={form.p2_payday_day === 15 ? '15th' : 'custom'}
                      onChange={e => setForm({ ...form, p2_payday_day: e.target.value === '15th' ? 15 : 16 })}
                      className="px-2 py-0.5 border border-purple-200 rounded-lg text-xs bg-purple-50 font-cute"
                    >
                      <option value="15th">15th of Active Month</option>
                      <option value="custom">Custom Day of Month</option>
                    </select>
                    {form.p2_payday_day !== 15 && (
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={form.p2_payday_day || 16}
                        onChange={e => setForm({ ...form, p2_payday_day: parseInt(e.target.value, 10) || 16 })}
                        className="w-12 px-1.5 py-0.5 border border-purple-200 rounded text-xs font-mono text-center font-bold"
                        title="Day of Month"
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-purple-50 flex-wrap">
                  <span className="font-bold text-[#52212e] text-[11px]">Covers Bills Due:</span>
                  <div className="flex items-center gap-1.5 font-cute text-xs">
                    <span className="text-[#8c6b73]">Day</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={form.p2_bill_start}
                      onChange={e => setForm({ ...form, p2_bill_start: parseInt(e.target.value, 10) || 16 })}
                      className="w-12 px-1.5 py-0.5 border border-purple-200 rounded text-xs font-mono text-center font-bold"
                    />
                    <span className="text-[#8c6b73]">to Day</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={form.p2_bill_end}
                      onChange={e => setForm({ ...form, p2_bill_end: parseInt(e.target.value, 10) || 31 })}
                      className="w-12 px-1.5 py-0.5 border border-purple-200 rounded text-xs font-mono text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* P2: Starting Rollover */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Rollover from Paycheck 1</label>
                    {(form.manual_fields || []).includes('p2_rollover') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-purple-800 bg-purple-100/80 px-1.5 py-0.2 rounded border border-purple-300">⚡ Check 1 Bridge</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p2_rollover', form.p1_rollover_next)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync from Check 1 ({formatCurrency(form.p1_rollover_next)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_rollover}
                  onChange={e => markFieldManual('p2_rollover', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
              </div>

              {/* P2: Inflow */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Paycheck 2 Inflow (Income)</label>
                    {(form.manual_fields || []).includes('p2_income') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Checking</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p2_income', dynamicP2Income)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Checking ({formatCurrency(dynamicP2Income)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_income}
                  onChange={e => markFieldManual('p2_income', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
              </div>

              {/* P2: Transfer In (Cash Infusion) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Transfer In (Cash Infusion)</label>
                    {(form.manual_fields || []).includes('p2_transfers_in') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Checking Transfers</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p2_transfers_in', dynamicP2TransfersIn)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Transfers ({formatCurrency(dynamicP2TransfersIn)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_transfers_in}
                  onChange={e => markFieldManual('p2_transfers_in', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
              </div>

              {/* P2: Fixed Bills */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Fixed Bills Assigned</label>
                    {(form.manual_fields || []).includes('p2_fixed_bills') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Card</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p2_fixed_bills', dynamicP2FixedBills)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Card ({formatCurrency(dynamicP2FixedBills)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_fixed_bills}
                  onChange={e => markFieldManual('p2_fixed_bills', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
              </div>

              {/* P2: Lifestyle Budget (Umbrella Group: Groceries, Gas, Entertainment, Takeout, Chicken Feed) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label className="text-xs font-bold text-[#52212e]">Lifestyle Budget Assigned</label>
                    {(form.manual_fields || []).includes('p2_lifestyle') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">☂️ 5 Categories</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => syncFieldDynamic('p2_lifestyle', dynUmbrellaPerPaycheck)}
                      className="text-[10px] text-purple-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Sync Umbrella ({formatCurrency(dynUmbrellaPerPaycheck)})</span>
                    </button>
                    <span className="text-[10px] text-[#8c6b73]">
                      Live Spent: {formatCurrency(actualP2Lifestyle)}
                    </span>
                  </div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_lifestyle}
                  onChange={e => markFieldManual('p2_lifestyle', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
                <div className="mt-1 text-[10px] text-[#8c6b73] flex items-center gap-1.5 flex-wrap">
                  <span>Pools:</span>
                  {umbrellaCategoryDetails.map(c => (
                    <span key={c.name} className="bg-purple-50/80 px-1.5 py-0.2 rounded border border-purple-100 text-[#52212e]">
                      {c.icon} {c.name} (${c.perCheckBudget})
                    </span>
                  ))}
                </div>
                {actualP2Lifestyle > (Number(form.p2_lifestyle) || 0) && (
                  <p className="text-[10px] text-purple-700 font-bold mt-1">
                    ⚠️ Live spending ({formatCurrency(actualP2Lifestyle)}) exceeds planned ({formatCurrency(form.p2_lifestyle)}). The Greater Of rule will deduct {formatCurrency(actualP2Lifestyle)}.
                  </p>
                )}
              </div>

              {/* P2: Unplanned Outflows / Extra Debt Paid */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label className="text-xs font-bold text-[#52212e]">Unplanned Outflows / Extra Debt Paid</label>
                    {(form.manual_fields || []).includes('p2_extra_debt') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-purple-800 bg-purple-100/80 px-1.5 py-0.2 rounded border border-purple-300">⚡ 2 Categories</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => syncFieldDynamic('p2_extra_debt', dynExtraDebtPerPaycheck)}
                      className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Sync Planner ({formatCurrency(dynExtraDebtPerPaycheck)})</span>
                    </button>
                    <span className="text-[10px] text-[#8c6b73]">
                      Live Spent: {formatCurrency(actualP2ExtraDebt)}
                    </span>
                  </div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_extra_debt}
                  onChange={e => markFieldManual('p2_extra_debt', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
                <div className="mt-1 text-[10px] text-[#8c6b73] flex items-center gap-1.5 flex-wrap">
                  <span>Pools:</span>
                  {extraDebtCategoryDetails.map(c => (
                    <span key={c.name} className="bg-purple-50/80 px-1.5 py-0.2 rounded border border-purple-100 text-[#52212e]">
                      {c.icon} {c.name} (${c.perCheckBudget})
                    </span>
                  ))}
                </div>
                {actualP2ExtraDebt > (Number(form.p2_extra_debt) || 0) && (
                  <p className="text-[10px] text-purple-700 font-bold mt-1">
                    ⚠️ Live spending ({formatCurrency(actualP2ExtraDebt)}) exceeds planned ({formatCurrency(form.p2_extra_debt)}). The Greater Of rule will deduct {formatCurrency(actualP2ExtraDebt)}.
                  </p>
                )}
              </div>

              {/* P2: Sinking Funds Assigned */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Sinking Funds Assigned</label>
                    {(form.manual_fields || []).includes('p2_savings') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Sinking Target</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p2_savings', dynamicP2Savings)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                    title={`Reset to dynamic monthly sinking funds total (${formatCurrency(dynamicP2Savings)})`}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Reset to Sinking Total ({formatCurrency(dynamicP2Savings)})
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_savings}
                  onChange={e => markFieldManual('p2_savings', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
              </div>

              {/* P2: Checking Buffer */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Checking Safety Buffer</label>
                    {(form.manual_fields || []).includes('p2_checking_buffer') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-purple-800 bg-purple-100/80 px-1.5 py-0.2 rounded border border-purple-300">⚡ Account Buffer</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p2_checking_buffer', dynamicP2Buffer)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Buffer ({formatCurrency(dynamicP2Buffer)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_checking_buffer}
                  onChange={e => markFieldManual('p2_checking_buffer', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
              </div>

              {/* P2: Transfer Out (Cash Drain) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Transfer Out (Cash Drain)</label>
                    {(form.manual_fields || []).includes('p2_transfers_out') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-rose-800 bg-rose-100/80 px-1.5 py-0.2 rounded border border-rose-300">⚡ Checking Transfers</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncFieldDynamic('p2_transfers_out', dynamicP2TransfersOut)}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Sync Transfers ({formatCurrency(dynamicP2TransfersOut)})</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_transfers_out}
                  onChange={e => markFieldManual('p2_transfers_out', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
              </div>

              {/* P2: Leftover Free Cash */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#52212e]">Leftover Free Cash (Net Remainder)</label>
                    {(form.manual_fields || []).includes('p2_leftover') ? (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-300">✏️ Manual</span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300">⚡ Auto-Cascaded</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const p2Obs = (form.p2_fixed_bills || 0) + (form.p2_lifestyle || 0) + (form.p2_extra_debt || 0) + (form.p2_savings || 0) + (form.p2_checking_buffer || 0) + (form.p2_transfers_out || 0);
                      const calc = (form.p2_rollover || 0) + (form.p2_income || 0) + (form.p2_transfers_in || 0) - p2Obs;
                      syncFieldDynamic('p2_leftover', Math.round(calc * 100) / 100);
                    }}
                    className="text-[10px] text-[#7d3c4c] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto-Calculate</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.p2_leftover}
                  onChange={e => markFieldManual('p2_leftover', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-[#ebd0d9] rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                />
              </div>

              {/* P2: Zero-Sum Allocation Targets (Rule 2) */}
              <div className="p-3 bg-purple-50/50 rounded-2xl border border-purple-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🎯</span>
                    <label className="text-xs font-bold text-[#52212e]">Zero-Sum Allocation Targets</label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const avail = Math.max(0, Number(form.p2_leftover) || 0);
                      setForm({
                        ...form,
                        p2_zero_sum_debt: avail,
                        p2_zero_sum_savings: 0,
                        p2_zero_sum_buffer: 0,
                        p2_zero_sum_target: 'debt_overpayment',
                      });
                    }}
                    className="text-[10px] text-purple-700 font-bold hover:underline cursor-pointer"
                  >
                    Zero out to Debt
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-[#7d3c4c] block mb-0.5">Debt Overpayment</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.p2_zero_sum_debt}
                      onChange={e => setForm({ ...form, p2_zero_sum_debt: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 border border-purple-200 rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[#7d3c4c] block mb-0.5">General Savings</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.p2_zero_sum_savings}
                      onChange={e => setForm({ ...form, p2_zero_sum_savings: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 border border-purple-200 rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[#7d3c4c] block mb-0.5">Checking Buffer</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.p2_zero_sum_buffer}
                      onChange={e => setForm({ ...form, p2_zero_sum_buffer: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 border border-purple-200 rounded-xl text-xs font-mono bg-white focus:outline-purple-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#ebd0d9]">
            <div className="text-xs font-medium text-[#7d3c4c] flex items-center gap-2">
              <span className="text-sm">ℹ️</span>
              {form.is_manual ? (
                <span className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                  Full Manual Mode: All numbers are saved exactly as entered.
                </span>
              ) : (form.manual_fields || []).length > 0 ? (
                <span className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                  {(form.manual_fields || []).length} manual override(s) active. Unmodified fields remain auto-synced.
                </span>
              ) : (
                <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                  All fields currently synced dynamically with live accounts &amp; budget cards.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl text-[#64748b] hover:bg-[#f8f7f6] text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 rounded-xl bg-[#7d3c4c] text-white text-xs font-bold hover:bg-[#6a313f] shadow-md shadow-rose-900/20 cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Dedicated Monthly Reconciliation & Zero-Sum View, or Streamlined Paycheck Waterfall Cascade */}
      {waterfallMode === 'reconciliation' ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Main Reconciliation & Allocation Card */}
          <div className="bg-white rounded-3xl border border-[#e4e0e2] shadow-kawaii overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-[#e4e0e2] bg-[#fdfbfb] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-extrabold text-[#1f242e] font-cute">
                    Monthly Reconciliation &amp; Zero-Sum Cash Allocation
                  </h3>
                  <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                    {selectedMonth} {selectedYear}
                  </span>
                </div>
                <p className="text-xs text-[#8c6b73] mt-1">
                  Sequential monthly reconciliation of combined paychecks against live actuals and zero-sum assignment of remaining cash.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right bg-emerald-50 px-3.5 py-1.5 rounded-2xl border border-emerald-200 shadow-2xs">
                  <span className="text-[10px] text-emerald-800 font-medium block">Net Free Cash</span>
                  <span className="font-mono font-extrabold text-sm text-emerald-700 block">
                    {formatCurrency(activeTotalNetFreeCash)}
                  </span>
                </div>
              </div>
            </div>

            {/* Zero-Sum Cash Allocation Section */}
            <div className="p-6 border-b border-[#e4e0e2] bg-gradient-to-b from-[#fcf9fa] to-white space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-extrabold text-[#1f242e] font-cute">
                      Zero-Sum Cash Allocation (Rule 2: Every Dollar Has a Job)
                    </h4>
                  </div>
                  <p className="text-xs text-[#8c6b73] mt-0.5">
                    Explicitly assign leftover cash to targets so unallocated cash reaches $0.00.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleQuickAllocate('debt')}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200 transition cursor-pointer"
                    title="Assign 100% of leftover cash to Debt Overpayment"
                  >
                    100% Debt Overpayment
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAllocate('savings')}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer"
                    title="Assign 100% of leftover cash to General Savings"
                  >
                    100% General Savings
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAllocate('buffer')}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                    title="Assign 100% of leftover cash to Checking Buffer"
                  >
                    100% Checking Buffer
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAllocate('split_50_50')}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-rose-50 text-[#7d3c4c] hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
                    title="Split leftover cash 50/50 between Debt and Savings"
                  >
                    50/50 Debt &amp; Savings
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAllocate('reset')}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition cursor-pointer"
                    title="Clear zero-sum allocations"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Three Target Allocation Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                <div className="p-4 bg-white rounded-2xl border border-purple-200/80 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-purple-900 block">Debt Overpayment</span>
                    <span className="text-[10px] text-[#8c6b73]">Extra principal payoff</span>
                  </div>
                  <span className="font-mono font-extrabold text-base text-purple-700">
                    {formatCurrency(p2ZeroSumDebt)}
                  </span>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-emerald-200/80 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-900 block">General Savings</span>
                    <span className="text-[10px] text-[#8c6b73]">Emergency / future fund</span>
                  </div>
                  <span className="font-mono font-extrabold text-base text-emerald-700">
                    {formatCurrency(p2ZeroSumSavings)}
                  </span>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-blue-200/80 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-blue-900 block">Checking Buffer</span>
                    <span className="text-[10px] text-[#8c6b73]">Checking cushion boost</span>
                  </div>
                  <span className="font-mono font-extrabold text-base text-blue-700">
                    {formatCurrency(p2ZeroSumBuffer)}
                  </span>
                </div>
              </div>

              {/* Status Balance Line */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-rose-100 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#8c6b73] font-medium">Allocated:</span>
                  <span className="font-mono font-bold text-[#1f242e]">{formatCurrency(p2TotalZeroSumAllocated)}</span>
                  <span className="text-[11px] text-[#8c6b73]">of {formatCurrency(activeP2Leftover)} available</span>
                </div>
                <div>
                  {p2UnallocatedLeftover === 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/90 px-3.5 py-1 rounded-full border border-emerald-300 shadow-2xs">
                      Zero-Sum Achieved ($0.00 Unallocated)
                    </span>
                  ) : p2UnallocatedLeftover > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-100/90 px-3.5 py-1 rounded-full border border-amber-300">
                      {formatCurrency(p2UnallocatedLeftover)} Unassigned Cash
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 bg-rose-100/90 px-3.5 py-1 rounded-full border border-rose-300">
                      {formatCurrency(Math.abs(p2UnallocatedLeftover))} Over-allocated
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Combined Monthly Financial Flow Summary */}
            <div className="p-6 bg-[#fdfbfb]">
              <div className="flex items-center justify-between pb-3 border-b border-[#ebd0d9] mb-4">
                <div>
                  <h4 className="font-extrabold text-sm text-[#1f242e] font-cute">
                    Combined Monthly Cash Flow ({selectedMonth} {selectedYear})
                  </h4>
                  <p className="text-xs text-[#8c6b73] mt-0.5">
                    Aggregated income, fixed obligations, lifestyle spending, debt, and reserves.
                  </p>
                </div>
              </div>

              {/* 8-Card Flow Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs mb-4">
                <div className="p-3 bg-white rounded-2xl border border-[#ebd0d9] shadow-2xs">
                  <span className="text-[10px] text-[#8c6b73] block font-medium">Starting Rollover</span>
                  <span className={`font-mono font-bold text-sm mt-1 block ${effectiveP1Rollover < 0 ? 'text-rose-600' : 'text-[#1f242e]'}`}>
                    {formatCurrency(effectiveP1Rollover)}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-[#ebd0d9] shadow-2xs">
                  <span className="text-[10px] text-[#8c6b73] block font-medium">Total Incomes (P1+P2)</span>
                  <span className="font-mono font-bold text-sm text-emerald-600 mt-1 block">
                    +{formatCurrency(activeTotalIncome)}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-emerald-200/80 shadow-2xs">
                  <span className="text-[10px] text-emerald-800/80 block font-medium">Transfers In (+)</span>
                  <span className="font-mono font-bold text-sm text-emerald-600 mt-1 block">
                    +{formatCurrency(activeTotalTransfersIn)}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-[#ebd0d9] shadow-2xs">
                  <span className="text-[10px] text-[#8c6b73] block font-medium">Total Fixed Bills</span>
                  <span className="font-mono font-bold text-sm text-rose-600 mt-1 block">
                    -{formatCurrency(activeTotalAssignedFixedBills)}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-[#ebd0d9] shadow-2xs">
                  <span className="text-[10px] text-[#8c6b73] block font-medium">Total Lifestyle</span>
                  <span className="font-mono font-bold text-sm text-rose-600 mt-1 block">
                    -{formatCurrency(activeTotalLifestyle)}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-[#ebd0d9] shadow-2xs">
                  <span className="text-[10px] text-[#8c6b73] block font-medium">Unplanned &amp; Debt</span>
                  <span className="font-mono font-bold text-sm text-rose-600 mt-1 block">
                    -{formatCurrency(activeTotalExtraDebt)}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-[#ebd0d9] shadow-2xs">
                  <span className="text-[10px] text-[#8c6b73] block font-medium">Total Savings</span>
                  <span className="font-mono font-bold text-sm text-emerald-700 mt-1 block">
                    -{formatCurrency(activeTotalSavings)}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-rose-200/80 shadow-2xs">
                  <span className="text-[10px] text-rose-800/80 block font-medium">Transfers Out (-)</span>
                  <span className="font-mono font-bold text-sm text-rose-600 mt-1 block">
                    -{formatCurrency(activeTotalTransfersOut)}
                  </span>
                </div>
              </div>

              {/* 4-Card Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-white rounded-2xl border border-[#ebd0d9] shadow-2xs">
                  <span className="text-[10px] text-[#8c6b73] block font-medium">Checking Buffer</span>
                  <span className="font-mono font-bold text-sm text-purple-700 mt-1 block">
                    -{formatCurrency(activeTotalBuffer)}
                  </span>
                </div>
                <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-200 shadow-2xs">
                  <span className="text-[10px] text-purple-800/80 block font-bold">Leftover Free Cash</span>
                  <span className={`font-mono font-extrabold text-sm mt-1 block ${activeTotalNetFreeCash >= 0 ? 'text-purple-700' : 'text-rose-600'}`}>
                    {formatCurrency(activeTotalNetFreeCash)}
                  </span>
                </div>
                <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-200 shadow-2xs">
                  <span className="text-[10px] text-blue-800/80 block font-bold">Zero-Sum Allocated</span>
                  <span className="font-mono font-extrabold text-sm text-blue-700 mt-1 block">
                    {formatCurrency(p2TotalZeroSumAllocated)}
                  </span>
                </div>
                <div className={`p-3 rounded-2xl border shadow-2xs ${p2UnallocatedLeftover === 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'}`}>
                  <span className="text-[10px] text-emerald-800/80 block font-bold">
                    {p2UnallocatedLeftover === 0 ? 'Zero-Sum Status' : 'Unassigned Cash'}
                  </span>
                  <span className={`font-mono font-extrabold text-sm mt-1 block ${p2UnallocatedLeftover === 0 ? 'text-emerald-700' : p2UnallocatedLeftover > 0 ? 'text-amber-700' : 'text-rose-600'}`}>
                    {p2UnallocatedLeftover === 0 ? '$0.00 (Zero-Sum)' : formatCurrency(p2UnallocatedLeftover)}
                  </span>
                </div>
              </div>
            </div>

            {/* SECTION 4: Planned Budget vs Live Actuals Comparison Table */}
            <div className="border-t border-[#e4e0e2] overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#fdfbfb] text-[#7d3c4c] font-bold border-b border-[#ebd0d9] uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-5">Financial Category</th>
                    <th className="py-3 px-4 text-right">Planned Monthly Budget</th>
                    <th className="py-3 px-4 text-right">Live Actuals / Cleared</th>
                    <th className="py-3 px-4 text-right">Variance</th>
                    <th className="py-3 px-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f7edf0]">
                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-5 font-medium text-[#1f242e]">Paycheck Inflow (P1 + P2)</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">+{formatCurrency(totalIncome)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">+{formatCurrency(activeTotalIncome)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">
                      {formatCurrency(activeTotalIncome - totalIncome)}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="text-[10px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {activeTotalIncome >= totalIncome ? 'Fully Cleared' : 'In Progress'}
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-5 font-medium text-[#1f242e]">Fixed Bills Assigned</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">-{formatCurrency(totalAssignedFixedBills)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">-{formatCurrency(activeTotalAssignedFixedBills)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      +{formatCurrency(Math.max(0, totalAssignedFixedBills - activeTotalAssignedFixedBills))}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="text-[10px] font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                        {activeTotalAssignedFixedBills >= totalAssignedFixedBills ? 'All Bills Paid' : 'Pending Bills in Cash'}
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-5 font-medium text-[#1f242e]">Lifestyle Allowance</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">-{formatCurrency(totalLifestyle)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">-{formatCurrency(activeTotalLifestyle)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      +{formatCurrency(Math.max(0, totalLifestyle - activeTotalLifestyle))}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="text-[10px] font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                        {activeTotalLifestyle > totalLifestyle ? 'Over Budget' : 'Under Allowance'}
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-5 font-medium text-[#1f242e]">Unplanned Outflows &amp; Extra Debt</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">-{formatCurrency(totalExtraDebt)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">-{formatCurrency(activeTotalExtraDebt)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      +{formatCurrency(Math.max(0, totalExtraDebt - activeTotalExtraDebt))}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="text-[10px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {activeTotalExtraDebt > totalExtraDebt ? 'Over Budget' : 'Spent Under Budget'}
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-5 font-medium text-[#1f242e]">Savings &amp; Sinking Funds</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">-{formatCurrency(totalSavings)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">-{formatCurrency(activeTotalSavings)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">
                      {formatCurrency(totalSavings - activeTotalSavings)}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="text-[10px] font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                        {activeTotalSavings >= totalSavings ? 'Fully Transferred' : 'Scheduled'}
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-5 font-medium text-[#1f242e]">Checking Safety Buffer</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-purple-700">-{formatCurrency(totalBuffer)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-purple-700">-{formatCurrency(activeTotalBuffer)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">$0.00</td>
                    <td className="py-3 px-5 text-right">
                      <span className="text-[10px] font-medium text-purple-800 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                        Buffer Intact
                      </span>
                    </td>
                  </tr>
                  <tr className="bg-emerald-50/40 font-bold border-t-2 border-[#ebd0d9]">
                    <td className="py-3.5 px-5 text-[#1f242e] font-cute text-sm">Net Free Cash Available</td>
                    <td className="py-3.5 px-4 text-right font-mono text-sm text-slate-800">{formatCurrency(totalNetFreeCash)}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-base font-extrabold text-emerald-700">{formatCurrency(activeTotalNetFreeCash)}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-sm font-extrabold text-emerald-700">
                      {activeTotalNetFreeCash >= totalNetFreeCash ? `+${formatCurrency(activeTotalNetFreeCash - totalNetFreeCash)}` : `-${formatCurrency(totalNetFreeCash - activeTotalNetFreeCash)}`}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
                        {p2UnallocatedLeftover === 0 ? 'Zero-Sum Balanced' : `${formatCurrency(p2UnallocatedLeftover)} Left to Assign`}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : viewMode === 'log' ? (
        <div className="bg-white rounded-3xl border border-[#e4e0e2] shadow-kawaii overflow-hidden">
          {/* Table Header */}
          <div className="p-5 border-b border-[#e4e0e2] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#fdfbfb]">
            <div>
              <h3 className="text-base font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
                Single Paycheck Allocation &amp; Obligations Log
              </h3>
              <p className="text-xs text-[#8c6b73] mt-0.5">
                Sequential waterfall log: Paycheck 1 cascades directly into Paycheck 2 underneath.
              </p>
            </div>
            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <span className="text-[11px] font-medium text-slate-600 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                Month: {selectedMonth} {selectedYear}
              </span>
            </div>
          </div>

          {/* Live Actuals Banner */}
          {isLiveActuals && (
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50/70 to-white border-b border-emerald-200 px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-950 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  <strong>Live Actuals Mode Active:</strong> Running balance reflects only cleared checking transactions and executed transfers (<strong className="font-mono text-emerald-700">{formatCurrency(checkingBalance)}</strong> in Checking). Unspent allowances and pending bills remain in cash.
                </span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 bg-white px-2.5 py-1 rounded-full border border-emerald-200 shadow-2xs shrink-0 self-start sm:self-auto">
                Physical Checking: {formatCurrency(checkingBalance)}
              </span>
            </div>
          )}

          {/* SECTION 1: PAYCHECK 1 (1st - 15th) */}
          <div className="border-b border-[#ebd0d9]">
            <div className="bg-gradient-to-r from-rose-100/60 via-rose-50 to-white px-5 py-3 border-b border-[#ebd0d9] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div>
                  <h4 className="font-extrabold text-sm text-[#1f242e] font-cute flex items-center gap-2 flex-wrap">
                    Paycheck 1 ({effectiveP1Period})
                    <span className="text-[10px] font-semibold text-rose-700 bg-white px-2 py-0.5 rounded-md border border-rose-200 shadow-2xs">
                      Paid {scheduledP1PayDate} (Last Day of Prior Month) • Covers Bills {effectiveP1BillStart}{getOrdinalSuffix(effectiveP1BillStart).slice(-2)}–{effectiveP1BillEnd}{getOrdinalSuffix(effectiveP1BillEnd).slice(-2)}
                    </span>
                  </h4>
                  <p className="text-[11px] text-[#8c6b73]">Funds early-month obligations from prior month-end inflow &amp; starting rollover</p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[11px] text-[#7d3c4c] font-semibold">Check 1 Inflow:</span>
                {isP1PaidPriorToMonth ? (
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-extrabold text-xs text-gray-500 bg-white px-2.5 py-1 rounded-xl border border-gray-200 shadow-2xs">
                      +$0.00
                    </span>
                    <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                      Included in Rollover ({formatCurrency(effectiveP1Income)})
                    </span>
                  </div>
                ) : (
                  <span className="font-mono font-extrabold text-xs text-emerald-700 bg-white px-2.5 py-1 rounded-xl border border-emerald-200 shadow-2xs">
                    +{formatCurrency(effectiveP1Income)}
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#fdf6f8]/70 border-b border-[#ebd0d9] text-[#52212e] font-cute text-[11px]">
                    <th className="py-2.5 px-4 font-extrabold w-2/5">Obligation / Flow Item</th>
                    <th className="py-2.5 px-4 font-extrabold w-1/4">Details / Source</th>
                    <th className="py-2.5 px-4 font-extrabold w-1/6 text-right">Assigned Amount</th>
                    <th className="py-2.5 px-4 font-bold w-1/6 text-right uppercase tracking-wider text-[10px] text-slate-700 bg-slate-100/80 border-l border-slate-200/80">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f5ebed]">
                  {/* P1: 1. Starting Rollover Balance */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Starting Rollover Balance</span>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p1_rollover') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : (
                            <span>Checking Ledger (Ending {prevMonth} {lastDayOfPrevMonth})</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isFieldManual('p1_rollover')
                            ? `Custom override (Ledger: ${formatCurrency(dynamicP1Rollover)})`
                            : `Ending balance as of ${prevMonth} ${lastDayOfPrevMonth} (${formatCurrency(dynamicP1Rollover)})`}
                        </div>
                      </div>
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-right ${effectiveP1Rollover < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                      {formatSignedCurrency(effectiveP1Rollover)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p1Step0 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p1Step0)}
                    </td>
                  </tr>

                  {/* P1: 2. Paycheck Inflow */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[#1f242e]">Paycheck 1 Inflow (Income)</span>
                          <button
                            type="button"
                            onClick={handleStartEdit}
                            className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                            title="Edit manually"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Pay Date: {scheduledP1PayDate} {isP1PaidPriorToMonth ? '(Prior Month-End)' : ''}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isP1PaidPriorToMonth ? (
                            <span className="text-slate-600">Included in Rollover ({formatCurrency(effectiveP1Income)})</span>
                          ) : isFieldManual('p1_income') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : (
                            <span className="text-slate-600">Paycheck Income</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isP1PaidPriorToMonth
                            ? 'Already inside account on 1st; added at $0.00'
                            : isFieldManual('p1_income')
                            ? `Custom (Live: ${formatCurrency(dynamicP1Income)})`
                            : (p1Txs.length > 0 ? `Checking Ledger (${p1Txs.length} tx)` : 'Checking Ledger')}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right">
                      {isP1PaidPriorToMonth ? (
                        <div>
                          <span className="text-slate-400 font-mono font-bold">+$0.00</span>
                          <span className="text-[10px] text-slate-400 block font-sans font-normal">(in rollover)</span>
                        </div>
                      ) : (
                        <span className="text-emerald-600 font-mono font-bold">+{formatCurrency(effectiveP1Income)}</span>
                      )}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p1Step1 < 0 ? 'text-rose-600' : 'text-emerald-700'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p1Step1)}
                    </td>
                  </tr>

                  {/* P1: Transfer In (Cash Infusion) */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Transfer In (Cash Infusion)</span>
                        <button
                          type="button"
                          onClick={() => setShowP1TransfersInLog(!showP1TransfersInLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Toggle inbound transfers breakdown for Check 1"
                        >
                          <ArrowDownLeft className="w-2.5 h-2.5 text-emerald-600" />
                          <span>{p1TransfersInItems.length} In</span>
                          {showP1TransfersInLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p1_transfers_in') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : (
                            <span>{p1TransfersInItems.length > 0 ? `Checking Deposit (${p1TransfersInItems.length} tx)` : 'Checking Deposit'}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isFieldManual('p1_transfers_in')
                            ? `Custom (Live: ${formatCurrency(dynamicP1TransfersIn)})`
                            : 'Inbound transfers into Checking (e.g. Savings to Checking)'}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right">
                      <span className="text-emerald-600 font-mono font-bold">+{formatCurrency(activeP1TransfersIn)}</span>
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p1StepTransferIn < 0 ? 'text-rose-600' : 'text-emerald-700'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p1StepTransferIn)}
                    </td>
                  </tr>

                  {/* P1: Expandable Transfers In Breakdown */}
                  {showP1TransfersInLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-emerald-50/40 border-y border-emerald-200/60 space-y-1.5 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-emerald-900 uppercase px-1 pb-0.5">
                            <span>Check 1 Inbound Transfers (Deposited to Checking)</span>
                            <span>Total Infusion: +{formatCurrency(activeP1TransfersIn)}</span>
                          </div>
                          {p1TransfersInItems.length === 0 ? (
                            <div className="text-[11px] text-[#8c6b73] italic py-1.5 text-center bg-white rounded-xl border border-emerald-100">
                              No inbound transfers into Checking in this pay period
                            </div>
                          ) : (
                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {p1TransfersInItems.map((item: any, idx: number) => (
                                <div key={item.id || idx} className="flex justify-between items-center text-[11px] px-2.5 py-1.5 bg-white rounded-lg border border-emerald-200 shadow-2xs">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 shrink-0">
                                      {item.date ? item.date.slice(5) : ''}
                                    </span>
                                    <span className="font-semibold text-[#1f242e] truncate">{item.description}</span>
                                    <span className="text-[10px] text-[#8c6b73] truncate">From: <strong className="text-emerald-800">{item.source || 'Other Account'}</strong></span>
                                  </div>
                                  <span className="font-mono font-bold text-emerald-700 shrink-0 ml-2">
                                    +{formatCurrency(item.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P1: 3. Fixed Bills Assigned */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Fixed Bills Assigned</span>
                        <button
                          type="button"
                          onClick={() => setShowP1BillsLog(!showP1BillsLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Toggle bill breakdown for Check 1"
                        >
                          <Receipt className="w-2.5 h-2.5" />
                          <span>{p1AllBills.length} bills ({p1PaidBills.length} paid)</span>
                          {showP1BillsLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isLiveActuals ? (
                            <span>Cleared Bills Only</span>
                          ) : isFieldManual('p1_fixed_bills') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : (
                            <span>Check 1 Bills</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isLiveActuals
                            ? `${p1PaidBills.length} paid (${formatCurrency(clearedP1FixedBills)}) • ${p1UnpaidBills.length} unpaid pending (${formatCurrency(p1UnpaidTotal)} in cash)`
                            : isFieldManual('p1_fixed_bills')
                            ? `Custom (Card: ${formatCurrency(p1TotalFixedBills)})`
                            : `${p1PaidBills.length} paid • ${p1UnpaidBills.length} unpaid`}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rose-600">
                      -{formatCurrency(activeP1FixedBills)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p1Step2 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p1Step2)}
                    </td>
                  </tr>

                  {/* P1: Expandable Bills Breakdown */}
                  {showP1BillsLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-[#fdf6f8]/70 border-y border-[#ebd0d9] space-y-1 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase px-1 pb-1">
                            <span>Check 1 Bills: {p1AllBills.length} total</span>
                            <span>{isLiveActuals ? `Total Cleared: ${formatCurrency(activeP1FixedBills)} (${formatCurrency(p1TotalFixedBills)} planned)` : `Total Assigned: ${formatCurrency(p1TotalFixedBills)}`}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                            {p1AllBills.map(b => {
                              const isPaid = Number(b[activeMonthKey] || 0) === 1;
                              return (
                                <div key={b.id} className="flex justify-between items-center text-[11px] px-2.5 py-1 bg-white rounded-lg border border-rose-200/60 shadow-2xs">
                                  <span className="text-[#52212e] truncate font-medium flex items-center gap-1.5">
                                    <span className="text-[10px] text-rose-600 font-bold">Due {b.due_day}th:</span>
                                    <span className="truncate">{b.name}</span>
                                    <span className={`text-[8px] px-1 py-0.2 rounded font-semibold ${
                                      isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'
                                    }`}>
                                      {isPaid ? 'Paid' : 'Unpaid'}
                                    </span>
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                    <span className="font-mono font-bold text-[#1f242e]">
                                      {formatCurrency(b.amount)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleReassignBill(b, '2nd Paycheck')}
                                      title="Move to Check 2"
                                      className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-[#7d3c4c] border border-rose-200 font-semibold cursor-pointer transition-colors"
                                    >
                                      → Check 2
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P1: 4. Lifestyle Budget Assigned */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#1f242e]">Lifestyle Budget Assigned</span>
                        <button
                          type="button"
                          onClick={() => setShowP1LifestyleLog(!showP1LifestyleLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs ml-1"
                          title="Toggle 5 categories breakdown"
                        >
                          <span>5 Categories</span>
                          {showP1LifestyleLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isLiveActuals ? (
                            <span>Cleared Spend</span>
                          ) : isFieldManual('p1_lifestyle') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : actualP1Lifestyle > plannedP1Lifestyle ? (
                            <span className="text-rose-600 font-semibold">Live Spending Overage</span>
                          ) : (
                            <span>5 Categories Planned</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isLiveActuals
                            ? `Spent ${formatCurrency(actualP1Lifestyle)} from checking • ${formatCurrency(Math.max(0, plannedP1Lifestyle - actualP1Lifestyle))} unspent in cash`
                            : actualP1Lifestyle > plannedP1Lifestyle
                            ? `Spent ${formatCurrency(actualP1Lifestyle)} (exceeds planned ${formatCurrency(plannedP1Lifestyle)})`
                            : `Planned ${formatCurrency(plannedP1Lifestyle)} • Spent ${formatCurrency(actualP1Lifestyle)}`}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rose-600">
                      -{formatCurrency(activeP1Lifestyle)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p1Step3 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p1Step3)}
                    </td>
                  </tr>

                  {/* P1: Expandable Lifestyle Umbrella Breakdown */}
                  {showP1LifestyleLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-[#fdf6f8]/70 border-y border-[#ebd0d9] space-y-1.5 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase px-1 pb-0.5">
                            <span>Umbrella Categories (1st - 15th): Groceries, Gas, Entertainment, Takeout, Chicken Feed</span>
                            <span>Combined Deducted: {formatCurrency(activeP1Lifestyle)}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                            {umbrellaCategoryDetails.map(cat => (
                              <div key={cat.name} className="flex flex-col text-[11px] px-2.5 py-1.5 bg-white rounded-xl border border-rose-200/60 shadow-2xs">
                                <span className="text-[#52212e] font-bold flex items-center gap-1">
                                  <span className="truncate">{cat.name}</span>
                                </span>
                                <div className="flex justify-between items-center text-[10px] text-[#8c6b73] mt-1 font-mono">
                                  <span>Plan: {formatCurrency(cat.perCheckBudget)}</span>
                                  <span className={cat.p1Spent > cat.perCheckBudget ? 'text-rose-600 font-bold' : 'text-[#1f242e]'}>
                                    Spent: {formatCurrency(cat.p1Spent)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P1: 5. Unplanned Outflows / Extra Debt Paid */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#1f242e]">Unplanned Outflows / Extra Debt Paid</span>
                        <button
                          type="button"
                          onClick={() => setShowP1ExtraDebtLog(!showP1ExtraDebtLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs ml-1"
                          title="Toggle unplanned outflows & extra payments breakdown"
                        >
                          <span>Breakdown ({p1UnplannedTxs.length})</span>
                          {showP1ExtraDebtLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isLiveActuals ? (
                            <span>Cleared Outflows (-{formatCurrency(activeP1ExtraDebt)})</span>
                          ) : manualFields.includes('p1_extra_debt') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : actualP1ExtraDebt > plannedP1ExtraDebt ? (
                            <span className="text-rose-600 font-semibold">Live Spending Overage</span>
                          ) : (
                            <span>Monthly Plan (Extra Debt)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isLiveActuals
                            ? (p1UnplannedTxs.length > 0
                                ? `Spent ${formatCurrency(actualP1ExtraDebt)} from checking (${p1UnplannedTxs.map((t: any) => `${t.description.replace('Pound Verterinary Hospital', 'Vet')} ${formatCurrency(t.amount)}`).join(' + ')})`
                                : `Spent $0.00 from checking`)
                            : actualP1ExtraDebt > plannedP1ExtraDebt
                            ? `Spent ${formatCurrency(actualP1ExtraDebt)} (exceeds planned ${formatCurrency(plannedP1ExtraDebt)})`
                            : `Planned ${formatCurrency(plannedP1ExtraDebt)} • Spent ${formatCurrency(actualP1ExtraDebt)}`}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rose-600">
                      -{formatCurrency(activeP1ExtraDebt)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p1Step4 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p1Step4)}
                    </td>
                  </tr>

                  {/* P1: Expandable Unplanned Outflows Breakdown */}
                  {showP1ExtraDebtLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-[#fdf6f8]/70 border-y border-[#ebd0d9] space-y-2 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase px-1 pb-0.5">
                            <span>Planner Budget: Extra Payment &amp; Other/Misc ({formatCurrency(plannedP1ExtraDebt)})</span>
                            <span>Total Deducted: {formatCurrency(activeP1ExtraDebt)}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {extraDebtCategoryDetails.map(cat => (
                              <div key={cat.name} className="flex flex-col text-[11px] px-2.5 py-1.5 bg-white rounded-xl border border-rose-200/60 shadow-2xs">
                                <span className="text-[#52212e] font-bold flex items-center gap-1">
                                  <span className="truncate">{cat.name}</span>
                                </span>
                                <div className="flex justify-between items-center text-[10px] text-[#8c6b73] mt-1 font-mono">
                                  <span>Plan: {formatCurrency(cat.perCheckBudget)}</span>
                                  <span className={cat.p1Spent > cat.perCheckBudget ? 'text-rose-600 font-bold' : 'text-[#1f242e]'}>
                                    Spent: {formatCurrency(cat.p1Spent)}
                                  </span>
                                </div>
                                {cat.name.toLowerCase().includes('other') && cat.p1Spent > 0 && (
                                  <div className="text-[9px] text-[#8c6b73] mt-0.5 italic">
                                    Itemized in outflows list below (tallied once in total)
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Itemized Unplanned Outflows (Rule 1) */}
                          <div className="pt-2 border-t border-rose-200/60">
                            <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase px-1 pb-1">
                              <span>Checking Ledger Outflows (Not in Fixed Bills)</span>
                              <span>{p1UnplannedTxs.length} Outflow{p1UnplannedTxs.length === 1 ? '' : 's'} (Strict Sum: {formatCurrency(actualP1ExtraDebt)})</span>
                            </div>
                            {p1UnplannedTxs.length === 0 ? (
                              <div className="text-[11px] text-[#8c6b73] italic py-1.5 text-center bg-white rounded-xl border border-rose-100">
                                No extra outflows or unplanned debits in this pay period
                              </div>
                            ) : (
                              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                {p1UnplannedTxs.map((item: any, idx: number) => (
                                  <div key={item.id || idx} className="flex justify-between items-center text-[11px] px-2.5 py-1 bg-white rounded-lg border border-rose-200/60 shadow-2xs">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 shrink-0">
                                        {item.date ? item.date.slice(5) : ''}
                                      </span>
                                      <span className="font-semibold text-[#1f242e] truncate">{item.description}</span>
                                      <span className="text-[9px] text-[#8c6b73] truncate">({item.reason})</span>
                                    </div>
                                    <span className="font-mono font-bold text-rose-600 shrink-0 ml-2">
                                      -{formatCurrency(item.amount)}
                                    </span>
                                  </div>
                                ))}
                                <div className="pt-1.5 mt-1 border-t border-rose-200/40 flex justify-between items-center text-[10px] font-bold text-[#7d3c4c]">
                                  <span>True Outflows Total (Single Sum, No Duplicates):</span>
                                  <span className="font-mono text-rose-700">-{formatCurrency(actualP1ExtraDebt)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P1: 6. Savings Assigned */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Savings Assigned</span>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isLiveActuals ? (
                            <span>Unexecuted</span>
                          ) : isFieldManual('p1_savings') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : (
                            <span>Monthly Budget</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isLiveActuals
                            ? (effectiveP1Savings > 0 ? `Unexecuted (${formatCurrency(effectiveP1Savings)} planned remains in cash)` : `No savings executed ($0.00)`)
                            : isFieldManual('p1_savings') ? `Custom (Budget: ${formatCurrency(dynamicP1Savings)})` : `Budget (${selectedMonth} ${selectedYear})`}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-emerald-700">
                      -{formatCurrency(activeP1Savings)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p1Step5 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p1Step5)}
                    </td>
                  </tr>

                  {/* P1: Transfer Out (Cash Drain) */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Transfer Out (Cash Drain)</span>
                        <button
                          type="button"
                          onClick={() => setShowP1TransfersOutLog(!showP1TransfersOutLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Toggle outbound transfers breakdown for Check 1"
                        >
                          <ArrowUpRight className="w-2.5 h-2.5 text-rose-600" />
                          <span>{p1TransfersOutItems.length} Out</span>
                          {showP1TransfersOutLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p1_transfers_out') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : (
                            <span>{p1TransfersOutItems.length > 0 ? `Checking Outflow (${p1TransfersOutItems.length} tx)` : 'Checking Outflow'}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isFieldManual('p1_transfers_out')
                            ? `Custom (Live: ${formatCurrency(dynamicP1TransfersOut)})`
                            : 'Outbound transfers sent from Checking (e.g. Checking to Savings)'}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rose-600">
                      -{formatCurrency(activeP1TransfersOut)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p1StepTransferOut < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p1StepTransferOut)}
                    </td>
                  </tr>

                  {/* P1: Expandable Transfers Out Breakdown */}
                  {showP1TransfersOutLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-rose-50/40 border-y border-rose-200/60 space-y-1.5 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-rose-900 uppercase px-1 pb-0.5">
                            <span>Check 1 Outbound Transfers (Sent from Checking)</span>
                            <span>Total Drain: -{formatCurrency(activeP1TransfersOut)}</span>
                          </div>
                          {p1TransfersOutItems.length === 0 ? (
                            <div className="text-[11px] text-[#8c6b73] italic py-1.5 text-center bg-white rounded-xl border border-rose-100">
                              No outbound transfers from Checking in this pay period
                            </div>
                          ) : (
                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {p1TransfersOutItems.map((item: any, idx: number) => (
                                <div key={item.id || idx} className="flex justify-between items-center text-[11px] px-2.5 py-1.5 bg-white rounded-lg border border-rose-200 shadow-2xs">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 shrink-0">
                                      {item.date ? item.date.slice(5) : ''}
                                    </span>
                                    <span className="font-semibold text-[#1f242e] truncate">{item.description}</span>
                                    <span className="text-[10px] text-[#8c6b73] truncate">To: <strong className="text-rose-800">{item.destination || 'Other Account'}</strong></span>
                                  </div>
                                  <span className="font-mono font-bold text-rose-600 shrink-0 ml-2">
                                    -{formatCurrency(item.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P1: Subtotal & Rollover */}
                  <tr className="bg-slate-50/90 border-t-2 border-slate-200 font-bold">
                    <td className="py-3 px-4 text-slate-800 font-cute">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs">Check 1 Total Obligations</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs text-slate-500 font-medium">
                        {isLiveActuals ? 'Live checking cash flow' : 'Worst-case plan'}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-rose-600 font-extrabold text-right text-xs">
                      -{formatCurrency(activeP1TotalObligations, { absolute: true })}
                    </td>
                    <td className="py-3 px-4 font-mono font-black text-right text-base border-l border-slate-200/80 bg-slate-100/90">
                      <span className={activeP1RolloverNext < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                        {formatSignedCurrency(activeP1RolloverNext)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* WATERFALL CASCADE CONNECTOR BANNER */}
          <div className="bg-gradient-to-r from-rose-100 via-[#faedf1] to-purple-50/60 py-2.5 px-5 border-b border-[#ebd0d9] flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <div className="flex items-center gap-2 text-[#7d3c4c] font-cute font-bold">
              <span className="text-base text-[#e11d48]">↓</span>
              <span>Paycheck 1 Remainder Cascades Directly into Paycheck 2 Below</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] self-start sm:self-auto">
              <span className="text-[#8c6b73]">Starting Check 2 with:</span>
              <span className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg border shadow-2xs ${
                activeP2Rollover < 0
                  ? 'text-rose-600 bg-rose-50 border-rose-200'
                  : 'text-emerald-700 bg-white border-emerald-200'
              }`}>
                {formatSignedCurrency(activeP2Rollover)}
              </span>
              {isLiveActuals && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                  activeP2Rollover < 0
                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                }`}>
                  (Live Checking Cash)
                </span>
              )}
            </div>
          </div>

          {/* SECTION 2: PAYCHECK 2 (16th - 31st) - UNDERNEATH PAYCHECK 1 */}
          <div className="border-b border-[#ebd0d9]">
            <div className="bg-gradient-to-r from-purple-100/60 via-rose-50 to-white px-5 py-3 border-b border-[#ebd0d9] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div>
                  <h4 className="font-extrabold text-sm text-[#1f242e] font-cute flex items-center gap-2 flex-wrap">
                    Paycheck 2 ({effectiveP2Period})
                    <span className="text-[10px] font-semibold text-purple-800 bg-white px-2 py-0.5 rounded-md border border-purple-200 shadow-2xs">
                      Paid {scheduledP2PayDate} {clearedP2Tx ? '(Cleared Deposit)' : '(15th of Month)'} • Covers Bills {effectiveP2BillStart}{getOrdinalSuffix(effectiveP2BillStart).slice(-2)}–{effectiveP2BillEnd}{getOrdinalSuffix(effectiveP2BillEnd).slice(-2)}
                    </span>
                  </h4>
                  <p className="text-[11px] text-[#8c6b73]">Mid-month inflow, late bills, safety buffer &amp; final leftover cash</p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[11px] text-[#7d3c4c] font-semibold">Check 2 Inflow:</span>
                <span className="font-mono font-extrabold text-xs text-emerald-700 bg-white px-2.5 py-1 rounded-xl border border-emerald-200 shadow-2xs">
                  +{formatCurrency(effectiveP2Income)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#fdf6f8]/70 border-b border-[#ebd0d9] text-[#52212e] font-cute text-[11px]">
                    <th className="py-2.5 px-4 font-extrabold w-2/5">Obligation / Flow Item</th>
                    <th className="py-2.5 px-4 font-extrabold w-1/4">Details / Source</th>
                    <th className="py-2.5 px-4 font-extrabold w-1/6 text-right">Assigned Amount</th>
                    <th className="py-2.5 px-4 font-bold w-1/6 text-right uppercase tracking-wider text-[10px] text-slate-700 bg-slate-100/80 border-l border-slate-200/80">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f5ebed]">
                  {/* P2: 1. Starting Rollover Balance (from P1) */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Rollover from Paycheck 1</span>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p2_rollover') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : isLiveActuals && clearedP2Tx ? (
                            <span>Pre-Deposit Balance Snapshot</span>
                          ) : (
                            <span>Carried forward from Check 1</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isLiveActuals && clearedP2Tx
                            ? `Checking balance right before deposit on ${scheduledP2PayDate}`
                            : `Rollover balance from ${effectiveP1Period} period`}
                        </div>
                      </div>
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-right ${activeP2Rollover < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {formatSignedCurrency(activeP2Rollover)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p2Step0 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p2Step0)}
                    </td>
                  </tr>

                  {/* P2: 2. Paycheck Inflow */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[#1f242e]">Paycheck 2 Inflow (Income)</span>
                          <button
                            type="button"
                            onClick={handleStartEdit}
                            className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                            title="Edit manually"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Pay Date: {scheduledP2PayDate} {clearedP2Tx ? '(Cleared Deposit)' : '(15th Inflow)'}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p2_income') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : isLiveActuals ? (
                            <span>{activeP2Income > 0 ? 'Cleared Inflow' : 'Pending Deposit'}</span>
                          ) : (
                            <span>{clearedP2Tx ? 'Cleared Inflow' : '15th Inflow'}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isFieldManual('p2_income')
                            ? `Custom (Live: ${formatCurrency(dynamicP2Income)})`
                            : isLiveActuals
                              ? (clearedP2Tx ? `Cleared Deposit on ${scheduledP2PayDate}` : activeP2Income > 0 ? `Checking Ledger (${p2Txs.length} tx)` : 'Not yet deposited (+$0.00 cleared)')
                              : (clearedP2Tx ? `Cleared Deposit on ${scheduledP2PayDate}` : p2Txs.length > 0 ? `Checking Ledger (${p2Txs.length} tx)` : 'Checking Ledger')}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-emerald-600">
                      +{formatCurrency(activeP2Income)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p2Step1 < 0 ? 'text-rose-600' : 'text-emerald-700'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p2Step1)}
                    </td>
                  </tr>

                  {/* P2: Transfer In (Cash Infusion) */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Transfer In (Cash Infusion)</span>
                        <button
                          type="button"
                          onClick={() => setShowP2TransfersInLog(!showP2TransfersInLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Toggle inbound transfers breakdown for Check 2"
                        >
                          <ArrowDownLeft className="w-2.5 h-2.5 text-emerald-600" />
                          <span>{p2TransfersInItems.length} In</span>
                          {showP2TransfersInLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p2_transfers_in') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : (
                            <span>{p2TransfersInItems.length > 0 ? `Checking Deposit (${p2TransfersInItems.length} tx)` : 'Checking Deposit'}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isFieldManual('p2_transfers_in')
                            ? `Custom (Live: ${formatCurrency(dynamicP2TransfersIn)})`
                            : 'Inbound transfers into Checking (e.g. Savings to Checking)'}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-emerald-600">
                      +{formatCurrency(activeP2TransfersIn)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p2StepTransferIn < 0 ? 'text-rose-600' : 'text-emerald-700'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p2StepTransferIn)}
                    </td>
                  </tr>

                  {/* P2: Expandable Transfers In Breakdown */}
                  {showP2TransfersInLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-emerald-50/40 border-y border-emerald-200/60 space-y-1.5 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-emerald-900 uppercase px-1 pb-0.5">
                            <span>Check 2 Inbound Transfers (Deposited to Checking)</span>
                            <span>Total Infusion: +{formatCurrency(activeP2TransfersIn)}</span>
                          </div>
                          {p2TransfersInItems.length === 0 ? (
                            <div className="text-[11px] text-[#8c6b73] italic py-1.5 text-center bg-white rounded-xl border border-emerald-100">
                              No inbound transfers into Checking in this pay period
                            </div>
                          ) : (
                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {p2TransfersInItems.map((item: any, idx: number) => (
                                <div key={item.id || idx} className="flex justify-between items-center text-[11px] px-2.5 py-1.5 bg-white rounded-lg border border-emerald-200 shadow-2xs">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 shrink-0">
                                      {item.date ? item.date.slice(5) : ''}
                                    </span>
                                    <span className="font-semibold text-[#1f242e] truncate">{item.description}</span>
                                    <span className="text-[10px] text-[#8c6b73] truncate">From: <strong className="text-emerald-800">{item.source || 'Other Account'}</strong></span>
                                  </div>
                                  <span className="font-mono font-bold text-emerald-700 shrink-0 ml-2">
                                    +{formatCurrency(item.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P2: 3. Fixed Bills Assigned */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Fixed Bills Assigned</span>
                        <button
                          type="button"
                          onClick={() => setShowP2BillsLog(!showP2BillsLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Toggle bill breakdown for Check 2"
                        >
                          <Receipt className="w-2.5 h-2.5" />
                          <span>{p2AllBills.length} bills ({p2PaidBills.length} paid)</span>
                          {showP2BillsLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p2_fixed_bills') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : isLiveActuals ? (
                            <span>Cleared Bills Only</span>
                          ) : (
                            <span>Check 2 Bills</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isFieldManual('p2_fixed_bills')
                            ? `Custom (Card: ${formatCurrency(p2TotalFixedBills)})`
                            : isLiveActuals
                              ? `${p2PaidBills.length} paid (${formatCurrency(clearedP2FixedBills)}) • ${p2UnpaidBills.length} unpaid pending (${formatCurrency(p2UnpaidTotal)} in cash)`
                              : `${p2PaidBills.length} paid • ${p2UnpaidBills.length} unpaid`}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rose-600">
                      -{formatCurrency(activeP2FixedBills)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p2Step2 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p2Step2)}
                    </td>
                  </tr>

                  {/* P2: Expandable Bills Breakdown */}
                  {showP2BillsLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-[#fdf6f8]/70 border-y border-[#ebd0d9] space-y-1 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase px-1 pb-1">
                            <span>Check 2 Bills: {p2AllBills.length} total</span>
                            <span>{isLiveActuals ? `Total Cleared: ${formatCurrency(activeP2FixedBills)} (${formatCurrency(p2TotalFixedBills)} planned)` : `Total Assigned: ${formatCurrency(p2TotalFixedBills)}`}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                            {p2AllBills.map(b => {
                              const isPaid = Number(b[activeMonthKey] || 0) === 1;
                              return (
                                <div key={b.id} className="flex justify-between items-center text-[11px] px-2.5 py-1 bg-white rounded-lg border border-rose-200/60 shadow-2xs">
                                  <span className="text-[#52212e] truncate font-medium flex items-center gap-1.5">
                                    <span className="text-[10px] text-rose-600 font-bold">Due {b.due_day}th:</span>
                                    <span className="truncate">{b.name}</span>
                                    <span className={`text-[8px] px-1 py-0.2 rounded font-semibold ${
                                      isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'
                                    }`}>
                                      {isPaid ? 'Paid' : 'Unpaid'}
                                    </span>
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                    <span className="font-mono font-bold text-[#1f242e]">
                                      {formatCurrency(b.amount)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleReassignBill(b, '1st Paycheck')}
                                      title="Move to Check 1"
                                      className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-[#7d3c4c] border border-rose-200 font-semibold cursor-pointer transition-colors"
                                    >
                                      ← Check 1
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P2: 4. Lifestyle Budget Assigned */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#1f242e]">Lifestyle Budget Assigned</span>
                        <button
                          type="button"
                          onClick={() => setShowP2LifestyleLog(!showP2LifestyleLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs ml-1"
                          title="Toggle 5 categories breakdown"
                        >
                          <span>5 Categories</span>
                          {showP2LifestyleLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p2_lifestyle') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : isLiveActuals ? (
                            <span>Cleared Spend</span>
                          ) : actualP2Lifestyle > plannedP2Lifestyle ? (
                            <span className="text-rose-600 font-semibold">Live Spending Overage</span>
                          ) : (
                            <span>5 Categories Planned</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isFieldManual('p2_lifestyle')
                            ? `Custom (Card: ${formatCurrency(plannedP2Lifestyle)})`
                            : isLiveActuals
                              ? `Spent ${formatCurrency(actualP2Lifestyle)} from checking • ${formatCurrency(Math.max(0, plannedP2Lifestyle - actualP2Lifestyle))} unspent in cash`
                              : actualP2Lifestyle > plannedP2Lifestyle
                                ? `Spent ${formatCurrency(actualP2Lifestyle)} (exceeds planned ${formatCurrency(plannedP2Lifestyle)})`
                                : `Planned ${formatCurrency(plannedP2Lifestyle)} • Spent ${formatCurrency(actualP2Lifestyle)}`}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rose-600">
                      -{formatCurrency(activeP2Lifestyle)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p2Step3 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p2Step3)}
                    </td>
                  </tr>

                  {/* P2: Expandable Lifestyle Umbrella Breakdown */}
                  {showP2LifestyleLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-[#fdf6f8]/70 border-y border-[#ebd0d9] space-y-1.5 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase px-1 pb-0.5">
                            <span>Umbrella Categories (16th - 31st): Groceries, Gas, Entertainment, Takeout, Chicken Feed</span>
                            <span>Combined Deducted: {formatCurrency(activeP2Lifestyle)}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                            {umbrellaCategoryDetails.map(cat => (
                              <div key={cat.name} className="flex flex-col text-[11px] px-2.5 py-1.5 bg-white rounded-xl border border-rose-200/60 shadow-2xs">
                                <span className="text-[#52212e] font-bold flex items-center gap-1">
                                  <span className="truncate">{cat.name}</span>
                                </span>
                                <div className="flex justify-between items-center text-[10px] text-[#8c6b73] mt-1 font-mono">
                                  <span>Plan: {formatCurrency(cat.perCheckBudget)}</span>
                                  <span className={cat.p2Spent > cat.perCheckBudget ? 'text-rose-600 font-bold' : 'text-[#1f242e]'}>
                                    Spent: {formatCurrency(cat.p2Spent)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P2: 5. Unplanned Outflows / Extra Debt Paid */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#1f242e]">Unplanned Outflows / Extra Debt Paid</span>
                        <button
                          type="button"
                          onClick={() => setShowP2ExtraDebtLog(!showP2ExtraDebtLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs ml-1"
                          title="Toggle unplanned outflows & extra payments breakdown"
                        >
                          <span>Breakdown ({p2UnplannedTxs.length})</span>
                          {showP2ExtraDebtLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {manualFields.includes('p2_extra_debt') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : isLiveActuals ? (
                            <span>Cleared Outflows (-{formatCurrency(activeP2ExtraDebt)})</span>
                          ) : actualP2ExtraDebt > plannedP2ExtraDebt ? (
                            <span className="text-rose-600 font-semibold">Live Spending Overage</span>
                          ) : (
                            <span>Monthly Plan (Extra Debt)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {manualFields.includes('p2_extra_debt')
                            ? `Custom (Card: ${formatCurrency(plannedP2ExtraDebt)})`
                            : isLiveActuals
                              ? (p2UnplannedTxs.length > 0
                                  ? `Spent ${formatCurrency(actualP2ExtraDebt)} from checking (${p2UnplannedTxs.map((t: any) => `${t.description} ${formatCurrency(t.amount)}`).join(' + ')})`
                                  : `Spent $0.00 from checking (0 unplanned outflows)`)
                              : actualP2ExtraDebt > plannedP2ExtraDebt
                                ? `Spent ${formatCurrency(actualP2ExtraDebt)} (exceeds planned ${formatCurrency(plannedP2ExtraDebt)})`
                                : `Planned ${formatCurrency(plannedP2ExtraDebt)} • Spent ${formatCurrency(actualP2ExtraDebt)}`}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rose-600">
                      -{formatCurrency(activeP2ExtraDebt)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p2Step4 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p2Step4)}
                    </td>
                  </tr>

                  {/* P2: Expandable Unplanned Outflows Breakdown */}
                  {showP2ExtraDebtLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-[#fdf6f8]/70 border-y border-[#ebd0d9] space-y-2 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase px-1 pb-0.5">
                            <span>Planner Budget: Extra Payment &amp; Other/Misc ({formatCurrency(plannedP2ExtraDebt)})</span>
                            <span>Total Deducted: {formatCurrency(activeP2ExtraDebt)}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {extraDebtCategoryDetails.map(cat => (
                              <div key={cat.name} className="flex flex-col text-[11px] px-2.5 py-1.5 bg-white rounded-xl border border-rose-200/60 shadow-2xs">
                                <span className="text-[#52212e] font-bold flex items-center gap-1">
                                  <span className="truncate">{cat.name}</span>
                                </span>
                                <div className="flex justify-between items-center text-[10px] text-[#8c6b73] mt-1 font-mono">
                                  <span>Plan: {formatCurrency(cat.perCheckBudget)}</span>
                                  <span className={cat.p2Spent > cat.perCheckBudget ? 'text-rose-600 font-bold' : 'text-[#1f242e]'}>
                                    Spent: {formatCurrency(cat.p2Spent)}
                                  </span>
                                </div>
                                {cat.name.toLowerCase().includes('other') && cat.p2Spent > 0 && (
                                  <div className="text-[9px] text-[#8c6b73] mt-0.5 italic">
                                    Itemized in outflows list below (tallied once in total)
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Itemized Unplanned Outflows (Rule 1) */}
                          <div className="pt-2 border-t border-rose-200/60">
                            <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase px-1 pb-1">
                              <span>Checking Ledger Outflows (Not in Fixed Bills)</span>
                              <span>{p2UnplannedTxs.length} Outflow{p2UnplannedTxs.length === 1 ? '' : 's'} (Strict Sum: {formatCurrency(actualP2ExtraDebt)})</span>
                            </div>
                            {p2UnplannedTxs.length === 0 ? (
                              <div className="text-[11px] text-[#8c6b73] italic py-1.5 text-center bg-white rounded-xl border border-rose-100">
                                No extra outflows or unplanned debits in this pay period
                              </div>
                            ) : (
                              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                {p2UnplannedTxs.map((item: any, idx: number) => (
                                  <div key={item.id || idx} className="flex justify-between items-center text-[11px] px-2.5 py-1 bg-white rounded-lg border border-rose-200/60 shadow-2xs">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 shrink-0">
                                        {item.date ? item.date.slice(5) : ''}
                                      </span>
                                      <span className="font-semibold text-[#1f242e] truncate">{item.description}</span>
                                      <span className="text-[9px] text-[#8c6b73] truncate">({item.reason})</span>
                                    </div>
                                    <span className="font-mono font-bold text-rose-600 shrink-0 ml-2">
                                      -{formatCurrency(item.amount)}
                                    </span>
                                  </div>
                                ))}
                                <div className="pt-1.5 mt-1 border-t border-rose-200/40 flex justify-between items-center text-[10px] font-bold text-[#7d3c4c]">
                                  <span>True Outflows Total (Single Sum, No Duplicates):</span>
                                  <span className="font-mono text-rose-700">-{formatCurrency(actualP2ExtraDebt)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P2: 6. Sinking Funds Assigned */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Sinking Funds Assigned</span>
                        <button
                          type="button"
                          onClick={() => setShowP2SinkingLog(!showP2SinkingLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Toggle Sinking Funds targets & transfers breakdown"
                        >
                          <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                          <span>{p2SinkingTransfers.length > 0 ? `${p2SinkingTransfers.length} Transfer${p2SinkingTransfers.length === 1 ? '' : 's'}` : 'Targets'}</span>
                          {showP2SinkingLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {manualFields.includes('p2_savings') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : p2SinkingTransfersTotal > 0 ? (
                            <span className={p2SinkingTransfersTotal >= effectiveP2Savings ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                              {p2SinkingTransfersTotal >= effectiveP2Savings ? 'Transfer Cleared' : 'Partial Transfer'}
                            </span>
                          ) : isLiveActuals ? (
                            <span>Unexecuted ($0.00)</span>
                          ) : (
                            <span>Sinking Funds Target</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isLiveActuals
                            ? (activeP2Savings > 0 
                                ? `Transferred ${formatCurrency(activeP2Savings)} to savings (Checking → Savings on 15th)` 
                                : `Unexecuted (${formatCurrency(effectiveP2Savings)} planned remains in checking cash)`)
                            : (sinkingTargetBreakdown.length > 0
                                ? `Consolidated Periodic Reserves (${sinkingTargetBreakdown.map(s => s.name).join(' + ')})`
                                : 'Consolidated Periodic Reserves')}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-emerald-700">
                      -{formatCurrency(activeP2Savings)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p2Step5 < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p2Step5)}
                    </td>
                  </tr>

                  {/* P2: Expandable Sinking Funds Breakdown */}
                  {showP2SinkingLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-emerald-50/40 border-y border-emerald-200/60 space-y-2 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-emerald-900 uppercase px-1 pb-0.5">
                            <span>Sinking Funds Targets (Auto-Synced from Sinking Funds Tab)</span>
                            <span>Monthly Target: {formatCurrency(effectiveP2Savings)}</span>
                          </div>

                          {/* Sinking Targets Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {sinkingTargetBreakdown.map((target) => (
                              <div key={target.id} className="flex flex-col text-[11px] px-2.5 py-1.5 bg-white rounded-xl border border-emerald-200/60 shadow-2xs">
                                <span className="text-[#52212e] font-bold flex items-center gap-1 truncate" title={target.name}>
                                  <span className="truncate">{target.name}</span>
                                </span>
                                <div className="flex justify-between items-center text-[10px] text-[#8c6b73] mt-1 font-mono">
                                  <span>Target: {formatCurrency(target.yearlyTarget)} / yr</span>
                                  <span className="text-emerald-700 font-bold">{formatCurrency(target.monthlyReserve)}/mo reserve</span>
                                </div>
                                {target.details && (
                                  <div className="text-[9px] text-[#a07c84] truncate mt-0.5">
                                    {target.details}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Executed Checking-to-Savings Transfers */}
                          <div className="pt-2 border-t border-emerald-200/60">
                            <div className="flex items-center justify-between text-[10px] font-bold text-emerald-900 uppercase px-1 pb-1">
                              <span>Executed Checking → Savings Transfers (Mid-Month Transfer)</span>
                              <span className="font-mono">{p2SinkingTransfersItems.length} Transfer{p2SinkingTransfersItems.length === 1 ? '' : 's'} ({formatCurrency(p2SinkingTransfersTotal)})</span>
                            </div>
                            {p2SinkingTransfersItems.length === 0 ? (
                              <div className="text-[11px] text-[#8c6b73] italic py-1.5 text-center bg-white rounded-xl border border-emerald-100">
                                Scheduled checking-to-savings transfer on the 15th has not executed yet
                              </div>
                            ) : (
                              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                {p2SinkingTransfersItems.map((item: any, idx: number) => (
                                  <div key={item.id || idx} className="flex justify-between items-center text-[11px] px-2.5 py-1 bg-white rounded-lg border border-emerald-200/60 shadow-2xs">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 shrink-0">
                                        {item.date ? item.date.slice(5) : ''}
                                      </span>
                                      <span className="font-semibold text-[#1f242e] truncate">{item.description}</span>
                                      <span className="text-[9px] text-[#8c6b73] truncate">({item.source} → {item.destination})</span>
                                    </div>
                                    <span className="font-mono font-bold text-emerald-700 shrink-0 ml-2">
                                      -{formatCurrency(item.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P2: 7. Checking Safety Buffer */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Checking Safety Buffer</span>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p2_checking_buffer') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : isLiveActuals ? (
                            <span>Undeducted Cash</span>
                          ) : (
                            <span>Safety Cushion</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isLiveActuals
                            ? 'Buffer stays in physical cash (-$0.00 deducted)'
                            : 'Floor balance kept in physical account'}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-purple-700">
                      -{formatCurrency(activeP2Buffer)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p2Step6 < 0 ? 'text-rose-600' : 'text-purple-700'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p2Step6)}
                    </td>
                  </tr>

                  {/* P2: Transfer Out (Cash Drain) */}
                  <tr className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#52212e]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1f242e]">Transfer Out (Cash Drain)</span>
                        <button
                          type="button"
                          onClick={() => setShowP2TransfersOutLog(!showP2TransfersOutLog)}
                          className="text-[10px] font-sans font-medium text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-md border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Toggle outbound transfers breakdown for Check 2"
                        >
                          <ArrowUpRight className="w-2.5 h-2.5 text-rose-600" />
                          <span>{p2TransfersOutItems.length} Out</span>
                          {showP2TransfersOutLog ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100 flex items-center gap-0.5 ml-1"
                          title="Edit manually"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-slate-700">
                          {isFieldManual('p2_transfers_out') ? (
                            <span className="text-amber-700 font-semibold">Manual override</span>
                          ) : (
                            <span>{p2TransfersOutItems.length > 0 ? `Checking Outflow (${p2TransfersOutItems.length} tx)` : 'Checking Outflow'}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {isFieldManual('p2_transfers_out')
                            ? `Custom (Live: ${formatCurrency(dynamicP2TransfersOut)})`
                            : 'Outbound transfers sent from Checking (e.g. Checking to Savings)'}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rose-600">
                      -{formatCurrency(activeP2TransfersOut)}
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold text-sm tracking-tight text-right ${p2StepTransferOut < 0 ? 'text-rose-600' : 'text-slate-900'} bg-slate-50/80 border-l border-slate-200/60`}>
                      {formatCurrency(p2StepTransferOut)}
                    </td>
                  </tr>

                  {/* P2: Expandable Transfers Out Breakdown */}
                  {showP2TransfersOutLog && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <div className="p-3 bg-rose-50/40 border-y border-rose-200/60 space-y-1.5 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[10px] font-bold text-rose-900 uppercase px-1 pb-0.5">
                            <span>Check 2 Outbound Transfers (Sent from Checking)</span>
                            <span>Total Drain: -{formatCurrency(activeP2TransfersOut)}</span>
                          </div>
                          {p2TransfersOutItems.length === 0 ? (
                            <div className="text-[11px] text-[#8c6b73] italic py-1.5 text-center bg-white rounded-xl border border-rose-100">
                              No outbound transfers from Checking in this pay period
                            </div>
                          ) : (
                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {p2TransfersOutItems.map((item: any, idx: number) => (
                                <div key={item.id || idx} className="flex justify-between items-center text-[11px] px-2.5 py-1 bg-white rounded-lg border border-rose-200 shadow-2xs">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 shrink-0">
                                      {item.date ? item.date.slice(5) : ''}
                                    </span>
                                    <span className="font-semibold text-[#1f242e] truncate">{item.description}</span>
                                    <span className="text-[10px] text-[#8c6b73] truncate">To: <strong className="text-rose-800">{item.destination || 'Other Account'}</strong></span>
                                  </div>
                                  <span className="font-mono font-bold text-rose-600 shrink-0 ml-2">
                                    -{formatCurrency(item.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* P2: Subtotal & Final Free Cash */}
                  <tr className="bg-emerald-50/70 border-t-2 border-emerald-200 font-bold">
                    <td className="py-3 px-4 text-emerald-900 font-cute">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs">Check 2 Total Obligations</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs text-emerald-800/80 font-medium">
                        {isLiveActuals ? 'Live checking cash flow' : 'Worst-case plan'}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-rose-600 font-extrabold text-right text-xs">
                      -{formatCurrency(activeP2TotalObligations, { absolute: true })}
                    </td>
                    <td className="py-3 px-4 font-mono font-black text-right text-base border-l border-emerald-200/80 bg-emerald-100/70">
                      <span className={activeP2Leftover < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                        {formatSignedCurrency(activeP2Leftover)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* CORE VIEW 2: Traditional Two Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Paycheck 1 */}
          <div className="bg-white rounded-3xl p-6 border border-[#e4e0e2] shadow-kawaii space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center pb-3 border-b border-[#e4e0e2]">
                <div>
                  <h3 className="text-base font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
                    Paycheck 1 ({effectiveP1Period})
                  </h3>
                  <span className="text-xs text-rose-500 font-medium">Paid {scheduledP1PayDate} (Last Day of Prior Month) • Funds {effectiveP1BillStart}{getOrdinalSuffix(effectiveP1BillStart).slice(-2)}–{effectiveP1BillEnd}{getOrdinalSuffix(effectiveP1BillEnd).slice(-2)}</span>
                </div>
                <div className="text-right font-mono font-extrabold text-[#1f242e] text-lg flex items-center justify-end gap-1.5">
                  {isP1PaidPriorToMonth ? (
                    <div className="flex flex-col items-end">
                      <span className="text-gray-500 text-sm font-bold">+$0.00</span>
                      <span className="text-[10px] font-sans font-semibold text-rose-600">in rollover ({formatCurrency(effectiveP1Income)})</span>
                    </div>
                  ) : (
                    <span>+{formatCurrency(effectiveP1Income)}</span>
                  )}
                  {isFieldManual('p1_income') && (
                    <span className="text-[9px] font-sans font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                      Manual
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 text-xs font-medium mt-4">
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Starting Rollover Balance:</span>
                    {isFieldManual('p1_rollover') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200" title="Pulled directly from ending ledger balance of previous month">
                        Checking Ledger ({prevMonth} {lastDayOfPrevMonth})
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[#1f242e]">{formatCurrency(effectiveP1Rollover)}</span>
                    {!isFieldManual('p1_rollover') && (
                      <div className="text-[9px] text-[#8c6b73]">
                        Ending balance as of {prevMonth} {lastDayOfPrevMonth}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Paycheck Inflow:</span>
                    {isP1PaidPriorToMonth ? (
                      <span className="text-[10px] font-medium text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                        Included in Rollover ({formatCurrency(effectiveP1Income)})
                      </span>
                    ) : (
                      <>
                        {isFieldManual('p1_income') ? (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            Manual
                          </span>
                        ) : (
                          p1Txs.length > 0 && (
                            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              Checking
                            </span>
                          )
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="text-right">
                    {isP1PaidPriorToMonth ? (
                      <div>
                        <span className="font-mono font-bold text-gray-400">+$0.00</span>
                        <div className="text-[9px] text-[#8c6b73]">(in rollover)</div>
                      </div>
                    ) : (
                      <span className="font-mono font-bold text-emerald-600">+{formatCurrency(effectiveP1Income)}</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Transfer In (Cash Infusion):</span>
                    {isFieldManual('p1_transfers_in') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : (
                      p1TransfersInItems.length > 0 && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                          <ArrowDownLeft className="w-2.5 h-2.5" />
                          <span>{p1TransfersInItems.length} In</span>
                        </span>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => setShowP1TransfersInLog(!showP1TransfersInLog)}
                      className="text-[10px] font-bold text-[#7d3c4c] hover:underline cursor-pointer opacity-75 hover:opacity-100"
                      title="Toggle inbound transfers breakdown"
                    >
                      {showP1TransfersInLog ? 'Hide' : `Breakdown (${p1TransfersInItems.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-emerald-600">+{formatCurrency(activeP1TransfersIn)}</span>
                </div>

                {showP1TransfersInLog && (
                  <div className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200/70 space-y-1.5 animate-in fade-in duration-150">
                    <div className="text-[10px] font-bold text-emerald-900 uppercase pb-0.5 flex justify-between">
                      <span>Inbound Transfers (Deposited to Checking)</span>
                      <span>Total: +{formatCurrency(activeP1TransfersIn)}</span>
                    </div>
                    {p1TransfersInItems.length === 0 ? (
                      <div className="text-[10px] text-[#8c6b73] italic py-1 text-center bg-white rounded border border-emerald-100">
                        No inbound transfers into Checking
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                        {p1TransfersInItems.map((item: any, idx: number) => (
                          <div key={item.id || idx} className="flex justify-between items-center text-[10px] px-2 py-1 bg-white rounded border border-emerald-100">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-bold text-emerald-700 shrink-0">{item.date ? item.date.slice(5) : ''}</span>
                              <span className="truncate text-[#1f242e] font-medium">{item.description}</span>
                              <span className="text-[9px] text-[#8c6b73] truncate">From: {item.source}</span>
                            </div>
                            <span className="font-mono font-bold text-emerald-700 shrink-0 ml-1">+{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Fixed Bills Assigned ({selectedMonth}):</span>
                    {isFieldManual('p1_fixed_bills') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : isLiveActuals ? (
                      <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Cleared Only
                      </span>
                    ) : null}
                    <button
                      onClick={() => setShowP1BillsModal(!showP1BillsModal)}
                      className="text-[10px] font-sans font-bold text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-full border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      title="Toggle breakdown of Check 1 bills"
                    >
                      <Receipt className="w-2.5 h-2.5" />
                      <span>{p1AllBills.length} bills ({p1PaidBills.length} paid)</span>
                      {showP1BillsModal ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-rose-600">-{formatCurrency(activeP1FixedBills)}</span>
                </div>

                {/* Optional Expandable List of P1 Bills */}
                {showP1BillsModal && (
                  <div className="p-2.5 bg-[#fdf6f8]/70 rounded-xl border border-[#ebd0d9] space-y-1.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase">
                      <span>Check 1 Bills ({selectedMonth}): {p1AllBills.length} total</span>
                      <span>{isLiveActuals ? `Total Cleared: ${formatCurrency(activeP1FixedBills)} (${formatCurrency(p1TotalFixedBills)} planned)` : `Total Assigned: ${formatCurrency(p1TotalFixedBills)}`}</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {p1AllBills.map(b => {
                        const isPaid = Number(b[activeMonthKey] || 0) === 1;
                        return (
                          <div key={b.id} className="flex justify-between items-center text-[11px] px-2 py-1 bg-white rounded-lg border border-rose-200/60">
                            <span className="text-[#52212e] truncate font-medium flex items-center gap-1.5">
                              <span className="text-[10px] text-rose-600 font-bold">Due {b.due_day}th:</span>
                              <span className="truncate">{b.name}</span>
                              <span className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                                isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'
                              }`}>
                                {isPaid ? 'Paid' : 'Unpaid'}
                              </span>
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0 ml-1">
                              <span className="font-mono font-bold text-[#1f242e]">
                                {formatCurrency(b.amount)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleReassignBill(b, '2nd Paycheck')}
                                title="Move to Check 2"
                                className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-[#7d3c4c] border border-rose-200 font-semibold cursor-pointer transition-colors"
                              >
                                → Check 2
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[#52212e]">Lifestyle Budget Assigned:</span>
                    {isFieldManual('p1_lifestyle') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : isLiveActuals ? (
                      <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Cleared Only
                      </span>
                    ) : actualP1Lifestyle > plannedP1Lifestyle ? (
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        Live Overage
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-700 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200">
                        5 Categories
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowP1LifestyleLog(!showP1LifestyleLog)}
                      className="text-[10px] font-bold text-[#7d3c4c] hover:underline cursor-pointer opacity-75 hover:opacity-100"
                      title="Toggle umbrella breakdown"
                    >
                      {showP1LifestyleLog ? 'Hide' : 'Breakdown'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-rose-600">-{formatCurrency(activeP1Lifestyle)}</span>
                    <div className="text-[9px] text-[#8c6b73]">
                      {isLiveActuals
                        ? `Spent ${formatCurrency(actualP1Lifestyle)} • ${formatCurrency(Math.max(0, plannedP1Lifestyle - actualP1Lifestyle))} unspent in cash`
                        : `Spent: ${formatCurrency(actualP1Lifestyle)}`}
                    </div>
                  </div>
                </div>

                {showP1LifestyleLog && (
                  <div className="p-2.5 bg-[#fdf6f8] rounded-xl border border-rose-200/60 space-y-1 animate-in fade-in duration-150">
                    <div className="text-[10px] font-bold text-[#7d3c4c] uppercase pb-0.5 flex justify-between">
                      <span>Umbrella Pools (1st - 15th):</span>
                      <span>{isLiveActuals ? `Deducted: ${formatCurrency(activeP1Lifestyle)} (Plan: ${formatCurrency(plannedP1Lifestyle)})` : `Plan: ${formatCurrency(plannedP1Lifestyle)}`}</span>
                    </div>
                    <div className="space-y-1">
                      {umbrellaCategoryDetails.map(cat => (
                        <div key={cat.name} className="flex justify-between items-center text-[11px] px-2 py-0.5 bg-white rounded border border-rose-100 font-mono">
                          <span className="text-[#52212e] font-sans font-medium flex items-center gap-1">
                            <span>{cat.name}</span>
                          </span>
                          <span className="text-[10px] text-[#8c6b73]">
                            Plan {formatCurrency(cat.perCheckBudget)} • <span className={cat.p1Spent > cat.perCheckBudget ? 'text-rose-600 font-bold' : ''}>Spent {formatCurrency(cat.p1Spent)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[#52212e]">Unplanned Outflows / Extra Debt Paid:</span>
                    {isLiveActuals ? (
                      <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Cleared Outflows (-{formatCurrency(activeP1ExtraDebt)})
                      </span>
                    ) : manualFields.includes('p1_extra_debt') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : actualP1ExtraDebt > plannedP1ExtraDebt ? (
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        Live Overage
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-700 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200">
                        2 Categories
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowP1ExtraDebtLog(!showP1ExtraDebtLog)}
                      className="text-[10px] font-bold text-[#7d3c4c] hover:underline cursor-pointer opacity-75 hover:opacity-100"
                      title="Toggle unplanned outflows breakdown"
                    >
                      {showP1ExtraDebtLog ? 'Hide' : `Breakdown (${p1UnplannedTxs.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-rose-600">-{formatCurrency(activeP1ExtraDebt)}</span>
                    <div className="text-[9px] text-[#8c6b73]">
                      Spent: {formatCurrency(actualP1ExtraDebt)}
                    </div>
                  </div>
                </div>

                {showP1ExtraDebtLog && (
                  <div className="p-2.5 bg-[#fdf6f8] rounded-xl border border-rose-200/60 space-y-2 animate-in fade-in duration-150">
                    <div className="text-[10px] font-bold text-[#7d3c4c] uppercase pb-0.5 flex justify-between">
                      <span>Planner Budget: Extra Payment &amp; Other/Misc</span>
                      <span>{isLiveActuals ? `Deducted: ${formatCurrency(activeP1ExtraDebt)} (Plan: ${formatCurrency(plannedP1ExtraDebt)})` : `Plan: ${formatCurrency(plannedP1ExtraDebt)}`}</span>
                    </div>
                    <div className="space-y-1">
                      {extraDebtCategoryDetails.map(cat => (
                        <div key={cat.name} className="flex flex-col text-[11px] px-2 py-1 bg-white rounded border border-rose-100 font-mono">
                          <div className="flex justify-between items-center">
                            <span className="text-[#52212e] font-sans font-medium flex items-center gap-1">
                              <span>{cat.name}</span>
                            </span>
                            <span className="text-[10px] text-[#8c6b73]">
                              Plan {formatCurrency(cat.perCheckBudget)} • <span className={cat.p1Spent > cat.perCheckBudget ? 'text-rose-600 font-bold' : ''}>Spent {formatCurrency(cat.p1Spent)}</span>
                            </span>
                          </div>
                          {cat.name.toLowerCase().includes('other') && cat.p1Spent > 0 && (
                            <div className="text-[9px] text-[#8c6b73] italic font-sans mt-0.5">
                              Itemized in outflows list below (tallied once in total)
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Itemized list in Cards View */}
                    <div className="pt-2 border-t border-rose-200/60">
                      <div className="text-[10px] font-bold text-[#7d3c4c] uppercase pb-1 flex justify-between">
                        <span>Itemized Outflows</span>
                        <span>{p1UnplannedTxs.length} items (Strict Sum: {formatCurrency(actualP1ExtraDebt)})</span>
                      </div>
                      {p1UnplannedTxs.length === 0 ? (
                        <div className="text-[10px] text-[#8c6b73] italic py-1 text-center bg-white rounded border border-rose-100">
                          No extra outflows in this pay period
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                          {p1UnplannedTxs.map((item: any, idx: number) => (
                            <div key={item.id || idx} className="flex justify-between items-center text-[10px] px-2 py-0.5 bg-white rounded border border-rose-100">
                              <span className="truncate text-[#1f242e] font-medium mr-1">{item.description}</span>
                              <span className="font-mono font-bold text-rose-600 shrink-0">-{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                          <div className="pt-1 mt-1 border-t border-rose-200/40 flex justify-between items-center text-[9px] font-bold text-[#7d3c4c]">
                            <span>True Outflows Total (Single Sum, No Duplicates):</span>
                            <span className="font-mono text-rose-700">-{formatCurrency(actualP1ExtraDebt)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Savings Assigned ({selectedMonth}):</span>
                    {isFieldManual('p1_savings') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : isLiveActuals ? (
                      <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Executed Only
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Monthly Budget
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-emerald-700">-{formatCurrency(activeP1Savings)}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Transfer Out (Cash Drain):</span>
                    {isFieldManual('p1_transfers_out') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : (
                      p1TransfersOutItems.length > 0 && (
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 flex items-center gap-1">
                          <ArrowUpRight className="w-2.5 h-2.5" />
                          <span>{p1TransfersOutItems.length} Out</span>
                        </span>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => setShowP1TransfersOutLog(!showP1TransfersOutLog)}
                      className="text-[10px] font-bold text-[#7d3c4c] hover:underline cursor-pointer opacity-75 hover:opacity-100"
                      title="Toggle outbound transfers breakdown"
                    >
                      {showP1TransfersOutLog ? 'Hide' : `Breakdown (${p1TransfersOutItems.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-rose-600">-{formatCurrency(activeP1TransfersOut)}</span>
                </div>

                {showP1TransfersOutLog && (
                  <div className="p-2.5 bg-rose-50/50 rounded-xl border border-rose-200/70 space-y-1.5 animate-in fade-in duration-150">
                    <div className="text-[10px] font-bold text-rose-900 uppercase pb-0.5 flex justify-between">
                      <span>Outbound Transfers (Sent from Checking)</span>
                      <span>Total: -{formatCurrency(activeP1TransfersOut)}</span>
                    </div>
                    {p1TransfersOutItems.length === 0 ? (
                      <div className="text-[10px] text-[#8c6b73] italic py-1 text-center bg-white rounded border border-rose-100">
                        No outbound transfers from Checking
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                        {p1TransfersOutItems.map((item: any, idx: number) => (
                          <div key={item.id || idx} className="flex justify-between items-center text-[10px] px-2 py-1 bg-white rounded border border-rose-100">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-bold text-rose-700 shrink-0">{item.date ? item.date.slice(5) : ''}</span>
                              <span className="truncate text-[#1f242e] font-medium">{item.description}</span>
                              <span className="text-[9px] text-[#8c6b73] truncate">To: {item.destination}</span>
                            </div>
                            <span className="font-mono font-bold text-rose-600 shrink-0 ml-1">-{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between py-1.5 border-t border-rose-100 font-bold text-[#7d3c4c]">
                  <span>Total Check 1 Obligations:</span>
                  <span className="font-mono text-rose-700">-{formatCurrency(activeP1TotalObligations)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center py-2.5 bg-[#fdf6f8] px-4 rounded-2xl border border-[#ebd0d9] mt-2">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[#1f242e] text-xs">Rollover to Next Period:</span>
                {isFieldManual('p1_rollover_next') && (
                  <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                    Manual
                  </span>
                )}
              </div>
              <span className={`font-mono font-extrabold text-sm ${activeP2Rollover < 0 ? 'text-rose-600' : 'text-[#1f242e]'}`}>
                {formatCurrency(activeP2Rollover)}
              </span>
            </div>
          </div>

          {/* Card 2: Paycheck 2 */}
          <div className="bg-white rounded-3xl p-6 border border-[#e4e0e2] shadow-kawaii space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center pb-3 border-b border-[#e4e0e2]">
                <div>
                  <h3 className="text-base font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
                    Paycheck 2 ({effectiveP2Period})
                  </h3>
                  <span className="text-xs text-purple-600 font-medium">Paid {scheduledP2PayDate} {clearedP2Tx ? '(Cleared Deposit)' : '(15th of Month)'} • Funds {effectiveP2BillStart}{getOrdinalSuffix(effectiveP2BillStart).slice(-2)}–{effectiveP2BillEnd}{getOrdinalSuffix(effectiveP2BillEnd).slice(-2)}</span>
                </div>
                <div className="text-right font-mono font-extrabold text-[#1f242e] text-lg flex items-center justify-end gap-1.5">
                  <span>+{formatCurrency(activeP2Income)}</span>
                  {isFieldManual('p2_income') && (
                    <span className="text-[9px] font-sans font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                      Manual
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 text-xs font-medium mt-4">
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Rollover from Paycheck 1:</span>
                    {isFieldManual('p2_rollover') && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className={`font-mono font-bold ${activeP2Rollover < 0 ? 'text-rose-600' : 'text-[#1f242e]'}`}>
                    {formatCurrency(activeP2Rollover)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Paycheck Inflow:</span>
                    {isLiveActuals ? (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        activeP2Income > 0
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-amber-800 bg-amber-50 border-amber-200'
                      }`}>
                        {activeP2Income > 0 ? 'Cleared Inflow' : 'Pending (Sep 15)'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        15th Inflow ({scheduledP2PayDate})
                      </span>
                    )}
                    {isFieldManual('p2_income') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : (
                      p2Txs.length > 0 && (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Checking
                        </span>
                      )
                    )}
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-emerald-600">+{formatCurrency(activeP2Income)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Transfer In (Cash Infusion):</span>
                    {isFieldManual('p2_transfers_in') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : (
                      p2TransfersInItems.length > 0 && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                          <ArrowDownLeft className="w-2.5 h-2.5" />
                          <span>{p2TransfersInItems.length} In</span>
                        </span>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => setShowP2TransfersInLog(!showP2TransfersInLog)}
                      className="text-[10px] font-bold text-[#7d3c4c] hover:underline cursor-pointer opacity-75 hover:opacity-100"
                      title="Toggle inbound transfers breakdown"
                    >
                      {showP2TransfersInLog ? 'Hide' : `Breakdown (${p2TransfersInItems.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-emerald-600">+{formatCurrency(activeP2TransfersIn)}</span>
                </div>

                {showP2TransfersInLog && (
                  <div className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200/70 space-y-1.5 animate-in fade-in duration-150">
                    <div className="text-[10px] font-bold text-emerald-900 uppercase pb-0.5 flex justify-between">
                      <span>Inbound Transfers (Deposited to Checking)</span>
                      <span>Total: +{formatCurrency(activeP2TransfersIn)}</span>
                    </div>
                    {p2TransfersInItems.length === 0 ? (
                      <div className="text-[10px] text-[#8c6b73] italic py-1 text-center bg-white rounded border border-emerald-100">
                        No inbound transfers into Checking
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                        {p2TransfersInItems.map((item: any, idx: number) => (
                          <div key={item.id || idx} className="flex justify-between items-center text-[10px] px-2 py-1 bg-white rounded border border-emerald-100">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-bold text-emerald-700 shrink-0">{item.date ? item.date.slice(5) : ''}</span>
                              <span className="truncate text-[#1f242e] font-medium">{item.description}</span>
                              <span className="text-[9px] text-[#8c6b73] truncate">From: {item.source}</span>
                            </div>
                            <span className="font-mono font-bold text-emerald-700 shrink-0 ml-1">+{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Fixed Bills Assigned ({selectedMonth}):</span>
                    {isFieldManual('p2_fixed_bills') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : isLiveActuals ? (
                      <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Cleared Only
                      </span>
                    ) : null}
                    <button
                      onClick={() => setShowP2BillsModal(!showP2BillsModal)}
                      className="text-[10px] font-sans font-bold text-[#7d3c4c] bg-[#fdf6f8] hover:bg-[#f8d5db] px-2 py-0.5 rounded-full border border-[#ebd0d9] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      title="Toggle breakdown of Check 2 bills"
                    >
                      <Receipt className="w-2.5 h-2.5" />
                      <span>{p2AllBills.length} bills ({p2PaidBills.length} paid)</span>
                      {showP2BillsModal ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-rose-600">-{formatCurrency(activeP2FixedBills)}</span>
                </div>

                {/* Optional Expandable List of P2 Bills */}
                {showP2BillsModal && (
                  <div className="p-2.5 bg-[#fdf6f8]/70 rounded-xl border border-[#ebd0d9] space-y-1.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#7d3c4c] uppercase">
                      <span>Check 2 Bills ({selectedMonth}): {p2AllBills.length} total</span>
                      <span>{isLiveActuals ? `Total Cleared: ${formatCurrency(activeP2FixedBills)} (${formatCurrency(p2TotalFixedBills)} planned)` : `Total Assigned: ${formatCurrency(p2TotalFixedBills)}`}</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {p2AllBills.map(b => {
                        const isPaid = Number(b[activeMonthKey] || 0) === 1;
                        return (
                          <div key={b.id} className="flex justify-between items-center text-[11px] px-2 py-1 bg-white rounded-lg border border-rose-200/60">
                            <span className="text-[#52212e] truncate font-medium flex items-center gap-1.5">
                              <span className="text-[10px] text-rose-600 font-bold">Due {b.due_day}th:</span>
                              <span className="truncate">{b.name}</span>
                              <span className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                                isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'
                              }`}>
                                {isPaid ? 'Paid' : 'Unpaid'}
                              </span>
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0 ml-1">
                              <span className="font-mono font-bold shrink-0 text-[#1f242e]">
                                {formatCurrency(b.amount)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleReassignBill(b, '1st Paycheck')}
                                title="Move to Check 1"
                                className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-[#7d3c4c] border border-rose-200 font-semibold cursor-pointer transition-colors"
                              >
                                ← Check 1
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[#52212e]">Lifestyle Budget Assigned:</span>
                    {isFieldManual('p2_lifestyle') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : isLiveActuals ? (
                      <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Cleared Only
                      </span>
                    ) : actualP2Lifestyle > plannedP2Lifestyle ? (
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        Live Overage
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-700 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200">
                        5 Categories
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowP2LifestyleLog(!showP2LifestyleLog)}
                      className="text-[10px] font-bold text-[#7d3c4c] hover:underline cursor-pointer opacity-75 hover:opacity-100"
                      title="Toggle umbrella breakdown"
                    >
                      {showP2LifestyleLog ? 'Hide' : 'Breakdown'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-rose-600">-{formatCurrency(activeP2Lifestyle)}</span>
                    <div className="text-[9px] text-[#8c6b73]">
                      {isLiveActuals
                        ? `Spent ${formatCurrency(actualP2Lifestyle)} • ${formatCurrency(Math.max(0, plannedP2Lifestyle - actualP2Lifestyle))} unspent in cash`
                        : `Spent: ${formatCurrency(actualP2Lifestyle)}`}
                    </div>
                  </div>
                </div>

                {showP2LifestyleLog && (
                  <div className="p-2.5 bg-[#fdf6f8] rounded-xl border border-rose-200/60 space-y-1 animate-in fade-in duration-150">
                    <div className="text-[10px] font-bold text-[#7d3c4c] uppercase pb-0.5 flex justify-between">
                      <span>Umbrella Pools (16th - 31st):</span>
                      <span>{isLiveActuals ? `Deducted: ${formatCurrency(activeP2Lifestyle)} (Plan: ${formatCurrency(plannedP2Lifestyle)})` : `Plan: ${formatCurrency(plannedP2Lifestyle)}`}</span>
                    </div>
                    <div className="space-y-1">
                      {umbrellaCategoryDetails.map(cat => (
                        <div key={cat.name} className="flex justify-between items-center text-[11px] px-2 py-0.5 bg-white rounded border border-rose-100 font-mono">
                          <span className="text-[#52212e] font-sans font-medium flex items-center gap-1">
                            <span>{cat.name}</span>
                          </span>
                          <span className="text-[10px] text-[#8c6b73]">
                            Plan {formatCurrency(cat.perCheckBudget)} • <span className={cat.p2Spent > cat.perCheckBudget ? 'text-rose-600 font-bold' : ''}>Spent {formatCurrency(cat.p2Spent)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[#52212e]">Unplanned Outflows / Extra Debt Paid:</span>
                    {isLiveActuals ? (
                      <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Cleared Outflows (-{formatCurrency(activeP2ExtraDebt)})
                      </span>
                    ) : manualFields.includes('p2_extra_debt') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : actualP2ExtraDebt > plannedP2ExtraDebt ? (
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        Live Overage
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-700 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200">
                        2 Categories
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowP2ExtraDebtLog(!showP2ExtraDebtLog)}
                      className="text-[10px] font-bold text-[#7d3c4c] hover:underline cursor-pointer opacity-75 hover:opacity-100"
                      title="Toggle unplanned outflows breakdown"
                    >
                      {showP2ExtraDebtLog ? 'Hide' : `Breakdown (${p2UnplannedTxs.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-rose-600">-{formatCurrency(activeP2ExtraDebt)}</span>
                    <div className="text-[9px] text-[#8c6b73]">
                      Spent: {formatCurrency(actualP2ExtraDebt)}
                    </div>
                  </div>
                </div>

                {showP2ExtraDebtLog && (
                  <div className="p-2.5 bg-[#fdf6f8] rounded-xl border border-rose-200/60 space-y-2 animate-in fade-in duration-150">
                    <div className="text-[10px] font-bold text-[#7d3c4c] uppercase pb-0.5 flex justify-between">
                      <span>Planner Budget: Extra Payment &amp; Other/Misc</span>
                      <span>{isLiveActuals ? `Deducted: ${formatCurrency(activeP2ExtraDebt)} (Plan: ${formatCurrency(plannedP2ExtraDebt)})` : `Plan: ${formatCurrency(plannedP2ExtraDebt)}`}</span>
                    </div>
                    <div className="space-y-1">
                      {extraDebtCategoryDetails.map(cat => (
                        <div key={cat.name} className="flex flex-col text-[11px] px-2 py-1 bg-white rounded border border-rose-100 font-mono">
                          <div className="flex justify-between items-center">
                            <span className="text-[#52212e] font-sans font-medium flex items-center gap-1">
                              <span>{cat.name}</span>
                            </span>
                            <span className="text-[10px] text-[#8c6b73]">
                              Plan {formatCurrency(cat.perCheckBudget)} • <span className={cat.p2Spent > cat.perCheckBudget ? 'text-rose-600 font-bold' : ''}>Spent {formatCurrency(cat.p2Spent)}</span>
                            </span>
                          </div>
                          {cat.name.toLowerCase().includes('other') && cat.p2Spent > 0 && (
                            <div className="text-[9px] text-[#8c6b73] italic font-sans mt-0.5">
                              Itemized in outflows list below (tallied once in total)
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Itemized list in Cards View */}
                    <div className="pt-2 border-t border-rose-200/60">
                      <div className="text-[10px] font-bold text-[#7d3c4c] uppercase pb-1 flex justify-between">
                        <span>Itemized Outflows</span>
                        <span>{p2UnplannedTxs.length} items (Strict Sum: {formatCurrency(actualP2ExtraDebt)})</span>
                      </div>
                      {p2UnplannedTxs.length === 0 ? (
                        <div className="text-[10px] text-[#8c6b73] italic py-1 text-center bg-white rounded border border-rose-100">
                          No extra outflows in this pay period
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                          {p2UnplannedTxs.map((item: any, idx: number) => (
                            <div key={item.id || idx} className="flex justify-between items-center text-[10px] px-2 py-0.5 bg-white rounded border border-rose-100">
                              <span className="truncate text-[#1f242e] font-medium mr-1">{item.description}</span>
                              <span className="font-mono font-bold text-rose-600 shrink-0">-{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                          <div className="pt-1 mt-1 border-t border-rose-200/40 flex justify-between items-center text-[9px] font-bold text-[#7d3c4c]">
                            <span>True Outflows Total (Single Sum, No Duplicates):</span>
                            <span className="font-mono text-rose-700">-{formatCurrency(actualP2ExtraDebt)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[#52212e]">Sinking Funds Assigned:</span>
                    {manualFields.includes('p2_savings') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : p2SinkingTransfersTotal > 0 ? (
                      <span className={`text-[9px] font-medium px-1.5 py-0.2 rounded border ${
                        p2SinkingTransfersTotal >= effectiveP2Savings 
                          ? 'text-emerald-800 bg-emerald-50 border-emerald-200' 
                          : 'text-amber-800 bg-amber-50 border-amber-200'
                      }`}>
                        {p2SinkingTransfersTotal >= effectiveP2Savings ? 'Cleared' : 'Partial'}
                      </span>
                    ) : isLiveActuals ? (
                      <span className="text-[9px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                        Unexecuted
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Target
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowP2SinkingLog(!showP2SinkingLog)}
                      className="text-[10px] font-bold text-[#7d3c4c] hover:underline cursor-pointer opacity-75 hover:opacity-100"
                      title="Toggle sinking funds breakdown"
                    >
                      {showP2SinkingLog ? 'Hide' : `Breakdown (${p2SinkingTransfers.length > 0 ? p2SinkingTransfers.length : 'Targets'})`}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-emerald-700">-{formatCurrency(activeP2Savings)}</span>
                </div>

                {showP2SinkingLog && (
                  <div className="p-3 bg-emerald-50/40 rounded-2xl border border-emerald-200/60 my-2 space-y-2 animate-in fade-in duration-150">
                    <div className="text-[10px] font-bold text-emerald-900 uppercase flex justify-between">
                      <span>Sinking Funds Targets</span>
                      <span>Target: {formatCurrency(effectiveP2Savings)}/mo</span>
                    </div>
                    <div className="text-[11px] text-[#52212e] space-y-1">
                      {sinkingTargetBreakdown.map((target) => (
                        <div key={target.id} className="flex justify-between bg-white px-2 py-1 rounded border border-emerald-100">
                          <span className="truncate mr-1">{target.name}</span>
                          <span className="font-mono font-bold text-emerald-700 shrink-0">{formatCurrency(target.monthlyReserve)}/mo</span>
                        </div>
                      ))}
                    </div>
                    {p2SinkingTransfersItems.length > 0 && (
                      <div className="pt-1.5 border-t border-emerald-200/60">
                        <div className="text-[10px] font-bold text-emerald-900 uppercase pb-1 flex justify-between">
                          <span>Checking → Savings Transfers</span>
                          <span>{formatCurrency(p2SinkingTransfersTotal)}</span>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                          {p2SinkingTransfersItems.map((item: any, idx: number) => (
                            <div key={item.id || idx} className="flex justify-between items-center text-[10px] px-2 py-0.5 bg-white rounded border border-emerald-100">
                              <span className="truncate text-[#1f242e] font-medium mr-1">{item.description}</span>
                              <span className="font-mono font-bold text-emerald-700 shrink-0">-{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Checking Safety Buffer:</span>
                    {isFieldManual('p2_checking_buffer') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : isLiveActuals ? (
                      <span className="text-[9px] font-medium text-purple-800 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                        In Cash
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-purple-700">{formatCurrency(activeP2Buffer)}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-rose-50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#52212e]">Transfer Out (Cash Drain):</span>
                    {isFieldManual('p2_transfers_out') ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Manual
                      </span>
                    ) : (
                      p2TransfersOutItems.length > 0 && (
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 flex items-center gap-1">
                          <ArrowUpRight className="w-2.5 h-2.5" />
                          <span>{p2TransfersOutItems.length} Out</span>
                        </span>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => setShowP2TransfersOutLog(!showP2TransfersOutLog)}
                      className="text-[10px] font-bold text-[#7d3c4c] hover:underline cursor-pointer opacity-75 hover:opacity-100"
                      title="Toggle outbound transfers breakdown"
                    >
                      {showP2TransfersOutLog ? 'Hide' : `Breakdown (${p2TransfersOutItems.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-[10px] text-[#7d3c4c] hover:underline cursor-pointer opacity-50 hover:opacity-100"
                      title="Edit manually"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-rose-600">-{formatCurrency(activeP2TransfersOut)}</span>
                </div>

                {showP2TransfersOutLog && (
                  <div className="p-2.5 bg-rose-50/50 rounded-xl border border-rose-200/70 space-y-1.5 animate-in fade-in duration-150">
                    <div className="text-[10px] font-bold text-rose-900 uppercase pb-0.5 flex justify-between">
                      <span>Outbound Transfers (Sent from Checking)</span>
                      <span>Total: -{formatCurrency(activeP2TransfersOut)}</span>
                    </div>
                    {p2TransfersOutItems.length === 0 ? (
                      <div className="text-[10px] text-[#8c6b73] italic py-1 text-center bg-white rounded border border-rose-100">
                        No outbound transfers from Checking
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                        {p2TransfersOutItems.map((item: any, idx: number) => (
                          <div key={item.id || idx} className="flex justify-between items-center text-[10px] px-2 py-1 bg-white rounded border border-rose-100">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-bold text-rose-700 shrink-0">{item.date ? item.date.slice(5) : ''}</span>
                              <span className="truncate text-[#1f242e] font-medium">{item.description}</span>
                              <span className="text-[9px] text-[#8c6b73] truncate">To: {item.destination}</span>
                            </div>
                            <span className="font-mono font-bold text-rose-600 shrink-0 ml-1">-{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between py-1.5 border-t border-rose-100 font-bold text-[#7d3c4c]">
                  <span>Total Check 2 Obligations:</span>
                  <span className="font-mono text-rose-700">-{formatCurrency(activeP2TotalObligations)}</span>
                </div>
              </div>
            </div>

            <div className={`flex justify-between items-center py-2.5 px-4 rounded-2xl border mt-2 ${
              activeP2Leftover >= 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs">Leftover Free Cash:</span>
                {isFieldManual('p2_leftover') && (
                  <span className="text-[10px] font-sans font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                    Manual
                  </span>
                )}
              </div>
              <span className="font-mono font-extrabold text-sm">
                {formatCurrency(activeP2Leftover)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
