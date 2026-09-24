import React, { useState } from 'react';
import { CreditCard, Award, Flame, Zap, ArrowRight, ShieldCheck, ChevronRight, Plus } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, formatPercent, getOrdinalSuffix, formatApr } from '../../utils/formatters';
import { ProgressBar } from '../common/ProgressBar';
import { KawaiiBadge } from '../common/KawaiiBadge';
import { DebtSnowballCalculator } from './DebtSnowballCalculator';

export const DebtCenterView: React.FC = () => {
  const { stats, accounts, setActiveTab, setSelectedAccountId, setIsQuickAddOpen } = useBudget();
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'snowball'>('overview');

  const revolving = accounts.filter(a => a.category === 'revolving');
  const autoLoans = accounts.filter(a => a.category === 'auto_loan' || a.category === 'personal_loan');

  const totalDebt = (stats?.debt.total ?? 0);
  const revolvingTotal = (stats?.debt.revolving ?? 0);
  const autoTotal = (stats?.debt.auto ?? 0);

  const paidOffCardsCount = revolving.filter(a => a.balance === 0).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
            <span>🌸</span> Debt Payoff Hub
          </h2>
          <p className="text-xs text-rose-400 font-medium mt-1">
            Track, crush, and eliminate your revolving credit, personal &amp; auto loans
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-white p-1 rounded-2xl border border-[#e4e0e2] shadow-sm">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'overview'
                ? 'bg-[#7d3c4c] text-white shadow-md'
                : 'text-[#52212e] hover:text-[#f472b6]'
            }`}
          >
            📊 Debt Balances
          </button>
          <button
            onClick={() => setActiveSubTab('snowball')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'snowball'
                ? 'bg-[#7d3c4c] text-white shadow-md'
                : 'text-[#52212e] hover:text-[#f472b6]'
            }`}
          >
            ⚡ Payoff Simulator
          </button>
        </div>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii">
          <div className="flex justify-between items-center text-xs font-bold text-rose-500 uppercase font-cute">
            <span>Total Debt Remaining</span>
            <CreditCard className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-[#1f242e] font-mono mt-1">
            {formatCurrency(totalDebt)}
          </div>
          <p className="text-xs text-[#64748b] mt-1">Combined Credit Cards &amp; Loans</p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii">
          <div className="flex justify-between items-center text-xs font-bold text-rose-500 uppercase font-cute">
            <span>Revolving Credit Cards</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-[#1f242e] font-mono mt-1">
            {formatCurrency(revolvingTotal)}
          </div>
          <p className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            <Award className="w-3.5 h-3.5" /> {paidOffCardsCount} cards 100% paid off!
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii">
          <div className="flex justify-between items-center text-xs font-bold text-rose-500 uppercase font-cute">
            <span>Auto &amp; Personal Loans Total</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-[#1f242e] font-mono mt-1">
            {formatCurrency(autoTotal)}
          </div>
          <p className="text-xs text-[#64748b] mt-1">{autoLoans.length > 0 ? autoLoans.map(a => a.name).join(', ') : 'Auto & Personal Loans'}</p>
        </div>
      </div>

      {activeSubTab === 'snowball' ? (
        <DebtSnowballCalculator />
      ) : (
        <div className="space-y-8">
          {/* Revolving / Credit Cards Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
                <span>💳</span> Credit Cards
              </h3>
              <span className="text-xs font-mono font-bold text-[#1f242e] bg-[#fdf6f8] px-3 py-1 rounded-xl border border-[#ebd0d9]">
                Subtotal: {formatCurrency(revolvingTotal)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {revolving.map((acc) => {
                const isPaidOff = acc.balance === 0;
                const paidOffAmount = (acc.starting_balance || 0) - acc.balance;
                const progressRatio = acc.starting_balance > 0 ? (paidOffAmount / acc.starting_balance) : 1;

                return (
                  <div
                    key={acc.id}
                    className={`bg-white rounded-3xl p-5 border transition-all shadow-kawaii hover:shadow-kawaii-lg flex flex-col justify-between ${
                      isPaidOff ? 'border-emerald-200 bg-emerald-50/20' : 'border-[#e4e0e2]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{acc.icon}</span>
                        {isPaidOff ? (
                          <KawaiiBadge variant="green">🌸 100% PAID OFF</KawaiiBadge>
                        ) : (
                          <KawaiiBadge variant="mauve">Due {getOrdinalSuffix(acc.due_day)}</KawaiiBadge>
                        )}
                      </div>

                      <h4 className="text-base font-bold text-[#1f242e] mt-2">{acc.name}</h4>

                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-[#64748b] font-medium">Current Balance:</span>
                          <span className="font-mono font-extrabold text-[#1f242e] text-sm">
                            {formatCurrency(acc.balance)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[#64748b] font-medium">Min. Payment:</span>
                          <span className="font-mono font-semibold text-[#1f242e]">
                            {formatCurrency(acc.min_payment)}/mo
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[#64748b] font-medium">Interest Rate (APR):</span>
                          <span className="font-mono font-semibold text-rose-500">
                            {formatApr(acc.apr)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex justify-between text-[11px] font-bold text-[#64748b] mb-1">
                          <span>Paid Off: {formatPercent(progressRatio)}</span>
                          <span>Start: {formatCurrency(acc.starting_balance)}</span>
                        </div>
                        <ProgressBar value={progressRatio} color={isPaidOff ? '#10b981' : '#f472b6'} />
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-rose-50 flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          setSelectedAccountId(acc.id);
                          setActiveTab('credit_cards');
                        }}
                        className="text-xs text-[#f472b6] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>View Ledger</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setIsQuickAddOpen(true)}
                        className="text-xs bg-rose-100 hover:bg-rose-200 text-[#f472b6] font-bold px-3 py-1 rounded-xl transition-all cursor-pointer"
                      >
                        + Log Payment
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Auto & Personal Loans Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
                <span>🚗</span> Auto &amp; Personal Loans
              </h3>
              <span className="text-xs font-mono font-bold text-[#1f242e] bg-[#fdf6f8] px-3 py-1 rounded-xl border border-[#ebd0d9]">
                Subtotal: {formatCurrency(autoTotal)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {autoLoans.map((acc) => {
                const paidOff = (acc.starting_balance || 0) - acc.balance;
                const ratio = acc.starting_balance > 0 ? (paidOff / acc.starting_balance) : 0;
                const isPaidOff = acc.balance === 0;

                return (
                  <div
                    key={acc.id}
                    className={`bg-white rounded-3xl p-6 border transition-all shadow-kawaii hover:shadow-kawaii-lg flex flex-col justify-between ${
                      isPaidOff ? 'border-emerald-200 bg-emerald-50/20' : 'border-[#e4e0e2]'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{acc.icon}</span>
                          <div>
                            <h4 className="text-base font-bold text-[#1f242e]">{acc.name}</h4>
                            <span className="text-xs text-rose-400 font-medium">Monthly: {formatCurrency(acc.min_payment)} • Due {getOrdinalSuffix(acc.due_day)}</span>
                          </div>
                        </div>
                        <KawaiiBadge variant="mauve">{formatApr(acc.apr)} APR</KawaiiBadge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 my-4 p-3 bg-[#fdf6f8]/40 rounded-2xl border border-[#e4e0e2] text-center">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#64748b] block">Starting</span>
                          <span className="font-mono text-xs font-bold text-[#1f242e]">{formatCurrency(acc.starting_balance)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-emerald-600 block">Paid</span>
                          <span className="font-mono text-xs font-bold text-emerald-700">{formatCurrency(paidOff)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-rose-500 block">Remaining</span>
                          <span className="font-mono text-xs font-bold text-[#1f242e]">{formatCurrency(acc.balance)}</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-bold text-[#52212e] mb-1">
                          <span>Progress</span>
                          <span>{formatPercent(ratio)}</span>
                        </div>
                        <ProgressBar value={ratio} color="#7d3c4c" height="h-3" />
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-rose-50 flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          setSelectedAccountId(acc.id);
                          setActiveTab('fixed_debt');
                        }}
                        className="text-xs text-[#f472b6] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>View Ledger</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setIsQuickAddOpen(true)}
                        className="text-xs bg-rose-100 hover:bg-rose-200 text-[#f472b6] font-bold px-3 py-1 rounded-xl transition-all cursor-pointer"
                      >
                        + Log Payment
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
