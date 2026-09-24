import React from 'react';
import { 
  PieChart, 
  CalendarCheck2, 
  Target, 
  CreditCard, 
  Landmark, 
  TrendingUp, 
  Award, 
  Database,
  HeartHandshake,
  Car
} from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, setSelectedAccountId } = useBudget();

  return (
    <aside className="w-full md:w-60 lg:w-64 bg-white border border-[#e4e0e2] rounded-3xl p-3 flex flex-col justify-between shrink-0 shadow-kawaii md:sticky md:top-20 md:self-start md:max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div className="space-y-4">
        {/* Core Budgeting Section */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold tracking-wider text-[#64748b] uppercase font-cute">
            Budget &amp; Expenses
          </div>

          <button
            onClick={() => setActiveTab('budget')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer ${
              activeTab === 'budget'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">🌸</span>
            <span className="flex-1">Monthly Budget</span>
          </button>

          <button
            onClick={() => setActiveTab('bills')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer ${
              activeTab === 'bills'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">📅</span>
            <span className="flex-1">Monthly Bills</span>
          </button>

          <button
            onClick={() => setActiveTab('sinking')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer ${
              activeTab === 'sinking'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">📦</span>
            <span className="flex-1">Sinking Funds</span>
          </button>
        </div>

        {/* Account Ledgers Section */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold tracking-wider text-[#64748b] uppercase font-cute">
            Accounts &amp; Ledgers
          </div>

          <button
            onClick={() => {
              setActiveTab('bank_accounts');
              setSelectedAccountId('acc_checking');
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeTab === 'bank_accounts'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">🏦</span>
            <span className="flex-1">Bank Accounts</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('credit_cards');
              setSelectedAccountId('debt_cap1');
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeTab === 'credit_cards'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">💳</span>
            <span className="flex-1">Credit Cards</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('fixed_debt');
              setSelectedAccountId('debt_subaru');
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeTab === 'fixed_debt'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">🚗</span>
            <span className="flex-1">Fixed Debt &amp; Loans</span>
          </button>
        </div>

        {/* Planning & Wealth Section */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold tracking-wider text-[#64748b] uppercase font-cute">
            Planning &amp; Wealth
          </div>

          <button
            onClick={() => setActiveTab('paycheck')}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeTab === 'paycheck'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">🎀</span>
            <span className="flex-1">Paycheck Waterfall</span>
          </button>

          <button
            onClick={() => setActiveTab('debt')}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeTab === 'debt'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">⚡</span>
            <span className="flex-1">Debt Payoff</span>
          </button>

          <button
            onClick={() => setActiveTab('projections')}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeTab === 'projections'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">🔮</span>
            <span className="flex-1">Projections &amp; Growth</span>
          </button>

          <button
            onClick={() => setActiveTab('goals')}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeTab === 'goals'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white shadow-md shadow-rose-900/15'
                : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#7d3c4c]'
            }`}
          >
            <span className="text-base">🎯</span>
            <span className="flex-1">Financial Goals</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
