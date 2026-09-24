import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  PiggyBank, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  History, 
  ChevronDown, 
  ChevronUp
} from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, formatPercent, formatDate } from '../../utils/formatters';

export const ProjectionsView: React.FC = () => {
  const { 
    stats, 
    accounts,
    transactions,
    categories, 
    selectedMonth, 
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    nextMonth,
    prevMonth,
  } = useBudget();
  
  // Find savings category budget for active month (for quick reference / default)
  const savingsCategory = categories.find(c => c.id === 'cat_sav' || c.name.toLowerCase() === 'savings');
  const activeSavingsBudget = savingsCategory !== undefined ? Number(savingsCategory.budget) : 100;

  // Active view toggle: 'actuals' (Live Savings) vs 'simulator' (Wealth Simulator)
  const [activeView, setActiveView] = useState<'actuals' | 'simulator'>('actuals');

  // Toggle for viewing the raw savings ledger entries in Section 1
  const [showLedgerEntries, setShowLedgerEntries] = useState(false);

  // =========================================================================
  // SECTION 1: LIVE SAVINGS TRACKER (ACTUALS ONLY - NO HYPOTHETICAL MATH)
  // =========================================================================
  const savingsAccount = accounts.find(a => a.id === 'acc_savings' || a.type === 'savings');
  const liveSavingsBalance = Number(savingsAccount?.balance ?? stats?.savings.balance ?? 0);

  const savingsAccountIds = useMemo(() => {
    return accounts.filter(a => a.type === 'savings' || a.id === 'acc_savings').map(a => a.id);
  }, [accounts]);

  const savingsTxs = useMemo(() => {
    return transactions.filter(t => savingsAccountIds.includes(t.account_id));
  }, [transactions, savingsAccountIds]);

  // Actual transactions for the selected calendar year
  const yearPrefix = `${selectedYear}-`;
  const yearSavingsTxs = useMemo(() => {
    return savingsTxs.filter(t => t.date && t.date.startsWith(yearPrefix));
  }, [savingsTxs, yearPrefix]);

  const isTransferIn = (t: any) => {
    const notesStr = (t.notes || '').toLowerCase();
    const descStr = (t.description || '').toLowerCase();
    const catStr = (t.category || '').toLowerCase();
    return notesStr.includes('[transfer: in') || 
           notesStr.includes('[transfer in') || 
           notesStr.includes('deposit') || 
           descStr.includes('(from ') || 
           descStr.startsWith('transfer from') ||
           catStr.includes('transfer in');
  };

  const isDepositTx = (t: any) => {
    if (t.description?.toLowerCase() === 'starting balance') return false;
    if (t.type === 'Income') return true;
    if (t.type === 'Transfer' && isTransferIn(t)) return true;
    return false;
  };

  const isWithdrawalTx = (t: any) => {
    if (t.type === 'Expense') return true;
    if (t.type === 'Transfer' && !isTransferIn(t)) return true;
    return false;
  };

  // YTD Actual Interest Earned in Savings Account
  const actualInterestEarned = useMemo(() => {
    return yearSavingsTxs
      .filter(t => (t.type === 'Income' || t.type === 'Transfer') && (
        t.category?.toLowerCase().includes('interest') || 
        t.description?.toLowerCase().includes('interest')
      ))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [yearSavingsTxs]);

  // YTD Actual Deposits (excluding interest & initial zero-balance setup)
  const actualDeposits = useMemo(() => {
    return yearSavingsTxs
      .filter(t => isDepositTx(t) && 
        !t.category?.toLowerCase().includes('interest') && 
        !t.description?.toLowerCase().includes('interest')
      )
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [yearSavingsTxs]);

  // YTD Actual Withdrawals from Savings Account
  const actualWithdrawals = useMemo(() => {
    return yearSavingsTxs
      .filter(t => isWithdrawalTx(t))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [yearSavingsTxs]);

  // YTD Net Actual Contributions (Deposits minus Withdrawals)
  const actualNetContributions = actualDeposits - actualWithdrawals;

  const monthsList = [
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

  // Group actual ledger entries by month (STRICT ACTUALS - No projected numbers)
  const monthlyActuals = useMemo(() => {
    const res: Record<string, { deposits: number; withdrawals: number; interest: number; net: number; count: number }> = {};
    for (const m of monthsList) {
      res[m.code] = { deposits: 0, withdrawals: 0, interest: 0, net: 0, count: 0 };
    }

    for (const t of yearSavingsTxs) {
      if (!t.date) continue;
      const parts = t.date.split('-');
      if (parts.length >= 2) {
        const monthNum = parseInt(parts[1], 10);
        const mObj = monthsList[monthNum - 1];
        if (mObj && res[mObj.code]) {
          const isInterest = (t.type === 'Income' || t.type === 'Transfer') && (
            t.category?.toLowerCase().includes('interest') || 
            t.description?.toLowerCase().includes('interest')
          );
          const isStartBal = t.description?.toLowerCase() === 'starting balance';
          
          if (isInterest) {
            res[mObj.code].interest += Number(t.amount || 0);
            res[mObj.code].net += Number(t.amount || 0);
            res[mObj.code].count++;
          } else if (isStartBal) {
            // Ignore initial zero balance
          } else if (isDepositTx(t)) {
            res[mObj.code].deposits += Number(t.amount || 0);
            res[mObj.code].net += Number(t.amount || 0);
            res[mObj.code].count++;
          } else if (isWithdrawalTx(t)) {
            res[mObj.code].withdrawals += Number(t.amount || 0);
            res[mObj.code].net -= Number(t.amount || 0);
            res[mObj.code].count++;
          }
        }
      }
    }
    return res;
  }, [yearSavingsTxs]);

  // =========================================================================
  // SECTION 2: WEALTH SIMULATOR (SANDBOX)
  // Starts strictly from current live Savings Account balance (Year 0 baseline)
  // Fully untangled from real-time budget tracking
  // =========================================================================
  const [simulatedContribution, setSimulatedContribution] = useState<number>(activeSavingsBudget || 100);

  const simulationRows = useMemo(() => {
    const apy = 0.031;
    const r = apy / 12;
    let running = liveSavingsBalance;

    const rows = [
      {
        year: 0,
        yearLabel: 'Year 0 (Today)',
        note: 'Starting Baseline',
        monthlyContribution: 0,
        annualContribution: 0,
        interestEarned: 0,
        expectedReturn: apy,
        projectedBalance: Math.round(liveSavingsBalance * 100) / 100,
      }
    ];

    for (let yr = 1; yr <= 5; yr++) {
      const start = running;
      let yrInterest = 0;
      for (let m = 0; m < 12; m++) {
        running += simulatedContribution;
        const interest = running * r;
        running += interest;
        yrInterest += interest;
      }
      const annualContrib = simulatedContribution * 12;
      rows.push({
        year: yr,
        yearLabel: `Year ${yr}`,
        note: `Forecast Year +${yr}`,
        monthlyContribution: simulatedContribution,
        annualContribution: annualContrib,
        interestEarned: Math.round(yrInterest * 100) / 100,
        expectedReturn: apy,
        projectedBalance: Math.round(running * 100) / 100,
      });
    }

    return rows;
  }, [liveSavingsBalance, simulatedContribution]);

  const totalSimulatedContributions5Yr = simulatedContribution * 60;
  const finalSimulatedBalance = simulationRows[5]?.projectedBalance ?? liveSavingsBalance;
  const totalSimulatedGain = Math.max(0, finalSimulatedBalance - liveSavingsBalance);
  const totalSimulatedInterest = Math.max(0, totalSimulatedGain - totalSimulatedContributions5Yr);

  const handleMonthDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [m, y] = e.target.value.split('-');
    setSelectedMonth(m);
    setSelectedYear(parseInt(y, 10));
  };

  const currentSelectionValue = `${selectedMonth}-${selectedYear}`;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
            <span>🔮</span> Projections &amp; Long-Term Wealth
          </h2>
          <p className="text-xs text-rose-400 font-medium mt-1">
            {activeView === 'actuals'
              ? 'Real-time ledger tracking for your live savings balance and actual contributions'
              : 'Interactive 5-year compound wealth simulator based on hypothetical monthly inputs'}
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-white p-1 rounded-2xl border border-[#e4e0e2] shadow-sm">
          <button
            onClick={() => setActiveView('actuals')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeView === 'actuals'
                ? 'bg-[#7d3c4c] text-white shadow-md'
                : 'text-[#52212e] hover:text-[#f472b6]'
            }`}
          >
            <PiggyBank className="w-3.5 h-3.5" />
            <span>Live Savings</span>
          </button>
          <button
            onClick={() => setActiveView('simulator')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeView === 'simulator'
                ? 'bg-[#7d3c4c] text-white shadow-md'
                : 'text-[#52212e] hover:text-[#f472b6]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Wealth Simulator</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SECTION 1: LIVE SAVINGS TRACKER (ACTUALS)                           */}
      {/* Strictly pulls from the Savings Account Ledger                      */}
      {/* NO hypothetical future math exists in this section                 */}
      {/* =================================================================== */}
      {activeView === 'actuals' && (
        <section className="space-y-4 animate-in fade-in duration-200">
          {/* Section Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#64748b]">Ledger Period:</span>
              <div className="flex items-center bg-white p-1 rounded-xl border border-[#e4e0e2] shadow-2xs">
                <button
                  onClick={prevMonth}
                  title="Previous Month"
                  className="p-1.5 rounded-lg hover:bg-[#f8f7f6] text-[#7d3c4c] transition-all shadow-2xs active:scale-95 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="relative px-1">
                  <select
                    value={currentSelectionValue}
                    onChange={handleMonthDropdownChange}
                    className="bg-transparent text-[#7d3c4c] font-extrabold text-xs px-2 py-1 rounded-lg outline-none font-cute cursor-pointer hover:text-[#52212e] transition-colors"
                  >
                    <optgroup label="2026 (Starting Period)">
                      {months2026.map(m => (
                        <option key={`2026-${m.code}`} value={`${m.code}-2026`}>
                          {m.name} 2026
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="2027">
                      {monthsList.map(m => (
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
                  className="p-1.5 rounded-lg hover:bg-[#f8f7f6] text-[#7d3c4c] transition-all shadow-2xs active:scale-95 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowLedgerEntries(!showLedgerEntries)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-[#7d3c4c] border border-[#ebd0d9] hover:bg-[#fdf6f8] transition-all cursor-pointer shadow-2xs self-start sm:self-auto"
            >
              <History className="w-3.5 h-3.5" />
              <span>{showLedgerEntries ? 'Hide' : 'View'} Ledger Entries ({yearSavingsTxs.length})</span>
              {showLedgerEntries ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

        {/* 3 Metric Cards for Actuals */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Current Live Balance */}
          <div className="bg-white rounded-3xl p-5 border border-emerald-200/80 shadow-kawaii flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs font-bold text-emerald-800 uppercase font-cute">
                <span>Current Live Balance</span>
                <span className="text-[10px] font-sans font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  3.10% APY HYSA
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#1f242e] font-mono">
                {formatCurrency(liveSavingsBalance)}
              </div>
              <p className="text-[11px] text-[#64748b] font-medium">
                Live available funds in {savingsAccount?.name || 'Savings Account'}
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#f1eded] flex items-center justify-between text-[11px]">
              <span className="text-[#64748b] font-medium">Account ID:</span>
              <span className="font-mono font-bold text-[#1f242e] bg-[#fdf6f8] px-1.5 py-0.5 rounded border border-[#ebd0d9]">
                {savingsAccount?.id || 'acc_savings'}
              </span>
            </div>
          </div>

          {/* Card 2: Year-to-Date (YTD) Actual Contributions */}
          <div className="bg-white rounded-3xl p-5 border border-[#ebd0d9] shadow-kawaii flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs font-bold text-[#7d3c4c] uppercase font-cute">
                <span>{selectedYear} YTD Net Contributions</span>
                <span className="text-[10px] font-sans font-bold bg-rose-50 text-[#7d3c4c] px-2 py-0.5 rounded-full border border-rose-200">
                  Actuals
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 font-mono">
                {formatCurrency(actualNetContributions)}
              </div>
              <div className="text-[11px] text-[#64748b] font-medium flex items-center gap-1.5 flex-wrap">
                <span>Deposited: <strong className="text-emerald-700 font-mono">{formatCurrency(actualDeposits)}</strong></span>
                <span>•</span>
                <span>Withdrawn: <strong className="text-rose-600 font-mono">-{formatCurrency(actualWithdrawals)}</strong></span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#f1eded] flex items-center justify-between text-[11px]">
              <span className="text-[#64748b] font-medium">Ledger Activity:</span>
              <span className="font-bold text-[#1f242e]">
                {yearSavingsTxs.length} {yearSavingsTxs.length === 1 ? 'transaction' : 'transactions'} in {selectedYear}
              </span>
            </div>
          </div>

          {/* Card 3: Actual Interest Earned */}
          <div className="bg-white rounded-3xl p-5 border border-amber-200/80 shadow-kawaii flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs font-bold text-amber-900 uppercase font-cute">
                <span>{selectedYear} Actual Interest Earned</span>
                <span className="text-[10px] font-sans font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                  Yield Actuals
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#1f242e] font-mono">
                {formatCurrency(actualInterestEarned)}
              </div>
              <p className="text-[11px] text-[#64748b] font-medium">
                {actualInterestEarned > 0 
                  ? 'Interest credits verified in savings ledger' 
                  : 'Compounding yield logged upon monthly interest deposit'}
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#f1eded] flex items-center justify-between text-[11px]">
              <span className="text-[#64748b] font-medium">Interest Status:</span>
              <span className="font-bold text-emerald-700">
                {actualInterestEarned > 0 ? 'Verified in Ledger' : 'Awaiting Next Credit'}
              </span>
            </div>
          </div>
        </div>

        {/* Actual Monthly Contributions Log (Strictly Actuals) */}
        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h4 className="text-sm font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
              <span>🌸</span> {selectedYear} Monthly Ledger Contributions (Actuals Only)
            </h4>
            <span className="text-[11px] text-[#64748b] font-medium">
              Net balance changes strictly recorded in your Savings Account
            </span>
          </div>

          <div className={`grid gap-2 pt-1 border-t border-[#f1eded] ${
            selectedYear === 2026 
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5' 
              : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12'
          }`}>
            {(selectedYear === 2026 ? months2026 : monthsList).map((m) => {
              const act = monthlyActuals[m.code];
              const hasActivity = act && act.count > 0;
              const isSelected = m.code === selectedMonth;

              return (
                <div
                  key={m.code}
                  className={`p-3 rounded-2xl border text-center transition-all ${
                    isSelected
                      ? 'bg-[#fdf2f4] border-[#f8ccd6] shadow-2xs ring-2 ring-[#7d3c4c]/20'
                      : hasActivity
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-[#fafafa] border-[#e4e0e2]'
                  }`}
                >
                  <div className="text-[11px] font-extrabold text-[#7d3c4c] font-cute flex items-center justify-center gap-1">
                    <span>{m.name}</span>
                    {hasActivity && <span className="text-[9px]" title="Active ledger records">🌸</span>}
                  </div>
                  <div className={`text-xs font-extrabold font-mono mt-1 ${
                    hasActivity 
                      ? (act.net >= 0 ? 'text-emerald-700' : 'text-rose-600')
                      : 'text-[#64748b]'
                  }`}>
                    {hasActivity 
                      ? `${act.net > 0 ? '+' : ''}${formatCurrency(act.net)}` 
                      : '$0.00'}
                  </div>
                  <div className="text-[10px] font-sans font-bold text-[#64748b] mt-0.5">
                    {hasActivity ? `${act.count} ${act.count === 1 ? 'entry' : 'entries'}` : 'No ledger activity'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collapsible Raw Savings Account Ledger Entries Table */}
        {showLedgerEntries && (
          <div className="bg-white rounded-3xl p-5 border border-[#ebd0d9] shadow-kawaii space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-[#ebd0d9] pb-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#7d3c4c]" />
                <h4 className="text-sm font-extrabold text-[#1f242e] font-cute">
                  Raw Savings Account Ledger Transactions ({selectedYear})
                </h4>
              </div>
              <span className="text-[11px] text-[#64748b] font-mono">
                Account: {savingsAccount?.name || 'Savings'}
              </span>
            </div>

            {yearSavingsTxs.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#64748b]">
                No transactions recorded in the savings account for {selectedYear}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-medium">
                  <thead>
                    <tr className="bg-[#fdf6f8] text-[#7d3c4c] font-bold border-b border-[#ebd0d9]">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-50/70">
                    {yearSavingsTxs.map((t) => (
                      <tr key={t.id} className="hover:bg-[#fdf6f8]/60 transition-colors">
                        <td className="py-2 px-3 font-mono text-[#64748b]">{formatDate(t.date)}</td>
                        <td className="py-2 px-3 font-bold text-[#1f242e]">{t.description}</td>
                        <td className="py-2 px-3 text-[#64748b]">{t.category}</td>
                        <td className="py-2 px-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            isDepositTx(t) 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : isWithdrawalTx(t)
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-gray-50 text-gray-700 border border-gray-200'
                          }`}>
                            {isDepositTx(t) ? 'Deposit' : isWithdrawalTx(t) ? 'Withdrawal' : t.type}
                          </span>
                        </td>
                        <td className={`py-2 px-3 text-right font-mono font-bold ${
                          isDepositTx(t) ? 'text-emerald-700' : isWithdrawalTx(t) ? 'text-rose-600' : 'text-[#1f242e]'
                        }`}>
                          {isDepositTx(t) ? '+' : isWithdrawalTx(t) ? '-' : ''}{formatCurrency(t.amount)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-[#1f242e]">
                          {formatCurrency(t.running_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {/* =================================================================== */}
      {/* SECTION 2: WEALTH SIMULATOR (SANDBOX)                               */}
      {/* Clearly defined separate section                                    */}
      {/* Year 0 Starting Baseline = Current Live Savings Account Balance     */}
      {/* Strictly uses user's selected hypothetical monthly input            */}
      {/* =================================================================== */}
      {activeView === 'simulator' && (
      <section className="space-y-4">
        {/* Sandbox Controls Card (Quick Select & Monthly Input) */}
        <div className="bg-white rounded-3xl p-5 border border-[#e4e0e2] shadow-kawaii space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-[#1f242e] font-cute flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#7d3c4c]" />
                  <span>Hypothetical Monthly Savings Input:</span>
                </span>
                <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Year 0 Baseline: {formatCurrency(liveSavingsBalance)}
                </span>
              </div>
              <p className="text-[11px] text-[#64748b] font-medium">
                Choose or type a simulated monthly savings amount to forecast multi-year compound growth at 3.10% APY.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-[#7d3c4c]">$</span>
                <input
                  type="number"
                  min="0"
                  step="25"
                  value={simulatedContribution}
                  onChange={e => setSimulatedContribution(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="pl-6 pr-3 py-2 w-32 bg-[#fdf6f8] border border-[#ebd0d9] rounded-xl font-mono text-sm font-extrabold text-[#7d3c4c] outline-none focus:border-[#7d3c4c] focus:bg-white text-right shadow-2xs"
                />
              </div>
              <span className="text-xs font-bold text-[#64748b]">/ month</span>

              {simulatedContribution !== 100 && (
                <button
                  onClick={() => setSimulatedContribution(100)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-[#fdf6f8] text-[#7d3c4c] border border-[#ebd0d9] hover:bg-[#f8d5db] transition-all cursor-pointer shadow-2xs"
                  title="Reset to $100/mo"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Select Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#f1eded]">
            <span className="text-[11px] font-bold text-[#64748b] mr-1">Quick Select:</span>
            {[50, 100, 250, 500, 750, 1000].map(amt => (
              <button
                key={amt}
                onClick={() => setSimulatedContribution(amt)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  simulatedContribution === amt
                    ? 'bg-[#7d3c4c] text-white border-[#7d3c4c] shadow-xs scale-102'
                    : 'bg-[#fdf6f8] text-[#52212e] border-[#ebd0d9] hover:border-[#7d3c4c]'
                }`}
              >
                +${amt}/mo
              </button>
            ))}
          </div>
        </div>

        {/* Simulation Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-3xl p-4 border border-[#e4e0e2] shadow-kawaii">
            <span className="text-[11px] font-bold text-[#64748b] uppercase block font-cute">Year 0 Baseline</span>
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#1f242e] mt-1">
              {formatCurrency(liveSavingsBalance)}
            </div>
            <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">
              Live Savings Balance Today
            </span>
          </div>

          <div className="bg-white rounded-3xl p-4 border border-[#e4e0e2] shadow-kawaii">
            <span className="text-[11px] font-bold text-[#64748b] uppercase block font-cute">Simulated Savings</span>
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#7d3c4c] mt-1">
              {formatCurrency(simulatedContribution)} <span className="text-xs font-normal">/ mo</span>
            </div>
            <span className="text-[10px] text-[#64748b] font-medium block mt-0.5">
              {formatCurrency(simulatedContribution * 12)} / year input
            </span>
          </div>

          <div className="bg-white rounded-3xl p-4 border border-emerald-200 shadow-kawaii">
            <span className="text-[11px] font-bold text-emerald-800 uppercase block font-cute">5-Year Projected Total</span>
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-700 mt-1">
              {formatCurrency(finalSimulatedBalance)}
            </div>
            <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
              Compounded at 3.10% APY
            </span>
          </div>

          <div className="bg-white rounded-3xl p-4 border border-[#e4e0e2] shadow-kawaii">
            <span className="text-[11px] font-bold text-[#64748b] uppercase block font-cute">Projected Wealth Gain</span>
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#7d3c4c] mt-1">
              +{formatCurrency(totalSimulatedGain)}
            </div>
            <span className="text-[10px] text-[#64748b] font-medium block mt-0.5">
              Principal: {formatCurrency(totalSimulatedContributions5Yr)} • Interest: <strong className="text-emerald-700">+{formatCurrency(totalSimulatedInterest)}</strong>
            </span>
          </div>
        </div>

        {/* 5-Year Compound Savings Projection Table */}
        <div className="bg-white rounded-3xl shadow-kawaii border border-[#e4e0e2] overflow-hidden">
          <div className="bg-[#fdf6f8] px-6 py-4 border-b border-[#e4e0e2] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
                <span>📈</span> 5-Year Compound Savings Projection Table
              </h3>
              <p className="text-xs text-[#64748b]">
                Starting from Year 0 baseline ({formatCurrency(liveSavingsBalance)}) with hypothetical {formatCurrency(simulatedContribution)}/month
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[#7d3c4c] bg-white px-3 py-1 rounded-xl border border-[#ebd0d9] self-start sm:self-auto shadow-2xs">
              Rate: 3.10% APY
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm font-medium">
              <thead>
                <tr className="bg-[#7d3c4c] text-white text-xs font-bold">
                  <th className="py-3.5 px-6">Timeline</th>
                  <th className="py-3.5 px-4 text-right">Monthly Contribution</th>
                  <th className="py-3.5 px-4 text-right">Annual Contribution</th>
                  <th className="py-3.5 px-4 text-right">Annual Interest Earned</th>
                  <th className="py-3.5 px-4 text-right">Expected Return</th>
                  <th className="py-3.5 px-6 text-right">Projected Total Balance</th>
                </tr>
              </thead>
              <tbody>
                {simulationRows.map((row, idx) => {
                  const isYear0 = row.year === 0;

                  return (
                    <tr
                      key={row.year}
                      className={`hover:bg-[#faedf1]/70 transition-colors ${
                        isYear0 
                          ? 'bg-emerald-50/50 font-bold border-b border-emerald-200' 
                          : idx % 2 === 1 
                          ? 'bg-[#fdf6f8]' 
                          : 'bg-white'
                      }`}
                    >
                      {/* Timeline */}
                      <td className="py-3.5 px-6 text-[#1f242e]">
                        <div className="flex items-center gap-2">
                          <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center font-bold text-xs shrink-0 ${
                            isYear0 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-rose-100 text-[#7d3c4c]'
                          }`}>
                            Yr {row.year}
                          </span>
                          <div>
                            <span className="font-bold">{row.yearLabel}</span>
                            <span className={`block text-[10px] ${isYear0 ? 'text-emerald-700 font-bold' : 'text-[#64748b]'}`}>
                              {row.note}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Monthly Contribution */}
                      <td className="py-3.5 px-4 text-right font-mono text-[#1f242e]">
                        {isYear0 ? '—' : formatCurrency(row.monthlyContribution)}
                      </td>

                      {/* Annual Contribution */}
                      <td className="py-3.5 px-4 text-right font-mono text-[#1f242e] font-bold">
                        {isYear0 ? '—' : formatCurrency(row.annualContribution)}
                      </td>

                      {/* Annual Interest */}
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-600 font-bold">
                        {isYear0 ? '—' : `+${formatCurrency(row.interestEarned)}`}
                      </td>

                      {/* Expected Return */}
                      <td className="py-3.5 px-4 text-right font-mono text-[#64748b]">
                        {formatPercent(row.expectedReturn)}
                      </td>

                      {/* Projected Total Balance */}
                      <td className="py-3.5 px-6 text-right font-mono text-base font-extrabold text-[#1f242e]">
                        {formatCurrency(row.projectedBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Total Row: Soft Rose Highlight #f8d5db matching the rest of the application */}
              <tfoot>
                <tr className="bg-[#f8d5db] text-[#1f242e] text-xs sm:text-sm font-extrabold border-t-2 border-[#ebd0d9]">
                  <td className="py-4 px-6 font-bold text-[#7d3c4c] font-cute text-sm flex items-center gap-1.5">
                    <span>✨</span>
                    <span>5-Year Cumulative Totals</span>
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-[#64748b]">—</td>
                  <td className="py-4 px-4 text-right font-mono text-[#1f242e] font-bold">
                    +{formatCurrency(totalSimulatedContributions5Yr)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-[#059669] font-bold">
                    +{formatCurrency(totalSimulatedInterest)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-[#7d3c4c]">3.10% APY</td>
                  <td className="py-4 px-6 text-right font-mono text-base text-[#7d3c4c] font-extrabold">
                    {formatCurrency(finalSimulatedBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>
      )}
    </div>
  );
};
