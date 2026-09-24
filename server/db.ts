import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
try {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
} catch (err: any) {
  console.warn(`[DB] Notice creating db directory '${dbDir}':`, err.message);
}

const dbPath = path.join(dbDir, 'kawaii_budget.sqlite');
console.log('🌸 Initializing SQLite database at:', dbPath);

let dbInstance: any;
try {
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
} catch (err: any) {
  console.error(`🚨 Fatal: Failed to initialize SQLite database at '${dbPath}'. Please ensure directory is writable:`, err.message);
  throw err;
}

export let db = dbInstance;

export function getDb() {
  return db;
}

export function reloadDatabase(newDbSourcePath?: string) {
  try {
    db.close();
  } catch {
    // ignore
  }

  if (newDbSourcePath && fs.existsSync(newDbSourcePath)) {
    try { if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm'); } catch {}
    fs.copyFileSync(newDbSourcePath, dbPath);
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  recalculateAccountBalances();
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '🌸',
      budget REAL DEFAULT 0,
      color TEXT DEFAULT '#f472b6',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL DEFAULT 0,
      starting_balance REAL DEFAULT 0,
      min_payment REAL DEFAULT 0,
      apr REAL DEFAULT 0,
      due_day INTEGER DEFAULT 1,
      buffer REAL DEFAULT 0,
      icon TEXT DEFAULT '💳',
      category TEXT DEFAULT 'general',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      due_day INTEGER NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      paycheck_assignment TEXT DEFAULT 'Paycheck 1 (1st-15th)',
      assigned_check TEXT DEFAULT NULL,
      paid_aug INTEGER DEFAULT 0,
      paid_sep INTEGER DEFAULT 0,
      paid_oct INTEGER DEFAULT 0,
      paid_nov INTEGER DEFAULT 0,
      paid_dec INTEGER DEFAULT 0,
      auto_pay INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS annual_bills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      due_date TEXT NOT NULL,
      amount REAL NOT NULL,
      is_paid INTEGER DEFAULT 0,
      frequency TEXT DEFAULT 'annual',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      running_balance REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL,
      target_date TEXT,
      category TEXT DEFAULT 'General',
      color TEXT DEFAULT '#f472b6',
      icon TEXT DEFAULT '🎯',
      type TEXT DEFAULT 'goal'
    );

    CREATE TABLE IF NOT EXISTS paycheck_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT UNIQUE,
      p1_period TEXT DEFAULT '1st - 15th',
      p1_rollover REAL DEFAULT 0.00,
      p1_income REAL DEFAULT 0.00,
      p1_fixed_bills REAL DEFAULT 0.00,
      p1_lifestyle REAL DEFAULT 0.00,
      p1_savings REAL DEFAULT 0.00,
      p1_rollover_next REAL DEFAULT 0.00,
      p2_period TEXT DEFAULT '16th - 31st',
      p2_rollover REAL DEFAULT 0.00,
      p2_income REAL DEFAULT 0.00,
      p2_fixed_bills REAL DEFAULT 0.00,
      p2_lifestyle REAL DEFAULT 0.00,
      p2_savings REAL DEFAULT 0.00,
      p2_checking_buffer REAL DEFAULT 500.00,
      p2_leftover REAL DEFAULT 0.00,
      is_manual INTEGER DEFAULT 0,
      manual_fields TEXT DEFAULT '[]',
      p1_payday_mode TEXT DEFAULT 'prev_month_last_day',
      p1_payday_day INTEGER DEFAULT 0,
      p1_bill_start INTEGER DEFAULT 1,
      p1_bill_end INTEGER DEFAULT 15,
      p2_payday_mode TEXT DEFAULT 'day_of_month',
      p2_payday_day INTEGER DEFAULT 15,
      p2_bill_start INTEGER DEFAULT 16,
      p2_bill_end INTEGER DEFAULT 31
    );

    CREATE TABLE IF NOT EXISTS monthly_category_budgets (
      category_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      month TEXT NOT NULL,
      budget REAL NOT NULL,
      PRIMARY KEY (category_id, year, month),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );
  `);

  try {
    db.exec('ALTER TABLE transactions ADD COLUMN sort_order INTEGER DEFAULT 0');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE transactions ADD COLUMN linked_transaction_id TEXT DEFAULT NULL');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE monthly_category_budgets ADD COLUMN is_hidden INTEGER DEFAULT 0');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE categories ADD COLUMN is_hidden INTEGER DEFAULT 0');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE bills ADD COLUMN sort_order INTEGER DEFAULT 0');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE bills ADD COLUMN assigned_check TEXT DEFAULT NULL');
  } catch (e) {}

  try {
    const unranked = db.prepare('SELECT id FROM bills WHERE sort_order = 0 OR sort_order IS NULL').all() as any[];
    if (unranked.length > 0) {
      db.exec(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY due_day ASC, name ASC) as rn
          FROM bills
        )
        UPDATE bills
        SET sort_order = (SELECT rn FROM ranked WHERE ranked.id = bills.id)
        WHERE sort_order = 0 OR sort_order IS NULL;
      `);
    }
  } catch (e) {}

  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p1_payday_mode TEXT DEFAULT 'prev_month_last_day'");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p1_payday_day INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p1_bill_start INTEGER DEFAULT 1");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p1_bill_end INTEGER DEFAULT 15");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_payday_mode TEXT DEFAULT 'day_of_month'");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_payday_day INTEGER DEFAULT 15");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_bill_start INTEGER DEFAULT 16");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_bill_end INTEGER DEFAULT 31");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE goals ADD COLUMN type TEXT DEFAULT 'goal'");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p1_extra_debt REAL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_extra_debt REAL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_zero_sum_buffer REAL DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_zero_sum_savings REAL DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_zero_sum_debt REAL DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_zero_sum_target TEXT DEFAULT 'debt_overpayment'");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p1_transfers_in REAL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p1_transfers_out REAL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_transfers_in REAL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE paycheck_plan ADD COLUMN p2_transfers_out REAL");
  } catch (e) {}

  const catCount = (db.prepare('SELECT count(*) as count FROM categories').get() as { count: number }).count;
  if (catCount === 0) {
    console.log('🌸 Database empty. Ready for initial setup or backup restore.');
  }

  // Ensure all credit card and loan minimum payments match bills in Monthly Bills
  syncAllAccountsWithBills();
}

