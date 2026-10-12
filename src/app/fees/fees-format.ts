/**
 * Fees' display helpers — money exactly as the references print it ("₹ 22,000", side-card
 * "₹18.4L"), "05 Sep 2026" dates, and the status-tag class per ledger status.
 */
import { ArrearNote, FeeStatus } from 'src/app/shared/models/fees/fees.model';

export const rupees = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : '₹ ' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** The side card's headline: ₹18.4L / ₹87.5K / ₹950. */
export const compactRupees = (value: number): string => {
  const n = Number(value) || 0;
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return '₹' + n.toLocaleString('en-IN');
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO date → "05 Sep 2026". */
export const shortDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  return String(date.getDate()).padStart(2, '0') + ' ' + SHORT_MONTHS[date.getMonth()] + ' ' + date.getFullYear();
};

/** The reference's tag colours: Fully Paid green, Has Arrears amber, Partial/Unpaid red. */
export const statusTagClass = (status: FeeStatus | null | undefined): string => {
  if (status === 'paid') return 'tag-paid';
  if (status === 'has-arrears') return 'tag-arrears';
  return 'tag-unpaid';
};

/** "incl. ₹ 6,500 from 7th" (several years: "incl. ₹ 9,000 from 6th, 7th"). */
export const arrearNote = (arrears: ArrearNote[] | undefined): string => {
  if (!arrears || !arrears.length) return '';
  const total = arrears.reduce((sum, item) => sum + item.due, 0);
  const from = arrears.map((item) => item.className || item.sessionShort).join(', ');
  return `incl. ${rupees(total)} from ${from}`;
};

/** "2026-2027" → "2026-27". */
export const shortSession = (label: string): string => {
  const match = /^(\d{4})-(\d{4})$/.exec(label || '');
  return match ? `${match[1]}-${match[2].slice(2)}` : label || '';
};
