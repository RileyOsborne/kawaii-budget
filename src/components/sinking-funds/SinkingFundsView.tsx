import React, { useState } from 'react';
import { Target, Plus, Check, Trash2, Pencil, Calendar, Sparkles, X } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { calculateMonthlySinkingFundsTotal } from '../../utils/calculations';
import { api } from '../../api/client';
import { KawaiiBadge } from '../common/KawaiiBadge';
import { AnnualBill } from '../../types';

export const SinkingFundsView: React.FC = () => {
  const { annualBills, refreshData, showToast, triggerConfetti } = useBudget();
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    due_date: '2026-10-01',
    amount: '',
    frequency: 'annual' as 'annual' | 'biannual',
  });

  const [editingItem, setEditingItem] = useState<AnnualBill | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    due_date: '',
    amount: '',
    frequency: 'annual' as 'annual' | 'biannual',
    notes: '',
  });

  const annuals = annualBills.filter(b => b.frequency === 'annual');
  const biannuals = annualBills.filter(b => b.frequency === 'biannual');

  const totalAnnual = annuals.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const monthlyRequiredAnnual = Math.round((totalAnnual / 12) * 100) / 100;

  const totalBiannual = biannuals.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const totalMonthlySinking = calculateMonthlySinkingFundsTotal(annualBills);
  const monthlyRequiredBiannual = Math.round(Math.max(0, totalMonthlySinking - monthlyRequiredAnnual) * 100) / 100;

  const handleToggle = async (id: string) => {
    try {
      const res = await api.toggleAnnualBillPaid(id);
      await refreshData();
      if (res.is_paid === 1) {
        triggerConfetti();
        showToast('Marked as paid and reflected in Checking Ledger! 🌸');
      } else {
        showToast('Unmarked sinking fund (removed from Checking)');
      }
    } catch {
      showToast('Error updating status');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.amount) {
      showToast('Please fill all fields');
      return;
    }
    try {
      await api.createAnnualBill({
        ...newItem,
        amount: parseFloat(newItem.amount),
      });
      setShowAdd(false);
      setNewItem({ name: '', due_date: '2026-10-01', amount: '', frequency: 'annual' });
      await refreshData();
      showToast('Sinking fund added! ✨');
    } catch {
      showToast('Error adding sinking fund');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete ${name}?`)) {
      await api.deleteAnnualBill(id);
      await refreshData();
      showToast(`Removed "${name}"`);
    }
  };

  const startEditing = (b: AnnualBill) => {
    setEditingItem(b);
    setEditForm({
      name: b.name,
      due_date: b.due_date,
      amount: String(b.amount),
      frequency: b.frequency,
      notes: b.notes || '',
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    const parsedAmount = parseFloat(editForm.amount);
    if (!editForm.name.trim()) {
      showToast('Please provide an expense name');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      showToast('Please provide a valid amount');
      return;
    }

    try {
      await api.updateAnnualBill(editingItem.id, {
        name: editForm.name.trim(),
        due_date: editForm.due_date,
        amount: parsedAmount,
        frequency: editForm.frequency,
        notes: editForm.notes.trim(),
      });
      setEditingItem(null);
      await refreshData();
      triggerConfetti();
      showToast('Sinking fund updated! 🌸');
    } catch {
      showToast('Error updating sinking fund');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
            <span>📦</span> Sinking Funds &amp; Periodic Bills
          </h2>
          <p className="text-xs text-[#64748b] font-medium mt-1">
            Annual and biannual reserve allocations tracked with monthly sinking targets
          </p>
        </div>

        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-[#7d3c4c] hover:bg-[#6a313f] text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-rose-900/15 active:scale-95 transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Sinking Fund</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-[#7d3c4c] to-[#934b5c] text-white rounded-3xl p-5 border border-[#6a313f] shadow-kawaii">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-100 uppercase tracking-wider font-cute block">
              Total Monthly Sinking Target
            </span>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">Auto-Sync</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-1">
            {formatCurrency(totalMonthlySinking)} <span className="text-xs text-rose-100 font-normal">/ month</span>
          </div>
          <p className="text-[11px] text-rose-100 mt-1">
            Pulls dynamically into Paycheck 2 Waterfall (Sinking Funds Assigned)
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii">
          <span className="text-xs font-bold text-[#7d3c4c] uppercase font-cute block">Annual Subscriptions</span>
          <div className="text-2xl font-extrabold text-[#1f242e] font-mono mt-1">
            {formatCurrency(totalAnnual)}
          </div>
          <p className="text-xs text-[#059669] font-semibold mt-1">
            {formatCurrency(monthlyRequiredAnnual)}/mo reserve • {annuals.length} targets
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii">
          <span className="text-xs font-bold text-[#7d3c4c] uppercase font-cute block">Biannual Insurance</span>
          <div className="text-2xl font-extrabold text-[#1f242e] font-mono mt-1">
            {formatCurrency(totalBiannual)}
          </div>
          <p className="text-xs text-[#64748b] mt-1">
            {formatCurrency(monthlyRequiredBiannual)}/mo reserve • Liberty Mutual
          </p>
        </div>
      </div>

      {/* Annual Bills Table */}
      <div className="bg-white rounded-3xl shadow-kawaii border border-[#e4e0e2] overflow-hidden">
        <div className="bg-[#fdf6f8] px-6 py-4 border-b border-[#e4e0e2] flex justify-between items-center">
          <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
            <span>📦</span> Annual Subscriptions Breakdown
          </h3>
          <span className="text-xs font-mono font-bold text-[#7d3c4c] bg-white px-3 py-1 rounded-xl border border-[#ebd0d9] shadow-2xs">
            Total: {formatCurrency(totalAnnual)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm font-medium">
            <thead>
              <tr className="bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white text-xs font-bold">
                <th className="py-3.5 px-6">Annual Bill Name</th>
                <th className="py-3.5 px-4">Due Date</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4 text-right">Monthly Sinking Needed</th>
                <th className="py-3.5 px-4 text-center w-36">Status</th>
                <th className="py-3.5 px-4 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody>
              {annuals.map((b, idx) => (
                <tr key={b.id} className={`hover:bg-[#faedf1] border-b border-[#f1eded] ${idx % 2 === 1 ? 'bg-[#fdf6f8]' : 'bg-white'}`}>
                  <td className="py-3.5 px-6 font-bold text-[#1f242e] flex items-center gap-2">
                    <span>🌸</span>
                    <span className={b.is_paid ? 'line-through text-[#64748b]' : ''}>{b.name}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#52212e]">{formatDate(b.due_date)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-[#1f242e]">{formatCurrency(b.amount)}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-[#059669] font-bold">{formatCurrency(b.amount / 12)}/mo</td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => handleToggle(b.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-2xs cursor-pointer active:scale-95 ${
                        b.is_paid
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                          : 'bg-white hover:bg-[#faedf1] text-[#64748b] border border-[#d1cbce]'
                      }`}
                      title={`Click to mark as ${b.is_paid ? 'unpaid' : 'paid'}`}
                    >
                      <Check className={`w-3.5 h-3.5 ${b.is_paid ? 'stroke-[3]' : 'text-slate-300'}`} />
                      <span>{b.is_paid ? 'Paid 🌸' : 'Unpaid'}</span>
                    </button>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => startEditing(b)}
                        className="p-1 text-[#cfabb8] hover:text-[#7d3c4c] rounded-lg transition-colors cursor-pointer"
                        title="Edit sinking fund amount & details"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(b.id, b.name)}
                        className="p-1 text-[#cfabb8] hover:text-[#e11d48] rounded-lg transition-colors cursor-pointer"
                        title="Delete sinking fund"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Biannual Bills Table */}
      <div className="bg-white rounded-3xl shadow-kawaii border border-[#e4e0e2] overflow-hidden">
        <div className="bg-[#fdf6f8] px-6 py-4 border-b border-[#e4e0e2] flex justify-between items-center">
          <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
            <span>🛡️</span> Biannual Expenses Breakdown
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#059669] bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl shadow-2xs">
              Reserve: {formatCurrency(monthlyRequiredBiannual)}/mo
            </span>
            <span className="text-xs font-mono font-bold text-[#7d3c4c] bg-white px-3 py-1 rounded-xl border border-[#ebd0d9] shadow-2xs">
              Total: {formatCurrency(totalBiannual)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm font-medium">
            <thead>
              <tr className="bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white text-xs font-bold">
                <th className="py-3.5 px-6">Biannual Bill Name</th>
                <th className="py-3.5 px-4">Due Date</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4 text-right">Monthly Sinking Needed</th>
                <th className="py-3.5 px-4 text-center w-36">Status</th>
                <th className="py-3.5 px-4 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody>
              {biannuals.map((b, idx) => (
                <tr key={b.id} className={`hover:bg-[#faedf1] border-b border-[#f1eded] ${idx % 2 === 1 ? 'bg-[#fdf6f8]' : 'bg-white'}`}>
                  <td className="py-3.5 px-6 font-bold text-[#1f242e] flex items-center gap-2">
                    <span>🌸</span>
                    <span className={b.is_paid ? 'line-through text-[#64748b]' : ''}>{b.name}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#52212e]">{formatDate(b.due_date)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-[#1f242e]">{formatCurrency(b.amount)}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-[#059669] font-bold">{formatCurrency(b.amount / 6)}/mo</td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => handleToggle(b.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-2xs cursor-pointer active:scale-95 ${
                        b.is_paid
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                          : 'bg-white hover:bg-[#faedf1] text-[#64748b] border border-[#d1cbce]'
                      }`}
                      title={`Click to mark as ${b.is_paid ? 'unpaid' : 'paid'}`}
                    >
                      <Check className={`w-3.5 h-3.5 ${b.is_paid ? 'stroke-[3]' : 'text-slate-300'}`} />
                      <span>{b.is_paid ? 'Paid 🌸' : 'Unpaid'}</span>
                    </button>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => startEditing(b)}
                        className="p-1 text-[#cfabb8] hover:text-[#7d3c4c] rounded-lg transition-colors cursor-pointer"
                        title="Edit sinking fund amount & details"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(b.id, b.name)}
                        className="p-1 text-[#cfabb8] hover:text-[#e11d48] rounded-lg transition-colors cursor-pointer"
                        title="Delete sinking fund"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Sinking Fund Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-[#e4e0e2] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
                <span>🌸</span> Add Sinking Fund
              </h3>
              <button
                onClick={() => setShowAdd(false)}
                className="text-[#64748b] hover:text-[#1f242e] p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Expense Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sam's Club, Car Registration"
                  value={newItem.name}
                  onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Due Date</label>
                  <input
                    type="date"
                    required
                    value={newItem.due_date}
                    onChange={e => setNewItem({ ...newItem, due_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={newItem.amount}
                    onChange={e => setNewItem({ ...newItem, amount: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Frequency</label>
                <select
                  value={newItem.frequency}
                  onChange={e => setNewItem({ ...newItem, frequency: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] font-semibold outline-none focus:border-[#7d3c4c]"
                >
                  <option value="annual">Annual (Once per year)</option>
                  <option value="biannual">Biannual (Every 6 months)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-[#64748b] font-bold rounded-xl hover:bg-[#f8f7f6] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#7d3c4c] text-white font-bold rounded-xl hover:bg-[#6a313f] shadow-md shadow-rose-900/15 cursor-pointer"
                >
                  Save Sinking Fund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Sinking Fund Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-[#e4e0e2] shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#e4e0e2]">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-white border border-[#ebd0d9] flex items-center justify-center text-sm shadow-2xs">
                  ✏️
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">
                    Edit Sinking Fund
                  </h3>
                  <p className="text-[11px] text-[#64748b]">Update amount, frequency, or due date</p>
                </div>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="text-[#64748b] hover:text-[#1f242e] p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5 text-xs">
              {/* Amount */}
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Target Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={editForm.amount}
                  onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full px-4 py-2.5 bg-[#fdf6f8]/50 border-2 border-[#ebd0d9] rounded-2xl text-lg font-mono font-extrabold text-[#7d3c4c] outline-none focus:border-[#7d3c4c] focus:bg-white transition-all shadow-inner"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Expense Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sam's Club, Car Insurance"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c] shadow-2xs"
                />
              </div>

              {/* Due Date & Frequency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Next Due Date</label>
                  <input
                    type="date"
                    required
                    value={editForm.due_date}
                    onChange={e => setEditForm({ ...editForm, due_date: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white border border-[#e4e0e2] rounded-xl font-mono text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c] shadow-2xs cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Frequency</label>
                  <select
                    value={editForm.frequency}
                    onChange={e => setEditForm({ ...editForm, frequency: e.target.value as any })}
                    className="w-full px-3.5 py-2 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] font-semibold outline-none focus:border-[#7d3c4c] shadow-2xs cursor-pointer"
                  >
                    <option value="annual">Annual (1x/yr)</option>
                    <option value="biannual">Biannual (2x/yr)</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Renews automatically in October"
                  value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3.5 py-2 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none text-xs focus:border-[#7d3c4c] shadow-2xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#f1eded]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 text-[#64748b] font-bold rounded-xl hover:bg-[#f8f7f6] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-[#7d3c4c] text-white font-bold rounded-xl hover:bg-[#6a313f] shadow-md shadow-rose-900/15 cursor-pointer active:scale-95 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
