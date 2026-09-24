import React, { useState, useEffect, useRef } from 'react';
import { X, Check, DollarSign, CornerDownLeft, Plus } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { api } from '../../api/client';
import { Transaction } from '../../types';
import { getDefaultTypeForCategory } from '../../utils/categoryDefaults';

interface Props {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const EditTransactionModal: React.FC<Props> = ({
  transaction,
  isOpen,
  onClose,
  onSaved,
}) => {
  const { accounts, categories, refreshData, showToast, triggerConfetti, selectedMonth, selectedYear } = useBudget();
  const amountRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    account_id: '',
    date: '',
    description: '',
    category: '',
    type: 'Expense' as Transaction['type'],
    amount: '',
    notes: '',
  });

  const [isSaving, setIsSaving] = useState(false);

  const selectedAcc = accounts.find(a => a.id === formData.account_id);
  const isCreditCard = selectedAcc?.type === 'credit_card';

  // Inline Category Creator State
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('🌸');
  const [newCatBudget, setNewCatBudget] = useState('0');

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

  useEffect(() => {
    if (transaction && isOpen) {
      setFormData({
        account_id: transaction.account_id,
        date: transaction.date,
        description: transaction.description,
        category: transaction.category,
        type: (transaction.type || 'Expense') as 'Income' | 'Expense' | 'Track Only' | 'Payment' | 'Transfer',
        amount: String(transaction.amount),
        notes: transaction.notes || '',
      });
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [transaction, isOpen]);

  if (!isOpen || !transaction) return null;

  const submitForm = async () => {
    const parsedAmount = parseFloat(formData.amount);
    if (!formData.description.trim()) {
      showToast('Please enter a transaction description');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      showToast('Please enter a valid amount');
      return;
    }

    setIsSaving(true);
    try {
      await api.updateTransaction(transaction.id, {
        account_id: formData.account_id,
        date: formData.date,
        description: formData.description.trim(),
        category: formData.category,
        type: formData.type,
        amount: parsedAmount,
        notes: formData.notes.trim(),
      });

      onClose();
      await refreshData();
      triggerConfetti();
      showToast(
        isCreditCard && formData.type === 'Payment'
          ? 'Payment updated & synced with Checking! 🌸'
          : 'Transaction updated! 🌸'
      );
      if (onSaved) onSaved();
    } catch (err: any) {
      showToast('Error updating transaction');
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
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitForm();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-[#e4e0e2] w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e4e0e2] bg-[#fdf6f8]">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-white border border-[#ebd0d9] flex items-center justify-center text-sm shadow-2xs">
              ✏️
            </span>
            <div>
              <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">Edit Transaction</h3>
              <p className="text-[11px] text-[#64748b] font-medium">Update date, category, amount, or notes</p>
            </div>
          </div>
          <button
            onClick={onClose}
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

          {/* Description */}
          <div>
            <label className="block font-bold text-[#1f242e] mb-1">Description / Payee</label>
            <input
              type="text"
              required
              placeholder="e.g. Trader Joe's, Gas, Direct Deposit"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-xs font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs"
            />
          </div>

          {/* Row 1: Category & Account */}
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
                  const autoType = getDefaultTypeForCategory(formData.category, newIsCC);
                  setFormData(prev => ({
                    ...prev,
                    account_id: newAccId,
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

          {/* Row 2: Transaction Type & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#1f242e] mb-1">Transaction Type</label>
              <select
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as any })}
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
                    <option value="Payment">Payment / Bill (-)</option>
                    <option value="Track Only">Track Only (No Balance Change)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block font-bold text-[#1f242e] mb-1">Date</label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3.5 py-2 bg-white border border-[#e4e0e2] rounded-xl font-mono text-xs font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Credit Card Payment Auto-Sync Notice */}
          {isCreditCard && formData.type === 'Payment' && (
            <div className="bg-[#f0fdf4] border border-emerald-200 rounded-2xl p-2.5 flex items-center gap-2 text-emerald-800 text-[11px] font-medium animate-in fade-in">
              <span className="text-base">🌸</span>
              <span>
                <strong>Automatic Checking Sync:</strong> Saving changes to this payment will automatically sync the matching withdrawal entry in your <strong>Checking Ledger</strong>!
              </span>
            </div>
          )}

          {/* Linked Transfer Auto-Sync Notice */}
          {formData.type === 'Transfer' && (
            <div className="bg-[#fdf6f8] border border-[#ebd0d9] rounded-2xl p-2.5 flex items-center gap-2 text-[#7d3c4c] text-[11px] font-medium animate-in fade-in">
              <span className="text-base">🔄</span>
              <span>
                <strong>Zero-Sum Linked Transfer:</strong> Updating this transfer's amount or date will automatically synchronize the matching linked entry in the other account!
              </span>
            </div>
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
                onClick={onClose}
                className="px-4 py-2 text-[#64748b] hover:text-[#1f242e] font-bold rounded-xl hover:bg-[#f8f7f6] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#7d3c4c] hover:bg-[#6a313f] text-white font-bold rounded-xl text-xs shadow-md shadow-rose-900/15 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
