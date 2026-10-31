import { currentSessionLabel, formatSession, pickHeaderSession } from './academic-session.util';

describe('academic-session.util', () => {
  it('always builds the full start-end year label', () => {
    expect(formatSession(2026)).toBe('2026-2027');
    expect(formatSession(1999)).toBe('1999-2000');
  });

  it('treats April as the start of a session year', () => {
    expect(currentSessionLabel(new Date(2027, 2, 31))).toBe('2026-2027');
    expect(currentSessionLabel(new Date(2027, 3, 1))).toBe('2027-2028');
  });
});


describe('pickHeaderSession (shared-fix2: header default session)', () => {
  const rows = [
    { label: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31' },
    { label: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31' },
    { label: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31' }
  ];
  const today = new Date('2026-10-21T10:00:00Z');

  it('defaults to the session covering today, not the newest', () => {
    expect(pickHeaderSession(rows, null, today)).toBe('2026-2027');
  });

  it('keeps the remembered choice while it still exists', () => {
    expect(pickHeaderSession(rows, '2025-2026', today)).toBe('2025-2026');
    expect(pickHeaderSession(rows, '1999-2000', today)).toBe('2026-2027');
  });

  it('falls back to the latest by start date when none covers today', () => {
    expect(pickHeaderSession(rows, null, new Date('2031-01-01'))).toBe('2027-2028');
    expect(pickHeaderSession([], null, today)).toBe('');
  });
});
