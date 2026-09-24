import React from 'react';
import { useBudget } from './context/BudgetContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { MonthlyBudgetView } from './components/budget/MonthlyBudgetView';
import { BillBreakdownView } from './components/bills/BillBreakdownView';
import { SinkingFundsView } from './components/sinking-funds/SinkingFundsView';
import { DebtCenterView } from './components/debt/DebtCenterView';
import { BankAccountsView } from './components/accounts/BankAccountsView';
import { CreditCardsView } from './components/accounts/CreditCardsView';
import { FixedDebtView } from './components/accounts/FixedDebtView';
import { AccountLedgerView } from './components/accounts/AccountLedgerView';
import { PaycheckAllocatorView } from './components/paycheck/PaycheckAllocatorView';
import { ProjectionsView } from './components/projections/ProjectionsView';
import { GoalsView } from './components/goals/GoalsView';
import { BackupExportView } from './components/backup/BackupExportView';
import { QuickAddModal } from './components/transactions/QuickAddModal';
import { CommandPalette } from './components/common/CommandPalette';

export const App: React.FC = () => {
  const { activeTab, loading, toastMessage } = useBudget();

  const renderActiveView = () => {
    switch (activeTab) {
      case 'budget':
        return <MonthlyBudgetView />;
      case 'bills':
        return <BillBreakdownView />;
      case 'sinking':
        return <SinkingFundsView />;
      case 'debt':
        return <DebtCenterView />;
      case 'accounts':
        return <AccountLedgerView />;
      case 'bank_accounts':
        return <BankAccountsView />;
      case 'credit_cards':
        return <CreditCardsView />;
      case 'fixed_debt':
        return <FixedDebtView />;
      case 'paycheck':
        return <PaycheckAllocatorView />;
      case 'projections':
        return <ProjectionsView />;
      case 'goals':
        return <GoalsView />;
      case 'backup':
        return <BackupExportView />;
      default:
        return <MonthlyBudgetView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f4f2] flex flex-col font-sans text-[#1f242e] selection:bg-[#f8d5db] selection:text-[#7d3c4c]">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Layout Body */}
      <div className="flex-1 w-full flex flex-col md:flex-row gap-6 px-4 sm:px-6 lg:px-8 py-6">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <main className="flex-1 w-full min-w-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-3">
              <span className="text-4xl animate-bounce">🌸</span>
              <p className="text-sm font-bold text-[#7d3c4c] font-cute">Loading your Kawaii Budget...</p>
            </div>
          ) : (
            renderActiveView()
          )}
        </main>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#7d3c4c] text-white px-5 py-3 rounded-2xl shadow-2xl border border-rose-300 font-bold text-xs flex items-center gap-2 animate-in slide-in-from-bottom-5 duration-300">
          <span>🌸</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals & Command Palette */}
      <QuickAddModal />
      <CommandPalette />
    </div>
  );
};
