import { Transaction } from '../types';

export const CATEGORY_DEFAULT_TYPES: Record<string, Transaction['type']> = {
  // Income categories
  'Income': 'Income',
  'Paycheck': 'Income',
  'Paycheck 1': 'Income',
  'Paycheck 2': 'Income',
  'Interest': 'Income',
  'Interest Earned': 'Income',
  'Refunds': 'Income',
  'Rollover': 'Income',
  'Bonus': 'Income',
  'Salary': 'Income',
  'Dividend': 'Income',
  'Dividends': 'Income',
  'Cashback': 'Income',
  'Cash Back': 'Income',
  'Deposit': 'Income',

  // Expense categories
  'Utilities': 'Expense',
  'Groceries': 'Expense',
  'Gas': 'Expense',
  'Insurance': 'Expense',
  'Debt Repayment': 'Expense',
  'Entertainment': 'Expense',
  'Subscriptions': 'Expense',
  'Annual Subscriptions (Savings)': 'Expense',
  'Takeout': 'Expense',
  'Chicken Feed': 'Expense',
  'Savings': 'Expense',
  'Extra Payment': 'Expense',
  'Other / Misc': 'Expense',
  'Minimum Charge': 'Expense',
  'Interest Charge': 'Expense',
  'Credit Protect': 'Expense',
  'Annual Fee': 'Expense',
  'Phone bill': 'Expense',
  'Petty Cash': 'Expense',
  'Lifestyle': 'Expense',
};

/**
 * Returns standard default transaction type for a given category name.
 * Respects Credit Card accounts (e.g. Debt Repayment on a CC defaults to Payment).
 */
export function getDefaultTypeForCategory(
  categoryName: string,
  isCreditCard: boolean = false
): Transaction['type'] {
  if (!categoryName) return isCreditCard ? 'Expense' : 'Expense';

  const trimmed = categoryName.trim();

  // If Credit Card account and category is Debt Repayment or Payment
  if (isCreditCard && (trimmed.toLowerCase().includes('payment') || trimmed.toLowerCase().includes('debt repayment'))) {
    return 'Payment';
  }

  // Exact dictionary match
  if (CATEGORY_DEFAULT_TYPES[trimmed]) {
    return CATEGORY_DEFAULT_TYPES[trimmed];
  }

  // Case-insensitive keyword fallback
  const lower = trimmed.toLowerCase();

  if (
    lower.includes('paycheck') ||
    lower.includes('income') ||
    lower.includes('salary') ||
    lower.includes('wage') ||
    lower.includes('interest earned') ||
    lower === 'interest' ||
    lower.includes('refund') ||
    lower.includes('rollover') ||
    lower.includes('deposit') ||
    lower.includes('cashback') ||
    lower.includes('cash back') ||
    lower.includes('dividend') ||
    lower.includes('bonus')
  ) {
    return 'Income';
  }

  if (isCreditCard && (lower.includes('payment') || lower.includes('transfer'))) {
    return 'Payment';
  }

  // Standard default is Expense
  return 'Expense';
}
