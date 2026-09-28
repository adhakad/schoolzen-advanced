import { currentSessionLabel, formatSession } from './academic-session.util';

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
