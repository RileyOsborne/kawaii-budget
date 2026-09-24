import React, { useState } from 'react';
import { Sparkles, Heart } from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';

import { formatCurrency } from '../../utils/formatters';

export const KawaiiMascot: React.FC = () => {
  const { stats, accounts, goals, triggerConfetti } = useBudget();
  const [dialog, setDialog] = useState<string | null>(null);

  const getDynamicTips = (): string[] => {
    const list: string[] = [
      '🎀 Pro-tip: Press "N" on your keyboard to instantly log a transaction!',
      '🌸 Pro-tip: Press "Cmd/Ctrl + K" to search accounts, bills, and jump anywhere!',
      '✨ Every small debt payment gets you closer to financial freedom!',
      '💖 Staying mindful of daily variable spending keeps your cute budget on track!',
      '🌷 Remember to celebrate every small milestone on your debt payoff journey!',
    ];

    const checking = accounts.find(a => a.type === 'checking' || a.id === 'acc_checking');
    if (checking && checking.buffer && checking.buffer > 0) {
      list.push(`🌸 Remember: You have a ${formatCurrency(checking.buffer)} safety buffer in ${checking.name}!`);
    }

    const paidOff = accounts.filter(a => (a.category === 'revolving' || a.type === 'credit_card') && a.balance === 0);
    if (paidOff.length > 0) {
      list.push(`✨ You have completely paid off ${paidOff.length} credit card${paidOff.length > 1 ? 's' : ''}! Amazing work!`);
    }

    const lowestDebt = accounts
      .filter(a => (a.category === 'revolving' || a.type === 'credit_card' || a.category === 'personal_loan') && a.balance > 0)
      .sort((a, b) => a.balance - b.balance)[0];
    if (lowestDebt) {
      list.push(`💖 Next debt target in Snowball: ${lowestDebt.name} (${formatCurrency(lowestDebt.balance)} remaining)!`);
    }

    const topGoal = goals.find(g => g.current_amount > 0);
    if (topGoal) {
      list.push(`🍰 ${topGoal.name} has ${formatCurrency(topGoal.current_amount)} saved up! Keep going!`);
    }

    return list;
  };

  const handleClick = () => {
    triggerConfetti();
    const currentTips = getDynamicTips();
    const randomTip = currentTips[Math.floor(Math.random() * currentTips.length)];
    setDialog(randomTip);
    setTimeout(() => setDialog(null), 5000);
  };

  return (
    <div className="relative flex items-center">
      <button
        onClick={handleClick}
        title="Click me for encouragement!"
        className="group relative flex items-center gap-2 bg-gradient-to-r from-rose-100 to-pink-100 border border-rose-200 hover:border-pink-300 px-3 py-1.5 rounded-full shadow-sm hover:shadow-md transition-all active:scale-95"
      >
        <span className="text-xl animate-float inline-block">🌸</span>
        <span className="text-xs font-bold text-kawaii-deep flex items-center gap-1 font-cute">
          Sakura <Sparkles className="w-3 h-3 text-amber-500 fill-amber-400" />
        </span>
      </button>

      {dialog && (
        <div className="absolute top-10 right-0 z-50 w-64 p-3 bg-white rounded-2xl shadow-xl border border-pink-200 text-xs font-semibold text-slate-700 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-2">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-400 shrink-0 mt-0.5" />
            <span>{dialog}</span>
          </div>
        </div>
      )}
    </div>
  );
};
