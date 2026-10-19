import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzePhoto } from './photo';
import { evaluate } from './evaluate';

const fake = {
  name: 'Яблоко', brand: '', ingredients: '', calories: null, calorieMin: 45, calorieMax: 70,
  protein: null, fat: null, carbohydrates: null, sugar: null, salt: null,
  saturatedFat: null, transFat: null, fiber: null, nova: null, servingSize: '',
  allergens: [], confidence: 'medium', notes: 'Приблизительная оценка',
};

afterEach(() => vi.unstubAllGlobals());

describe('Обработка распознанного фото', () => {
  it('для еды сохраняет только диапазон, не выдумывая точные БЖУ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fake }));
    const p = await analyzePhoto('data:image/jpeg;base64,AA==', 'food');
    expect(p.source).toBe('ai-food');
    expect(p.calorieRange).toEqual([45, 70]);
    expect(p.nutriments['energy-kcal_100g']).toBeUndefined();
    expect(evaluate(p).completeness).toBe('low');
  });
  it('не маскирует серверные ошибки', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Ключ ИИ не настроен.' }) }));
    await expect(analyzePhoto('data:image/jpeg;base64,AA==', 'package')).rejects.toThrow('Ключ ИИ не настроен.');
  });
});
