import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';

export const MONTH_NAMES: Record<string, string> = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December'
};

export const MONTH_CODE_TO_NUM: Record<string, string> = {
  'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
  'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
  'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
};

export const MONTH_NUM_TO_CODE: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
};

export interface MonthYearFilterProps {
  selectedPeriod: string; // 'ALL' | 'YYYY-MM' | 'YYYY'
  onChangePeriod: (period: string) => void;
  availableDates?: string[]; // array of ISO/date strings to auto-discover years/months
  currentBudgetMonth?: string; // e.g. 'Aug'
  currentBudgetYear?: number;  // e.g. 2026
  className?: string;
  showQuickChips?: boolean;
}

export const MonthYearFilter: React.FC<MonthYearFilterProps> = ({
  selectedPeriod,
  onChangePeriod,
  availableDates = [],
  currentBudgetMonth = 'Aug',
  currentBudgetYear = 2026,
  className = '',
  showQuickChips = false,
}) => {
  const currentBudgetMonthNum = MONTH_CODE_TO_NUM[currentBudgetMonth] || '08';
  const currentBudgetPeriod = `${currentBudgetYear}-${currentBudgetMonthNum}`;

  // Gather all unique years and year-months
  const discoveredYearMonths = new Set<string>();
  const discoveredYears = new Set<number>([2026, 2027]);

  // Standard months for 2026 (starting August 2026) and 2027
  ['08', '09', '10', '11', '12'].forEach(m => {
    discoveredYearMonths.add(`2026-${m}`);
  });
  ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].forEach(m => {
    discoveredYearMonths.add(`2027-${m}`);
  });

  // Discover from data
  availableDates.forEach(d => {
    if (!d) return;
    const clean = d.replace(/\//g, '-');
    const match = clean.match(/^(\d{4})-(\d{2})/);
    if (match) {
      discoveredYearMonths.add(`${match[1]}-${match[2]}`);
      discoveredYears.add(parseInt(match[1], 10));
    }
  });

  const sortedYears = Array.from(discoveredYears).sort((a, b) => a - b);

  // Stepper handlers
  const handlePrev = () => {
    if (selectedPeriod === 'ALL') {
      onChangePeriod(currentBudgetPeriod);
      return;
    }

    if (selectedPeriod.length === 7) {
      const [yStr, mStr] = selectedPeriod.split('-');
      let y = parseInt(yStr, 10);
      let m = parseInt(mStr, 10);

      if (m === 1) {
        y -= 1;
        m = 12;
      } else {
        m -= 1;
      }

      const nextVal = `${y}-${String(m).padStart(2, '0')}`;
      onChangePeriod(nextVal);
    }
  };

  const handleNext = () => {
    if (selectedPeriod === 'ALL') {
      onChangePeriod(currentBudgetPeriod);
      return;
    }

    if (selectedPeriod.length === 7) {
      const [yStr, mStr] = selectedPeriod.split('-');
      let y = parseInt(yStr, 10);
      let m = parseInt(mStr, 10);

      if (m === 12) {
        y += 1;
        m = 1;
      } else {
        m += 1;
      }

      const nextVal = `${y}-${String(m).padStart(2, '0')}`;
      onChangePeriod(nextVal);
    }
  };

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {/* Month/Year Dropdown with Steppers */}
      <div className="flex items-center bg-[#fdf6f8] border border-[#ebd0d9] p-1 rounded-2xl shadow-2xs">
        <button
          type="button"
          onClick={handlePrev}
          title="Previous Month"
          className="p-1.5 rounded-xl hover:bg-white text-[#7d3c4c] transition-all cursor-pointer hover:shadow-2xs active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="relative px-2 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-[#7d3c4c] shrink-0" />
          <select
            value={selectedPeriod}
            onChange={(e) => onChangePeriod(e.target.value)}
            className="bg-transparent text-[#7d3c4c] font-bold text-xs outline-none cursor-pointer pr-1 py-0.5"
            title="Filter ledger by month and year"
          >
            <option value="ALL">🌟 All Dates (All Time)</option>
            {sortedYears.map((yr) => {
              const monthsForYear = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].filter(
                (m) => discoveredYearMonths.has(`${yr}-${m}`)
              );

              return (
                <optgroup key={yr} label={`Year ${yr}`}>
                  {monthsForYear.map((m) => {
                    const ym = `${yr}-${m}`;
                    const isCurrent = ym === currentBudgetPeriod;
                    return (
                      <option key={ym} value={ym}>
                        {MONTH_NAMES[m]} {yr} {isCurrent ? '🌸 (Current Budget)' : ''}
                      </option>
                    );
                  })}
                </optgroup>
              );
            })}
          </select>
        </div>

        <button
          type="button"
          onClick={handleNext}
          title="Next Month"
          className="p-1.5 rounded-xl hover:bg-white text-[#7d3c4c] transition-all cursor-pointer hover:shadow-2xs active:scale-95"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Optional Quick Action Chips */}
      {showQuickChips && (
        <div className="flex items-center gap-1.5">
          {selectedPeriod !== 'ALL' && (
            <button
              type="button"
              onClick={() => onChangePeriod('ALL')}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#fdf6f8] text-[#7d3c4c] border border-[#ebd0d9] rounded-xl text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
              title="Show all transactions across all dates"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Show All</span>
            </button>
          )}

          {selectedPeriod !== currentBudgetPeriod && (
            <button
              type="button"
              onClick={() => onChangePeriod(currentBudgetPeriod)}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#fff0f4] hover:bg-[#ffe4eb] text-[#7d3c4c] border border-[#f8ccd6] rounded-xl text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
              title={`Jump to ${currentBudgetMonth} ${currentBudgetYear}`}
            >
              <Sparkles className="w-3 h-3 text-[#f472b6]" />
              <span>{currentBudgetMonth} {currentBudgetYear}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
