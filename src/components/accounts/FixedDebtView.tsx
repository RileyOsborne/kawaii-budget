import React, { useState, useMemo, useEffect } from 'react';
import { Car, Plus, Search, Trash2, Pencil, GripVertical, Check, X, RotateCcw, Calendar, Sparkles } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, formatDate, getOrdinalSuffix, formatPercent, formatApr } from '../../utils/formatters';
import { KawaiiBadge } from '../common/KawaiiBadge';
import { ProgressBar } from '../common/ProgressBar';
import { MonthYearFilter, MONTH_NAMES } from '../common/MonthYearFilter';
import { api } from '../../api/client';
import { Transaction } from '../../types';
import { EditTransactionModal } from '../transactions/EditTransactionModal';

export const FixedDebtView: React.FC = () => {
  const { accounts, transactions, selectedAccountId, setSelectedAccountId, selectedMonth, selectedYear, refreshData, showToast, setIsQuickAddOpen, triggerConfetti } = useBudget();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('ALL');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // Edit Loan Modal State
  const [showEditLoanModal, setShowEditLoanModal] = useState(false);
  const [loanEditForm, setLoanEditForm] = useState({
    name: '',
    min_payment: '',
    apr: '',
    due_day: '',
    starting_balance: '',
  });

  // Drag and Drop Ledger Reordering State
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | null>(null);
  const [localTxList, setLocalTxList] = useState<Transaction[]>([]);

  const fixedLoans = accounts.filter(a => a.category === 'auto_loan' || a.category === 'personal_loan');
  const currentAccId = (selectedAccountId && fixedLoans.some(a => a.id === selectedAccountId)) 
    ? selectedAccountId 
    : (fixedLoans[0]?.id || 'debt_subaru');
  
  const currentAccount = fixedLoans.find(a => a.id === currentAccId) || fixedLoans[0];

  const openEditLoanModal = () => {
    if (!currentAccount) return;
    setLoanEditForm({
      name: currentAccount.name,
      min_payment: String(currentAccount.min_payment || 0),
      apr: String(currentAccount.apr || 0),
      due_day: String(currentAccount.due_day || 1),
      starting_balance: String(currentAccount.starting_balance || 0),
    });
    setShowEditLoanModal(true);
  };

  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccount) return;

    try {
      await api.updateAccount(currentAccount.id, {
        name: loanEditForm.name.trim(),
        min_payment: parseFloat(loanEditForm.min_payment) || 0,
        apr: parseFloat(loanEditForm.apr) || 0,
        due_day: parseInt(loanEditForm.due_day, 10) || 1,
        starting_balance: parseFloat(loanEditForm.starting_balance) || 0,
      });

      setShowEditLoanModal(false);
      await refreshData();
      triggerConfetti();
      showToast(`${loanEditForm.name} updated & synced to Monthly Bills! 🌸`);
    } catch {
      showToast('Error updating loan details');
    }
  };

  const accountTransactions = useMemo(() => {
    return transactions.filter(t => t.account_id === currentAccId);
  }, [transactions, currentAccId]);

  useEffect(() => {
    setLocalTxList(accountTransactions);
  }, [accountTransactions]);

  const displayedTransactions = useMemo(() => {
    return localTxList.filter(t => {
      // Month/Year filter
      if (selectedPeriod !== 'ALL') {
        const cleanDate = (t.date || '').replace(/\//g, '-');
        if (!cleanDate.startsWith(selectedPeriod)) return false;
      }

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const descMatch = t.description?.toLowerCase().includes(q);
        const catMatch = t.category?.toLowerCase().includes(q);
        const notesMatch = t.notes?.toLowerCase().includes(q);
        const amtMatch = t.amount?.toString().includes(q);
        if (!descMatch && !catMatch && !notesMatch && !amtMatch) return false;
      }
      return true;
    });
  }, [localTxList, selectedPeriod, searchQuery]);

  // Financial summary for the currently displayed / filtered period
  const periodSummary = useMemo(() => {
    let totalPaid = 0;

    for (const t of displayedTransactions) {
      totalPaid += (t.amount || 0);
    }

    let periodLabel = 'All Time';
    if (selectedPeriod.length === 7) {
      const [yStr, mStr] = selectedPeriod.split('-');
      periodLabel = `${MONTH_NAMES[mStr] || mStr} ${yStr}`;
    }

    return {
      totalPaid,
      count: displayedTransactions.length,
      periodLabel,
    };
  }, [displayedTransactions, selectedPeriod]);

  const handleDeleteTx = async (id: string) => {
    if (confirm('Delete this transaction entry?')) {
      await api.deleteTransaction(id);
      await refreshData();
      showToast('Payment record deleted');
    }
  };

  // --- Drag and Drop Table Row Reordering ---
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

    const sourceIdx = localTxList.findIndex(t => t.id === draggedRowId);
    const targetIdx = localTxList.findIndex(t => t.id === targetId);

    if (sourceIdx < 0 || targetIdx < 0) {
      setDraggedRowId(null);
      setDragOverRowId(null);
      setDragOverPosition(null);
      return;
    }

    const updated = [...localTxList];
    const [movedItem] = updated.splice(sourceIdx, 1);
    
    let insertIdx = updated.findIndex(t => t.id === targetId);
    if (dragOverPosition === 'bottom') {
      insertIdx += 1;
    }
    updated.splice(insertIdx, 0, movedItem);

    setLocalTxList(updated);
    setDraggedRowId(null);
    setDragOverRowId(null);
    setDragOverPosition(null);

    try {
      const newOrderIds = updated.map(t => t.id);
      await api.reorderTransactions(currentAccId, newOrderIds);
      await refreshData();
      showToast('Loan payment ledger order updated! 🌸');
    } catch (err) {
      showToast('Error saving new transaction order');
      await refreshData();
    }
  };

  const handleRowDragEnd = () => {
    setDraggedRowId(null);
    setDragOverRowId(null);
    setDragOverPosition(null);
  };

  const paidDownThisLoan = (currentAccount?.starting_balance || 0) - (currentAccount?.balance || 0);
  const progressRatio = currentAccount?.starting_balance > 0 ? (paidDownThisLoan / currentAccount.starting_balance) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
            <span>🚗</span> Fixed Debt &amp; Installment Loans
          </h2>
          <p className="text-xs text-[#64748b] font-medium mt-1">
            {fixedLoans.length > 0
              ? `Dedicated pay-down trackers for ${fixedLoans.map(d => d.name).join(', ')}`
              : 'Dedicated pay-down trackers for installment loans & financing'}
          </p>
        </div>

        <button
          onClick={() => setIsQuickAddOpen(true)}
          className="flex items-center gap-2 bg-[#7d3c4c] hover:bg-[#6a313f] text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-rose-900/15 active:scale-95 transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Log Loan Payment</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {fixedLoans.map((loan) => {
          const isSelected = loan.id === currentAccId;
          const paidAmt = (loan.starting_balance || 0) - loan.balance;
          const ratio = loan.starting_balance > 0 ? (paidAmt / loan.starting_balance) : 0;

          return (
            <button
              key={loan.id}
              onClick={() => setSelectedAccountId(loan.id)}
              className={`p-5 rounded-3xl text-left transition-all border shadow-kawaii hover:shadow-kawaii-lg flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? 'bg-gradient-to-br from-white to-[#fdf6f8] border-[#7d3c4c] ring-2 ring-[#7d3c4c]/20'
                  : 'bg-white border-[#e4e0e2] hover:border-[#d1cbce]'
              }`}
            >
              <div className="flex justify-between items-center w-full">
                <span className="text-2xl">{loan.icon}</span>
                <KawaiiBadge variant={isSelected ? 'mauve' : 'pink'}>
                  Due {getOrdinalSuffix(loan.due_day)}
                </KawaiiBadge>
              </div>

              <div className="mt-3 w-full">
                <h4 className="text-sm font-bold text-[#1f242e] font-cute">{loan.name}</h4>
                <div className="text-xl font-extrabold text-[#7d3c4c] font-mono mt-1">
                  {formatCurrency(loan.balance)}
                </div>
                
                <div className="mt-2.5">
                  <ProgressBar value={ratio} color="#7d3c4c" height="h-2" />
                  <div className="flex justify-between text-[10px] text-[#64748b] font-semibold mt-1">
                    <span>Paid: {formatCurrency(paidAmt)}</span>
                    <span>{formatPercent(ratio)}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-3xl p-6 border border-[#e4e0e2] shadow-kawaii">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f1eded] pb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#fdf6f8] flex items-center justify-center text-3xl border border-[#ebd0d9] shrink-0">
              {currentAccount?.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-extrabold text-[#7d3c4c] font-cute">{currentAccount?.name}</h3>
                <KawaiiBadge variant="mauve">Due {getOrdinalSuffix(currentAccount?.due_day)}</KawaiiBadge>
                <button
                  onClick={openEditLoanModal}
                  className="p-1.5 text-[#cfabb8] hover:text-[#7d3c4c] hover:bg-[#fdf6f8] rounded-xl transition-colors cursor-pointer"
                  title="Edit loan interest rate, payment, or details"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-[#64748b] font-medium mt-0.5">
                Monthly Minimum: {formatCurrency(currentAccount?.min_payment)} • Interest Rate: {formatApr(currentAccount?.apr)} APR
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-[#64748b] font-bold block">Remaining Loan Balance</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-[#7d3c4c] font-mono">
              {formatCurrency(currentAccount?.balance)}
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex justify-between text-xs font-bold text-[#1f242e]">
            <span>Starting Loan: {formatCurrency(currentAccount?.starting_balance)}</span>
            <span className="text-[#059669]">Total Paid Down: {formatCurrency(paidDownThisLoan)}</span>
          </div>
          <ProgressBar value={progressRatio} color="#7d3c4c" height="h-3" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="bg-[#fdf6f8] p-3.5 rounded-2xl border border-[#ebd0d9] text-center">
            <span className="text-[11px] font-bold text-[#7d3c4c] uppercase block">Monthly Payment</span>
            <span className="font-mono text-sm font-bold text-[#7d3c4c] mt-1 block">
              {formatCurrency(currentAccount?.min_payment)}/mo
            </span>
          </div>
          <div className="bg-[#fdf6f8] p-3.5 rounded-2xl border border-[#ebd0d9] text-center">
            <span className="text-[11px] font-bold text-[#7d3c4c] uppercase block">Starting Loan Balance</span>
            <span className="font-mono text-sm font-bold text-[#7d3c4c] mt-1 block">
              {formatCurrency(currentAccount?.starting_balance)}
            </span>
          </div>
          <div className="bg-[#fdf6f8] p-3.5 rounded-2xl border border-[#ebd0d9] text-center">
            <span className="text-[11px] font-bold text-[#7d3c4c] uppercase block">Paydown Progress</span>
            <span className="font-mono text-sm font-bold text-[#7d3c4c] mt-1 block">
              {formatPercent(progressRatio)}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-[#e4e0e2] shadow-kawaii space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#7d3c4c] absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder={`Search ${currentAccount?.name} payment entries...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#fdf6f8]/60 focus:bg-white border border-[#e4e0e2] rounded-2xl text-xs outline-none focus:border-[#7d3c4c] text-[#1f242e] font-medium shadow-2xs transition-colors"
            />
          </div>

          {/* Month/Year Filter Controls */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
            <MonthYearFilter
              selectedPeriod={selectedPeriod}
              onChangePeriod={setSelectedPeriod}
              availableDates={transactions.map(t => t.date)}
              currentBudgetMonth={selectedMonth}
              currentBudgetYear={selectedYear}
              showQuickChips={true}
            />
          </div>
        </div>

        {/* Financial Period Summary Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#fdf6f8] px-4 py-2.5 rounded-2xl border border-[#ebd0d9] text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#7d3c4c] flex items-center gap-1.5 font-cute">
              <span>📅</span> {periodSummary.periodLabel}
            </span>
            <span className="text-[11px] text-[#64748b] bg-white px-2 py-0.5 rounded-lg border border-[#ebd0d9] font-medium">
              {periodSummary.count} {periodSummary.count === 1 ? 'payment' : 'payments'}
            </span>
            {selectedPeriod !== 'ALL' && (
              <span className="text-[10px] text-[#934b5c] font-semibold hidden md:inline">
                (Filtered by Month &amp; Year)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-4 flex-wrap font-mono text-[11px] sm:text-xs">
            <div className="flex items-center gap-1 bg-white px-2.5 py-0.5 rounded-xl border border-[#ebd0d9] shadow-2xs">
              <span className="text-[#64748b] font-bold">Total Paid:</span>
              <span className="font-extrabold text-[#059669]">+{formatCurrency(periodSummary.totalPaid)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-kawaii border border-[#e4e0e2] overflow-hidden">
        <div className="bg-[#fdf6f8] px-6 py-4 border-b border-[#e4e0e2] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
              <span>{currentAccount?.icon}</span> {currentAccount?.name} Payment Ledger
            </h3>
            {selectedPeriod !== 'ALL' && (
              <span className="bg-[#fff0f4] text-[#7d3c4c] border border-[#f8ccd6] text-[10px] font-bold px-2 py-0.5 rounded-md">
                {periodSummary.periodLabel}
              </span>
            )}
          </div>
          <span className="text-xs font-mono font-bold text-[#7d3c4c] bg-white px-3.5 py-1 rounded-xl border border-[#ebd0d9] shadow-2xs">
            Remaining: {formatCurrency(currentAccount?.balance)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm font-medium">
            <thead>
              <tr className="bg-gradient-to-r from-[#7d3c4c] to-[#934b5c] text-white text-xs font-bold">
                <th className="py-3.5 px-3 w-10 text-center">
                  <span title="Drag handle to reorder rows">⠿</span>
                </th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Description</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4 text-right">Payment Amount</th>
                <th className="py-3.5 px-6 text-right">Remaining Balance</th>
                <th className="py-3.5 px-4 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedTransactions.map((t, idx) => {
                const isBeingDragged = draggedRowId === t.id;
                const isDragOverTarget = dragOverRowId === t.id;

                return (
                  <tr
                    key={t.id}
                    draggable
                    onDragStart={(e) => handleRowDragStart(e, t.id)}
                    onDragOver={(e) => handleRowDragOver(e, t.id)}
                    onDragLeave={handleRowDragLeave}
                    onDrop={(e) => handleRowDrop(e, t.id)}
                    onDragEnd={handleRowDragEnd}
                    className={`transition-colors border-b border-[#f1eded] select-none ${
                      isBeingDragged 
                        ? 'opacity-30 bg-[#fdf6f8]' 
                        : isDragOverTarget
                          ? dragOverPosition === 'top'
                            ? 'border-t-3 border-t-[#7d3c4c] bg-[#fff0f4]'
                            : 'border-b-3 border-b-[#7d3c4c] bg-[#fff0f4]'
                          : idx % 2 === 1 
                            ? 'bg-[#fdf6f8] hover:bg-[#faedf1]' 
                            : 'bg-white hover:bg-[#faedf1]'
                    }`}
                  >
                    <td className="py-3.5 px-3 text-center cursor-grab active:cursor-grabbing text-[#cfabb8] hover:text-[#7d3c4c]">
                      <div className="flex items-center justify-center p-1 rounded-lg hover:bg-[#ebd0d9]/40 transition-colors">
                        <GripVertical className="w-4 h-4" />
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[#52212e]">
                      {formatDate(t.date)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-[#1f242e]">
                      {t.description}
                    </td>
                    <td className="py-3.5 px-4">
                      <KawaiiBadge variant="mauve" size="sm">{t.category}</KawaiiBadge>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-[#059669]">
                      -{formatCurrency(t.amount)}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-extrabold text-[#7d3c4c]">
                      {formatCurrency(t.running_balance)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditingTx(t)}
                          className="p-1 text-[#debac6] hover:text-[#7d3c4c] rounded-lg transition-colors cursor-pointer"
                          title="Edit payment entry"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTx(t.id)}
                          className="p-1 text-[#debac6] hover:text-[#e11d48] rounded-lg transition-colors cursor-pointer"
                          title="Delete transaction"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayedTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#64748b]">
                    <span className="text-3xl block mb-2">🌸</span>
                    <p className="font-bold text-sm text-[#7d3c4c]">
                      {selectedPeriod !== 'ALL' || searchQuery
                        ? `No payment entries match your filters for ${periodSummary.periodLabel}`
                        : 'No payment history recorded yet for this loan'}
                    </p>
                    <p className="text-xs text-[#64748b] mt-1 max-w-sm mx-auto">
                      {selectedPeriod !== 'ALL' || searchQuery
                        ? 'Try switching to "All Dates" or clearing your search term.'
                        : 'Click "+ New Entry" above to record a loan payment.'}
                    </p>
                    {(selectedPeriod !== 'ALL' || searchQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPeriod('ALL');
                          setSearchQuery('');
                        }}
                        className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#fdf6f8] hover:bg-[#fff0f4] text-[#7d3c4c] border border-[#ebd0d9] rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset All Filters</span>
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        transaction={editingTx}
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
      />

      {/* Edit Loan Details Modal */}
      {showEditLoanModal && currentAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-[#e4e0e2] shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#e4e0e2]">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-white border border-[#ebd0d9] flex items-center justify-center text-sm shadow-2xs">
                  {currentAccount.icon}
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">
                    Edit {currentAccount.name}
                  </h3>
                  <p className="text-[11px] text-[#64748b]">Update APR, minimum payment, or due date</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditLoanModal(false)}
                className="text-[#64748b] hover:text-[#1f242e] p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLoan} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Loan Name</label>
                <input
                  type="text"
                  required
                  value={loanEditForm.name}
                  onChange={e => setLoanEditForm({ ...loanEditForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl text-[#1f242e] outline-none font-semibold focus:border-[#7d3c4c] shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Interest Rate (% APR)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 18.3"
                    value={loanEditForm.apr}
                    onChange={e => setLoanEditForm({ ...loanEditForm, apr: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#fdf6f8]/50 border-2 border-[#ebd0d9] rounded-xl font-mono text-sm font-extrabold text-[#7d3c4c] outline-none focus:border-[#7d3c4c] focus:bg-white shadow-inner"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-[#1f242e]">Monthly Payment ($)</label>
                    <span className="text-[10px] text-purple-600 font-semibold">✨ Syncs to Bills</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={loanEditForm.min_payment}
                    onChange={e => setLoanEditForm({ ...loanEditForm, min_payment: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl font-mono text-xs font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Due Day of Month</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={loanEditForm.due_day}
                    onChange={e => setLoanEditForm({ ...loanEditForm, due_day: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl font-mono text-xs font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Starting Balance ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={loanEditForm.starting_balance}
                    onChange={e => setLoanEditForm({ ...loanEditForm, starting_balance: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#e4e0e2] rounded-xl font-mono text-xs font-semibold text-[#1f242e] outline-none focus:border-[#7d3c4c] shadow-2xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#f1eded]">
                <button
                  type="button"
                  onClick={() => setShowEditLoanModal(false)}
                  className="px-4 py-2 text-[#64748b] font-bold rounded-xl hover:bg-[#f8f7f6] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-[#7d3c4c] text-white font-bold rounded-xl hover:bg-[#6a313f] shadow-md shadow-rose-900/15 cursor-pointer active:scale-95 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Loan Details</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
