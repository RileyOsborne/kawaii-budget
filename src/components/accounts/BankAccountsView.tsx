import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Pencil, 
  Upload, 
  Download, 
  GripVertical, 
  Check, 
  X, 
  Sparkles,
  ArrowUpDown,
  Calendar,
  RotateCcw,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { KawaiiBadge } from '../common/KawaiiBadge';
import { MonthYearFilter, MONTH_NAMES, MONTH_CODE_TO_NUM } from '../common/MonthYearFilter';
import { api } from '../../api/client';
import { Transaction } from '../../types';
import { EditTransactionModal } from '../transactions/EditTransactionModal';
import { SakuraIcon } from '../common/SakuraIcon';

export const BankAccountsView: React.FC = () => {
  const { 
    accounts, 
    transactions, 
    selectedAccountId, 
    setSelectedAccountId, 
    selectedMonth, 
    selectedYear, 
    refreshData, 
    showToast, 
    triggerConfetti, 
    setIsQuickAddOpen 
  } = useBudget();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('ALL');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // Drag and Drop Ledger Reordering State
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | null>(null);
  const [localTxList, setLocalTxList] = useState<Transaction[]>([]);

  // CSV Importer State
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvRows, setCsvRows] = useState<Array<{
    id: string;
    date: string;
    description: string;
    category: string;
    type: 'Expense' | 'Income' | 'Track Only';
    amount: number;
    selected: boolean;
  }>>([]);
  const [csvTargetAccountId, setCsvTargetAccountId] = useState('acc_checking');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bankAccounts = useMemo(() => {
    return accounts.filter(a => a.type === 'checking' || a.type === 'savings' || a.type === 'cash');
  }, [accounts]);

  const currentAccId = (selectedAccountId && bankAccounts.some(a => a.id === selectedAccountId)) 
    ? selectedAccountId 
    : (bankAccounts[0]?.id || 'acc_checking');
  
  const currentAccount = bankAccounts.find(a => a.id === currentAccId) || bankAccounts[0];

  // Base list of transactions for the current account
  const accountTransactions = useMemo(() => {
    return transactions.filter(t => t.account_id === currentAccId);
  }, [transactions, currentAccId]);

  // Keep local list in sync with transactions
  useEffect(() => {
    setLocalTxList(accountTransactions);
  }, [accountTransactions]);

  // Filtered transactions for display
  const displayedTransactions = useMemo(() => {
    return localTxList.filter(t => {
      // Type filter
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;

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
  }, [localTxList, typeFilter, selectedPeriod, searchQuery]);

  // Financial summary for the currently displayed / filtered period
  const periodSummary = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;

    for (const t of displayedTransactions) {
      if (t.type === 'Income') {
        totalInflow += (t.amount || 0);
      } else if (t.type === 'Expense') {
        totalOutflow += (t.amount || 0);
      } else if (t.type === 'Transfer') {
        const isDep = (t.notes || '').includes('[Transfer: In') || 
                      (t.notes || '').includes('[Transfer In') || 
                      (t.description || '').toLowerCase().includes('(from ') || 
                      (t.description || '').toLowerCase().startsWith('transfer from');
        if (isDep) {
          totalInflow += (t.amount || 0);
        } else {
          totalOutflow += (t.amount || 0);
        }
      }
    }

    const netChange = totalInflow - totalOutflow;

    let periodLabel = 'All Time';
    if (selectedPeriod.length === 7) {
      const [yStr, mStr] = selectedPeriod.split('-');
      periodLabel = `${MONTH_NAMES[mStr] || mStr} ${yStr}`;
    }

    return {
      totalInflow,
      totalOutflow,
      netChange,
      count: displayedTransactions.length,
      periodLabel,
    };
  }, [displayedTransactions, selectedPeriod]);

  const handleDeleteTx = async (id: string) => {
    if (confirm('Delete this transaction?')) {
      await api.deleteTransaction(id);
      await refreshData();
      showToast('Transaction deleted');
    }
  };

  // Helper to format today's date string
  const getTodayStr = () => {
    const today = new Date();
    const monthMap: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
      'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    const mNum = monthMap[selectedMonth] || String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${selectedYear}-${mNum}-${day}`;
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
    
    // Calculate new insertion index based on top/bottom
    let insertIdx = updated.findIndex(t => t.id === targetId);
    if (dragOverPosition === 'bottom') {
      insertIdx += 1;
    }
    updated.splice(insertIdx, 0, movedItem);

    // Optimistically update local UI immediately
    setLocalTxList(updated);
    setDraggedRowId(null);
    setDragOverRowId(null);
    setDragOverPosition(null);

    // Persist new order on backend
    try {
      const newOrderIds = updated.map(t => t.id);
      await api.reorderTransactions(currentAccId, newOrderIds);
      await refreshData();
      showToast('Ledger order updated! 🌸');
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

  // --- CSV Statement File Parsing ---
  const parseCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) {
        showToast('CSV file is empty or missing data');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const dateIdx = headers.findIndex(h => h.includes('date'));
      const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('payee') || h.includes('memo') || h.includes('name'));
      const catIdx = headers.findIndex(h => h.includes('cat'));
      const typeIdx = headers.findIndex(h => h.includes('type'));
      const amtIdx = headers.findIndex(h => h.includes('amount') || h.includes('amt') || h.includes('value'));
      const debitIdx = headers.findIndex(h => h.includes('debit'));
      const creditIdx = headers.findIndex(h => h.includes('credit'));

      const parsed: Array<{
        id: string;
        date: string;
        description: string;
        category: string;
        type: 'Expense' | 'Income' | 'Track Only';
        amount: number;
        selected: boolean;
      }> = [];

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(col => col.trim().replace(/^"|"$/g, ''));
        if (row.length === 0 || !row[0]) continue;

        let rawDate = dateIdx >= 0 ? row[dateIdx] : getTodayStr();
        if (!rawDate || rawDate.length < 4) rawDate = getTodayStr();

        if (rawDate.includes('/')) {
          const parts = rawDate.split('/');
          if (parts.length === 3) {
            const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            const m = parts[0].padStart(2, '0');
            const d = parts[1].padStart(2, '0');
            rawDate = `${y}-${m}-${d}`;
          }
        }

        const description = descIdx >= 0 ? row[descIdx] : `Transaction #${i}`;
        const category = catIdx >= 0 && row[catIdx] ? row[catIdx] : 'General';
        
        let type: 'Expense' | 'Income' | 'Track Only' = 'Expense';
        let amount = 0;

        if (amtIdx >= 0) {
          const rawVal = parseFloat(row[amtIdx].replace(/[^0-9.-]/g, '')) || 0;
          if (rawVal < 0) {
            type = 'Expense';
            amount = Math.abs(rawVal);
          } else {
            type = (typeIdx >= 0 && row[typeIdx].toLowerCase().includes('inc')) ? 'Income' : 'Expense';
            amount = Math.abs(rawVal);
          }
        } else if (debitIdx >= 0 && row[debitIdx]) {
          type = 'Expense';
          amount = Math.abs(parseFloat(row[debitIdx].replace(/[^0-9.-]/g, '')) || 0);
        } else if (creditIdx >= 0 && row[creditIdx]) {
          type = 'Income';
          amount = Math.abs(parseFloat(row[creditIdx].replace(/[^0-9.-]/g, '')) || 0);
        }

        if (amount > 0) {
          parsed.push({
            id: `csv_${i}_${Date.now()}`,
            date: rawDate,
            description,
            category,
            type,
            amount,
            selected: true,
          });
        }
      }

      if (parsed.length === 0) {
        showToast('No valid transactions found in CSV');
        return;
      }

      setCsvRows(parsed);
      setShowCsvModal(true);
      showToast(`Parsed ${parsed.length} transactions from CSV! 🌸`);
    };

    reader.readAsText(file);
  };

  const handleCommitCsvImport = async () => {
    const toImport = csvRows.filter(r => r.selected);
    if (toImport.length === 0) {
      showToast('No transactions selected for import');
      return;
    }

    setIsImporting(true);
    try {
      const payload = toImport.map(r => ({
        account_id: csvTargetAccountId,
        date: r.date,
        description: r.description,
        category: r.category,
        type: r.type,
        amount: r.amount,
        notes: '[CSV Statement Import 🌸]'
      }));

      await api.createTransactionsBulk(payload);
      setShowCsvModal(false);
      setCsvRows([]);
      triggerConfetti();
      await refreshData();
      showToast(`Successfully recorded ${toImport.length} transactions! 🌸`);
    } catch (err) {
      showToast('Error recording CSV transactions');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const sample = `Date,Description,Category,Type,Amount\n2026-08-25,Trader Joe's Groceries,Groceries,Expense,84.50\n2026-08-25,Shell Gas Station,Gas,Expense,42.00\n2026-08-25,Payroll Direct Deposit,Paycheck,Income,2500.00\n2026-08-25,Electric Bill,Utilities,Expense,115.20`;
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_kawaii_budget_transactions.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
            <span>🏦</span> Bank &amp; Cash Accounts
          </h2>
          <p className="text-xs text-[#64748b] font-medium mt-1">
            Checking buffer, savings funds, and petty cash ledgers
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* CSV Statement Import Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 bg-white hover:bg-[#fdf6f8] text-[#7d3c4c] border border-[#ebd0d9] px-3.5 py-2.5 rounded-2xl text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
            title="Import bank statement CSV file"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Drop / Import CSV</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                setCsvTargetAccountId(currentAccId);
                parseCsvFile(e.target.files[0]);
              }
            }}
            accept=".csv,text/csv"
            className="hidden"
          />

          {/* New Entry Button */}
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-2 bg-[#7d3c4c] hover:bg-[#6a313f] text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-rose-900/15 active:scale-95 transition-all self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Entry</span>
          </button>
        </div>
      </div>

      {/* Account Picker Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {bankAccounts.map((acc) => {
          const isSelected = acc.id === currentAccId;
          const isCheck = acc.id === 'acc_checking';
          const spendable = isCheck ? Math.max(0, acc.balance - (acc.buffer || 500)) : acc.balance;

          return (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className={`p-5 rounded-3xl text-left transition-all border shadow-kawaii hover:shadow-kawaii-lg flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? 'bg-gradient-to-br from-white to-[#fdf6f8] border-[#7d3c4c] ring-2 ring-[#7d3c4c]/20'
                  : 'bg-white border-[#e4e0e2] hover:border-[#d1cbce]'
              }`}
            >
              <div className="flex justify-between items-center w-full">
                <span className="text-2xl">{acc.icon}</span>
                <KawaiiBadge variant={isSelected ? 'mauve' : 'pink'}>{acc.type}</KawaiiBadge>
              </div>

              <div className="mt-3">
                <h4 className="text-sm font-bold text-[#1f242e] font-cute">{acc.name}</h4>
                <div className="text-xl font-extrabold text-[#7d3c4c] font-mono mt-1">
                  {formatCurrency(acc.balance)}
                </div>
                {isCheck ? (
                  <p className="text-[11px] text-[#934b5c] font-semibold mt-0.5">
                    {formatCurrency(spendable)} spendable (+${acc.buffer || 500} buffer)
                  </p>
                ) : (
                  <p className="text-[11px] text-[#64748b] font-medium mt-0.5">
                    Starting: {formatCurrency(acc.starting_balance)}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-[#e4e0e2] shadow-kawaii space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#7d3c4c] absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder={`Search ${currentAccount?.name} transactions (payee, category, notes)...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#fdf6f8]/60 focus:bg-white border border-[#e4e0e2] rounded-2xl text-xs outline-none focus:border-[#7d3c4c] text-[#1f242e] font-medium shadow-2xs transition-colors"
            />
          </div>

          {/* Month/Year and Type Filter Controls */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
            <MonthYearFilter
              selectedPeriod={selectedPeriod}
              onChangePeriod={setSelectedPeriod}
              availableDates={transactions.map(t => t.date)}
              currentBudgetMonth={selectedMonth}
              currentBudgetYear={selectedYear}
              showQuickChips={true}
            />

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3.5 py-2 bg-[#fdf6f8] border border-[#ebd0d9] rounded-2xl text-xs font-bold text-[#7d3c4c] outline-none shadow-2xs cursor-pointer"
            >
              <option value="ALL">All Types</option>
              <option value="Income">Income / Deposits</option>
              <option value="Expense">Expenses</option>
              <option value="Transfer">Transfers</option>
              <option value="Track Only">Track Only</option>
            </select>
          </div>
        </div>

        {/* Financial Period Summary Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#fdf6f8] px-4 py-2.5 rounded-2xl border border-[#ebd0d9] text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#7d3c4c] flex items-center gap-1.5 font-cute">
              <span>📅</span> {periodSummary.periodLabel}
            </span>
            <span className="text-[11px] text-[#64748b] bg-white px-2 py-0.5 rounded-lg border border-[#ebd0d9] font-medium">
              {periodSummary.count} {periodSummary.count === 1 ? 'entry' : 'entries'}
            </span>
            {selectedPeriod !== 'ALL' && (
              <span className="text-[10px] text-[#934b5c] font-semibold hidden md:inline">
                (Filtered by Month &amp; Year)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-4 flex-wrap font-mono text-[11px] sm:text-xs">
            <div className="flex items-center gap-1">
              <span className="text-[#059669] font-bold">Inflow:</span>
              <span className="font-extrabold text-[#059669]">+{formatCurrency(periodSummary.totalInflow)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[#e11d48] font-bold">Outflow:</span>
              <span className="font-extrabold text-[#e11d48]">-{formatCurrency(periodSummary.totalOutflow)}</span>
            </div>
            <div className="flex items-center gap-1 bg-white px-2.5 py-0.5 rounded-xl border border-[#ebd0d9] shadow-2xs">
              <span className="text-[#64748b] font-bold">Net:</span>
              <span className={`font-extrabold ${periodSummary.netChange >= 0 ? 'text-[#059669]' : 'text-[#e11d48]'}`}>
                {periodSummary.netChange >= 0 ? `+${formatCurrency(periodSummary.netChange)}` : `-${formatCurrency(Math.abs(periodSummary.netChange))}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Ledger Table with Drag-and-Drop Reordering */}
      <div className="bg-white rounded-3xl shadow-kawaii border border-[#e4e0e2] overflow-hidden">
        <div className="bg-[#fdf6f8] px-6 py-4 border-b border-[#e4e0e2] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute flex items-center gap-2">
              <span>{currentAccount?.icon}</span> {currentAccount?.name} Transaction Ledger
            </h3>
            {selectedPeriod !== 'ALL' && (
              <span className="bg-[#fff0f4] text-[#7d3c4c] border border-[#f8ccd6] text-[10px] font-bold px-2 py-0.5 rounded-md">
                {periodSummary.periodLabel}
              </span>
            )}
          </div>
          <span className="text-xs font-mono font-bold text-[#7d3c4c] bg-white px-3.5 py-1 rounded-xl border border-[#ebd0d9] shadow-2xs">
            Balance: {formatCurrency(currentAccount?.balance)}
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
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-6 text-right">Running Balance</th>
                <th className="py-3.5 px-4 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedTransactions.map((t, idx) => {
                const isIncome = t.type === 'Income';
                const isTrackOnly = t.type === 'Track Only';
                const isTransfer = t.type === 'Transfer';
                const isDeposit = isIncome || (isTransfer && (
                  (t.notes || '').includes('[Transfer: In') || 
                  (t.notes || '').includes('[Transfer In') || 
                  (t.description || '').toLowerCase().includes('(from ') || 
                  (t.description || '').toLowerCase().startsWith('transfer from')
                ));
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
                    {/* Drag Handle */}
                    <td className="py-3.5 px-3 text-center cursor-grab active:cursor-grabbing text-[#cfabb8] hover:text-[#7d3c4c]">
                      <div className="flex items-center justify-center p-1 rounded-lg hover:bg-[#ebd0d9]/40 transition-colors">
                        <GripVertical className="w-4 h-4" />
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[#52212e]">
                      {formatDate(t.date)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-[#1f242e]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{t.description}</span>
                        {isTransfer && t.linked_transaction_id && (
                          <span 
                            className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200 flex items-center gap-1"
                            title="Zero-Sum Linked Transfer"
                          >
                            🔄 Linked
                          </span>
                        )}
                        {!isTransfer && (t.linked_transaction_id || (t.notes && t.notes.includes('[CC Payment Sync:'))) && (
                          <span 
                            className="text-[10px] font-bold text-[#7d3c4c] bg-[#fdf2f4] px-1.5 py-0.5 rounded-md border border-[#f8ccd6] flex items-center gap-1"
                            title="Automatically synced from Credit Card payment"
                          >
                            💳 CC Sync
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <KawaiiBadge variant="mauve" size="sm">{t.category}</KawaiiBadge>
                    </td>
                    <td className="py-3.5 px-4">
                      {isTransfer ? (
                        <KawaiiBadge variant={isDeposit ? 'green' : 'purple'} size="sm">
                          {isDeposit ? '🔄 Transfer In' : '🔄 Transfer Out'}
                        </KawaiiBadge>
                      ) : (
                        <KawaiiBadge variant={isIncome ? 'green' : (isTrackOnly ? 'purple' : 'pink')} size="sm">
                          {t.type}
                        </KawaiiBadge>
                      )}
                    </td>
                    <td className={`py-3.5 px-4 text-right font-mono font-bold ${
                      isDeposit ? 'text-[#059669]' : 'text-[#1f242e]'
                    }`}>
                      {isDeposit ? `+${formatCurrency(t.amount)}` : `-${formatCurrency(t.amount)}`}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-extrabold text-[#7d3c4c]">
                      {formatCurrency(t.running_balance)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditingTx(t)}
                          className="p-1 text-[#cfabb8] hover:text-[#7d3c4c] rounded-lg transition-colors cursor-pointer"
                          title="Edit transaction"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTx(t.id)}
                          className="p-1 text-[#cfabb8] hover:text-[#e11d48] rounded-lg transition-colors cursor-pointer"
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
                  <td colSpan={8} className="py-12 text-center text-[#64748b]">
                    <SakuraIcon className="w-10 h-10 mx-auto mb-2 opacity-80" />
                    <p className="font-bold text-sm text-[#7d3c4c]">
                      {selectedPeriod !== 'ALL' || searchQuery || typeFilter !== 'ALL'
                        ? `No transactions match your current filters for ${periodSummary.periodLabel}`
                        : 'No transactions recorded yet in this account'}
                    </p>
                    <p className="text-xs text-[#64748b] mt-1 max-w-sm mx-auto">
                      {selectedPeriod !== 'ALL' || searchQuery || typeFilter !== 'ALL'
                        ? 'Try switching to "All Dates" or clearing search/type filters.'
                        : 'Click "+ New Entry" or import a CSV statement to get started!'}
                    </p>
                    {(selectedPeriod !== 'ALL' || searchQuery || typeFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPeriod('ALL');
                          setSearchQuery('');
                          setTypeFilter('ALL');
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

      {/* CSV Preview and Batch Record Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6">
          <div className="bg-white rounded-3xl max-w-3xl w-full border border-[#e4e0e2] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95">
            <div className="bg-[#fdf6f8] px-6 py-4 border-b border-[#e4e0e2] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📄</span>
                <div>
                  <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">
                    Import Statement Transactions
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Review parsed CSV rows before recording into your ledger
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowCsvModal(false)}
                className="text-[#64748b] hover:text-[#1f242e] p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f8f7f6] p-3.5 rounded-2xl border border-[#e4e0e2]">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-[#1f242e]">Record into Account:</label>
                  <select
                    value={csvTargetAccountId}
                    onChange={e => setCsvTargetAccountId(e.target.value)}
                    className="bg-white border border-[#e4e0e2] px-3 py-1.5 rounded-xl text-xs font-bold text-[#7d3c4c] outline-none cursor-pointer"
                  >
                    {bankAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const allSelected = csvRows.every(r => r.selected);
                      setCsvRows(csvRows.map(r => ({ ...r, selected: !allSelected })));
                    }}
                    className="text-xs text-[#7d3c4c] font-bold hover:underline cursor-pointer"
                  >
                    {csvRows.every(r => r.selected) ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-xs text-[#64748b]">
                    ({csvRows.filter(r => r.selected).length} of {csvRows.length} selected)
                  </span>
                </div>
              </div>

              {/* Rows Table */}
              <div className="border border-[#e4e0e2] rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#fdf6f8] text-[#7d3c4c] font-bold border-b border-[#e4e0e2]">
                    <tr>
                      <th className="py-2.5 px-3 w-8 text-center">✓</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1eded]">
                    {csvRows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`hover:bg-[#faedf1]/50 ${!row.selected ? 'opacity-40 bg-gray-50' : ''}`}
                      >
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={e => {
                              const updated = [...csvRows];
                              updated[idx].selected = e.target.checked;
                              setCsvRows(updated);
                            }}
                            className="accent-[#7d3c4c] cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-mono">{row.date}</td>
                        <td className="py-2.5 px-3 font-bold text-[#1f242e]">{row.description}</td>
                        <td className="py-2.5 px-3">
                          <span className="bg-[#fdf6f8] text-[#7d3c4c] px-2 py-0.5 rounded-md border border-[#ebd0d9] font-medium">
                            {row.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold">
                          <span className={row.type === 'Income' ? 'text-emerald-600' : 'text-rose-600'}>
                            {row.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1f242e]">
                          {formatCurrency(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-[#f8f7f6] px-6 py-4 border-t border-[#e4e0e2] flex items-center justify-between">
              <button
                onClick={handleDownloadSampleCsv}
                className="text-xs text-[#64748b] hover:text-[#7d3c4c] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Sample CSV Template</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCsvModal(false)}
                  className="px-4 py-2 text-xs text-[#64748b] font-bold rounded-xl hover:bg-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommitCsvImport}
                  disabled={isImporting || csvRows.filter(r => r.selected).length === 0}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#7d3c4c] hover:bg-[#6a313f] text-white font-bold rounded-xl text-xs shadow-md shadow-rose-900/15 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {isImporting ? 'Recording...' : `Record ${csvRows.filter(r => r.selected).length} Transactions`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        transaction={editingTx}
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
      />
    </div>
  );
};
