/**
 * Wall-clock helpers for the Attendance pages. The API speaks 24h "HH:mm"; the pages show
 * and accept "8:00 AM" the way the references do.
 */

/** "8:00 AM" / "08:00" / "14:30" / "2 pm" → "HH:mm", or null when unreadable. */
export const parseTimeInput = (raw: string): string | null => {
  const text = (raw || '').trim().toLowerCase().replace(/\./g, '');
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3];
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'am' && hours === 12) hours = 0;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
};

/** "14:00" → "2:00 PM". */
export const formatTime = (hhmm: string | null | undefined): string => {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!match) return '';
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return twelve + ':' + match[2] + ' ' + suffix;
};

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Today's "YYYY-MM" from the browser's local date parts. */
export const currentMonthKey = (now = new Date()): string =>
  now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

/** "2026-08" ± n months. */
export const shiftMonth = (monthKey: string, delta: number): string => {
  const [year, month] = monthKey.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  return Math.floor(index / 12) + '-' + String((index % 12) + 1).padStart(2, '0');
};

export const monthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split('-').map(Number);
  return MONTH_NAMES[month - 1] + ' ' + year;
};

/** Leading blanks + day numbers for a Sun-first calendar of the month. */
export const monthCalendar = (monthKey: string): (number | null)[] => {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  return [...Array.from({ length: firstDow }, () => null), ...Array.from({ length: count }, (_, i) => i + 1)];
};
