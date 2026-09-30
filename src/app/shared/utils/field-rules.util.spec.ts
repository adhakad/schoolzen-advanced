import { isValidAadhaar, verhoeffValid } from './field-rules.util';

// Standard Verhoeff tables, used here only to GENERATE check digits for the batch test.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const INV = [0,4,3,2,1,5,6,7,8,9];
const withCheckDigit = (body: string): string => {
  let c = 0;
  body.split('').reverse().map(Number).forEach((d, i) => { c = D[c][P[(i + 1) % 8][d]]; });
  return body + INV[c];
};

describe('field-rules.util — Aadhaar Verhoeff (student-fix5.md #1)', () => {
  it('passes the standard reference vectors', () => {
    expect(verhoeffValid('1428570')).toBe(true);
    expect(verhoeffValid('1428571')).toBe(false);
    expect(verhoeffValid('2363')).toBe(true);
  });

  it('accepts EVERY checksum-valid 12-digit number, whatever its first digit', () => {
    const rejected: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const aadhaar = withCheckDigit(String(Math.floor(Math.random() * 1e11)).padStart(11, '0'));
      if (!isValidAadhaar(aadhaar)) rejected.push(aadhaar);
    }
    expect(rejected).toEqual([]);
    expect(isValidAadhaar(withCheckDigit('12345678901'))).toBe(true);
  });

  it('rejects a single changed digit and a wrong length', () => {
    const good = withCheckDigit('98765432101');
    const bad = good.slice(0, 11) + ((Number(good[11]) + 1) % 10);
    expect(isValidAadhaar(bad)).toBe(false);
    expect(isValidAadhaar(good.slice(0, 11))).toBe(false);
  });
});
