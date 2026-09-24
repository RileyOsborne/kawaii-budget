import React, { useState } from 'react';
import { 
  Plus, 
  Sparkles, 
  Trash2, 
  Check, 
  Pencil, 
  X 
} from 'lucide-react';
import { useBudget } from '../../context/BudgetContext';
import { formatCurrency, formatPercent, formatDate } from '../../utils/formatters';
import { ProgressBar } from '../common/ProgressBar';
import { KawaiiBadge } from '../common/KawaiiBadge';
import { api } from '../../api/client';
import { Goal } from '../../types';

const GOAL_ICONS = ['🎯', '🏖️', '🛡️', '📦', '🚗', '🏠', '💻', '🎁', '✈️', '🎓', '🏆', '🌸', '⚡', '💎', '🎉'];
const PRESET_COLORS = [
  '#7d3c4c', // deep mauve
  '#fb7185', // rose
  '#f472b6', // pink
  '#c084fc', // lavender
  '#a855f7', // purple
  '#38bdf8', // sky
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#fb923c', // orange
  '#facc15', // yellow
];

export const GoalsView: React.FC = () => {
  const { goals, refreshData, showToast, triggerConfetti } = useBudget();
  const [showAdd, setShowAdd] = useState(false);
  const [newGoal, setNewGoal] = useState({
    name: '',
    target_amount: '',
    current_amount: '',
    target_date: '2026-12-31',
    category: 'Savings',
    color: '#10b981',
    icon: '🎯',
  });

  // Edit Goal State
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editGoalForm, setEditGoalForm] = useState({
    name: '',
    target_amount: '',
    current_amount: '',
    target_date: '2026-12-31',
    category: 'General',
    color: '#10b981',
    icon: '🎯',
  });

  // Stats for all Financial Goals
  const totalGoalTarget = goals.reduce((sum, g) => sum + (g.target_amount || 0), 0);
  const totalGoalSaved = goals.reduce((sum, g) => sum + (g.current_amount || 0), 0);
  const goalOverallRatio = totalGoalTarget > 0 ? (totalGoalSaved / totalGoalTarget) : 0;
  const completedGoalsCount = goals.filter(g => (g.target_amount || 0) > 0 && (g.current_amount || 0) >= (g.target_amount || 0)).length;

  const handleOpenAdd = () => {
    setNewGoal({
      name: '',
      target_amount: '',
      current_amount: '',
      target_date: '2026-12-31',
      category: 'Savings',
      color: '#10b981',
      icon: '🎯',
    });
    setShowAdd(true);
  };

  const handleStartEdit = (g: Goal) => {
    setEditingGoal(g);
    setEditGoalForm({
      name: g.name,
      target_amount: String(g.target_amount || 0),
      current_amount: String(g.current_amount || 0),
      target_date: g.target_date || '2026-12-31',
      category: g.category || 'Savings',
      color: g.color || '#10b981',
      icon: g.icon || '🎯',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal || !editGoalForm.name || !editGoalForm.target_amount) {
      showToast('Please fill required fields');
      return;
    }
    try {
      await api.updateGoal(editingGoal.id, {
        name: editGoalForm.name.trim(),
        target_amount: parseFloat(editGoalForm.target_amount) || 0,
        current_amount: parseFloat(editGoalForm.current_amount) || 0,
        target_date: editGoalForm.target_date,
        category: editGoalForm.category.trim() || 'General',
        color: editGoalForm.color,
        icon: editGoalForm.icon || '🎯',
        type: 'goal',
      });
      setEditingGoal(null);
      await refreshData();
      triggerConfetti();
      showToast(`${editGoalForm.name} updated! 🌸`);
    } catch {
      showToast('Error updating goal');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.name || !newGoal.target_amount) {
      showToast('Please fill required fields');
      return;
    }
    try {
      await api.createGoal({
        ...newGoal,
        target_amount: parseFloat(newGoal.target_amount),
        current_amount: parseFloat(newGoal.current_amount || '0'),
        type: 'goal',
      });
      setShowAdd(false);
      await refreshData();
      triggerConfetti();
      showToast(`${newGoal.name} created! 🌸`);
    } catch {
      showToast('Error creating goal');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete "${name}"?`)) {
      await api.deleteGoal(id);
      await refreshData();
      showToast('Goal deleted');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1f242e] font-cute flex items-center gap-2">
            <span>🎯</span> Financial Goals
          </h2>
          <p className="text-xs text-[#8c6b73] font-medium mt-1">
            Track and manage your savings targets and financial checkpoints
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-[#7d3c4c] hover:bg-[#6a313f] text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-rose-900/15 active:scale-95 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Goal</span>
        </button>
      </div>

      {/* Overview & Goals Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#ebd0d9] pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-extrabold text-[#7d3c4c] font-cute">
              Financial Goals
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#fdf2f4] text-[#7d3c4c] border border-[#f8ccd6] font-bold">
              {goals.length} {goals.length === 1 ? 'Goal' : 'Goals'}
            </span>
            {completedGoalsCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1">
                <Check className="w-3 h-3" /> {completedGoalsCount} Reached
              </span>
            )}
          </div>
          <div className="text-xs font-bold text-[#64748b]">
            Total Saved: <strong className="font-mono text-[#059669]">{formatCurrency(totalGoalSaved)}</strong> of <strong className="font-mono text-[#1f242e]">{formatCurrency(totalGoalTarget)}</strong> ({formatPercent(goalOverallRatio)})
          </div>
        </div>

        {goals.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-[#ebd0d9] space-y-2 shadow-kawaii">
            <div className="text-3xl">🎯</div>
            <p className="text-xs font-bold text-[#64748b]">No active financial goals found.</p>
            <button
              onClick={handleOpenAdd}
              className="text-xs font-bold text-[#7d3c4c] hover:underline cursor-pointer"
            >
              + Create your first financial goal
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {goals.map((g) => {
              const ratio = g.target_amount > 0 ? (g.current_amount / g.target_amount) : 0;
              const isDone = ratio >= 1;
              const remaining = Math.max(0, g.target_amount - g.current_amount);

              return (
                <div
                  key={g.id}
                  className={`bg-white rounded-3xl p-6 border transition-all shadow-kawaii hover:shadow-kawaii-lg flex flex-col justify-between ${
                    isDone ? 'border-emerald-300 bg-emerald-50/15' : 'border-[#ebd0d9]'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{g.icon || '🎯'}</span>
                        <div>
                          <h4 className="text-base font-bold text-[#1f242e] font-cute">{g.name}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-[#8c6b73] font-medium bg-[#fdf6f8] px-2 py-0.5 rounded-full border border-[#ebd0d9]">
                              {g.category || 'General'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isDone ? (
                        <KawaiiBadge variant="green">🌸 Goal Reached!</KawaiiBadge>
                      ) : (
                        <span className="text-[11px] font-mono font-bold text-[#7d3c4c] bg-[#fdf6f8] px-2.5 py-1 rounded-xl border border-[#ebd0d9]">
                          {g.target_date ? `Due ${formatDate(g.target_date)}` : 'Ongoing'}
                        </span>
                      )}
                    </div>

                    <div className="my-5 space-y-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-2xl font-extrabold font-mono text-[#1f242e]">
                          {formatCurrency(g.current_amount)}
                        </span>
                        <span className="text-xs text-[#64748b] font-mono">
                          target: {formatCurrency(g.target_amount)}
                        </span>
                      </div>

                      <ProgressBar value={ratio} color={g.color || '#10b981'} height="h-3.5" />

                      <div className="flex justify-between text-xs font-semibold text-[#64748b]">
                        <span>Saved: {formatPercent(ratio)}</span>
                        <span className={remaining === 0 ? 'text-[#059669] font-bold' : 'text-[#7d3c4c]'}>
                          {remaining === 0 ? 'Fully Funded! ✨' : `Remaining: ${formatCurrency(remaining)}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#f1eded] flex justify-between items-center text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(g)}
                        className="p-1.5 text-[#8c6b73] hover:text-[#7d3c4c] hover:bg-[#fdf6f8] rounded-xl transition-all cursor-pointer"
                        title={`Edit ${g.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(g.id, g.name)}
                        className="p-1.5 text-[#8c6b73] hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title={`Delete ${g.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isDone ? (
                      <span className="text-emerald-600 font-bold flex items-center gap-1 font-cute text-xs">
                        <Sparkles className="w-3.5 h-3.5 fill-emerald-400" /> Goal Achieved!
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#8c6b73] font-medium">
                        Active goal
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Goal Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-[#ebd0d9] w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#ebd0d9]">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{newGoal.icon || '🎯'}</span>
                <div>
                  <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">
                    Create Financial Goal
                  </h3>
                  <p className="text-[11px] text-[#8c6b73]">
                    Track a savings target or financial checkpoint
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAdd(false)}
                className="text-[#8c6b73] hover:text-[#7d3c4c] p-1.5 rounded-xl hover:bg-rose-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">
                  Goal Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vacation Fund, $500 Buffer, Emergency Fund"
                  value={newGoal.name}
                  onChange={e => setNewGoal({ ...newGoal, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-bold text-xs focus:border-[#7d3c4c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">
                    Target Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="1000.00"
                    value={newGoal.target_amount}
                    onChange={e => setNewGoal({ ...newGoal, target_amount: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-mono font-bold text-xs focus:border-[#7d3c4c]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">
                    Current Saved ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newGoal.current_amount}
                    onChange={e => setNewGoal({ ...newGoal, current_amount: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-mono font-bold text-xs focus:border-[#7d3c4c]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Target Date</label>
                  <input
                    type="date"
                    value={newGoal.target_date}
                    onChange={e => setNewGoal({ ...newGoal, target_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-bold text-xs focus:border-[#7d3c4c]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Savings, Buffer, Debt Free"
                    value={newGoal.category}
                    onChange={e => setNewGoal({ ...newGoal, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-bold text-xs focus:border-[#7d3c4c]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Emoji Icon</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newGoal.icon}
                    onChange={e => setNewGoal({ ...newGoal, icon: e.target.value })}
                    className="w-12 px-2 py-2 bg-white border border-[#ebd0d9] rounded-xl outline-none text-center text-lg font-bold focus:border-[#7d3c4c]"
                  />
                  <div className="flex gap-1 flex-wrap">
                    {GOAL_ICONS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewGoal({ ...newGoal, icon: emoji })}
                        className={`w-6 h-6 rounded-lg text-xs flex items-center justify-center hover:scale-110 transition-transform ${newGoal.icon === emoji ? 'bg-rose-100 border border-rose-300' : 'bg-slate-50'}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Theme Color</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewGoal({ ...newGoal, color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${newGoal.color === c ? 'border-black ring-2 ring-[#7d3c4c]/30 scale-110' : 'border-white'}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#ebd0d9]">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 rounded-xl text-[#8c6b73] font-bold hover:bg-[#f8f7f6] cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#7d3c4c] text-white font-bold hover:bg-[#6a313f] shadow-md shadow-rose-900/15 active:scale-95 transition-all cursor-pointer text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Goal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Goal Modal */}
      {editingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-[#ebd0d9] w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#ebd0d9]">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#fdf6f8] border border-[#ebd0d9] flex items-center justify-center text-base shadow-2xs">
                  {editGoalForm.icon}
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-[#7d3c4c] font-cute">
                    Edit {editGoalForm.name}
                  </h3>
                  <p className="text-[11px] text-[#8c6b73]">
                    Update target amount, saved balance, date, or category
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingGoal(null)}
                className="text-[#8c6b73] hover:text-[#7d3c4c] p-1.5 rounded-xl hover:bg-rose-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-[#1f242e] mb-1">
                  Goal Name
                </label>
                <input
                  type="text"
                  required
                  value={editGoalForm.name}
                  onChange={e => setEditGoalForm({ ...editGoalForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-bold text-xs focus:border-[#7d3c4c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">
                    Target Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editGoalForm.target_amount}
                    onChange={e => setEditGoalForm({ ...editGoalForm, target_amount: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-mono font-bold text-xs focus:border-[#7d3c4c]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">
                    Current Saved ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editGoalForm.current_amount}
                    onChange={e => setEditGoalForm({ ...editGoalForm, current_amount: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-mono font-bold text-xs focus:border-[#7d3c4c]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Target Date</label>
                  <input
                    type="date"
                    value={editGoalForm.target_date}
                    onChange={e => setEditGoalForm({ ...editGoalForm, target_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-bold text-xs focus:border-[#7d3c4c]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#1f242e] mb-1">Category</label>
                  <input
                    type="text"
                    value={editGoalForm.category}
                    onChange={e => setEditGoalForm({ ...editGoalForm, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebd0d9] rounded-xl outline-none font-bold text-xs focus:border-[#7d3c4c]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Emoji Icon</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editGoalForm.icon}
                    onChange={e => setEditGoalForm({ ...editGoalForm, icon: e.target.value })}
                    className="w-12 px-2 py-2 bg-white border border-[#ebd0d9] rounded-xl outline-none text-center text-lg font-bold focus:border-[#7d3c4c]"
                  />
                  <div className="flex gap-1 flex-wrap">
                    {GOAL_ICONS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditGoalForm({ ...editGoalForm, icon: emoji })}
                        className={`w-6 h-6 rounded-lg text-xs flex items-center justify-center hover:scale-110 transition-transform ${editGoalForm.icon === emoji ? 'bg-rose-100 border border-rose-300' : 'bg-slate-50'}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1f242e] mb-1">Theme Color</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditGoalForm({ ...editGoalForm, color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${editGoalForm.color === c ? 'border-black ring-2 ring-[#7d3c4c]/30 scale-110' : 'border-white'}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#ebd0d9]">
                <button
                  type="button"
                  onClick={() => setEditingGoal(null)}
                  className="px-4 py-2 rounded-xl text-[#8c6b73] font-bold hover:bg-[#f8f7f6] cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-[#7d3c4c] text-white font-bold rounded-xl hover:bg-[#6a313f] shadow-md shadow-rose-900/15 cursor-pointer active:scale-95 transition-all text-xs"
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
