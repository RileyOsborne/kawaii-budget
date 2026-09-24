import React, { useState, useMemo } from 'react';
import { Sparkles, DollarSign, Calendar, ArrowRight, Award, MountainSnow } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, formatPercent, formatApr } from '../../utils/formatters';
import { calculateDebtPayoff, calculateWaterfallLeftover } from '../../utils/calculations';
import { KawaiiBadge } from '../common/KawaiiBadge';

export const DebtSnowballCalculator: React.FC = () => {
  const { accounts, stats, bills, paycheckPlan, transactions, categories, selectedMonth, selectedYear } = useBudget();
  const [extraMonthly, setExtraMonthly] = useState<number>(500);
  const [strategy, setStrategy] = useState<'snowball' | 'avalanche' | 'highest_balance'>('snowball');

  // Map directly to True Cash Flow 'Leftover Free Cash' final output variable from the Paycheck Waterfall Log
  const leftoverFreeCash = useMemo(() => {
    return calculateWaterfallLeftover({
      paycheckPlan,
      accounts,
      bills,
      transactions,
      categories,
      selectedMonth,
      selectedYear,
      stats
    });
  }, [paycheckPlan, accounts, bills, transactions, categories, selectedMonth, selectedYear, stats]);

  // Dynamic slider max based on true leftover and input value
  const sliderMax = Math.max(6000, Math.ceil(leftoverFreeCash / 500) * 500, Math.ceil(extraMonthly / 500) * 500);

  const result = useMemo(() => {
    return calculateDebtPayoff(accounts, extraMonthly, strategy);
  }, [accounts, extraMonthly, strategy]);

  const now = new Date(2026, 7, 1);
  const debtFreeDate = new Date(now.getFullYear(), now.getMonth() + result.totalMonths, 1);
  const debtFreeStr = debtFreeDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Controls Card */}
      <div className="bg-white rounded-3xl p-6 border border-[#e4e0e2] shadow-kawaii space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
              <span>⚡</span> Interactive Payoff Simulator
            </h3>
            <p className="text-xs text-rose-400 font-medium mt-0.5">
              See how applying leftover paycheck surplus crushes debt and accelerates your debt-free milestone
            </p>
          </div>

          {/* Strategy Toggle with Thematic Emojis */}
          <div className="flex items-center bg-[#fdf6f8] p-1 rounded-2xl border border-[#ebd0d9] flex-wrap gap-1">
            <button
              onClick={() => setStrategy('snowball')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                strategy === 'snowball'
                  ? 'bg-[#7d3c4c] text-white shadow-sm'
                  : 'text-[#52212e] hover:text-[#f472b6]'
              }`}
            >
              ⛄ Snowball (Lowest Balance First)
            </button>
            <button
              onClick={() => setStrategy('avalanche')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                strategy === 'avalanche'
                  ? 'bg-[#7d3c4c] text-white shadow-sm'
                  : 'text-[#52212e] hover:text-[#f472b6]'
              }`}
            >
              🏔️ Avalanche (Highest APR First)
            </button>
            <button
              onClick={() => setStrategy('highest_balance')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                strategy === 'highest_balance'
                  ? 'bg-[#7d3c4c] text-white shadow-sm'
                  : 'text-[#52212e] hover:text-[#f472b6]'
              }`}
            >
              🐘 Highest Balance First
            </button>
          </div>
        </div>

        {/* Dynamic Extra Monthly Payment Controls */}
        <div className="space-y-3 pt-3 border-t border-[#e4e0e2]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="text-xs font-bold text-[#1f242e] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-400" />
              Extra Monthly Payoff Payment:
            </label>

            {/* Direct Editable Dollar Input */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-[#7d3c4c]">$</span>
                <input
                  type="number"
                  min="0"
                  step="25"
                  value={extraMonthly}
                  onChange={(e) => setExtraMonthly(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="pl-6 pr-3 py-1.5 w-32 bg-[#fdf6f8] border-2 border-[#ebd0d9] rounded-xl font-mono text-base font-extrabold text-[#7d3c4c] outline-none focus:border-[#7d3c4c] focus:bg-white text-right shadow-inner"
                />
              </div>
              <span className="text-xs font-bold text-[#64748b]">/ month</span>
            </div>
          </div>

          {/* Slider with Expanded Dynamic Range */}
          <input
            type="range"
            min="0"
            max={sliderMax}
            step="25"
            value={Math.min(extraMonthly, sliderMax)}
            onChange={(e) => setExtraMonthly(parseFloat(e.target.value))}
            className="w-full accent-[#7d3c4c] cursor-pointer h-2.5 bg-rose-100 rounded-lg appearance-none"
          />

          {/* Quick Preset Buttons / Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-bold text-[#64748b] mr-1">Quick Select:</span>
            <button
              onClick={() => setExtraMonthly(0)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                extraMonthly === 0 ? 'bg-[#7d3c4c] text-white border-[#7d3c4c]' : 'bg-[#fdf6f8] text-[#52212e] border-[#ebd0d9] hover:border-[#7d3c4c]'
              }`}
            >
              $0 (Min Only)
            </button>
            <button
              onClick={() => setExtraMonthly(500)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                extraMonthly === 500 ? 'bg-[#7d3c4c] text-white border-[#7d3c4c]' : 'bg-[#fdf6f8] text-[#52212e] border-[#ebd0d9] hover:border-[#7d3c4c]'
              }`}
            >
              +$500/mo (Budgeted Extra)
            </button>
            <button
              onClick={() => setExtraMonthly(1000)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                extraMonthly === 1000 ? 'bg-[#7d3c4c] text-white border-[#7d3c4c]' : 'bg-[#fdf6f8] text-[#52212e] border-[#ebd0d9] hover:border-[#7d3c4c]'
              }`}
            >
              +$1,000/mo
            </button>
            <button
              onClick={() => setExtraMonthly(2000)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                extraMonthly === 2000 ? 'bg-[#7d3c4c] text-white border-[#7d3c4c]' : 'bg-[#fdf6f8] text-[#52212e] border-[#ebd0d9] hover:border-[#7d3c4c]'
              }`}
            >
              +$2,000/mo
            </button>
            <button
              onClick={() => setExtraMonthly(3500)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                extraMonthly === 3500 ? 'bg-[#7d3c4c] text-white border-[#7d3c4c]' : 'bg-[#fdf6f8] text-[#52212e] border-[#ebd0d9] hover:border-[#7d3c4c]'
              }`}
            >
              +$3,500/mo
            </button>
            {leftoverFreeCash > 0 && (
              <button
                onClick={() => setExtraMonthly(Math.round(leftoverFreeCash))}
                className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer border flex items-center gap-1 ${
                  extraMonthly === Math.round(leftoverFreeCash)
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                }`}
                title="Apply 100% of Leftover Free Cash from Paycheck Waterfall"
              >
                <span>🌸 Full Leftover (+{formatCurrency(leftoverFreeCash)}/mo)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hero Outcome Card */}
      <div className="bg-gradient-to-br from-[#7d3c4c] to-[#9f5264] text-white rounded-3xl p-6 sm:p-8 shadow-kawaii-lg flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 text-xs font-bold tracking-wide uppercase font-cute">
            🎉 Estimated Debt Free Milestone
          </span>
          <h3 className="text-3xl sm:text-4xl font-extrabold font-cute tracking-tight">
            {debtFreeStr}
          </h3>
          <p className="text-sm text-rose-100 font-medium">
            You will be 100% debt free in <span className="font-bold text-white underline decoration-rose-300">{result.totalMonths} months</span> ({Math.floor(result.totalMonths / 12)} yrs {result.totalMonths % 12} mos)!
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/20">
          <div className="text-center">
            <span className="text-[11px] uppercase font-semibold text-rose-200 block">Total Interest Paid</span>
            <span className="text-xl font-extrabold font-mono text-white">{formatCurrency(result.totalInterest)}</span>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <div className="text-center">
            <span className="text-[11px] uppercase font-semibold text-rose-200 block">Strategy</span>
            <span className="text-base font-extrabold font-cute text-white flex items-center gap-1">
              {strategy === 'snowball' ? '⛄ Snowball' : (strategy === 'avalanche' ? '🏔️ Avalanche' : '🐘 Highest Balance')}
            </span>
          </div>
        </div>
      </div>

      {/* Payoff Order Sequence Table */}
      <div className="bg-white rounded-3xl shadow-kawaii border border-[#e4e0e2] overflow-hidden">
        <div className="bg-[#fdf6f8]/60 px-6 py-4 border-b border-[#e4e0e2] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-base font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
            <span>🏅</span> Target Payoff Order &amp; Milestone Timeline
          </h3>
          <span className="text-xs font-mono font-bold text-rose-600 bg-white px-3 py-1 rounded-xl border border-[#ebd0d9] self-start sm:self-auto">
            {strategy === 'snowball' ? '⛄ Ordered by Lowest Balance First' : (strategy === 'avalanche' ? '🏔️ Ordered by Highest APR First' : '🐘 Ordered by Highest Balance First')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm font-medium">
            <thead>
              <tr className="bg-[#7d3c4c] text-white text-xs font-bold">
                <th className="py-3.5 px-6">Order</th>
                <th className="py-3.5 px-4">Account Name</th>
                <th className="py-3.5 px-4 text-right">Starting Balance</th>
                <th className="py-3.5 px-4 text-right">Min Payment</th>
                <th className="py-3.5 px-4 text-right">Interest Rate</th>
                <th className="py-3.5 px-6 text-right">Est. Payoff Month</th>
              </tr>
            </thead>
            <tbody>
              {result.debtAccounts.map((d, idx) => {
                const targetDate = new Date(now.getFullYear(), now.getMonth() + d.paidOffMonth, 1);
                const targetStr = d.paidOffMonth > 0 ? targetDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Month ' + d.paidOffMonth;

                return (
                  <tr
                    key={d.id}
                    className={`hover:bg-[#faedf1]/70 ${idx % 2 === 1 ? 'bg-[#fdf6f8]' : 'bg-white'}`}
                  >
                    <td className="py-3.5 px-6 font-bold text-[#1f242e]">
                      <span className="w-6 h-6 rounded-full bg-rose-100 text-[#7d3c4c] inline-flex items-center justify-center font-bold text-xs">
                        #{idx + 1}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-[#1f242e] flex items-center gap-2">
                      <span className="text-base">{d.icon}</span>
                      <span>{d.name}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-[#1f242e]">
                      {formatCurrency(d.balance)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[#52212e]">
                      {formatCurrency(d.min_payment)}/mo
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-rose-500">
                      {formatApr(d.apr)}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-extrabold text-emerald-700">
                      <KawaiiBadge variant="green">{targetStr} ({d.paidOffMonth} mos)</KawaiiBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
