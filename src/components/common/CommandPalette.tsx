import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Calendar, CreditCard, DollarSign, PieChart, Target, Database, X, Landmark, Car, Sparkles, TrendingUp, ArrowRight, CornerDownLeft } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';

export const CommandPalette: React.FC = () => {
  const { 
    isCommandPaletteOpen, 
    setIsCommandPaletteOpen, 
    setActiveTab, 
    setIsQuickAddOpen, 
    setSelectedAccountId, 
    accounts 
  } = useBudget();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const baseActions = useMemo(() => [
    { label: 'Add New Transaction', icon: Plus, action: () => { setIsQuickAddOpen(true); setIsCommandPaletteOpen(false); }, shortcut: 'N', group: 'Quick Actions' },
    { label: '🌸 Monthly Budget Overview', icon: PieChart, action: () => { setActiveTab('budget'); setIsCommandPaletteOpen(false); }, shortcut: '1', group: 'Views' },
    { label: '📅 Monthly Bill Breakdown', icon: Calendar, action: () => { setActiveTab('bills'); setIsCommandPaletteOpen(false); }, shortcut: '2', group: 'Views' },
    { label: '📦 Annual & Biannual Sinking Funds', icon: Target, action: () => { setActiveTab('sinking'); setIsCommandPaletteOpen(false); }, shortcut: '3', group: 'Views' },
    { label: '⚡ Debt Payoff Hub', icon: Sparkles, action: () => { setActiveTab('debt'); setIsCommandPaletteOpen(false); }, shortcut: '4', group: 'Views' },
    { label: '🏦 Bank Accounts Ledger', icon: Landmark, action: () => { setActiveTab('bank_accounts'); setSelectedAccountId('acc_checking'); setIsCommandPaletteOpen(false); }, shortcut: '5', group: 'Accounts' },
    { label: '💳 Credit Cards Ledger', icon: CreditCard, action: () => { setActiveTab('credit_cards'); setSelectedAccountId('debt_cap1'); setIsCommandPaletteOpen(false); }, shortcut: '6', group: 'Accounts' },
    { label: '🚗 Fixed Debt & Loans', icon: Car, action: () => { setActiveTab('fixed_debt'); setSelectedAccountId('debt_subaru'); setIsCommandPaletteOpen(false); }, shortcut: '7', group: 'Accounts' },
    { label: '🎀 Paycheck Waterfall', icon: DollarSign, action: () => { setActiveTab('paycheck'); setIsCommandPaletteOpen(false); }, shortcut: '8', group: 'Views' },
    { label: '🔮 Projections & Growth', icon: TrendingUp, action: () => { setActiveTab('projections'); setIsCommandPaletteOpen(false); }, shortcut: '9', group: 'Views' },
    { label: '🎯 Financial Goals', icon: Target, action: () => { setActiveTab('goals'); setIsCommandPaletteOpen(false); }, shortcut: '0', group: 'Views' },
    { label: '⚙️ Backup & Docker Settings', icon: Database, action: () => { setActiveTab('backup'); setIsCommandPaletteOpen(false); }, group: 'Settings' },
  ], [setActiveTab, setIsQuickAddOpen, setSelectedAccountId, setIsCommandPaletteOpen]);

  const accountActions = useMemo(() => accounts.map(a => ({
    label: `${a.icon} ${a.name} Ledger`,
    icon: a.category === 'auto_loan' || a.category === 'personal_loan' ? Car : (a.type === 'credit_card' ? CreditCard : Landmark),
    action: () => {
      setSelectedAccountId(a.id);
      if (a.category === 'auto_loan' || a.category === 'personal_loan') {
        setActiveTab('fixed_debt');
      } else if (a.type === 'credit_card') {
        setActiveTab('credit_cards');
      } else {
        setActiveTab('bank_accounts');
      }
      setIsCommandPaletteOpen(false);
    },
    group: 'Direct Account Jump',
    shortcut: undefined
  })), [accounts, setSelectedAccountId, setActiveTab, setIsCommandPaletteOpen]);

  const allItems = useMemo(() => [...baseActions, ...accountActions], [baseActions, accountActions]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    return allItems.filter(a => a.label.toLowerCase().includes(query.toLowerCase()) || a.group.toLowerCase().includes(query.toLowerCase()));
  }, [allItems, query]);

  // Reset index on query change or modal open
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isCommandPaletteOpen]);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isCommandPaletteOpen]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      setSelectedIndex(prev => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      setSelectedIndex(prev => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsCommandPaletteOpen(false);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedIndex(filtered.length - 1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        setSelectedIndex(prev => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
      } else {
        setSelectedIndex(prev => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
      }
    }
  };

  if (!isCommandPaletteOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={() => setIsCommandPaletteOpen(false)}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-[#e4e0e2] w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <div className="flex items-center px-6 py-4 border-b border-[#e4e0e2] bg-[#fdf6f8]/50">
          <Search className="w-6 h-6 text-[#f472b6] mr-3.5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type to search or use ↑ ↓ / Enter to navigate..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent border-none outline-none text-[#1f242e] placeholder-rose-300 text-base font-semibold"
          />
          <button
            onClick={() => setIsCommandPaletteOpen(false)}
            className="text-rose-400 hover:text-rose-700 p-1.5 rounded-full hover:bg-[#faedf1] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-3 space-y-1 max-h-[28rem] scroll-smooth">
          {filtered.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={idx}
                ref={el => { itemRefs.current[idx] = el; }}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all text-left text-sm font-semibold group cursor-pointer ${
                  isSelected
                    ? 'bg-[#7d3c4c] text-white shadow-md shadow-rose-900/20 translate-x-1'
                    : 'text-[#1f242e] hover:bg-[#fdf6f8] hover:text-[#f472b6]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                    isSelected 
                      ? 'bg-white/20 text-white border-white/30' 
                      : 'bg-[#fdf6f8] text-[#f472b6] border-[#e4e0e2] group-hover:bg-white'
                  }`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className={isSelected ? 'text-white font-bold' : 'text-[#1f242e]'}>{item.label}</span>
                    <span className={`text-[11px] block font-normal ${isSelected ? 'text-rose-200' : 'text-rose-300'}`}>
                      {item.group}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {item.shortcut && (
                    <kbd className={`text-xs px-2 py-0.5 rounded-md font-bold font-mono ${
                      isSelected 
                        ? 'bg-white/20 text-white border border-white/30' 
                        : 'bg-rose-100 text-[#f472b6]'
                    }`}>
                      {item.shortcut}
                    </kbd>
                  )}
                  {isSelected && (
                    <CornerDownLeft className="w-4 h-4 text-rose-200 animate-pulse" />
                  )}
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-[#64748b] text-sm">
              <span className="text-3xl block mb-2">🌸</span>
              No matching pages or accounts found
            </div>
          )}
        </div>

        {/* Footer with Power-User Shortcuts */}
        <div className="px-6 py-3 bg-[#f8f7f6] border-t border-[#e4e0e2]/80 flex flex-wrap justify-between items-center text-xs text-[#64748b] gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="bg-white px-1.5 py-0.5 rounded border text-[#1f242e] font-mono text-[10px] font-bold">↑</kbd>
              <kbd className="bg-white px-1.5 py-0.5 rounded border text-[#1f242e] font-mono text-[10px] font-bold">↓</kbd>
              <span className="ml-1 text-[#64748b] font-medium">Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-white px-1.5 py-0.5 rounded border text-[#1f242e] font-mono text-[10px] font-bold">↵</kbd>
              <span className="ml-1 text-[#64748b] font-medium">Select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-white px-1.5 py-0.5 rounded border text-[#1f242e] font-mono text-[10px] font-bold">ESC</kbd>
              <span className="ml-1 text-[#64748b] font-medium">Close</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-rose-400 font-semibold font-cute">🌸 Power-User Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
};
