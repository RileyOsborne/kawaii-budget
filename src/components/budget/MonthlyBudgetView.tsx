import React, { useState, useEffect } from 'react';
import { Sparkles, Edit2, Check, Plus, AlertCircle, TrendingUp, PiggyBank, CreditCard, ChevronLeft, ChevronRight, Trash2, X, Wallet, GripVertical } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, formatPercent, getOrdinalSuffix } from '../../utils/formatters';
import { ProgressBar } from '../common/ProgressBar';
import { api } from '../../api/client';
import { isBillInPaycheck1 } from '../../utils/calculations';
import { SakuraIcon } from '../common/SakuraIcon';

const PRESET_COLORS = [
  '#7d3c4c', // deep mauve
  '#fb7185', // rose
  '#f472b6', // pink
  '#ec4899', // hot pink
  '#c084fc', // lavender
  '#a855f7', // purple
  '#38bdf8', // sky
  '#06b6d4', // cyan
  '#34d399', // emerald
  '#fb923c', // orange
  '#facc15', // yellow
  '#94a3b8', // slate
];

const PRESET_ICONS = ['🌸', '📱', '💡', '🛒', '⛽', '🛡️', '💳', '🎮', '📦', '🍱', '🐔', '✨', '☕', '🏠', '🐾', '🩺', '🚗', '✈️'];

