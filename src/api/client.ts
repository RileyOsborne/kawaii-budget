import { Category, Account, Bill, AnnualBill, Transaction, Goal, PaycheckPlan, OverviewStats, ProjectionsData, BackupItem, ExternalBackupInspection, TransferPayload } from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const isGet = !options || !options.method || options.method.toUpperCase() === 'GET';
  const finalUrl = isGet 
    ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}` 
    : url;

  const res = await fetch(finalUrl, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...(options?.headers || {}),
    },
    cache: 'no-store',
    ...options,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Stats
  getStats: (month = 'Sep', year = 2026) => fetchJson<OverviewStats>(`${API_BASE}/stats/overview?month=${month}&year=${year}`),

  // Categories
  getCategories: (month?: string, year?: number, all?: boolean) => 
    fetchJson<Category[]>(`${API_BASE}/categories?month=${month || ''}&year=${year || ''}${all ? '&all=true' : ''}`),
  createCategory: (data: Partial<Category> & { month?: string; year?: number }) =>
    fetchJson<{ id: string; success: boolean }>(`${API_BASE}/categories`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: string, data: Partial<Category> & { month?: string; year?: number }) => 
    fetchJson<{ success: boolean }>(`${API_BASE}/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: string, params?: { month?: string; year?: number; scope?: 'month' | 'all' }) => {
    const query = new URLSearchParams();
    if (params?.month) query.set('month', params.month);
    if (params?.year) query.set('year', String(params.year));
    if (params?.scope) query.set('scope', params.scope);
    const qs = query.toString();
    return fetchJson<{ success: boolean }>(`${API_BASE}/categories/${id}${qs ? `?${qs}` : ''}`, {
      method: 'DELETE',
    });
  },
  reorderCategories: (order: string[]) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/categories-reorder`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),

  // Accounts & Debt
  getAccounts: () => fetchJson<Account[]>(`${API_BASE}/accounts`),
  updateAccount: (id: string, data: Partial<Account>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  reorderAccounts: (order: string[]) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/accounts-reorder`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),

  // Bills
  getBills: () => fetchJson<Bill[]>(`${API_BASE}/bills`),
  createBill: (data: Partial<Bill>) =>
    fetchJson<{ id: string; success: boolean }>(`${API_BASE}/bills`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateBill: (id: string, data: Partial<Bill>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/bills/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleBillPaid: (id: string, month: string) =>
    fetchJson<{ success: boolean; newVal: number }>(`${API_BASE}/bills/${id}/toggle-paid`, {
      method: 'PATCH',
      body: JSON.stringify({ month }),
    }),
  deleteBill: (id: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/bills/${id}`, {
      method: 'DELETE',
    }),
  reorderBills: (order: string[]) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/bills-reorder`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),

  // Annual Bills
  getAnnualBills: () => fetchJson<AnnualBill[]>(`${API_BASE}/annual-bills`),
  createAnnualBill: (data: Partial<AnnualBill>) =>
    fetchJson<{ id: string; success: boolean }>(`${API_BASE}/annual-bills`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAnnualBill: (id: string, data: Partial<AnnualBill>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/annual-bills/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleAnnualBillPaid: (id: string) =>
    fetchJson<{ success: boolean; is_paid: number }>(`${API_BASE}/annual-bills/${id}/toggle-paid`, {
      method: 'PATCH',
    }),
  deleteAnnualBill: (id: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/annual-bills/${id}`, {
      method: 'DELETE',
    }),

  // Transactions
  getTransactions: (accountId?: string) =>
    fetchJson<Transaction[]>(`${API_BASE}/transactions${accountId ? `?account_id=${accountId}` : ''}`),
  createTransaction: (data: Partial<Transaction>) =>
    fetchJson<{ id: string; success: boolean }>(`${API_BASE}/transactions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createTransfer: (data: TransferPayload) =>
    fetchJson<{ success: boolean; source_transaction_id: string; destination_transaction_id: string }>(
      `${API_BASE}/transfers`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
  createTransactionsBulk: (transactions: Partial<Transaction>[]) =>
    fetchJson<{ success: boolean; count: number }>(`${API_BASE}/transactions/bulk`, {
      method: 'POST',
      body: JSON.stringify({ transactions }),
    }),
  updateTransaction: (id: string, data: Partial<Transaction>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteTransaction: (id: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/transactions/${id}`, {
      method: 'DELETE',
    }),
  reorderTransactions: (accountId: string, order: string[]) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/transactions-reorder`, {
      method: 'PUT',
      body: JSON.stringify({ account_id: accountId, order }),
    }),

  // Paycheck Plan
  getPaycheckPlan: (month = 'Aug', year = 2026) => fetchJson<PaycheckPlan>(`${API_BASE}/paycheck?month=${month}&year=${year}`),
  updatePaycheckPlan: (data: Partial<PaycheckPlan>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/paycheck`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Goals
  getGoals: () => fetchJson<Goal[]>(`${API_BASE}/goals`),
  createGoal: (data: Partial<Goal>) =>
    fetchJson<{ id: string; success: boolean }>(`${API_BASE}/goals`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateGoal: (id: string, data: Partial<Goal>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/goals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteGoal: (id: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/goals/${id}`, {
      method: 'DELETE',
    }),

  // Projections
  getProjections: (extraSnowball = 500, strategy = 'snowball', month = 'Sep', year = 2026, savingsContribution?: number) =>
    fetchJson<ProjectionsData>(`${API_BASE}/projections?extraSnowball=${extraSnowball}&strategy=${strategy}&month=${month}&year=${year}${savingsContribution !== undefined ? `&savingsContribution=${savingsContribution}` : ''}`),

  // Tarball Database Backups & Snapshots
  getBackupsList: () => fetchJson<BackupItem[]>(`${API_BASE}/backup/list`),
  createInstantBackup: () =>
    fetchJson<{ success: boolean; backup: BackupItem }>(`${API_BASE}/backup/create-tarball`, {
      method: 'POST',
    }),
  restoreBackupTarball: (filename: string) =>
    fetchJson<{ success: boolean; message: string; metadata: any }>(`${API_BASE}/backup/restore-tarball`, {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }),
  deleteBackupTarball: (filename: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/backup/delete-tarball/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  // External Backup Staging & Restoration
  stageExternalBackup: async (file: File) => {
    const res = await fetch(`${API_BASE}/backup/stage-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': encodeURIComponent(file.name),
      },
      body: file,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Failed to upload and inspect backup file');
    }
    return res.json() as Promise<{
      token: string;
      stageFilename: string;
      inspection: ExternalBackupInspection;
    }>;
  },
  confirmStageRestore: (token: string, stageFilename: string) =>
    fetchJson<{ success: boolean; message: string; metadata?: any }>(
      `${API_BASE}/backup/confirm-stage-restore`,
      {
        method: 'POST',
        body: JSON.stringify({ token, stageFilename }),
      }
    ),
  inspectServerPath: (filePath: string) =>
    fetchJson<{ inspection: ExternalBackupInspection; resolvedPath: string }>(
      `${API_BASE}/backup/inspect-server-path`,
      {
        method: 'POST',
        body: JSON.stringify({ filePath }),
      }
    ),
  restoreServerPath: (filePath: string) =>
    fetchJson<{ success: boolean; message: string; metadata?: any }>(
      `${API_BASE}/backup/restore-server-path`,
      {
        method: 'POST',
        body: JSON.stringify({ filePath }),
      }
    ),

  // Backup & Seed
  exportBackup: () => fetchJson<any>(`${API_BASE}/backup/export-json`),
  importBackup: (data: any) =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/backup/import-json`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  resetSeed: () =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/backup/reset-seed`, {
      method: 'POST',
    }),
};
