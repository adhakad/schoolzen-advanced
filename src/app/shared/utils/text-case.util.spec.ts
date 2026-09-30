import { applyTextCase, compareText } from './text-case.util';

describe('text-case.util', () => {
  it('Title Case capitalises every word, including after hyphens and initials', () => {
    expect(applyTextCase('ROHAN KAPOOR', 'title')).toBe('Rohan Kapoor');
    expect(applyTextCase('priya joshi-mehta', 'title')).toBe('Priya Joshi-Mehta');
    expect(applyTextCase('a.k. verma', 'title')).toBe('A.K. Verma');
  });

  it('UPPERCASE / lowercase transform the whole value', () => {
    expect(applyTextCase('Rohan Kapoor', 'upper')).toBe('ROHAN KAPOOR');
    expect(applyTextCase('Rohan Kapoor', 'lower')).toBe('rohan kapoor');
  });

  it('treats a missing value as empty', () => {
    expect(applyTextCase(null, 'upper')).toBe('');
  });

  it('sorts case-insensitively, empty values last in both directions', () => {
    const names = ['meera', null, 'Ananya', 'KABIR'];
    expect([...names].sort((a, b) => compareText(a, b, 'asc'))).toEqual(['Ananya', 'KABIR', 'meera', null]);
    expect([...names].sort((a, b) => compareText(a, b, 'desc'))).toEqual(['meera', 'KABIR', 'Ananya', null]);
  });
});
