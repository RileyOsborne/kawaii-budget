import { db, recalculateAccountBalances } from './db.js';

export interface SyncCreditCardTxParams {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  description?: string;
  category?: string;
  type?: string;
  notes?: string;
  linked_transaction_id?: string | null;
}

/**
 * Determines whether a transaction on an account represents a Credit Card Payment
 * that draws cash from the Checking account.
 * Regular charges/purchases, merchant refunds, and starting balances are NOT payments.
 */
export function isCreditCardPayment(
  account: any, 
  tx: { type?: string; category?: string; description?: string }
): boolean {
  if (!account || account.type !== 'credit_card') return false;

  const type = (tx.type || '').trim();
  const typeLower = type.toLowerCase();
  const cat = (tx.category || '').trim().toLowerCase();
  const desc = (tx.description || '').trim().toLowerCase();

  // 1. Explicit 'Payment' type
  if (typeLower === 'payment') return true;

  // 2. Merchant refunds and starting balances do not draw from checking cash
  if (cat.includes('refund') || desc.includes('refund') || desc.includes('starting balance')) {
    return false;
  }

  // 3. Categorized as Transfer or Payment
  if (
    cat === 'transfer' || 
    cat === 'credit card payment' || 
    cat === 'card payment' || 
    cat === 'extra payment' || 
    cat === 'payment'
  ) {
    return true;
  }

  // 4. On a credit card ledger, an Income entry (payment/credit) is a payment towards the card
  if (type === 'Income') {
    return true;
  }

  // 5. Categorized as debt repayment with payment/payoff/transfer description
  if (
    cat === 'debt repayment' && 
    (desc.includes('payment') || desc.includes('payoff') || desc.includes('transfer') || desc.includes('paid'))
  ) {
    return true;
  }

  // 6. Description explicitly indicates a payment/payoff
  if (desc.startsWith('payment') || desc.includes(' payment') || desc.includes('payoff')) {
    return true;
  }

  return false;
}

/**
 * Gets the primary checking account.
 */
export function getCheckingAccount() {
  return db.prepare(`
    SELECT * FROM accounts 
    WHERE id = 'acc_checking' OR type = 'checking' 
    ORDER BY (CASE WHEN id = 'acc_checking' THEN 0 ELSE 1 END) 
    LIMIT 1
  `).get() as any;
}

/**
 * Synchronizes a credit card payment to the Checking Ledger.
 * Creates or updates a corresponding withdrawal entry with matching date and amount,
 * and description "Payment to <Card Name>".
 */
export function syncCreditCardPaymentToChecking(ccTx: SyncCreditCardTxParams): string | null {
  const cardAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(ccTx.account_id) as any;
  if (!cardAccount || cardAccount.type !== 'credit_card') return null;

  const checkingAccount = getCheckingAccount();
  if (!checkingAccount) {
    console.error('⚠️ No checking account found for credit card payment sync.');
    return null;
  }

  const cleanCardName = cardAccount.name.replace(/🌸/g, '').trim();
  const checkingDescription = `Payment to ${cleanCardName}`;
  const checkingAmount = Math.abs(Number(ccTx.amount) || 0);
  const checkingDate = ccTx.date;
  const syncTag = `[CC Payment Sync: ${ccTx.id}]`;
  const checkingCategory = 'Debt Repayment';

  // Check if a linked checking transaction already exists
  let linkedCheckingTx: any = null;
  if (ccTx.linked_transaction_id) {
    linkedCheckingTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(ccTx.linked_transaction_id);
  }
  if (!linkedCheckingTx) {
    linkedCheckingTx = db.prepare('SELECT * FROM transactions WHERE linked_transaction_id = ? OR notes LIKE ?')
      .get(ccTx.id, `%${syncTag}%`);
  }

  if (linkedCheckingTx) {
    // Update existing linked transaction in Checking to match date, amount, and destination
    db.prepare(`
      UPDATE transactions
      SET date = ?, description = ?, amount = ?, notes = ?, category = ?, type = 'Expense', linked_transaction_id = ?
      WHERE id = ?
    `).run(
      checkingDate, 
      checkingDescription, 
      checkingAmount, 
      syncTag, 
      checkingCategory, 
      ccTx.id, 
      linkedCheckingTx.id
    );

    // Ensure ccTx has its linked_transaction_id set
    db.prepare('UPDATE transactions SET linked_transaction_id = ? WHERE id = ?')
      .run(linkedCheckingTx.id, ccTx.id);

    recalculateAccountBalances(checkingAccount.id);
    console.log(`🌸 Updated synced Checking withdrawal for ${cleanCardName}: $${checkingAmount} on ${checkingDate}`);
    return linkedCheckingTx.id;
  } else {
    // Generate new corresponding withdrawal entry in Checking Ledger
    const newCheckingTxId = `tx_cc_sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Shift existing sort_order to place this new transaction at the top of checking
    db.prepare('UPDATE transactions SET sort_order = sort_order + 1 WHERE account_id = ? AND sort_order > 0')
      .run(checkingAccount.id);

    db.prepare(`
      INSERT INTO transactions (id, account_id, date, description, category, type, amount, notes, sort_order, linked_transaction_id)
      VALUES (?, ?, ?, ?, ?, 'Expense', ?, ?, 1, ?)
    `).run(
      newCheckingTxId,
      checkingAccount.id,
      checkingDate,
      checkingDescription,
      checkingCategory,
      checkingAmount,
      syncTag,
      ccTx.id
    );

    // Link ccTx to the newly generated checking entry
    db.prepare('UPDATE transactions SET linked_transaction_id = ? WHERE id = ?')
      .run(newCheckingTxId, ccTx.id);

    recalculateAccountBalances(checkingAccount.id);
    console.log(`🌸 Generated synced Checking withdrawal for ${cleanCardName}: $${checkingAmount} on ${checkingDate} (${newCheckingTxId})`);
    return newCheckingTxId;
  }
}

/**
 * Deletes the linked checking transaction when a credit card payment is deleted
 * or edited to no longer be a payment.
 */
export function deleteLinkedCheckingTransaction(ccTxId: string): boolean {
  const syncTag = `[CC Payment Sync: ${ccTxId}]`;
  const linkedCheckingTx = db.prepare(`
    SELECT * FROM transactions 
    WHERE linked_transaction_id = ? OR notes LIKE ?
  `).get(ccTxId, `%${syncTag}%`) as any;

  if (linkedCheckingTx) {
    db.prepare('DELETE FROM transactions WHERE id = ?').run(linkedCheckingTx.id);
    recalculateAccountBalances(linkedCheckingTx.account_id);
    console.log(`🌸 Deleted linked Checking withdrawal (${linkedCheckingTx.id}) for CC payment ${ccTxId}`);
    return true;
  }
  return false;
}
