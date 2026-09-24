export interface FormatCurrencyOptions {
  showPlus?: boolean;
  absolute?: boolean;
}

export function formatCurrency(
  amount: number | string | undefined | null,
  options?: FormatCurrencyOptions
): string {
  let num: number;
  if (typeof amount === 'string') {
    // Strip everything except digits, decimal points, and sign characters
    const cleaned = amount.replace(/[^0-9.+-]/g, '');
    // If it contains multiple leading signs like '+-' or '-+', normalize to '-'
    const normalized = cleaned.replace(/^[+-]+/, (match) => match.includes('-') ? '-' : '');
    num = parseFloat(normalized);
  } else {
    num = amount || 0;
  }

  if (isNaN(num)) return '$0.00';
  if (Math.abs(num) < 0.005) num = 0;

  const formattedAbs = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));

  if (options?.absolute) {
    return formattedAbs;
  }

  if (num < 0) {
    return `-${formattedAbs}`;
  }

  if (num > 0 && options?.showPlus) {
    return `+${formattedAbs}`;
  }

  return formattedAbs;
}

export function formatSignedCurrency(
  amount: number | string | undefined | null,
  showPlus: boolean = true
): string {
  return formatCurrency(amount, { showPlus });
}

export function formatPercent(value: number | string | undefined | null): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  if (isNaN(num)) return '0.00%';
  return `${(num * 100).toFixed(2)}%`;
}

export function formatApr(value: number | string | undefined | null): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  if (isNaN(num)) return '0.00%';
  return `${num.toFixed(2)}%`;
}

export function formatDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
}

export function getOrdinalSuffix(n: number | string | undefined | null): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : (n || 1);
  if (isNaN(num)) return '1st';
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) {
    return num + 'st';
  }
  if (j === 2 && k !== 12) {
    return num + 'nd';
  }
  if (j === 3 && k !== 13) {
    return num + 'rd';
  }
  return num + 'th';
}
