import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, DollarSign, CornerDownLeft, ArrowLeftRight } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { api } from '../../api/client';
import { Transaction } from '../../types';
import { getDefaultTypeForCategory } from '../../utils/categoryDefaults';
import { formatCurrency } from '../../utils/formatters';
import { SakuraIcon } from '../common/SakuraIcon';

export const QuickAddModal: React.FC = () => {
  const { isQuickAddOpen, setIsQuickAddOpen, accounts, categories, refreshData, showToast, triggerConfetti, selectedMonth, selectedYear, selectedAccountId } = useBudget();
  const amountRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    account_id: 'acc_checking',
    destination_account_id: 'acc_savings',
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: 'Groceries',
    type: 'Expense' as Transaction['type'],
    amount: '',
    notes: '',
  });

  const [isSaving, setIsSaving] = useState(false);

  // Inline Category Creator State
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('🌸');
  const [newCatBudget, setNewCatBudget] = useState('0');

  const selectedAcc = accounts.find(a => a.id === formData.account_id);
  const isCreditCard = selectedAcc?.type === 'credit_card';

  const sourceAcc = accounts.find(a => a.id === formData.account_id);
  const destAcc = accounts.find(a => a.id === formData.destination_account_id);

  const handleSaveInlineCategory = async () => {
    if (!newCatName.trim()) {
      showToast('Please enter a category name');
      return;
    }
    try {
      await api.createCategory({
        name: newCatName.trim(),
        icon: newCatIcon.trim() || '🌸',
        budget: parseFloat(newCatBudget) || 0,
        month: selectedMonth,
        year: selectedYear,
      });
      await refreshData(selectedMonth, selectedYear);
      const catName = newCatName.trim();
      const autoType = getDefaultTypeForCategory(catName, isCreditCard);
      setFormData(prev => ({
        ...prev,
        category: catName,
        type: autoType,
      }));
      setIsCreatingCategory(false);
      setNewCatName('');
      setNewCatIcon('🌸');
      setNewCatBudget('0');
      showToast(`Category "${catName}" created and selected! 🌸`);
    } catch (err: any) {
      showToast('Error creating category');
    }
  };

  const handleTypeChange = (newType: Transaction['type']) => {
    if (newType === 'Transfer') {
      const curSource = formData.account_id || 'acc_checking';
      const curDest = formData.destination_account_id && formData.destination_account_id !== curSource
        ? formData.destination_account_id
        : (accounts.find(a => a.id !== curSource)?.id || 'acc_savings');

      setFormData(prev => ({
        ...prev,
        type: 'Transfer',
        category: 'Transfer',
        account_id: curSource,
        destination_account_id: curDest,
      }));
    } else {
      const autoType = newType;
      const isCC = accounts.find(a => a.id === formData.account_id)?.type === 'credit_card';
      const curCat = formData.category === 'Transfer' ? (isCC ? 'Debt Repayment' : 'Groceries') : formData.category;
      setFormData(prev => ({
        ...prev,
        type: autoType,
        category: curCat,
      }));
    }
  };

  useEffect(() => {
    if (isQuickAddOpen) {
      // Default account to currently viewed account if valid
      const initialAccount = (selectedAccountId && accounts.some(a => a.id === selectedAccountId))
        ? selectedAccountId
        : 'acc_checking';

      const initialDest = accounts.find(a => a.id !== initialAccount)?.id || 'acc_savings';
      const isInitialCC = accounts.find(a => a.id === initialAccount)?.type === 'credit_card';
      const initialCategory = isInitialCC ? 'Debt Repayment' : (categories[0]?.name || 'Groceries');
      const initialType = getDefaultTypeForCategory(initialCategory, isInitialCC);

      setFormData({
        account_id: initialAccount,
        destination_account_id: initialDest,
        date: new Date().toISOString().split('T')[0],
        description: '',
        category: initialCategory,
        type: initialType,
        amount: '',
        notes: '',
      });
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [isQuickAddOpen, selectedAccountId, accounts, categories]);

  if (!isQuickAddOpen) return null;

  const submitForm = async () => {
    const parsedAmount = parseFloat(formData.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Please enter a valid positive amount');
      return;
    }

    if (formData.type === 'Transfer') {
      if (!formData.account_id || !formData.destination_account_id) {
        showToast('Please select both Source and Destination accounts');
        return;
      }
      if (formData.account_id === formData.destination_account_id) {
        showToast('Source and Destination accounts cannot be the same');
        return;
      }
      const sAcc = accounts.find(a => a.id === formData.account_id);
      const dAcc = accounts.find(a => a.id === formData.destination_account_id);

      setIsSaving(true);
      try {
        await api.createTransfer({
          source_account_id: formData.account_id,
          destination_account_id: formData.destination_account_id,
          amount: parsedAmount,
          date: formData.date,
          description: formData.description.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        });

        setIsQuickAddOpen(false);
        await refreshData();
        triggerConfetti();
        showToast(`Linked Transfer of ${formatCurrency(parsedAmount)} completed! 🌸 (${sAcc?.name} ➔ ${dAcc?.name})`);
      } catch (err: any) {
        showToast(err.message || 'Error saving transfer');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!formData.description.trim()) {
      showToast('Please enter a transaction description');
      return;
    }

    setIsSaving(true);
    try {
      await api.createTransaction({
        account_id: formData.account_id,
        date: formData.date,
        description: formData.description.trim(),
        category: formData.category,
        type: formData.type,
        amount: parsedAmount,
        notes: formData.notes.trim(),
      });

      setIsQuickAddOpen(false);
      await refreshData();
      triggerConfetti();
      showToast('Transaction logged successfully! 🌸');
    } catch (err: any) {
      showToast('Error saving transaction');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submitForm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsQuickAddOpen(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitForm();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={() => setIsQuickAddOpen(false)}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-[#e4e0e2] w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e4e0e2] bg-[#fdf6f8]">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-white border border-[#ebd0d9] flex items-center justify-center text-sm shadow-2xs">
              <SakuraIcon className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">Add Transaction</h3>
              <p className="text-[11px] text-[#64748b] font-medium">Log a new transaction to your budget ledger</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsQuickAddOpen(false)}
            className="text-[#64748b] hover:text-[#1f242e] p-1.5 rounded-full hover:bg-white/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="p-6 space-y-4 text-xs">
          {/* Amount Field */}
          <div>
            <label className="block font-bold text-[#1f242e] mb-1.5 flex items-center justify-between">
              <span>Amount ($)</span>
              <span className="text-[10px] text-[#64748b] font-normal">Press Tab to navigate</span>
            </label>
            <div className="relative">
              <DollarSign className="w-5 h-5 text-[#7d3c4c] absolute left-3.5 top-3.5" />
              <input
                ref={amountRef}
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="w-full pl-10 pr-4 py-3 bg-[#fdf6f8]/50 border-2 border-[#ebd0d9] rounded-2xl text-xl font-extrabold text-[#7d3c4c] font-mono outline-none focus:border-[#7d3c4c] focus:bg-white transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Row 1: Transaction Type & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#1f242e] mb-1">Transaction Type</label>
              <select
                value={formData.type}
                onChange={e => handleTypeChange(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs cursor-pointer"
              >
                {isCreditCard ? (
                  <>
                    <option value="Payment">💳 Payment (Syncs from Checking)</option>
                    <option value="Transfer">🔄 Transfer Between Accounts</option>
                    <option value="Expense">🛍️ Charge / Purchase (Card Expense)</option>
                    <option value="Income">💰 Refund / Merchant Credit (+)</option>
                    <option value="Track Only">📝 Track Only (No Balance Change)</option>
                  </>
                ) : (
                  <>
                    <option value="Expense">Expense / Withdrawal (-)</option>
                    <option value="Income">Income / Deposit (+)</option>
                    <option value="Transfer">🔄 Transfer Between Accounts</option>
                    <option value="Payment">Bill / Payment (-)</option>
                    <option value="Track Only">Track Only (No Balance Change)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block font-bold text-[#1f242e] mb-1">Date</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl font-mono text-xs font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs cursor-pointer"
              />
            </div>
          </div>

          {/* Conditional: Linked Transfer (To/From Mapping) vs Regular Transaction Fields */}
          {formData.type === 'Transfer' ? (
            <div className="bg-[#fdf6f8] border border-[#ebd0d9] rounded-2xl p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🔄</span>
                  <span className="font-extrabold text-[#7d3c4c] text-xs font-cute">Linked Transfer Route</span>
                </div>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  Zero-Sum Execution
                </span>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {/* Source Account (From - Where money leaves) */}
                <div>
                  <label className="block font-bold text-[#52212e] text-[11px] mb-1 flex items-center justify-between">
                    <span>Source Account (From)</span>
                    <span className="text-[9px] font-mono text-rose-600 bg-rose-50 px-1 rounded border border-rose-200">- Outflow</span>
                  </label>
                  <select
                    value={formData.account_id}
                    onChange={e => {
                      const newSource = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        account_id: newSource,
                        destination_account_id: prev.destination_account_id === newSource
                          ? (accounts.find(a => a.id !== newSource)?.id || '')
                          : prev.destination_account_id
                      }));
                    }}
                    className="w-full px-3 py-2 bg-white border border-[#e4e0e2] rounded-xl font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs text-xs cursor-pointer"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.icon} {acc.name}
                      </option>
                    ))}
                  </select>
                  <div className="text-[10px] font-mono text-[#8c6b73] mt-0.5 pl-1">
                    Balance: {formatCurrency(sourceAcc?.balance)}
                  </div>
                </div>

                {/* Interactive Swap Button */}
                <div className="flex flex-col items-center justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        account_id: prev.destination_account_id,
                        destination_account_id: prev.account_id
                      }));
                    }}
                    className="w-8 h-8 rounded-full bg-white border border-[#ebd0d9] hover:bg-[#faedf1] text-[#7d3c4c] flex items-center justify-center shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    title="Swap Source and Destination accounts"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Destination Account (To - Where money goes) */}
                <div>
                  <label className="block font-bold text-[#52212e] text-[11px] mb-1 flex items-center justify-between">
                    <span>Destination Account (To)</span>
                    <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-200">+ Inflow</span>
                  </label>
                  <select
                    value={formData.destination_account_id}
                    onChange={e => {
                      const newDest = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        destination_account_id: newDest,
                        account_id: prev.account_id === newDest
                          ? (accounts.find(a => a.id !== newDest)?.id || '')
                          : prev.account_id
                      }));
                    }}
                    className="w-full px-3 py-2 bg-white border border-[#e4e0e2] rounded-xl font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs text-xs cursor-pointer"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.icon} {acc.name}
                      </option>
                    ))}
                  </select>
                  <div className="text-[10px] font-mono text-[#8c6b73] mt-0.5 pl-1">
                    Balance: {formatCurrency(destAcc?.balance)}
                  </div>
                </div>
              </div>

              {/* Zero-Sum Realtime Preview Banner */}
              <div className="bg-white/90 rounded-xl p-2.5 border border-[#ebd0d9] text-[11px] text-[#52212e] space-y-1">
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1 text-rose-700">
                    <span>{sourceAcc?.icon}</span> {sourceAcc?.name}: <span className="font-mono">-{formatCurrency(parseFloat(formData.amount) || 0)}</span>
                  </span>
                  <span className="text-[#9f5264] font-bold">➔</span>
                  <span className="flex items-center gap-1 text-emerald-700">
                    <span>{destAcc?.icon}</span> {destAcc?.name}: <span className="font-mono">+{formatCurrency(parseFloat(formData.amount) || 0)}</span>
                  </span>
                </div>
                <p className="text-[10px] text-[#8c6b73] flex items-start gap-1">
                  <SakuraIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span><strong>Zero-Sum Execution:</strong> Generates two linked entries simultaneously (negative withdrawal in Source and positive deposit in Destination) without inflating living expenses or income.</span>
                </p>
              </div>

              {/* Transfer Description / Memo (Optional) */}
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Description / Memo (Optional)</label>
                <input
                  type="text"
                  placeholder={`e.g. Transfer from ${sourceAcc?.name || 'Source'} to ${destAcc?.name || 'Destination'}`}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-[#e4e0e2] rounded-xl text-xs font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs"
                />
              </div>
            </div>
          ) : (
            <>
              {/* Description / Payee for standard transactions */}
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Description / Payee</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Trader Joe's, Gas, Direct Deposit, Target"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-xs font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs"
                />
              </div>

              {/* Row: Category & Account */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-[#1f242e]">Category</label>
                    <button
                      type="button"
                      onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                      className="text-[11px] font-bold text-[#7d3c4c] hover:text-[#9f5264] flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> New
                    </button>
                  </div>

                  {isCreatingCategory ? (
                    <div className="bg-[#fdf6f8] p-3 rounded-2xl border border-[#ebd0d9] space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex justify-between items-center text-[11px] font-extrabold text-[#7d3c4c]">
                        <span>✨ New Category</span>
                        <button
                          type="button"
                          onClick={() => setIsCreatingCategory(false)}
                          className="text-[#64748b] hover:text-[#1f242e] text-xs font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Icon"
                          value={newCatIcon}
                          onChange={e => setNewCatIcon(e.target.value)}
                          className="w-12 text-center text-sm py-1.5 bg-white border border-[#ebd0d9] rounded-xl outline-none focus:border-[#7d3c4c]"
                          title="Category Emoji"
                        />
                        <input
                          type="text"
                          placeholder="Category Name"
                          value={newCatName}
                          onChange={e => setNewCatName(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-white border border-[#ebd0d9] rounded-xl text-xs font-bold text-[#1f242e] outline-none focus:border-[#7d3c4c]"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveInlineCategory();
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1.5 text-xs text-[#64748b] font-mono">$</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Monthly Budget"
                            value={newCatBudget}
                            onChange={e => setNewCatBudget(e.target.value)}
                            className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-[#ebd0d9] rounded-xl text-xs font-mono font-bold text-[#1f242e] outline-none focus:border-[#7d3c4c]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveInlineCategory}
                          className="bg-[#7d3c4c] hover:bg-[#6a313f] text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                        >
                          Add &amp; Select
                        </button>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={formData.category}
                      onChange={e => {
                        if (e.target.value === '__NEW_CATEGORY__') {
                          setIsCreatingCategory(true);
                        } else {
                          const newCat = e.target.value;
                          const autoType = getDefaultTypeForCategory(newCat, isCreditCard);
                          setFormData(prev => ({
                            ...prev,
                            category: newCat,
                            type: autoType,
                          }));
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs cursor-pointer"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.name}>
                          {c.icon} {c.name}
                        </option>
                      ))}
                      {!categories.some(c => c.name === formData.category) && formData.category && (
                        <option value={formData.category}>{formData.category}</option>
                      )}
                      <option value="__NEW_CATEGORY__" className="font-bold text-[#7d3c4c]">
                        ✨ + Create New Category...
                      </option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Account</label>
                  <select
                    value={formData.account_id}
                    onChange={e => {
                      const newAccId = e.target.value;
                      const newIsCC = accounts.find(a => a.id === newAccId)?.type === 'credit_card';
                      const curCat = (newIsCC && formData.category === 'Groceries') ? 'Debt Repayment' : formData.category;
                      const autoType = getDefaultTypeForCategory(curCat, newIsCC);
                      setFormData(prev => ({
                        ...prev,
                        account_id: newAccId,
                        category: curCat,
                        type: autoType,
                      }));
                    }}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs cursor-pointer"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.icon} {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Credit Card Payment Auto-Sync Notice */}
              {isCreditCard && formData.type === 'Payment' && (
                <div className="bg-[#f0fdf4] border border-emerald-200 rounded-2xl p-2.5 flex items-center gap-2 text-emerald-800 text-[11px] font-medium animate-in fade-in">
                  <SakuraIcon className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Automatic Checking Sync:</strong> Saving this payment will automatically create a matching withdrawal entry in your <strong>Checking Ledger</strong>!
                  </span>
                </div>
              )}
            </>
          )}

          {/* Notes */}
          <div>
            <label className="block font-bold text-[#1f242e] mb-1">Notes (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Vacation fund, reimbursable, receipt tag"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-4 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-xs text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#f1eded]">
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-[#64748b]">
              <CornerDownLeft className="w-3.5 h-3.5 text-[#7d3c4c]" />
              <span>Press <kbd className="bg-slate-100 px-1 py-0.5 rounded text-[10px] font-mono border">⌘+Enter</kbd> to save</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="px-4 py-2 text-[#64748b] hover:text-[#1f242e] font-bold rounded-xl hover:bg-[#f8f7f6] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#7d3c4c] hover:bg-[#6a313f] text-white font-bold rounded-xl text-xs shadow-md shadow-rose-900/15 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Entry'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

