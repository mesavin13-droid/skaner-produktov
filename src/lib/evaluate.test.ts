import { describe, expect, it } from 'vitest';
import { evaluate, profileWarnings } from './evaluate';
import { calorie100, normalizeProduct, servingGrams, validBarcode } from './off';
import type { Product } from '../types';
const sample = (overrides: Partial<Product> = {}): Product => ({
  code: '4601234567890', name: 'Пример', brand: 'Тест', quantity: '100 г', image: undefined,
  ingredients: 'Овёс', ingredientsTags: [], allergensTags: [], tracesTags: [], additivesTags: [],
  nutritionGrade: 'a', novaGroup: 1, categoriesTags: [], labelsTags: [], ingredientsAnalysisTags: [],
  servingSize: '30 g', nutriments: { 'energy-kcal_100g': 390, sugars_100g: 1, salt_100g: 0.01, 'saturated-fat_100g': 1.2, fiber_100g: 10, proteins_100g: 12 },
  ...overrides,
});
describe('штрихкоды и нутриенты', () => {
  it('принимает распространённые длины штрихкода', () => { expect(validBarcode('12345678')).toBe(true); expect(validBarcode('1234567890123')).toBe(true); expect(validBarcode('abc123')).toBe(false); });
  it('рассчитывает калории из килоджоулей', () => expect(calorie100({ 'energy-kj_100g': 418.4 })).toBeCloseTo(100));
  it('читает граммы и миллилитры порции', () => { expect(servingGrams('25 g')).toBe(25); expect(servingGrams('200 мл')).toBe(200); });
  it('нормализует отсутствующие поля', () => expect(normalizeProduct({}, '12345678').name).toContain('12345678'));
});
describe('ориентировочный индекс', () => {
  it('показывает минимум замечаний для менее обработанного продукта', () => expect(evaluate(sample()).score).toBeLessThan(35));
  it('увеличивает индекс при большом количестве сахара, соли и насыщенных жиров', () => {
    const bad = sample({ nutritionGrade: 'e', novaGroup: 4, nutriments: { sugars_100g: 39, salt_100g: 2.2, 'saturated-fat_100g': 12 } });
    expect(evaluate(bad).score).toBeGreaterThan(65);
  });
  it('отмечает недостаток данных', () => expect(evaluate(sample({ nutriments: {}, novaGroup: undefined, nutritionGrade: undefined })).completeness).toBe('low'));
  it('замечает аллерген, но не путает арахис с древесными орехами', () => {
    const product = sample({ allergensTags: ['en:peanuts'] });
    const warnings = profileWarnings(product, { diet: 'none', calories: 2000, allergens: ['nuts', 'peanuts'] });
    expect(warnings).toHaveLength(1); expect(warnings[0]).toContain('Арахис');
  });
});
