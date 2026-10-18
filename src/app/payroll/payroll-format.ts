/**
 * Payroll's display helpers — money as the references print it (₹26,000 / −₹3,000 / ₹58.6L),
 * 3-letter month labels ("Sep 2026"), and "01 Apr 2026" dates.
 */
import { MONTH_SHORT, currentMonthKey } from 'src/app/shared/utils/attendance-time.util';

export const rupees = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const minusRupees = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : '−' + rupees(value);

/** The side card's headline: ₹58.6L / ₹4.2K / ₹950. */
export const compactRupees = (value: number): string => {
  const n = Number(value) || 0;
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return rupees(n);
};

export { currentMonthKey };

/** "2026-08" → { year: 2026, month: 8 }. */
export const splitMonth = (monthKey: string): { year: number; month: number } => {
  const [year, month] = monthKey.split('-').map(Number);
  return { year, month };
};

export const monthName = (monthKey: string): string => {
  const { year, month } = splitMonth(monthKey);
  return MONTH_SHORT[month - 1] + ' ' + year;
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-04-01" → "01 Apr 2026". */
export const shortDate = (dateKey: string | null | undefined): string => {
  if (!dateKey) return '—';
  const [year, month, day] = String(dateKey).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '—';
  return String(day).padStart(2, '0') + ' ' + SHORT_MONTHS[month - 1] + ' ' + year;
};

/** Today as "YYYY-MM-DD" from the browser's local date parts. */
export const todayKey = (now = new Date()): string =>
  now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