export function seedDatabase() {
  const seedFile = path.join(__dirname, '..', 'seed_data.json');
  if (!fs.existsSync(seedFile)) {
    console.warn('⚠️ seed_data.json not found, skipping initial seed.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

  const insertCategory = db.prepare('INSERT OR REPLACE INTO categories (id, name, icon, budget, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const insertAccount = db.prepare('INSERT OR REPLACE INTO accounts (id, name, type, balance, starting_balance, min_payment, apr, due_day, buffer, icon, category, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertBill = db.prepare('INSERT OR REPLACE INTO bills (id, name, due_day, category, amount, paycheck_assignment, paid_aug, paid_sep, paid_oct, paid_nov, paid_dec, auto_pay, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertAnnualBill = db.prepare('INSERT OR REPLACE INTO annual_bills (id, name, due_date, amount, is_paid, frequency, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertTx = db.prepare('INSERT OR REPLACE INTO transactions (id, account_id, date, description, category, type, amount, running_balance, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertGoal = db.prepare('INSERT OR REPLACE INTO goals (id, name, target_amount, current_amount, target_date, category, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertPaycheck = db.prepare('INSERT OR REPLACE INTO paycheck_plan (id, month, p1_period, p1_rollover, p1_income, p1_fixed_bills, p1_lifestyle, p1_savings, p1_rollover_next, p2_period, p2_rollover, p2_income, p2_fixed_bills, p2_lifestyle, p2_savings, p2_checking_buffer, p2_leftover) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  const tx = db.transaction(() => {
    db.exec('DELETE FROM transactions');
    db.exec('DELETE FROM categories');
    db.exec('DELETE FROM accounts');
    db.exec('DELETE FROM bills');
    db.exec('DELETE FROM annual_bills');
    db.exec('DELETE FROM goals');
    db.exec('DELETE FROM paycheck_plan');

    data.categories.forEach((c: any, idx: number) => {
      insertCategory.run(c.id, c.name, c.icon, c.budget, c.color, idx);
    });

    data.accounts.forEach((a: any, idx: number) => {
      insertAccount.run(a.id, a.name, a.type, a.balance, a.starting_balance, a.min_payment || 0, a.apr || 0, a.due_day || 1, a.buffer || 0, a.icon || '💳', a.category || 'general', idx);
    });

    data.bills.forEach((b: any) => {
      insertBill.run(
        b.id, b.name, b.due_day, b.category, b.amount, b.paycheck_assignment,
        b.paid_status?.Aug ? 1 : 0,
        b.paid_status?.Sep ? 1 : 0,
        b.paid_status?.Oct ? 1 : 0,
        b.paid_status?.Nov ? 1 : 0,
        b.paid_status?.Dec ? 1 : 0,
        b.auto_pay ? 1 : 0,
        b.notes || ''
      );
    });

    data.annual_bills.forEach((ab: any) => {
      insertAnnualBill.run(ab.id, ab.name, ab.due_date, ab.amount, ab.is_paid ? 1 : 0, ab.frequency, ab.notes || '');
    });

    data.transactions.forEach((t: any) => {
      insertTx.run(t.id, t.account_id, t.date, t.description, t.category, t.type, t.amount, t.running_balance, t.notes || '');
    });

    data.goals.forEach((g: any) => {
      insertGoal.run(g.id, g.name, g.target_amount, g.current_amount, g.target_date, g.category, g.color, g.icon || '🎯');
    });

    const p = data.paycheck_plan;
    insertPaycheck.run(
      p.month,
      p.paycheck1.period, p.paycheck1.rollover_balance, p.paycheck1.income, p.paycheck1.fixed_bills, p.paycheck1.lifestyle_budget, p.paycheck1.savings_assigned, p.paycheck1.rollover_next,
      p.paycheck2.period, p.paycheck2.rollover_balance, p.paycheck2.income, p.paycheck2.fixed_bills, p.paycheck2.lifestyle_budget, p.paycheck2.savings_assigned, p.paycheck2.checking_buffer, p.paycheck2.leftover
    );
  });

  tx();
  console.log('🌸 Seed completed successfully!');
}

export function recalculateAccountBalances(accountId?: string) {
  const accountsToUpdate = accountId ? [accountId] : (db.prepare('SELECT id FROM accounts').all() as { id: string }[]).map(a => a.id);

  const updateAccountStmt = db.prepare('UPDATE accounts SET balance = ? WHERE id = ?');
  const updateTxStmt = db.prepare('UPDATE transactions SET running_balance = ? WHERE id = ?');

  const runRecalc = db.transaction(() => {
    for (const accId of accountsToUpdate) {
      const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accId) as any;
      if (!account) continue;

      // Query transactions in exact display order, then reverse to calculate running balances
      // from bottom (oldest / starting balance) up to top (latest transaction).
      const displayTxs = db.prepare(`
        SELECT * FROM transactions 
        WHERE account_id = ? 
        ORDER BY (CASE WHEN sort_order IS NOT NULL AND sort_order > 0 THEN 0 ELSE 1 END), sort_order ASC, date DESC, created_at DESC
      `).all(accId) as any[];

      const chronTxs = [...displayTxs].reverse();

      const isBankType = account.type === 'checking' || account.type === 'savings' || account.type === 'cash';
      const hasStartingBalanceTx = chronTxs.some(t => t.description.toLowerCase().includes('starting balance') && t.amount > 0);
      let currentBal = (isBankType && hasStartingBalanceTx) ? 0 : (account.starting_balance || 0);
      
      for (const t of chronTxs) {
        if (t.type === 'Income') {
          if (account.type === 'credit_card' || account.type === 'loan' || account.type === 'auto_loan') {
            // For debt, payment (income to debt account) decreases balance
            currentBal -= t.amount;
          } else {
            // Checking / Savings / Cash: income increases balance
            currentBal += t.amount;
          }
        } else if (t.type === 'Payment') {
          // Payment decreases balance for both Credit Cards (reduces debt) and Bank Accounts (reduces cash)
          currentBal -= t.amount;
        } else if (t.type === 'Expense') {
          if (account.type === 'credit_card' || account.type === 'loan' || account.type === 'auto_loan') {
            // For debt, charge increases balance
            currentBal += t.amount;
          } else {
            // Checking / Savings / Cash: expense decreases balance
            currentBal -= t.amount;
          }
        } else if (t.type === 'Transfer') {
          const notesStr = (t.notes || '').toLowerCase();
          const descStr = (t.description || '').toLowerCase();
          const isDeposit = notesStr.includes('[transfer: in') || 
                            notesStr.includes('[transfer in') || 
                            notesStr.includes('deposit') ||
                            descStr.startsWith('transfer from') ||
                            descStr.includes('(from ');

          if (account.type === 'credit_card' || account.type === 'loan' || account.type === 'auto_loan') {
            // For debt accounts: deposit/transfer-in pays down debt (-), withdrawal/transfer-out draws on credit (+)
            if (isDeposit) {
              currentBal -= t.amount;
            } else {
              currentBal += t.amount;
            }
          } else {
            // For asset bank accounts (checking, savings, cash): deposit adds cash (+), withdrawal removes cash (-)
            if (isDeposit) {
              currentBal += t.amount;
            } else {
              currentBal -= t.amount;
            }
          }
        }
        // Track Only does not affect balance
        currentBal = Math.round(currentBal * 100) / 100;
        updateTxStmt.run(currentBal, t.id);
      }

      updateAccountStmt.run(currentBal, accId);
    }
  });

  runRecalc();
}

export function syncAccountWithBill(accountId: string, accountName: string, minPayment: number, dueDay?: number) {
  try {
    const allBills = db.prepare('SELECT * FROM bills').all() as any[];
    
    // 1. Direct name match (case-insensitive)
    let match = allBills.find(b => b.name.trim().toLowerCase() === accountName.trim().toLowerCase());
    
    // 2. Fallback fuzzy normalization
    if (!match) {
      const norm = (s: string) => s.toLowerCase().replace(/visa/g, '').replace(/vis/g, '').replace(/credit/g, '').replace(/[^a-z0-9]/g, '');
      const accNorm = norm(accountName);
      if (accNorm.length >= 3) {
        match = allBills.find(b => {
          if (b.name.includes('(comes out of') || b.name.includes('comes out of')) return false;
          const billNorm = norm(b.name);
          return billNorm === accNorm;
        });
      }
    }

    if (match) {
      if (dueDay !== undefined) {
        db.prepare('UPDATE bills SET amount = ?, due_day = ? WHERE id = ?').run(minPayment, dueDay, match.id);
      } else {
        db.prepare('UPDATE bills SET amount = ? WHERE id = ?').run(minPayment, match.id);
      }
      console.log(`🌸 Synced account '${accountName}' ($${minPayment}) to bill '${match.name}' (${match.id})`);
    }
  } catch (err) {
    console.error('Error syncing account to bill:', err);
  }
}

export function syncAllAccountsWithBills() {
  try {
    const accounts = db.prepare("SELECT * FROM accounts WHERE type IN ('credit_card', 'loan', 'auto_loan') OR category IN ('revolving', 'auto_loan', 'personal_loan')").all() as any[];
    for (const acc of accounts) {
      if (acc.min_payment !== undefined && acc.min_payment !== null) {
        syncAccountWithBill(acc.id, acc.name, Number(acc.min_payment), acc.due_day);
      }
    }
    console.log('🌸 All credit card & loan minimum payments synced to Monthly Bills!');
  } catch (e) {
    console.error('Error during syncAllAccountsWithBills:', e);
  }
}
