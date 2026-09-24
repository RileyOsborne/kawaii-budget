export interface Category {
  id: string;
  name: string;
  icon: string;
  budget: number;
  color: string;
  sort_order: number;
  actual?: number;
  difference?: number;
  delta?: number;
}

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'credit_card' | 'loan' | 'auto_loan';
  balance: number;
  starting_balance: number;
  min_payment: number;
  apr: number;
  due_day: number;
  buffer: number;
  icon: string;
  category: 'revolving' | 'auto_loan' | 'personal_loan' | 'general';
  sort_order: number;
}

export interface Bill {
  id: string;
  name: string;
  due_day: number;
  category: string;
  amount: number;
  paycheck_assignment: string;
  assigned_check?: string;
  paid_aug: number;
  paid_sep: number;
  paid_oct: number;
  paid_nov: number;
  paid_dec: number;
  auto_pay: number;
  notes?: string;
  sort_order?: number;
  is_sinking_fund?: number;
}

export interface AnnualBill {
  id: string;
  name: string;
  due_date: string;
  amount: number;
  is_paid: number;
  frequency: 'annual' | 'biannual';
  notes?: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  date: string;
  description: string;
  category: string;
  type: 'Income' | 'Expense' | 'Transfer' | 'Track Only' | 'Payment';
  amount: number;
  running_balance: number;
  notes?: string;
  created_at?: string;
  sort_order?: number;
  linked_transaction_id?: string | null;
}

export interface TransferPayload {
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  date: string;
  description?: string;
  notes?: string;
}

export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date?: string;
  category: string;
  color: string;
  icon: string;
  type?: 'goal' | 'milestone';
}

export interface PaycheckPlan {
  id: number;
  month: string;
  p1_period: string;
  p1_payday_mode?: 'prev_month_last_day' | 'day_of_month' | string;
  p1_payday_day?: number;
  p1_bill_start?: number;
  p1_bill_end?: number;
  p1_rollover: number;
  p1_income: number;
  p1_fixed_bills: number;
  p1_lifestyle: number;
  p1_savings: number;
  p1_rollover_next: number;
  p2_period: string;
  p2_payday_mode?: 'day_of_month' | string;
  p2_payday_day?: number;
  p2_bill_start?: number;
  p2_bill_end?: number;
  p2_rollover: number;
  p2_income: number;
  p2_fixed_bills: number;
  p2_lifestyle: number;
  p2_savings: number;
  p2_checking_buffer: number;
  p2_leftover: number;
  is_manual?: number;
  manual_fields?: string[];
  dynamic_values?: Record<string, number>;
  is_p1_paid_prior_to_month?: number | boolean;
  p1_effective_inflow_math?: number;
  p1_scheduled_pay_date?: string;
  p2_scheduled_pay_date?: string;
  p1_lifestyle_planned?: number;
  p1_lifestyle_spent?: number;
  p2_lifestyle_planned?: number;
  p2_lifestyle_spent?: number;
  lifestyle_umbrella_categories?: {
    name: string;
    icon: string;
    monthly_budget: number;
    p1_budget: number;
    p2_budget: number;
    p1_spent: number;
    p2_spent: number;
  }[];
  p1_extra_debt?: number;
  p1_extra_debt_planned?: number;
  p1_extra_debt_spent?: number;
  p2_extra_debt?: number;
  p2_extra_debt_planned?: number;
  p2_extra_debt_spent?: number;
  total_extra_debt?: number;
  extra_debt_categories?: {
    name: string;
    icon: string;
    monthly_budget: number;
    p1_budget: number;
    p2_budget: number;
    p1_spent: number;
    p2_spent: number;
  }[];
  p1_unplanned_outflows?: number;
  p1_unplanned_outflows_planned?: number;
  p1_unplanned_outflows_spent?: number;
  p2_unplanned_outflows?: number;
  p2_unplanned_outflows_planned?: number;
  p2_unplanned_outflows_spent?: number;
  total_unplanned_outflows?: number;
  unplanned_outflows_txs?: {
    p1: Array<{ id: string; date: string; description: string; amount: number; category: string; reason: string }>;
    p2: Array<{ id: string; date: string; description: string; amount: number; category: string; reason: string }>;
  };
  p2_zero_sum_buffer?: number;
  p2_zero_sum_savings?: number;
  p2_zero_sum_debt?: number;
  p2_zero_sum_target?: string;
  p2_total_zero_sum_allocated?: number;
  p2_unallocated_leftover?: number;
  p1_transfers_in?: number;
  p1_transfers_out?: number;
  p1_transfers_in_items?: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  p1_transfers_out_items?: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  p2_transfers_in?: number;
  p2_transfers_out?: number;
  p2_transfers_in_items?: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  p2_transfers_out_items?: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  cleared_p2_tx?: { id: string; date: string; amount: number; description?: string } | null;
  cleared_p2_date?: string | null;
  cleared_p2_day?: number | null;
  pre_deposit_checking_balance?: number;
  monthly_sinking_funds_total?: number;
  p2_sinking_transfers?: Array<{ id: string; date: string; description: string; amount: number; source?: string; destination?: string; notes?: string }>;
  p2_sinking_transfer_total?: number;
  p2_sinking_cleared?: boolean;
  total_transfers_in?: number;
  total_transfers_out?: number;
  checking_ending_balance_prev_month?: number;
  prev_month_label?: string;
  rollover_tx_desc?: string;
  mode?: 'worst_case' | 'live_actuals';
  live_actuals?: any;
  worst_case?: any;
}

