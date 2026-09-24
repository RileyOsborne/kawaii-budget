import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Check, Trash2, X, Wallet, PiggyBank, Sparkles, ChevronLeft, ChevronRight, Edit2, GripVertical, RotateCcw } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, getOrdinalSuffix } from '../../utils/formatters';
import { KawaiiBadge } from '../common/KawaiiBadge';
import { api } from '../../api/client';
import { Bill } from '../../types';
import { isBillInPaycheck1 } from '../../utils/calculations';

export const BillBreakdownView: React.FC = () => {
  const { 
    bills, 
    accounts,
    paycheckPlan,
    refreshData, 
    showToast, 
    triggerConfetti, 
    selectedMonth, 
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    nextMonth, 
    prevMonth
  } = useBudget();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [billFilter, setBillFilter] = useState<'all' | 'p1' | 'p2' | 'unpaid'>('all');

  // Drag and Drop Bills Reordering State
  const [localBills, setLocalBills] = useState<Bill[]>([]);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | null>(null);

  useEffect(() => {
    const sorted = [...bills].sort((a, b) => {
      const orderA = a.sort_order ?? 0;
      const orderB = b.sort_order ?? 0;
      if (orderA > 0 && orderB > 0) return orderA - orderB;
      if (orderA > 0) return -1;
      if (orderB > 0) return 1;
      return (a.due_day || 0) - (b.due_day || 0);
    });
    setLocalBills(sorted);
  }, [bills]);
  const [editForm, setEditForm] = useState({
    name: '',
    due_day: 1,
    category: 'Subscriptions',
    paycheck_assignment: '1st Paycheck',
    amount: '',
  });

  const [newBill, setNewBill] = useState({
    name: '',
    due_day: 1,
    category: 'Subscriptions',
    paycheck_assignment: '1st Paycheck',
    amount: '',
  });

  const getLinkedAccount = (billName: string) => {
    if (!billName || billName.includes('(comes out of') || billName.includes('comes out of')) return null;
    const clean = (s: string) => s.toLowerCase().replace(/visa/g, '').replace(/vis/g, '').replace(/credit/g, '').replace(/[^a-z0-9]/g, '');
    const bNorm = clean(billName);
    return accounts.find(a => 
      (a.type === 'credit_card' || a.type === 'loan' || a.type === 'auto_loan') && 
      (a.name.trim().toLowerCase() === billName.trim().toLowerCase() || (bNorm.length >= 3 && clean(a.name) === bNorm))
    );
  };

  const p1BillStart = Number(paycheckPlan?.p1_bill_start ?? 1);
  const p1BillEnd = Number(paycheckPlan?.p1_bill_end ?? 15);
  const isFirstPaycheck = (b: any) => isBillInPaycheck1(b, p1BillStart, p1BillEnd, paycheckPlan?.cleared_p2_day);

  const p1Bills = bills.filter(isFirstPaycheck);
  const p2Bills = bills.filter(b => !isFirstPaycheck(b));

  const p1Total = p1Bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const p2Total = p2Bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const totalBillsAmount = p1Total + p2Total;

  // Active month paid stats
  const activeMonthKey = `paid_${selectedMonth.toLowerCase()}` as keyof (typeof bills)[0];
  const paidBills = bills.filter(b => Number(b[activeMonthKey] || 0) === 1);
  const unpaidBills = bills.filter(b => Number(b[activeMonthKey] || 0) !== 1);
  const paidCount = paidBills.length;
  const unpaidCount = unpaidBills.length;
  const paidAmount = paidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const unpaidAmount = totalBillsAmount - paidAmount;

  const allMonthsList = [
    { code: 'Jan', name: 'January' },
    { code: 'Feb', name: 'February' },
    { code: 'Mar', name: 'March' },
    { code: 'Apr', name: 'April' },
    { code: 'May', name: 'May' },
    { code: 'Jun', name: 'June' },
    { code: 'Jul', name: 'July' },
    { code: 'Aug', name: 'August' },
    { code: 'Sep', name: 'September' },
    { code: 'Oct', name: 'October' },
    { code: 'Nov', name: 'November' },
    { code: 'Dec', name: 'December' },
  ];

  // Starting strictly from August 2026
  const months2026 = [
    { code: 'Aug', name: 'August' },
    { code: 'Sep', name: 'September' },
    { code: 'Oct', name: 'October' },
    { code: 'Nov', name: 'November' },
    { code: 'Dec', name: 'December' },
  ];

  const handleMonthDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [m, y] = e.target.value.split('-');
    setSelectedMonth(m);
    setSelectedYear(parseInt(y, 10));
  };

  const currentSelectionValue = `${selectedMonth}-${selectedYear}`;

  const handleTogglePaid = async (billId: string) => {
    try {
      const res = await api.toggleBillPaid(billId, selectedMonth);
      await refreshData();
      if (res.newVal === 1) {
        triggerConfetti();
        showToast(`Marked as paid for ${selectedMonth}! 🌸 (Synced to Checking)`);
      } else {
        showToast(`Unmarked for ${selectedMonth}`);
      }
    } catch (err) {
      showToast('Failed to update bill payment status');
    }
  };

  const handleTogglePaycheck = async (bill: any) => {
    const nextAssignment = isFirstPaycheck(bill) ? '2nd Paycheck' : '1st Paycheck';
    try {
      await api.updateBill(bill.id, {
        paycheck_assignment: nextAssignment,
        assigned_check: nextAssignment,
      });
      await refreshData();
      showToast(`Assigned "${bill.name}" to ${nextAssignment}`);
    } catch (err) {
      showToast('Error updating paycheck assignment');
    }
  };

  const handleOpenEdit = (bill: Bill) => {
    setEditingBill(bill);
    let currentAssigned = bill.assigned_check || bill.paycheck_assignment;
    if (!currentAssigned || currentAssigned.includes('(')) {
      currentAssigned = isFirstPaycheck(bill) ? '1st Paycheck' : '2nd Paycheck';
    } else if (currentAssigned.toLowerCase().startsWith('first') || currentAssigned.toLowerCase().startsWith('1st')) {
      currentAssigned = '1st Paycheck';
    } else if (currentAssigned.toLowerCase().startsWith('second') || currentAssigned.toLowerCase().startsWith('2nd')) {
      currentAssigned = '2nd Paycheck';
    }

    setEditForm({
      name: bill.name,
      due_day: bill.due_day || 1,
      category: bill.category || 'Subscriptions',
      paycheck_assignment: currentAssigned,
      amount: String(bill.amount || 0),
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBill || !editForm.name || !editForm.amount) return;

    try {
      await api.updateBill(editingBill.id, {
        name: editForm.name.trim(),
        due_day: parseInt(String(editForm.due_day), 10) || 1,
        category: editForm.category,
        paycheck_assignment: editForm.paycheck_assignment,
        assigned_check: editForm.paycheck_assignment,
        amount: parseFloat(editForm.amount) || 0,
      });

      // If linked to an account, also update the account's min_payment & due_day
      const linked = getLinkedAccount(editingBill.name);
      if (linked) {
        await api.updateAccount(linked.id, {
          min_payment: parseFloat(editForm.amount) || 0,
          due_day: parseInt(String(editForm.due_day), 10) || 1,
        });
      }

      setEditingBill(null);
      await refreshData();
      showToast(`"${editForm.name}" updated successfully! 🌸`);
    } catch (err) {
      showToast('Error updating bill');
    }
  };

  const handleAddBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBill.name || !newBill.amount) return;
    try {
      await api.createBill({
        ...newBill,
        amount: parseFloat(newBill.amount),
        assigned_check: newBill.paycheck_assignment,
      });
      setShowAddModal(false);
      setNewBill({ name: '', due_day: 1, category: 'Subscriptions', paycheck_assignment: '1st Paycheck', amount: '' });
      await refreshData();
      showToast('New recurring bill added! 🌸');
    } catch (err) {
      showToast('Error adding bill');
    }
  };

  const handleDeleteBill = async (id: string, name: string) => {
    if (confirm(`Remove bill "${name}"?`)) {
      await api.deleteBill(id);
      await refreshData();
      showToast(`Removed "${name}"`);
    }
  };

  const handleRowDragStart = (e: React.DragEvent, id: string) => {
    setDraggedRowId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleRowDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (targetId === draggedRowId) {
      setDragOverRowId(null);
      setDragOverPosition(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'top' : 'bottom';

    setDragOverRowId(targetId);
    setDragOverPosition(pos);
  };

  const handleRowDragLeave = () => {
    setDragOverRowId(null);
    setDragOverPosition(null);
  };

  const handleRowDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedRowId || draggedRowId === targetId) {
      setDraggedRowId(null);
      setDragOverRowId(null);
      setDragOverPosition(null);
      return;
    }

    const sourceIdx = localBills.findIndex(b => b.id === draggedRowId);
    const targetIdx = localBills.findIndex(b => b.id === targetId);

    if (sourceIdx < 0 || targetIdx < 0) {
      setDraggedRowId(null);
      setDragOverRowId(null);
      setDragOverPosition(null);
      return;
    }

    const updated = [...localBills];
    const [movedItem] = updated.splice(sourceIdx, 1);
    
    let insertIdx = updated.findIndex(b => b.id === targetId);
    if (dragOverPosition === 'bottom') {
      insertIdx += 1;
    }
    updated.splice(insertIdx, 0, movedItem);

    setLocalBills(updated);
    setDraggedRowId(null);
    setDragOverRowId(null);
    setDragOverPosition(null);

    try {
      const newOrderIds = updated.map(b => b.id);
      await api.reorderBills(newOrderIds);
      await refreshData();
      showToast('Bill order updated! 🌸');
    } catch (err) {
      showToast('Error saving new bill order');
      await refreshData();
    }
  };

  const handleRowDragEnd = () => {
    setDraggedRowId(null);
    setDragOverRowId(null);
    setDragOverPosition(null);
  };

  const handleResetToChronological = async () => {
    const chronoSorted = [...bills].sort((a, b) => (a.due_day || 0) - (b.due_day || 0));
    try {
      const ids = chronoSorted.map(b => b.id);
      await api.reorderBills(ids);
      await refreshData();
      showToast('Reset bills to due date order! 📅');
    } catch (err) {
      showToast('Error resetting bill order');
    }
  };

  // Filter bills based on selected filter pill: All, Check 1, Check 2, Unpaid
  const displayBills = localBills.filter(b => {
    if (billFilter === 'p1') return isFirstPaycheck(b);
    if (billFilter === 'p2') return !isFirstPaycheck(b);
    if (billFilter === 'unpaid') return Number(b[activeMonthKey] || 0) !== 1;
    return true;
  });

  const displayTotalAmount = displayBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const displayPaidBills = displayBills.filter(b => Number(b[activeMonthKey] || 0) === 1);
  const displayPaidAmount = displayPaidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Month Selector & Header Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-[#e4e0e2] shadow-kawaii">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#fdf2f4] flex items-center justify-center text-2xl border border-[#f8ccd6] shadow-2xs shrink-0">
            📅
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
              Monthly Bill Breakdown
            </h2>
            <p className="text-xs text-[#64748b] font-medium">
              Manage recurring bills and track paid status for {allMonthsList.find(m => m.code === selectedMonth)?.name} {selectedYear}
            </p>
          </div>
        </div>

        {/* Clean Single Dropdown with Stepper & Add Bill Button */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-[#f8f7f6] p-1.5 rounded-2xl border border-[#e4e0e2] shadow-2xs">
            <button
              onClick={prevMonth}
              title="Previous Month"
              className="p-2 rounded-xl hover:bg-white text-[#7d3c4c] transition-all shadow-2xs active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="relative px-2">
              <select
                value={currentSelectionValue}
                onChange={handleMonthDropdownChange}
                className="bg-white border border-[#e4e0e2] text-[#7d3c4c] font-extrabold text-xs sm:text-sm px-3.5 py-1.5 rounded-xl outline-none font-cute cursor-pointer shadow-2xs hover:border-[#7d3c4c] transition-colors"
              >
                <optgroup label="2026 (Starting Month)">
                  {months2026.map(m => (
                    <option key={`2026-${m.code}`} value={`${m.code}-2026`}>
                      {m.name} 2026
                    </option>
                  ))}
                </optgroup>
                <optgroup label="2027">
                  {allMonthsList.map(m => (
                    <option key={`2027-${m.code}`} value={`${m.code}-2027`}>
                      {m.name} 2027
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <button
              onClick={nextMonth}
              title="Next Month"
              className="p-2 rounded-xl hover:bg-white text-[#7d3c4c] transition-all shadow-2xs active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-[#7d3c4c] hover:bg-[#6a313f] text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-rose-900/15 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Recurring Bill</span>
          </button>
        </div>
      </div>

      {/* Bill Table with Single Paid Column */}
      <div className="bg-white rounded-3xl shadow-kawaii border border-[#e4e0e2] overflow-hidden">
        {/* Table Title Bar with Filter Pills */}
        <div className="bg-[#fdf6f8] px-6 py-4 border-b border-[#e4e0e2] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
              <span>🌸</span> Recurring Bills ({displayBills.length}{billFilter !== 'all' ? ` of ${bills.length}` : ''})
            </h3>
            <p className="text-xs text-[#64748b] font-medium">
              Bills due in {allMonthsList.find(m => m.code === selectedMonth)?.name} {selectedYear}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Filter Pills: All, Check 1, Check 2, Unpaid */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-[#ebd0d9] shadow-2xs">
              <button
                type="button"
                onClick={() => setBillFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  billFilter === 'all'
                    ? 'bg-[#7d3c4c] text-white shadow-xs'
                    : 'text-[#52212e] hover:bg-[#fdf6f8]'
                }`}
              >
                All ({bills.length})
              </button>
              <button
                type="button"
                onClick={() => setBillFilter('p1')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  billFilter === 'p1'
                    ? 'bg-[#7d3c4c] text-white shadow-xs'
                    : 'text-[#52212e] hover:bg-[#fdf6f8]'
                }`}
              >
                Check 1 ({p1Bills.length})
              </button>
              <button
                type="button"
                onClick={() => setBillFilter('p2')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  billFilter === 'p2'
                    ? 'bg-[#7d3c4c] text-white shadow-xs'
                    : 'text-[#52212e] hover:bg-[#fdf6f8]'
                }`}
              >
                Check 2 ({p2Bills.length})
              </button>
              <button
                type="button"
                onClick={() => setBillFilter('unpaid')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  billFilter === 'unpaid'
                    ? 'bg-[#7d3c4c] text-white shadow-xs'
                    : 'text-[#52212e] hover:bg-[#fdf6f8]'
                }`}
              >
                Unpaid ({unpaidCount})
              </button>
            </div>

            {/* Paid Summary Pill */}
            <div className="flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-2xl border border-[#ebd0d9] text-xs font-bold text-[#7d3c4c] self-start sm:self-auto shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-[#059669]" />
              <span>{paidCount} of {bills.length} Paid</span>
              <span className="text-[#059669] font-mono">({formatCurrency(paidAmount)})</span>
            </div>

            {/* Reset Order Button */}
            <button
              type="button"
              onClick={handleResetToChronological}
              className="flex items-center gap-1.5 bg-white hover:bg-[#faedf1] px-3 py-1.5 rounded-2xl border border-[#ebd0d9] text-xs font-bold text-[#7d3c4c] transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Reset order chronologically by due date (1st to 31st)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#7d3c4c]" />
              <span>Due Date Order</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm font-medium">
            <thead>
              <tr className="bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white text-xs font-bold">
                <th className="py-3.5 px-3 w-10 text-center rounded-tl-2xl">
                  <span title="Drag handle to reorder rows">⠿</span>
                </th>
                <th className="py-3.5 px-4 sm:px-6">Bill Name</th>
                <th className="py-3.5 px-3 text-center">Due Day</th>
                <th className="py-3.5 px-3 text-center">Assigned Check</th>
                <th className="py-3.5 px-3">Category</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4 text-center w-36">Status ({selectedMonth})</th>
                <th className="py-3.5 px-4 text-center w-20 rounded-tr-2xl">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayBills.map((b, idx) => {
                const isEven = idx % 2 === 1;
                const isFirst = isFirstPaycheck(b);
                const isPaid = b[activeMonthKey] === 1;
                const linkedAccount = getLinkedAccount(b.name);
                const isBeingDragged = draggedRowId === b.id;
                const isDragOverTarget = dragOverRowId === b.id;

                return (
                  <tr
                    key={b.id}
                    draggable
                    onDragStart={(e) => handleRowDragStart(e, b.id)}
                    onDragOver={(e) => handleRowDragOver(e, b.id)}
                    onDragLeave={handleRowDragLeave}
                    onDrop={(e) => handleRowDrop(e, b.id)}
                    onDragEnd={handleRowDragEnd}
                    className={`transition-colors border-b border-[#f1eded] select-none ${
                      isBeingDragged 
                        ? 'opacity-30 bg-[#fdf6f8]' 
                        : isDragOverTarget
                          ? dragOverPosition === 'top'
                            ? 'border-t-3 border-t-[#7d3c4c] bg-[#fff0f4]'
                            : 'border-b-3 border-b-[#7d3c4c] bg-[#fff0f4]'
                          : isEven 
                            ? 'bg-[#fdf6f8] hover:bg-[#faedf1]' 
                            : 'bg-white hover:bg-[#faedf1]'
                    }`}
                  >
                    {/* Drag Handle */}
                    <td className="py-3.5 px-3 text-center cursor-grab active:cursor-grabbing text-[#cfabb8] hover:text-[#7d3c4c]">
                      <div className="flex items-center justify-center p-1 rounded-lg hover:bg-[#ebd0d9]/40 transition-colors">
                        <GripVertical className="w-4 h-4" />
                      </div>
                    </td>

                    {/* Bill Name */}
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#1f242e]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">🌸</span>
                        <span className={isPaid ? 'line-through text-[#64748b]' : ''}>{b.name}</span>
                      </div>
                      {linkedAccount && (
                        <div className="mt-1 ml-5">
                          <span 
                            className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 font-semibold inline-flex items-center gap-1"
                            title={`Synced with ${linkedAccount.name} minimum payment`}
                          >
                            💳 Min Payment Synced
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Due Day */}
                    <td className="py-3.5 px-3 text-center font-mono font-bold text-[#7d3c4c]">
                      <span className="bg-[#f8f7f6] px-2.5 py-0.5 rounded-lg border border-[#e4e0e2] text-xs font-bold">
                        {getOrdinalSuffix(b.due_day)}
                      </span>
                    </td>

                    {/* Paycheck Association */}
                    <td className="py-3.5 px-3 text-center">
                      <button
                        onClick={() => handleTogglePaycheck(b)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold border transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 ${
                          isFirst
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                        }`}
                        title="Click to toggle between First and Second Paycheck"
                      >
                        <span>{isFirst ? '1st Paycheck' : '2nd Paycheck'}</span>
                      </button>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-3">
                      <KawaiiBadge variant="mauve" size="sm">{b.category}</KawaiiBadge>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-[#1f242e]">
                      {formatCurrency(b.amount)}
                    </td>

                    {/* Single Paid Column (Toggle Button like Sinking Funds) */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleTogglePaid(b.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-2xs cursor-pointer active:scale-95 ${
                          isPaid
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                            : 'bg-white hover:bg-[#faedf1] text-[#64748b] border border-[#d1cbce]'
                        }`}
                        title={`Click to mark as ${isPaid ? 'unpaid' : 'paid'} for ${selectedMonth}`}
                      >
                        <Check className={`w-3.5 h-3.5 ${isPaid ? 'stroke-[3]' : 'text-slate-300'}`} />
                        <span>{isPaid ? 'Paid 🌸' : 'Unpaid'}</span>
                      </button>
                    </td>

                    {/* Action Column */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(b)}
                          className="p-1.5 text-[#64748b] hover:text-[#7d3c4c] rounded-lg transition-colors cursor-pointer hover:bg-white border border-transparent hover:border-[#ebd0d9]"
                          title="Edit Bill"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBill(b.id, b.name)}
                          className="p-1.5 text-[#d1cbce] hover:text-[#e11d48] rounded-lg transition-colors cursor-pointer hover:bg-rose-50"
                          title="Delete Bill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayBills.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#64748b]">
                    <span className="text-3xl block mb-2">🌸</span>
                    No recurring bills match this filter for {allMonthsList.find(m => m.code === selectedMonth)?.name} {selectedYear}
                  </td>
                </tr>
              )}
            </tbody>

            {/* Total Row */}
            <tfoot>
              <tr className="bg-[#f8d5db] text-[#1f242e] text-xs sm:text-sm font-extrabold border-t-2 border-[#e4e0e2]">
                <td colSpan={2} className="py-4 px-4 sm:px-6 font-bold text-[#1f242e] font-cute text-base">
                  Total Bills ({displayBills.length}{billFilter !== 'all' ? ` of ${bills.length}` : ''})
                </td>
                <td className="py-4 px-3 text-center text-[#64748b] text-xs">
                  {displayBills.length} bills
                </td>
                <td className="py-4 px-3 text-center text-[#64748b] text-xs">
                  1st: {p1Bills.length} | 2nd: {p2Bills.length}
                </td>
                <td className="py-4 px-3 text-[#64748b] text-xs">
                  {billFilter === 'all' ? 'Monthly Total' : `${billFilter.toUpperCase()} Total`}
                </td>
                <td className="py-4 px-4 text-right font-mono text-[#1f242e] text-base">
                  {formatCurrency(displayTotalAmount)}
                </td>
                <td className="py-4 px-4 text-center font-mono font-bold text-xs text-[#059669]">
                  {formatCurrency(displayPaidAmount)} Paid
                </td>
                <td className="py-4 px-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Edit Bill Modal */}
      {editingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-[#e4e0e2] shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#e4e0e2]">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-white border border-[#ebd0d9] flex items-center justify-center text-sm shadow-2xs">
                  ✏️
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">
                    Edit Recurring Bill
                  </h3>
                  <p className="text-[11px] text-[#64748b]">Update amount, due day, or paycheck assignment</p>
                </div>
              </div>
              <button
                onClick={() => setEditingBill(null)}
                className="text-[#64748b] hover:text-[#1f242e] p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {getLinkedAccount(editingBill.name) && (
              <div className="bg-purple-50 p-3 rounded-2xl border border-purple-200 text-xs text-purple-800 flex items-center gap-2">
                <span>💳</span>
                <span>
                  This bill is linked to <strong>{getLinkedAccount(editingBill.name)?.name}</strong>. Updating the amount will also update its minimum payment in Credit Cards / Loans.
                </span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Bill Name</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c] shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Due Day of Month</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={editForm.due_day}
                    onChange={e => setEditForm({ ...editForm, due_day: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c] shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={editForm.amount}
                    onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#fdf6f8]/50 border-2 border-[#ebd0d9] rounded-xl font-mono text-sm font-extrabold text-[#7d3c4c] outline-none focus:border-[#7d3c4c] focus:bg-white shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Category</label>
                  <select
                    value={editForm.category}
                    onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] font-semibold outline-none focus:border-[#7d3c4c] shadow-2xs cursor-pointer"
                  >
                    <option value="Utilities">Utilities</option>
                    <option value="Subscriptions">Subscriptions</option>
                    <option value="Debt Repayment">Debt Repayment</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Savings">Savings</option>
                    <option value="Other / Misc">Other / Misc</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Assigned Paycheck</label>
                  <select
                    value={editForm.paycheck_assignment}
                    onChange={e => setEditForm({ ...editForm, paycheck_assignment: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] font-semibold outline-none focus:border-[#7d3c4c] shadow-2xs cursor-pointer"
                  >
                    <option value="1st Paycheck">1st Paycheck (Check 1)</option>
                    <option value="2nd Paycheck">2nd Paycheck (Check 2)</option>
                    {editForm.paycheck_assignment === 'First Paycheck' && (
                      <option value="First Paycheck">1st Paycheck (Check 1)</option>
                    )}
                    {editForm.paycheck_assignment === 'Second Paycheck' && (
                      <option value="Second Paycheck">2nd Paycheck (Check 2)</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#f1eded]">
                <button
                  type="button"
                  onClick={() => setEditingBill(null)}
                  className="px-4 py-2 text-[#64748b] font-bold rounded-xl hover:bg-[#f8f7f6] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#7d3c4c] text-white font-bold rounded-xl hover:bg-[#6a313f] shadow-md shadow-rose-900/15 cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Bill Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-[#e4e0e2] shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
                <span>🌸</span> Add Recurring Bill
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#64748b] hover:text-[#1f242e] p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddBill} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Bill Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Netflix, Car Insurance"
                  value={newBill.name}
                  onChange={e => setNewBill({ ...newBill, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Due Day (1-31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={newBill.due_day}
                    onChange={e => setNewBill({ ...newBill, due_day: parseInt(e.target.value) || 1 })}
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
                    value={newBill.amount}
                    onChange={e => setNewBill({ ...newBill, amount: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Category</label>
                  <select
                    value={newBill.category}
                    onChange={e => setNewBill({ ...newBill, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] font-semibold outline-none focus:border-[#7d3c4c]"
                  >
                    <option value="Utilities">Utilities</option>
                    <option value="Subscriptions">Subscriptions</option>
                    <option value="Debt Repayment">Debt Repayment</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Savings">Savings</option>
                    <option value="Other / Misc">Other / Misc</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Assigned Paycheck</label>
                  <select
                    value={newBill.paycheck_assignment}
                    onChange={e => setNewBill({ ...newBill, paycheck_assignment: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] font-semibold outline-none focus:border-[#7d3c4c]"
                  >
                    <option value="1st Paycheck">1st Paycheck (Check 1)</option>
                    <option value="2nd Paycheck">2nd Paycheck (Check 2)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-[#64748b] font-bold rounded-xl hover:bg-[#f8f7f6] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#7d3c4c] text-white font-bold rounded-xl hover:bg-[#6a313f] shadow-md shadow-rose-900/15 cursor-pointer"
                >
                  Save Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
