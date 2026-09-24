import React, { useState } from 'react';
import { useBudget } from '../../context/BudgetContext';
import { BankAccountsView } from './BankAccountsView';
import { CreditCardsView } from './CreditCardsView';
import { FixedDebtView } from './FixedDebtView';

interface Props {
  initialSubTab?: 'bank' | 'credit' | 'fixed';
}

export const AccountLedgerView: React.FC<Props> = ({ initialSubTab = 'bank' }) => {
  const { activeTab, setActiveTab } = useBudget();
  
  const getInitial = () => {
    if (activeTab === 'bank_accounts') return 'bank';
    if (activeTab === 'credit_cards') return 'credit';
    if (activeTab === 'fixed_debt') return 'fixed';
    return initialSubTab;
  };

  const [subTab, setSubTab] = useState<'bank' | 'credit' | 'fixed'>(getInitial());

  const handleSubTabChange = (tab: 'bank' | 'credit' | 'fixed') => {
    setSubTab(tab);
    if (tab === 'bank') setActiveTab('bank_accounts');
    if (tab === 'credit') setActiveTab('credit_cards');
    if (tab === 'fixed') setActiveTab('fixed_debt');
  };

  return (
    <div className="space-y-6">
      {/* 3-Way Top Account Category Picker */}
      <div className="bg-white p-2 rounded-3xl border border-[#e4e0e2] shadow-kawaii flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => handleSubTabChange('bank')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'bank'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span>🏦</span>
            <span>Bank Accounts (3)</span>
          </button>

          <button
            onClick={() => handleSubTabChange('credit')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'credit'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span>💳</span>
            <span>Credit Cards (8)</span>
          </button>

          <button
            onClick={() => handleSubTabChange('fixed')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'fixed'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span>🚗</span>
            <span>Fixed Debt &amp; Loans (3)</span>
          </button>
        </div>
      </div>

      {/* Render selected view */}
      {subTab === 'bank' && <BankAccountsView />}
      {subTab === 'credit' && <CreditCardsView />}
      {subTab === 'fixed' && <FixedDebtView />}
    </div>
  );
};