export interface OverviewStats {
  checking: {
    balance: number;
    buffer: number;
    spendable: number;
  };
  savings: {
    balance: number;
  };
  pettyCash: {
    balance: number;
  };
  debt: {
    revolving: number;
    auto: number;
    total: number;
    accountsCount: number;
  };
  budgetSummary: {
    totalBudget: number;
    totalActual: number;
    totalDifference: number;
    delta: number;
    categories: Category[];
  };
  billsSummary: {
    totalCount: number;
    paidCount: number;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
  };
  paycheckPlan: PaycheckPlan;
}

export interface SavingsMonthlyBreakdownItem {
  actual: number;
  projected: number;
  isActual: boolean;
}

export interface ProjectionsData {
  totalDebt: number;
  monthsToDebtFree: number;
  debtOrder: Array<{
    id: string;
    name: string;
    monthsToPayoff: number;
    totalInterest: number;
  }>;
  savingsProjections: Array<{
    year: number;
    yearLabel?: number | string;
    startBalance?: number;
    monthlyContribution: number;
    annualContribution: number;
    interestEarned?: number;
    expectedReturn: number;
    projectedBalance: number;
    actualYearToDate?: number;
    projectedRemaining?: number;
    remainingMonthsCount?: number;
  }>;
  currentYearSavings?: {
    activeMonthBudget: number;
    annualizedRate: number;
    totalYearProjected: number;
    actualYearToDate: number;
    projectedRemaining: number;
    remainingMonthsCount: number;
    monthlyBreakdown: Record<string, SavingsMonthlyBreakdownItem>;
    initialBalance: number;
  };
}

export interface BackupItem {
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  type: 'daily_auto' | 'manual_instant' | 'external_import';
  stats: {
    transactionsCount: number;
    accountsCount: number;
    billsCount: number;
    checkingBalance: number;
  };
}

export interface ExternalBackupInspection {
  valid: boolean;
  filename: string;
  format: 'tarball' | 'sqlite' | 'json';
  size: number;
  sizeFormatted: string;
  createdAt: string;
  stats: {
    transactionsCount: number;
    accountsCount: number;
    billsCount: number;
    checkingBalance: number;
  };
  error?: string;
}
