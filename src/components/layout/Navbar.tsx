import React from 'react';
import { Plus, Search, Sparkles, ShieldCheck, Wallet, PiggyBank, CreditCard, Settings } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency } from '../../utils/formatters';
import { KawaiiMascot } from './KawaiiMascot';

export const Navbar: React.FC = () => {
  const { stats, activeTab, setActiveTab, setIsQuickAddOpen, setIsCommandPaletteOpen } = useBudget();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#e4e0e2] shadow-xs px-4 sm:px-6 lg:px-8 py-3 transition-all">
      <div className="w-full flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#7d3c4c] to-[#9f5264] flex items-center justify-center text-xl shadow-md text-white shadow-rose-900/15 shrink-0">
            🌸
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[#7d3c4c] tracking-tight font-cute flex items-center gap-1.5 leading-tight">
              Kawaii Budget
            </h1>
            <p className="text-[11px] text-[#64748b] font-medium hidden sm:block">Local-First &amp; Kawaii Finance</p>
          </div>
        </div>

        {/* Live Top Badges */}
        <div className="hidden lg:flex items-center gap-3">
          {/* Checking Balance & Buffer */}
          <div className="relative group flex items-center gap-2.5 bg-[#fdf6f8] border border-[#ebd0d9] px-4 py-1.5 rounded-2xl shadow-2xs cursor-help transition-all hover:border-[#7d3c4c]">
            <Wallet className="w-4 h-4 text-[#7d3c4c] shrink-0" />
            <div className="text-xs leading-tight">
              <span className="text-[#64748b] block text-[11px] font-semibold">Checking (Spendable)</span>
              <span className="font-extrabold text-[#7d3c4c] font-mono">
                {formatCurrency(stats?.checking.spendable ?? 0)}
              </span>
              <span className="text-[10px] text-[#934b5c] ml-1 font-bold">(+${stats?.checking.buffer ?? 500} buffer)</span>
            </div>

            {/* Hover Tooltip Breakdown */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2.5 w-64 p-3.5 bg-white border border-[#ebd0d9] rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none text-xs animate-in fade-in zoom-in-95">
              {/* Tooltip Header */}
              <div className="flex items-center justify-between pb-2 border-b border-[#f1eded]">
                <div className="flex items-center gap-1.5 font-bold text-[#7d3c4c] font-cute text-xs">
                  <span>🌸</span>
                  <span>Spendable Cash Breakdown</span>
                </div>
                <span className="text-[10px] font-bold text-[#64748b]">Checking</span>
              </div>

              {/* Math Breakdown Table */}
              <div className="py-2 space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center text-[#1f242e]">
                  <span className="text-[#64748b]">Total Checking Balance:</span>
                  <span className="font-mono font-bold text-[#1f242e]">
                    {formatCurrency(stats?.checking.balance ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-rose-600">
                  <span>Safety Buffer:</span>
                  <span className="font-mono font-bold">
                    -{formatCurrency(stats?.checking.buffer ?? 500)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-[#f1eded] font-bold text-[#059669]">
                  <span>Spendable Balance:</span>
                  <span className="font-mono font-extrabold text-sm">
                    {formatCurrency(stats?.checking.spendable ?? 0)}
                  </span>
                </div>
              </div>

              {/* Friendly explanation */}
              <div className="bg-[#fdf6f8] p-2 rounded-xl border border-[#ebd0d9] text-[10px] text-[#7d3c4c] font-medium leading-relaxed mt-1">
                💡 Holds a <strong>{formatCurrency(stats?.checking.buffer ?? 500)}</strong> cushion in your checking account so you never accidentally overspend into your buffer.
              </div>

              {/* Pointer Arrow */}
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-t border-l border-[#ebd0d9] rotate-45"></div>
            </div>
          </div>

          {/* Savings */}
          <div className="flex items-center gap-2.5 bg-[#ecfdf5] border border-[#a7f3d0] px-4 py-1.5 rounded-2xl shadow-2xs">
            <PiggyBank className="w-4 h-4 text-[#059669] shrink-0" />
            <div className="text-xs leading-tight">
              <span className="text-[#065f46] block text-[11px] font-semibold">Total Savings</span>
              <span className="font-extrabold text-[#047857] font-mono">
                {formatCurrency(stats?.savings.balance ?? 0)}
              </span>
            </div>
          </div>

          {/* Debt Remaining */}
          <div className="flex items-center gap-2.5 bg-[#fff1f2] border border-[#fecdd3] px-4 py-1.5 rounded-2xl shadow-2xs">
            <CreditCard className="w-4 h-4 text-[#e11d48] shrink-0" />
            <div className="text-xs leading-tight">
              <span className="text-[#9f1239] block text-[11px] font-semibold">Revolving Debt</span>
              <span className="font-extrabold text-[#be123c] font-mono">
                {formatCurrency(stats?.debt.revolving ?? 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions & Mascot */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Search Button */}
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="flex items-center gap-2 bg-[#f8f7f6] hover:bg-[#f2eff0] text-[#1f242e] border border-[#e4e0e2] px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-[#7d3c4c]" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="bg-white px-2 py-0.5 rounded text-[10px] border border-[#d1cbce] text-[#7d3c4c] font-bold font-mono shadow-xs">Super+S</kbd>
          </button>

          {/* Quick Add Button */}
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] hover:from-[#6a313f] hover:to-[#823f4f] text-white px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-md shadow-rose-900/15 active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Quick Add</span>
            <kbd className="hidden sm:inline-block bg-white/20 px-1.5 py-0.5 rounded text-[10px] ml-1 font-mono">N</kbd>
          </button>

          <KawaiiMascot />

          {/* Backup & Docker Settings Cog Button */}
          <button
            onClick={() => setActiveTab('backup')}
            title="Backup & Docker Settings"
            className={`p-2 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
              activeTab === 'backup'
                ? 'bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white border-[#7d3c4c] shadow-md shadow-rose-900/20'
                : 'bg-[#f8f7f6] hover:bg-[#f2eff0] text-[#7d3c4c] border-[#e4e0e2] hover:border-[#debac6]'
            }`}
          >
            <Settings className={`w-4 h-4 transition-transform hover:rotate-45 duration-300 ${activeTab === 'backup' ? 'text-white' : 'text-[#7d3c4c]'}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
