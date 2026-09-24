import React from 'react';

interface Props {
  value: number; // 0 to 1 (or > 1)
  color?: string;
  height?: string;
  showPercent?: boolean;
}

export const ProgressBar: React.FC<Props> = ({ value, color = '#f472b6', height = 'h-2.5', showPercent = false }) => {
  const clamped = Math.min(Math.max(value, 0), 1) * 100;
  const isOver = value > 1;

  return (
    <div className="w-full flex items-center gap-2">
      <div className={`w-full bg-rose-100/70 rounded-full overflow-hidden ${height} relative`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${isOver ? 'bg-rose-500' : ''}`}
          style={{ width: `${clamped}%`, backgroundColor: isOver ? undefined : color }}
        />
      </div>
      {showPercent && (
        <span className={`text-xs font-bold shrink-0 ${isOver ? 'text-rose-600 font-extrabold' : 'text-slate-600'}`}>
          {(value * 100).toFixed(2)}%
        </span>
      )}
    </div>
  );
};