export const MonthlyBudgetView: React.FC = () => {
  const { 
    stats, 
    categories, 
    bills,
    accounts,
    transactions,
    paycheckPlan,
    refreshData, 
    showToast, 
    selectedMonth, 
    selectedYear, 
    setSelectedMonth, 
    setSelectedYear,
    nextMonth, 
    prevMonth 
  } = useBudget();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBudgetVal, setEditBudgetVal] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', icon: '🌸', color: '#7d3c4c', budget: '' });
  const [breakdownCat, setBreakdownCat] = useState<any | null>(null);

  // Full Category Edit & Delete State
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    id: '',
    name: '',
    icon: '🌸',
    color: '#7d3c4c',
    budget: '0',
  });
  const [deletingCategory, setDeletingCategory] = useState<any | null>(null);

  // Paycheck income estimates (dynamically synced from active paycheck plan / ledger)
  const [p1Income, setP1Income] = useState<number>(() => Number(paycheckPlan?.p1_income ?? 0));
  const [p2Income, setP2Income] = useState<number>(() => Number(paycheckPlan?.p2_income ?? 0));
  const [isEditingIncomes, setIsEditingIncomes] = useState<boolean>(false);
  const [isSavingIncomes, setIsSavingIncomes] = useState<boolean>(false);

  // Sync incomes when active paycheckPlan, month, or year updates (unless currently editing)
  useEffect(() => {
    if (!isEditingIncomes && paycheckPlan) {
      setP1Income(Number(paycheckPlan.p1_income ?? 0));
      setP2Income(Number(paycheckPlan.p2_income ?? 0));
    }
  }, [paycheckPlan, isEditingIncomes, selectedMonth, selectedYear]);

  const handleSaveIncomes = async () => {
    try {
      setIsSavingIncomes(true);
      const monthKey = `${selectedMonth} ${selectedYear}`;
      await api.updatePaycheckPlan({
        month: monthKey,
        p1_income: p1Income,
        p2_income: p2Income,
        manual_fields: Array.from(new Set([...(paycheckPlan?.manual_fields || []), 'p1_income', 'p2_income']))
      });
      setIsEditingIncomes(false);
      showToast('🌸 Paycheck incomes saved!');
      await refreshData();
    } catch (err: any) {
      showToast('⚠️ Failed to save incomes: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingIncomes(false);
    }
  };

  const handleCancelEditIncomes = () => {
    setP1Income(Number(paycheckPlan?.p1_income ?? 0));
    setP2Income(Number(paycheckPlan?.p2_income ?? 0));
    setIsEditingIncomes(false);
  };

  const summary = stats?.budgetSummary;

  // Drag and Drop Categories Reordering State
  const [localCategories, setLocalCategories] = useState<any[]>([]);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | null>(null);

  useEffect(() => {
    if (summary?.categories) {
      setLocalCategories(summary.categories);
    }
  }, [summary?.categories]);

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

    const sourceIdx = localCategories.findIndex(c => c.id === draggedRowId);
    const targetIdx = localCategories.findIndex(c => c.id === targetId);

    if (sourceIdx < 0 || targetIdx < 0) {
      setDraggedRowId(null);
      setDragOverRowId(null);
      setDragOverPosition(null);
      return;
    }

    const updated = [...localCategories];
    const [movedItem] = updated.splice(sourceIdx, 1);
    
    let insertIdx = updated.findIndex(c => c.id === targetId);
    if (dragOverPosition === 'bottom') {
      insertIdx += 1;
    }
    updated.splice(insertIdx, 0, movedItem);

    setLocalCategories(updated);
    setDraggedRowId(null);
    setDragOverRowId(null);
    setDragOverPosition(null);

    try {
      const newOrderIds = updated.map(c => c.id);
      await api.reorderCategories(newOrderIds);
      await refreshData();
      showToast('Category order updated! 🌸');
    } catch (err) {
      showToast('Error saving category order');
      await refreshData();
    }
  };

  const handleRowDragEnd = () => {
    setDraggedRowId(null);
    setDragOverRowId(null);
    setDragOverPosition(null);
  };

  const p1BillStart = Number(paycheckPlan?.p1_bill_start ?? stats?.paycheckPlan?.p1_bill_start ?? 1);
  const p1BillEnd = Number(paycheckPlan?.p1_bill_end ?? stats?.paycheckPlan?.p1_bill_end ?? 15);
  const clearedP2Day = paycheckPlan?.cleared_p2_day ?? stats?.paycheckPlan?.cleared_p2_day;
  const isFirstPaycheck = (b: any) => isBillInPaycheck1(b, p1BillStart, p1BillEnd, clearedP2Day);

  const p1Bills = bills.filter(isFirstPaycheck);
  const p2Bills = bills.filter(b => !isFirstPaycheck(b));

  const p1Total = p1Bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const p2Total = p2Bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const totalBillsAmount = p1Total + p2Total;

  const p1Remaining = p1Income - p1Total;
  const p2Remaining = p2Income - p2Total;
  const totalMonthlyExtra = p1Remaining + p2Remaining;

  // Active month paid stats
  const activeMonthKey = `paid_${selectedMonth.toLowerCase()}` as keyof (typeof bills)[0];
  const paidCount = bills.filter(b => b[activeMonthKey] === 1).length;
  const paidAmount = bills.filter(b => b[activeMonthKey] === 1).reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

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

  const availableYears = React.useMemo(() => {
    const years = new Set<number>([2026, 2027]);
    if (selectedYear) years.add(selectedYear);
    const curr = new Date().getFullYear();
    if (curr) years.add(curr);
    return Array.from(years).sort((a, b) => a - b);
  }, [selectedYear]);

  const monthMap: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  const activeMonthPrefix = `${selectedYear}-${monthMap[selectedMonth] || '09'}`;
  const activeMonthPaidCol = `paid_${selectedMonth.toLowerCase()}` as keyof (typeof bills)[0];

  const breakdownItems = React.useMemo(() => {
    if (!breakdownCat) return [];
    const catNameNorm = (breakdownCat.name || '').trim().toLowerCase();
    const items: Array<{
      id: string;
      date: string;
      source: string;
      isCreditCard: boolean;
      description: string;
      amount: number;
      kind: string;
    }> = [];

    // 1. Paid bills for this category
    for (const b of bills) {
      if (b[activeMonthPaidCol] === 1 && (b.category || '').trim().toLowerCase() === catNameNorm) {
        items.push({
          id: b.id,
          date: `${selectedYear}-${monthMap[selectedMonth] || '09'}-${String(b.due_day).padStart(2, '0')}`,
          source: 'Monthly Bill (Paid)',
          isCreditCard: false,
          description: b.name,
          amount: Number(b.amount || 0),
          kind: 'Bill',
        });
      }
    }

    // 2. Transactions in active month
    for (const t of transactions) {
      if (!t.date || !t.date.startsWith(activeMonthPrefix)) continue;
      if ((t.category || '').trim().toLowerCase() !== catNameNorm) continue;
      if (t.notes && t.notes.includes('[Bill Auto-Sync')) continue;

      const acc = accounts.find(a => a.id === t.account_id);
      const isCC = acc?.type === 'credit_card';

      if (isCC) {
        // Exclude CC payments and starting balance
        const isPayment = t.type === 'Payment' || (t.type === 'Income' && !t.category?.toLowerCase().includes('refund') && !t.description?.toLowerCase().includes('refund'));
        if (isPayment || t.description?.toLowerCase().includes('starting balance')) continue;

        items.push({
          id: t.id,
          date: t.date,
          source: acc?.name || 'Credit Card',
          isCreditCard: true,
          description: t.description,
          amount: Number(t.amount || 0),
          kind: t.type === 'Income' ? 'Refund' : 'Card Charge',
        });
      } else {
        if (t.type === 'Expense' || t.type === 'Payment' || t.type === 'Track Only') {
          const isCCSync = Boolean(t.notes && t.notes.includes('[CC Payment Sync:'));
          items.push({
            id: t.id,
            date: t.date,
            source: acc?.name || 'Bank Account',
            isCreditCard: false,
            description: t.description,
            amount: Number(t.amount || 0),
            kind: isCCSync ? 'CC Paydown Transfer' : 'Bank Withdrawal',
          });
        }
      }
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [breakdownCat, bills, transactions, accounts, activeMonthPaidCol, activeMonthPrefix, selectedMonth, selectedYear]);

  const handleStartEdit = (cat: any) => {
    setEditingId(cat.id);
    setEditBudgetVal(cat.budget.toString());
  };

  const handleSaveEdit = async (cat: any) => {
    try {
      const newBudget = parseFloat(editBudgetVal);
      if (isNaN(newBudget) || newBudget < 0) {
        showToast('Please enter a valid amount');
        return;
      }
      await api.updateCategory(cat.id, { 
        budget: newBudget, 
        month: selectedMonth, 
        year: selectedYear 
      });
      setEditingId(null);
      await refreshData(selectedMonth, selectedYear);
      showToast(`Updated ${selectedMonth} budget for ${cat.name}! 🌸`);
    } catch (err: any) {
      showToast('Error updating budget');
    }
  };

  const handleOpenEditModal = (cat: any) => {
    setEditingCategory(cat);
    setCategoryForm({
      id: cat.id,
      name: cat.name || '',
      icon: cat.icon || '🌸',
      color: cat.color || '#7d3c4c',
      budget: cat.budget !== undefined && cat.budget !== null ? String(cat.budget) : '0',
    });
  };

  const handleSaveCategoryModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) {
      showToast('Category name is required');
      return;
    }
    const parsedBudget = parseFloat(categoryForm.budget);
    if (isNaN(parsedBudget) || parsedBudget < 0) {
      showToast('Please enter a valid budget amount');
      return;
    }

    try {
      await api.updateCategory(categoryForm.id, {
        name: categoryForm.name.trim(),
        icon: categoryForm.icon.trim() || '🌸',
        color: categoryForm.color,
        budget: parsedBudget,
        month: selectedMonth,
        year: selectedYear,
      });
      setEditingCategory(null);
      await refreshData(selectedMonth, selectedYear);
      showToast(`Category "${categoryForm.name.trim()}" updated! 🌸`);
    } catch (err: any) {
      showToast(`Error updating category: ${err.message}`);
    }
  };

  const handleConfirmDeleteCategory = async (scope: 'month' | 'all' = 'month') => {
    if (!deletingCategory) return;
    try {
      await api.deleteCategory(deletingCategory.id, {
        month: selectedMonth,
        year: selectedYear,
        scope,
      });
      const catName = deletingCategory.name;
      setDeletingCategory(null);
      if (editingCategory?.id === deletingCategory.id) {
        setEditingCategory(null);
      }
      await refreshData(selectedMonth, selectedYear);
      showToast(
        scope === 'all'
          ? `Row "${catName}" removed from all monthly budgets! 🌸`
          : `Row "${catName}" removed from ${selectedMonth} ${selectedYear} budget! 🌸`
      );
    } catch (err: any) {
      showToast(`Error removing row: ${err.message}`);
    }
  };

  const availableCategoriesToRestore = React.useMemo(() => {
    const currentNames = new Set(localCategories.map(c => (c.name || '').trim().toLowerCase()));
    const nonBudgetCats = ['income', 'refunds', 'rollover', 'paycheck 1', 'paycheck 2', 'interest earned'];
    return categories.filter(c => {
      const n = (c.name || '').trim().toLowerCase();
      return !currentNames.has(n) && !nonBudgetCats.includes(n);
    });
  }, [categories, localCategories]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat.name) return;
    try {
      await api.createCategory({
        name: newCat.name.trim(),
        icon: newCat.icon || '🌸',
        color: newCat.color || '#7d3c4c',
        budget: parseFloat(newCat.budget) || 0,
        month: selectedMonth,
        year: selectedYear,
      });
      setShowAddModal(false);
      setNewCat({ name: '', icon: '🌸', color: '#7d3c4c', budget: '' });
      await refreshData(selectedMonth, selectedYear);
      showToast('New budget line added! 🌸');
    } catch (err) {
      showToast('Error adding category');
    }
  };

  const handleMonthDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [m, y] = e.target.value.split('-');
    setSelectedMonth(m);
    setSelectedYear(parseInt(y, 10));
  };

  const currentSelectionValue = `${selectedMonth}-${selectedYear}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Month Selector & Header Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-[#e4e0e2] shadow-kawaii">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#fdf2f4] flex items-center justify-center border border-[#f8ccd6] shadow-2xs shrink-0">
            <SakuraIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
              Monthly Budget Planner
            </h2>
            <p className="text-xs text-[#64748b] font-medium">
              Reference overview for planned budget vs actual spending
            </p>
          </div>
        </div>

        {/* Clean Single Dropdown with Stepper */}
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
                {availableYears.map(yr => (
                  <optgroup key={`year-${yr}`} label={String(yr)}>
                    {allMonthsList.map(m => (
                      <option key={`${yr}-${m.code}`} value={`${m.code}-${yr}`}>
                        {m.name} {yr}
                      </option>
                    ))}
                  </optgroup>
                ))}
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

          {/* Add Category Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-[#7d3c4c] hover:bg-[#6a313f] text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-rose-900/15 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Budget Line</span>
          </button>
        </div>
      </div>

      {/* Paycheck Extra / Remaining Calculation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* First Paycheck Card */}
        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold tracking-wider text-[#065f46] uppercase font-cute bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 inline-block">
                  First Paycheck
                </span>
                <span className="text-[10px] text-[#64748b] font-medium">Funds Check 1 Bills ({paycheckPlan?.p1_period || '1st - 15th'})</span>
              </div>
              <div className="text-xs text-[#64748b] mt-1.5 font-medium flex items-center gap-1.5 flex-wrap">
                <span>Check:</span>
                {isEditingIncomes ? (
                  <input
                    type="number"
                    value={p1Income}
                    onChange={e => setP1Income(parseFloat(e.target.value) || 0)}
                    className="w-20 px-1 py-0.5 border border-[#cfabb8] rounded text-xs font-mono font-bold text-[#1f242e]"
                  />
                ) : (
                  <span className="font-mono font-bold text-[#1f242e]">{formatCurrency(p1Income)}</span>
                )}
                <span>- Bills: <strong className="font-mono text-[#e11d48]">{formatCurrency(p1Total)}</strong></span>
              </div>
            </div>
            <div className="p-2 rounded-2xl bg-emerald-50 text-[#059669] border border-emerald-200">
              <Wallet className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f1eded]">
            <div className="text-[11px] font-bold text-[#64748b]">Extra After Check 1 Bills</div>
            <div className="text-2xl font-extrabold text-[#059669] font-mono mt-0.5">
              {formatCurrency(p1Remaining)}
            </div>
            <p className="text-[11px] text-[#065f46] font-semibold mt-0.5">
              {p1Bills.length} bills funded by First Check
            </p>
          </div>
        </div>

        {/* Second Paycheck Card */}
        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold tracking-wider text-[#6b21a8] uppercase font-cute bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 inline-block">
                  Second Paycheck
                </span>
                <span className="text-[10px] text-[#64748b] font-medium">{clearedP2Day && clearedP2Day > 0 ? `Cleared on the ${clearedP2Day}${getOrdinalSuffix(clearedP2Day).slice(-2)}` : 'Paid on the 15th'} • Funds Check 2 Bills ({paycheckPlan?.p2_period || '16th - 31st'})</span>
              </div>
              <div className="text-xs text-[#64748b] mt-1.5 font-medium flex items-center gap-1.5 flex-wrap">
                <span>Check:</span>
                {isEditingIncomes ? (
                  <input
                    type="number"
                    value={p2Income}
                    onChange={e => setP2Income(parseFloat(e.target.value) || 0)}
                    className="w-20 px-1 py-0.5 border border-[#cfabb8] rounded text-xs font-mono font-bold text-[#1f242e]"
                  />
                ) : (
                  <span className="font-mono font-bold text-[#1f242e]">{formatCurrency(p2Income)}</span>
                )}
                <span>- Bills: <strong className="font-mono text-[#e11d48]">{formatCurrency(p2Total)}</strong></span>
              </div>
            </div>
            <div className="p-2 rounded-2xl bg-purple-50 text-[#7c3aed] border border-purple-200">
              <Wallet className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f1eded]">
            <div className="text-[11px] font-bold text-[#64748b]">Extra After Check 2 Bills</div>
            <div className="text-2xl font-extrabold text-[#059669] font-mono mt-0.5">
              {formatCurrency(p2Remaining)}
            </div>
            <p className="text-[11px] text-[#6b21a8] font-semibold mt-0.5">
              {p2Bills.length} bills funded by Second Check
            </p>
          </div>
        </div>

        {/* Total Monthly Extra Card */}
        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] font-bold tracking-wider text-[#7d3c4c] uppercase font-cute block bg-[#fdf2f4] px-2.5 py-0.5 rounded-full border border-[#f8ccd6] inline-block mb-1">
                Total Monthly Cash Left
              </span>
              <div className="text-xs text-[#64748b] mt-1 font-medium">
                Total Bills: <strong className="font-mono text-[#e11d48]">{formatCurrency(totalBillsAmount)}</strong>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {isEditingIncomes ? (
                <>
                  <button
                    onClick={handleSaveIncomes}
                    disabled={isSavingIncomes}
                    className="p-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-[#059669] border border-emerald-200 transition-colors cursor-pointer"
                    title="Save estimated paycheck incomes"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleCancelEditIncomes}
                    disabled={isSavingIncomes}
                    className="p-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer"
                    title="Cancel editing"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditingIncomes(true)}
                  className="p-2 rounded-2xl bg-[#f8f7f6] hover:bg-[#fdf2f4] text-[#7d3c4c] border border-[#e4e0e2] transition-colors cursor-pointer"
                  title="Edit estimated paycheck incomes"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f1eded]">
            <div className="text-[11px] font-bold text-[#64748b]">Remaining for Living &amp; Debt</div>
            <div className="text-2xl font-extrabold text-[#7d3c4c] font-mono mt-0.5">
              {formatCurrency(totalMonthlyExtra)}
            </div>
            <p className="text-[11px] text-[#059669] font-bold mt-0.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {paidCount} of {bills.length} bills paid for {selectedMonth} ({formatCurrency(paidAmount)})
            </p>
          </div>
        </div>
      </div>

      {/* Main Budget Reference Table */}
      <div className="bg-white rounded-3xl shadow-kawaii border border-[#e4e0e2] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            {/* Table Header: Deep Mauve / Burgundy #7d3c4c */}
            <thead>
              <tr className="bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white text-xs sm:text-sm font-bold tracking-wide">
                <th className="py-3.5 px-3 w-10 text-center rounded-tl-2xl">
                  <span title="Drag handle to reorder categories">⠿</span>
                </th>
                <th className="py-3.5 px-4 sm:px-6">Category</th>
                <th className="py-3.5 px-4 text-right">Budget</th>
                <th className="py-3.5 px-4 text-right">
                  Actual <span className="text-[10px] font-normal opacity-85 block sm:inline">(Real-Time)</span>
                </th>
                <th className="py-3.5 px-4 text-right">Difference</th>
                <th className="py-3.5 px-4 text-right">Delta</th>
                <th className="py-3.5 px-4 text-center rounded-tr-2xl w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="text-xs sm:text-sm font-medium">
              {localCategories.map((cat, idx) => {
                const isEven = idx % 2 === 1;
                const isOver = (cat.difference || 0) < 0;
                const isEditing = editingId === cat.id;
                const isBeingDragged = draggedRowId === cat.id;
                const isDragOverTarget = dragOverRowId === cat.id;

                return (
                  <tr
                    key={cat.id}
                    draggable
                    onDragStart={(e) => handleRowDragStart(e, cat.id)}
                    onDragOver={(e) => handleRowDragOver(e, cat.id)}
                    onDragLeave={handleRowDragLeave}
                    onDrop={(e) => handleRowDrop(e, cat.id)}
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

                    {/* Category Column */}
                    <td className="py-3.5 px-4 sm:px-6 text-[#1f242e] font-bold">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base flex items-center justify-center">
                          {cat.icon === '🌸' ? <SakuraIcon className="w-4 h-4 inline-block" /> : cat.icon}
                        </span>
                        <span>{cat.name}</span>
                      </div>
                    </td>

                    {/* Budget Column (Editable) */}
                    <td className="py-3.5 px-4 text-right font-mono text-[#52212e] font-bold">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="0.01"
                            value={editBudgetVal}
                            onChange={(e) => setEditBudgetVal(e.target.value)}
                            className="w-24 px-2 py-1 border border-[#debac6] rounded-lg text-right text-xs outline-none bg-white text-[#1f242e] font-mono font-bold"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(cat);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            onClick={() => handleSaveEdit(cat)}
                            className="p-1 bg-emerald-100 text-emerald-800 rounded-md hover:bg-emerald-200 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 bg-rose-100 text-rose-800 rounded-md hover:bg-rose-200 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5 group">
                          <span>{formatCurrency(cat.budget)}</span>
                          <button
                            onClick={() => handleStartEdit(cat)}
                            className="opacity-0 group-hover:opacity-100 text-[#64748b] hover:text-[#7d3c4c] transition-opacity p-0.5 cursor-pointer"
                            title="Edit Budget"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Actual Column (Real-Time Drill-Down) */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-[#1f242e]">
                      <button
                        type="button"
                        onClick={() => setBreakdownCat(cat)}
                        className="font-mono font-bold text-[#1f242e] hover:text-[#7d3c4c] hover:bg-rose-50 px-2 py-0.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 group"
                        title="Click to view real-time charges and spending breakdown"
                      >
                        <span>{formatCurrency(cat.actual)}</span>
                        <span className="text-[10px] text-[#cfabb8] opacity-0 group-hover:opacity-100 transition-opacity">🔍</span>
                      </button>
                    </td>

                    {/* Difference Column */}
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold">
                      <span className={isOver ? 'text-[#e11d48]' : 'text-[#059669]'}>
                        {cat.difference >= 0 ? '+' : ''}{formatCurrency(cat.difference)}
                      </span>
                    </td>

                    {/* Delta Column */}
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold">
                      <div className="flex items-center justify-end gap-2">
                        <span className={isOver ? 'text-[#e11d48]' : 'text-[#1f242e]'}>
                          {formatPercent(cat.delta)}
                        </span>
                      </div>
                    </td>

                    {/* Actions Column */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(cat)}
                          className="p-1.5 rounded-lg text-[#64748b] hover:text-[#7d3c4c] hover:bg-rose-100/60 transition-colors cursor-pointer"
                          title="Fully edit category (Name, Icon, Color, Budget)"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCategory(cat)}
                          className="p-1.5 rounded-lg text-[#64748b] hover:text-rose-600 hover:bg-rose-100/60 transition-colors cursor-pointer"
                          title="Delete category from budget"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Total Row: Soft Rose Highlight #f8d5db */}
            <tfoot>
              <tr className="bg-[#f8d5db] text-[#1f242e] text-xs sm:text-sm font-extrabold border-t-2 border-[#e4e0e2]">
                <td colSpan={2} className="py-4 px-4 sm:px-6 font-bold text-[#1f242e] font-cute text-base">
                  Total Expenses
                </td>
                <td className="py-4 px-4 text-right font-mono text-[#1f242e] text-base">
                  {formatCurrency(summary?.totalBudget ?? 0)}
                </td>
                <td className="py-4 px-4 text-right font-mono text-[#1f242e] text-base">
                  {formatCurrency(summary?.totalActual ?? 0)}
                </td>
                <td className="py-4 px-4 text-right font-mono text-base">
                  <span className={(summary?.totalDifference ?? 0) < 0 ? 'text-[#e11d48]' : 'text-[#059669]'}>
                    {(summary?.totalDifference ?? 0) >= 0 ? '+' : ''}{formatCurrency(summary?.totalDifference ?? 0)}
                  </span>
                </td>
                <td className="py-4 px-4 text-right font-mono text-[#1f242e] text-base">
                  {formatPercent(summary?.delta ?? 0)}
                </td>
                <td className="py-4 px-4 text-center"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Add New Category Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border-2 border-[#ebd0d9] shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#ebd0d9]">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl flex items-center justify-center">
                  {(!newCat.icon || newCat.icon === '🌸') ? <SakuraIcon className="w-6 h-6 inline-block" /> : newCat.icon}
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">
                    Add New Budget Category
                  </h3>
                  <p className="text-[11px] text-[#8c6b73]">
                    Create a new spending or bills category for {selectedMonth} {selectedYear}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#8c6b73] hover:text-[#7d3c4c] p-1.5 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCategory} className="space-y-3.5 text-xs">
              {availableCategoriesToRestore.length > 0 && (
                <div className="p-2.5 bg-[#fdf6f8] rounded-xl border border-[#ebd0d9]">
                  <label className="block font-bold text-[#7d3c4c] text-[11px] mb-1">
                    ✨ Restore an existing category to this month:
                  </label>
                  <select
                    onChange={e => {
                      const found = availableCategoriesToRestore.find(c => c.id === e.target.value);
                      if (found) {
                        setNewCat({
                          name: found.name,
                          icon: found.icon || '🌸',
                          color: found.color || '#7d3c4c',
                          budget: String(found.budget || '0'),
                        });
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-white border border-[#ebd0d9] rounded-lg text-xs font-semibold text-[#1f242e] outline-none cursor-pointer"
                    defaultValue=""
                  >
                    <option value="" disabled>-- Pick a category to restore --</option>
                    {availableCategoriesToRestore.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name} (Prior budget: ${c.budget || 0})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Phone Bill, Pet Care, Yard Care"
                  value={newCat.name}
                  onChange={e => setNewCat({ ...newCat, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl text-[#1f242e] outline-none font-bold focus:border-[#7d3c4c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Emoji Icon</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="🌸"
                      value={newCat.icon}
                      onChange={e => setNewCat({ ...newCat, icon: e.target.value })}
                      className="w-12 px-2 py-2 bg-white border border-[#ebd0d9] rounded-xl text-[#1f242e] text-center text-lg outline-none font-bold focus:border-[#7d3c4c]"
                    />
                    <div className="flex gap-1 flex-wrap max-w-[110px]">
                      {PRESET_ICONS.slice(0, 6).map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setNewCat({ ...newCat, icon: emoji })}
                          className={`w-5 h-5 rounded-md text-xs flex items-center justify-center hover:scale-110 transition-transform ${newCat.icon === emoji ? 'bg-rose-100 border border-rose-300' : 'bg-slate-50'}`}
                        >
                          {emoji === '🌸' ? <SakuraIcon className="w-3.5 h-3.5" /> : emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Planned Budget ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={newCat.budget}
                    onChange={e => setNewCat({ ...newCat, budget: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl text-[#1f242e] outline-none font-mono font-bold focus:border-[#7d3c4c]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1f242e] mb-1.5">Category Color Tag</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCat({ ...newCat, color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${newCat.color === c ? 'border-black ring-2 ring-[#7d3c4c]/30 scale-110' : 'border-white'}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#ebd0d9]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-[#8c6b73] font-bold rounded-xl hover:bg-slate-50 cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#7d3c4c] text-white font-bold rounded-xl hover:bg-[#6a313f] shadow-md shadow-rose-900/15 cursor-pointer text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Edit Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 border-2 border-[#ebd0d9] shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#ebd0d9]">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl flex items-center justify-center">
                  {categoryForm.icon === '🌸' ? <SakuraIcon className="w-6 h-6 inline-block" /> : categoryForm.icon}
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-[#1f242e] font-cute">
                    Edit Category
                  </h3>
                  <p className="text-[11px] text-[#8c6b73]">
                    Modify category name, icon, color, and {selectedMonth} {selectedYear} budget
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="p-1.5 text-[#8c6b73] hover:text-[#7d3c4c] hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategoryModal} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  value={categoryForm.name}
                  onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="e.g. Phone Bill"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl text-[#1f242e] font-bold text-xs outline-none focus:border-[#7d3c4c]"
                />
                <p className="text-[10px] text-[#8c6b73] mt-1">
                  Renaming will automatically update all matching transactions and bills!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Emoji Icon</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={categoryForm.icon}
                      onChange={e => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                      className="w-12 px-2 py-2 bg-white border border-[#ebd0d9] rounded-xl text-center text-lg outline-none font-bold focus:border-[#7d3c4c]"
                    />
                    <div className="flex gap-1 flex-wrap max-w-[110px]">
                      {PRESET_ICONS.slice(0, 6).map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setCategoryForm({ ...categoryForm, icon: emoji })}
                          className={`w-5 h-5 rounded-md text-xs flex items-center justify-center hover:scale-110 transition-transform ${categoryForm.icon === emoji ? 'bg-rose-100 border border-rose-300' : 'bg-slate-50'}`}
                        >
                          {emoji === '🌸' ? <SakuraIcon className="w-3.5 h-3.5" /> : emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Planned Budget ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={categoryForm.budget}
                    onChange={e => setCategoryForm({ ...categoryForm, budget: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl text-[#1f242e] font-mono font-bold text-xs outline-none focus:border-[#7d3c4c]"
                  />
                  <span className="text-[10px] text-[#8c6b73]">For {selectedMonth} {selectedYear}</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1f242e] mb-1.5">Category Color Tag</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategoryForm({ ...categoryForm, color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${categoryForm.color === c ? 'border-black ring-2 ring-[#7d3c4c]/30 scale-110' : 'border-white'}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#ebd0d9]">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingCategory(editingCategory);
                  }}
                  className="px-3 py-2 text-rose-600 hover:bg-rose-50 font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Category</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCategory(null)}
                    className="px-3 py-2 text-[#8c6b73] font-bold rounded-xl hover:bg-slate-50 cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#7d3c4c] text-white font-bold rounded-xl hover:bg-[#6a313f] shadow-md shadow-rose-900/15 flex items-center gap-1.5 cursor-pointer text-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 border-2 border-[#ebd0d9] shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#fdf2f4] flex items-center justify-center text-2xl border border-[#f8ccd6] shrink-0">
                🗑️
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">
                  Remove Row from Monthly Budget?
                </h3>
                <p className="text-xs text-[#8c6b73]">
                  Remove the <strong className="text-[#1f242e]">{deletingCategory.name}</strong> row from your budget table.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-[#f0fdf4] rounded-2xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-emerald-800">
                <span>🛡️</span> Your transactions and accounts are 100% safe!
              </p>
              <p className="text-[11px] text-emerald-700">
                This <strong>only removes the row</strong> from the Monthly Budget Planner. Your past transactions, credit card charges, bills, and account balances will <strong>NOT</strong> be deleted or altered.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirmDeleteCategory('month')}
                  className="px-3.5 py-2.5 text-xs font-bold text-white bg-[#7d3c4c] hover:bg-[#6a313f] rounded-xl shadow-md shadow-rose-900/15 transition-colors cursor-pointer text-center"
                >
                  Remove for {selectedMonth} {selectedYear}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmDeleteCategory('all')}
                  className="px-3.5 py-2.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer text-center"
                >
                  Remove for All Months
                </button>
              </div>
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="w-full py-2 text-xs font-bold text-[#8c6b73] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-center"
              >
                Cancel (Keep Row)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Spending Breakdown Modal */}
      {breakdownCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full border-2 border-[#ebd0d9] shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#ebd0d9]">
              <div className="flex items-center gap-2.5">
                <span className="text-3xl flex items-center justify-center">
                  {(!breakdownCat.icon || breakdownCat.icon === '🌸') ? <SakuraIcon className="w-8 h-8 inline-block" /> : breakdownCat.icon}
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute flex items-center gap-1.5">
                    <span>{breakdownCat.name}</span>
                    <span className="text-xs bg-[#fdf2f4] text-[#7d3c4c] px-2 py-0.5 rounded-md border border-[#f8ccd6] font-mono">
                      {selectedMonth} {selectedYear}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#8c6b73]">
                    Real-time spending breakdown (Credit Card charges + Bank withdrawals + Paid bills)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBreakdownCat(null)}
                className="text-[#8c6b73] hover:text-[#7d3c4c] p-1.5 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* KPI Overview Chips */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[#fdf6f8] p-3 rounded-2xl border border-[#ebd0d9]">
                <span className="text-[10px] font-bold text-[#8c6b73] uppercase block">Budget</span>
                <span className="text-base font-extrabold font-mono text-[#1f242e]">
                  {formatCurrency(breakdownCat.budget)}
                </span>
              </div>
              <div className="bg-rose-50/70 p-3 rounded-2xl border border-rose-200">
                <span className="text-[10px] font-bold text-[#7d3c4c] uppercase block">Actual Spent</span>
                <span className="text-base font-extrabold font-mono text-[#7d3c4c]">
                  {formatCurrency(breakdownCat.actual)}
                </span>
              </div>
              <div className={`p-3 rounded-2xl border ${
                breakdownCat.difference < 0 ? 'bg-rose-100/50 border-rose-300' : 'bg-emerald-50 border-emerald-200'
              }`}>
                <span className="text-[10px] font-bold text-[#8c6b73] uppercase block">
                  {breakdownCat.difference < 0 ? 'Over Budget' : 'Remaining'}
                </span>
                <span className={`text-base font-extrabold font-mono ${
                  breakdownCat.difference < 0 ? 'text-[#e11d48]' : 'text-[#059669]'
                }`}>
                  {breakdownCat.difference >= 0 ? '+' : ''}{formatCurrency(breakdownCat.difference)}
                </span>
              </div>
            </div>

            {/* Transactions & Bills List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#7d3c4c]">
                <span>Contributing Items ({breakdownItems.length})</span>
                <span className="text-[10px] text-[#8c6b73] font-medium">Sorted newest first</span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {breakdownItems.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[#8c6b73] bg-[#fdf6f8] rounded-2xl border border-[#ebd0d9]">
                    <span className="flex items-center justify-center gap-1.5"><SakuraIcon className="w-3.5 h-3.5 shrink-0" /> No expenses or charges logged for {breakdownCat.name} in {selectedMonth} {selectedYear}.</span>
                  </div>
                ) : (
                  breakdownItems.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-[#fdf6f8] hover:bg-[#faedf1] rounded-2xl border border-[#ebd0d9] text-xs transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-[#1f242e] flex items-center gap-1.5 flex-wrap">
                          <span>{item.description}</span>
                          {item.isCreditCard && (
                            <span 
                              className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200"
                              title="Individual credit card charge (strictly bypassed checking)"
                            >
                              💳 Card Charge
                            </span>
                          )}
                          {item.kind === 'Bill' && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              📅 Paid Bill
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#8c6b73] flex items-center gap-2">
                          <span className="font-mono">{item.date}</span>
                          <span>•</span>
                          <span>{item.source}</span>
                        </div>
                      </div>

                      <div className="text-right font-mono font-extrabold text-sm text-[#1f242e]">
                        {formatCurrency(item.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Kawaii Real-Time Note */}
            <div className="bg-[#f0fdf4] border border-emerald-200 rounded-2xl p-2.5 flex items-center gap-2 text-emerald-800 text-[11px] font-medium">
              <SakuraIcon className="w-4 h-4 shrink-0" />
              <span>
                <strong>Real-Time Credit Card Sync:</strong> Credit card charges directly increase your actual budget spend without altering your spendable checking cash!
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setBreakdownCat(null)}
                className="px-5 py-2 bg-[#7d3c4c] text-white font-bold rounded-xl hover:bg-[#6a313f] shadow-md shadow-rose-900/15 cursor-pointer text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
