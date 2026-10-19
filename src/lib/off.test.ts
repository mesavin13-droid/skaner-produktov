import { describe, expect, it } from 'vitest';
import { calorie100, normalizeProduct, servingGrams, validBarcode } from './off';

describe('Open Food Facts parser', () => {
  it('accepts typical barcode lengths only', () => {
    expect(validBarcode('3017620422003')).toBe(true);
    expect(validBarcode('bad')).toBe(false);
    expect(validBarcode('123')).toBe(false);
  });
  it('uses Russian name when available', () => {
    expect(normalizeProduct({ product_name: 'Bread', product_name_ru: 'Хлеб' }, '12345678').name).toBe('Хлеб');
  });
  it('converts kJ to kcal and parses serving', () => {
    expect(calorie100({ 'energy-kj_100g': 418.4 })).toBeCloseTo(100);
    expect(servingGrams('2 biscuits (30g)')).toBe(30);
  });
});
