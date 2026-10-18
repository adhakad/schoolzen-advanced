import { formatTime, monthCalendar, monthLabel, parseTimeInput, shiftMonth, TIME_OPTIONS } from './attendance-time.util';

// Global rule 4: every time on the Attendance pages is 12-hour AM/PM, in and out.
describe('attendance-time.util', () => {
  it('formats 24h API times as 12-hour AM/PM, including midnight and noon', () => {
    expect(formatTime('00:00')).toBe('12:00 AM');
    expect(formatTime('07:45')).toBe('7:45 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('14:30')).toBe('2:30 PM');
    expect(formatTime('23:59')).toBe('11:59 PM');
    expect(formatTime('bad')).toBe('');
    expect(formatTime(null)).toBe('');
  });

  it('reads typed times in either form and rejects impossible ones', () => {
    expect(parseTimeInput('8:00 AM')).toBe('08:00');
    expect(parseTimeInput('12 am')).toBe('00:00');
    expect(parseTimeInput('12:15 pm')).toBe('12:15');
    expect(parseTimeInput('2 p.m.')).toBe('14:00');
    expect(parseTimeInput('14:30')).toBe('14:30');
    expect(parseTimeInput('13:00 pm')).toBeNull();
    expect(parseTimeInput('9:75')).toBeNull();
  });

  it('every time option is labelled AM/PM, every 15 minutes', () => {
    expect(TIME_OPTIONS.length).toBe(96);
    expect(TIME_OPTIONS.every((option) => / (AM|PM)$/.test(option.label))).toBeTrue();
    expect(TIME_OPTIONS.find((option) => option.value === '13:15')?.label).toBe('1:15 PM');
  });

  it('month helpers: label, stepping across a year, calendar padding', () => {
    expect(monthLabel('2026-09')).toBe('Sep 2026');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    const october = monthCalendar('2026-10');
    expect(october.filter((day) => day !== null).length).toBe(31);
    expect(october.indexOf(1)).toBe(4); // 1 Oct 2026 is a Thursday
  });
});
