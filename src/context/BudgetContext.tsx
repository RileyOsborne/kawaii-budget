import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { api } from '../api/client';
import { Category, Account, Bill, AnnualBill, Transaction, Goal, PaycheckPlan, OverviewStats } from '../types';

interface BudgetContextType {
  stats: OverviewStats | null;
  categories: Category[];
  accounts: Account[];
  bills: Bill[];
  annualBills: AnnualBill[];
  transactions: Transaction[];
  goals: Goal[];
  paycheckPlan: PaycheckPlan | null;
  loading: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isQuickAddOpen: boolean;
  setIsQuickAddOpen: (open: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  selectedMonth: string; // e.g. 'Aug'
  selectedYear: number;  // e.g. 2026
  setSelectedMonth: (month: string) => void;
  setSelectedYear: (year: number) => void;
  nextMonth: () => void;
  prevMonth: () => void;
  refreshData: (m?: string, y?: number) => Promise<void>;
  triggerConfetti: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export const BudgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [annualBills, setAnnualBills] = useState<AnnualBill[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [paycheckPlan, setPaycheckPlan] = useState<PaycheckPlan | null>(null);
  
  const monthsList = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const VALID_TABS = [
    'budget', 'bills', 'sinking', 'debt', 'accounts',
    'bank_accounts', 'credit_cards', 'fixed_debt',
    'paycheck', 'projections', 'goals', 'backup'
  ];

  const getInitialTab = (): string => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && VALID_TABS.includes(hash)) return hash;
      const saved = localStorage.getItem('kawaii_budget_active_tab');
      if (saved && VALID_TABS.includes(saved)) return saved;
    }
    return 'budget';
  };

  const getInitialMonth = (): string => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kawaii_budget_selected_month');
      if (saved && monthsList.includes(saved)) return saved;
    }
    const currentM = monthsList[new Date().getMonth()];
    return currentM || 'Sep';
  };

  const getInitialYear = (): number => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kawaii_budget_selected_year');
      const y = saved ? Number(saved) : 2026;
      if (!isNaN(y) && y >= 2020 && y <= 2040) return y;
    }
    const currentY = new Date().getFullYear();
    return currentY >= 2020 ? currentY : 2026;
  };

  const getInitialAccountId = (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('kawaii_budget_selected_account_id') || null;
    }
    return null;
  };

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTabState] = useState<string>(getInitialTab);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(getInitialAccountId);
  const [selectedMonth, setSelectedMonthState] = useState<string>(getInitialMonth);
  const [selectedYear, setSelectedYearState] = useState<number>(getInitialYear);

  const setActiveTab = useCallback((tabOrUpdater: string | ((prev: string) => string)) => {
    setActiveTabState(prev => {
      const nextTab = typeof tabOrUpdater === 'function' ? tabOrUpdater(prev) : tabOrUpdater;
      try {
        localStorage.setItem('kawaii_budget_active_tab', nextTab);
        if (window.location.hash.replace(/^#/, '') !== nextTab) {
          window.location.hash = nextTab;
        }
      } catch {}
      return nextTab;
    });
  }, []);

  const setSelectedMonth = useCallback((monthOrUpdater: string | ((prev: string) => string)) => {
    setSelectedMonthState(prev => {
      const nextM = typeof monthOrUpdater === 'function' ? monthOrUpdater(prev) : monthOrUpdater;
      try {
        localStorage.setItem('kawaii_budget_selected_month', nextM);
      } catch {}
      return nextM;
    });
  }, []);

  const setSelectedYear = useCallback((yearOrUpdater: number | ((prev: number) => number)) => {
    setSelectedYearState(prev => {
      const nextY = typeof yearOrUpdater === 'function' ? yearOrUpdater(prev) : yearOrUpdater;
      try {
        localStorage.setItem('kawaii_budget_selected_year', String(nextY));
      } catch {}
      return nextY;
    });
  }, []);

  const setSelectedAccountId = useCallback((idOrUpdater: string | null | ((prev: string | null) => string | null)) => {
    setSelectedAccountIdState(prev => {
      const nextId = typeof idOrUpdater === 'function' ? idOrUpdater(prev) : idOrUpdater;
      try {
        if (nextId) {
          localStorage.setItem('kawaii_budget_selected_account_id', nextId);
        } else {
          localStorage.removeItem('kawaii_budget_selected_account_id');
        }
      } catch {}
      return nextId;
    });
  }, []);

  // Sync hash changes (e.g. browser back/forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && VALID_TABS.includes(hash)) {
        setActiveTabState(hash);
        try {
          localStorage.setItem('kawaii_budget_active_tab', hash);
        } catch {}
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const selectedMonthRef = useRef(selectedMonth);
  const selectedYearRef = useRef(selectedYear);

  useEffect(() => {
    selectedMonthRef.current = selectedMonth;
    selectedYearRef.current = selectedYear;
  }, [selectedMonth, selectedYear]);

  const nextMonth = () => {
    const idx = monthsList.indexOf(selectedMonth);
    if (idx === 11) {
      setSelectedMonth('Jan');
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(monthsList[idx + 1]);
    }
  };

  const prevMonth = () => {
    const idx = monthsList.indexOf(selectedMonth);
    if (idx === 0) {
      setSelectedMonth('Dec');
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(monthsList[idx - 1]);
    }
  };
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  const triggerConfetti = useCallback(() => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#f472b6', '#fb7185', '#fda4af', '#facc15', '#a855f7', '#34d399'],
    });
  }, []);

  const refreshData = useCallback(async (mOverride?: string, yOverride?: number) => {
    try {
      const m = mOverride || selectedMonthRef.current;
      const y = yOverride || selectedYearRef.current;
      const results = await Promise.allSettled([
        api.getStats(m, y),
        api.getCategories(m, y, true),
        api.getAccounts(),
        api.getBills(),
        api.getAnnualBills(),
        api.getTransactions(),
        api.getGoals(),
        api.getPaycheckPlan(m, y),
      ]);

      if (results[0].status === 'fulfilled') setStats(results[0].value);
      if (results[1].status === 'fulfilled') setCategories(results[1].value);
      if (results[2].status === 'fulfilled') setAccounts(results[2].value);
      if (results[3].status === 'fulfilled') setBills(results[3].value);
      if (results[4].status === 'fulfilled') setAnnualBills(results[4].value);
      if (results[5].status === 'fulfilled') setTransactions(results[5].value);
      if (results[6].status === 'fulfilled') setGoals(results[6].value);
      if (results[7].status === 'fulfilled') setPaycheckPlan(results[7].value);

      const hasRejection = results.some(r => r.status === 'rejected');
      if (hasRejection) {
        console.warn('One or more data queries failed:', results);
      }
    } catch (err: any) {
      console.error('Failed to fetch budget data:', err);
      showToast('⚠️ Could not connect to local server.');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refreshData(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear, refreshData]);

  // Global hotkeys (N for quick add, Super+S for search, 1-9 for instant tab switching)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Super+S or Ctrl+S or Cmd+K anywhere (even from inputs if searching)
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

      // Don't trigger single-key shortcuts if typing inside an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsQuickAddOpen(true);
      } else if (e.key === '1') {
        setActiveTab('budget');
      } else if (e.key === '2') {
        setActiveTab('bills');
      } else if (e.key === '3') {
        setActiveTab('sinking');
      } else if (e.key === '4') {
        setActiveTab('debt');
      } else if (e.key === '5') {
        setActiveTab('bank_accounts');
        setSelectedAccountId('acc_checking');
      } else if (e.key === '6') {
        setActiveTab('credit_cards');
        setSelectedAccountId('debt_cap1');
      } else if (e.key === '7') {
        setActiveTab('fixed_debt');
        setSelectedAccountId('debt_subaru');
      } else if (e.key === '8') {
        setActiveTab('paycheck');
      } else if (e.key === '9') {
        setActiveTab('projections');
      } else if (e.key === '0') {
        setActiveTab('goals');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, setSelectedAccountId]);

  return (
    <BudgetContext.Provider
      value={{
        stats,
        categories,
        accounts,
        bills,
        annualBills,
        transactions,
        goals,
        paycheckPlan,
        loading,
        activeTab,
        setActiveTab,
        isQuickAddOpen,
        setIsQuickAddOpen,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        selectedAccountId,
        setSelectedAccountId,
        selectedMonth,
        selectedYear,
        setSelectedMonth,
        setSelectedYear,
        nextMonth,
        prevMonth,
        refreshData,
        triggerConfetti,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudget = () => {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error('useBudget must be used within a BudgetProvider');
  }
  return context;
};
