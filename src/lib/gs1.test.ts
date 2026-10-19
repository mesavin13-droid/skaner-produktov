import { describe, expect, it } from 'vitest';
import { parseMarking, remainingDays, validGtin, formatMarkingDate } from './gs1';

const gtin = '04660008080136';
describe('GS1 Data Matrix', () => {
  it('checks the GTIN digit', () => {
    expect(validGtin(gtin)).toBe(true);
    expect(validGtin('04660008080137')).toBe(false);
  });
  it('extracts expiry and production dates from a valid code', () => {
    const v = parseMarking(`]d201${gtin}1726103111260901\u001d21serialABC`, new Date('2026-10-19'));
    expect(v).toEqual({ gtin, expiryDate: '2026-10-31', expiryKind: 'use-by', productionDate: '2026-09-01' });
    expect(remainingDays('2026-10-31', new Date('2026-10-19'))).toBe(12);
  });
  it('does not invent a date from the serial', () => {
    expect(parseMarking(`01${gtin}21SERIAL17261101`)).toEqual({ gtin });
  });
  it('reads AI 17 after a GS separator', () => {
    expect(parseMarking(`01${gtin}21SERIAL\u001d17261130`)?.expiryDate).toBe('2026-11-30');
  });
  it('accepts bracket notation and GS1 end-of-month day 00', () => {
    expect(parseMarking(`(01)${gtin}(15)260200`, new Date('2026-10-19'))?.expiryDate).toBe('2026-02-28');
    expect(formatMarkingDate('2026-02-28')).toBe('28.02.2026');
  });
  it('does not treat an ordinary EAN-13 as a GS1 Data Matrix', () => {
    expect(parseMarking('4660008080136')).toBe(null);
    expect(parseMarking('(01)04660008080137(17)261231')).toBe(null);
  });
});