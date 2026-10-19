import type { Product } from '../types';

export type PhotoMode = 'package' | 'food';
export interface PhotoAnalysis {
  name: string; brand: string; ingredients: string;
  calories: number | null; calorieMin: number | null; calorieMax: number | null;
  protein: number | null; fat: number | null; carbohydrates: number | null;
  sugar: number | null; salt: number | null; saturatedFat: number | null;
  transFat: number | null; fiber: number | null; nova: number | null;
  servingSize: string; allergens: string[]; confidence: 'high' | 'medium' | 'low'; notes: string;
}

export function makeThumbnail(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Выберите фотографию.'));
  if (file.size > 15_000_000) return Promise.reject(new Error('Фото слишком большое. Максимум 15 МБ до сжатия.'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1700 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Не удалось обработать изображение.')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.83);
      if (base64.length > 3_700_000) { reject(new Error('Снимок не удалось сжать. Попробуйте снять ближе.')); return; }
      resolve(base64);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть файл изображения.')); };
    img.src = url;
  });
}

export async function analyzePhoto(image: string, mode: PhotoMode, signal?: AbortSignal): Promise<Product> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mode }),
    signal,
  });
  const data: PhotoAnalysis & { error?: string } = await response.json().catch(() => ({})) as PhotoAnalysis & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Не удалось распознать фотографию.');
  if (typeof data.name !== 'string' || !data.name) throw new Error('Неполный ответ распознавания. Попробуйте ещё раз.');
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safe = (num: unknown): number | undefined => typeof num === 'number' && Number.isFinite(num) && num >= 0 ? num : undefined;
  return {
    code: `photo-${suffix}`,
    name: data.name,
    brand: data.brand || '',
    quantity: '',
    ingredients: mode === 'package' ? data.ingredients || '' : '',
    ingredientsTags: [], allergensTags: [], tracesTags: [], additivesTags: [],
    servingSize: mode === 'package' ? data.servingSize || '' : '',
    categoriesTags: [], labelsTags: [], ingredientsAnalysisTags: [],
    novaGroup: mode === 'package' ? safe(data.nova) : undefined,
    source: mode === 'food' ? 'ai-food' : 'ai-package',
    confidence: data.confidence || 'low',
    aiNotes: data.notes || '',
    calorieRange: mode === 'food' && safe(data.calorieMin) != null && safe(data.calorieMax) != null ? [safe(data.calorieMin)!, safe(data.calorieMax)!] : undefined,
    aiAllergens: Array.isArray(data.allergens) ? data.allergens : [],
    nutriments: mode === 'package' ? {
      'energy-kcal_100g': safe(data.calories), proteins_100g: safe(data.protein),
      fat_100g: safe(data.fat), carbohydrates_100g: safe(data.carbohydrates),
      sugars_100g: safe(data.sugar), salt_100g: safe(data.salt),
      'saturated-fat_100g': safe(data.saturatedFat), 'trans-fat_100g': safe(data.transFat),
      fiber_100g: safe(data.fiber),
    } : {},
  };
}
