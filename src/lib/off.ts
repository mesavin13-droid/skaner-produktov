import type { Nutriments, Product } from '../types';

interface RawProduct {
  code?: string;
  product_name?: string;
  product_name_ru?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  image_url?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  ingredients_text?: string;
  ingredients_text_ru?: string;
  ingredients_tags?: string[];
  additives_tags?: string[];
  allergens_tags?: string[];
  traces_tags?: string[];
  nutrition_grades?: string;
  nutriscore_grade?: string;
  nova_group?: number;
  categories_tags?: string[];
  labels_tags?: string[];
  ingredients_analysis_tags?: string[];
  nutriments?: Nutriments;
}

const digits = /^\d{8,14}$/;
export function validBarcode(code: string): boolean {
  return digits.test(code);
}
export function cleanBarcode(code: string): string { return code.replace(/[\s-]/g, ''); }

export function normalizeProduct(raw: RawProduct, code: string): Product {
  return {
    code,
    name: raw.product_name_ru?.trim() || raw.product_name?.trim() || `Товар ${code}`,
    brand: raw.brands?.split(',')[0]?.trim() ?? '',
    quantity: raw.quantity ?? '',
    servingSize: raw.serving_size ?? '',
    image: raw.image_front_url || raw.image_url || raw.image_front_small_url,
    ingredients: raw.ingredients_text_ru || raw.ingredients_text || '',
    ingredientsTags: raw.ingredients_tags ?? [],
    allergensTags: raw.allergens_tags ?? [],
    tracesTags: raw.traces_tags ?? [],
    additivesTags: raw.additives_tags ?? [],
    nutritionGrade: raw.nutrition_grades || raw.nutriscore_grade,
    novaGroup: raw.nova_group,
    categoriesTags: raw.categories_tags ?? [],
    labelsTags: raw.labels_tags ?? [],
    ingredientsAnalysisTags: raw.ingredients_analysis_tags ?? [],
    nutriments: raw.nutriments ?? {},
  };
}

export class ProductNotFound extends Error {}

export async function getProduct(code: string, signal?: AbortSignal): Promise<Product> {
  const clean = cleanBarcode(code);
  if (!validBarcode(clean)) throw new Error('Введите штрихкод от 8 до 14 цифр.');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(`/api/product?code=${encodeURIComponent(clean)}`, { signal: controller.signal });
    if (response.status === 404) throw new ProductNotFound('Товар пока не найден в Open Food Facts.');
    if (!response.ok) throw new Error('Каталог продуктов временно недоступен. Попробуйте позже.');
    const data: { status: number; product?: RawProduct } = await response.json();
    if (data.status !== 1 || !data.product) throw new ProductNotFound('Товар пока не найден в Open Food Facts.');
    return normalizeProduct(data.product, clean);
  } catch (error) {
    if (error instanceof ProductNotFound) throw error;
    if (signal?.aborted) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Не удалось получить ответ. Проверьте интернет и попробуйте ещё раз.');
    }
    if (!navigator.onLine) throw new Error('Нет интернета. Ранее просмотренные товары доступны в истории.');
    if (error instanceof TypeError) throw new Error('Не удалось подключиться к каталогу. Проверьте интернет.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export function calorie100(n: Nutriments): number | null {
  if (Number.isFinite(n['energy-kcal_100g'])) return n['energy-kcal_100g']!;
  const kj = n['energy-kj_100g'] ?? n.energy_100g;
  return Number.isFinite(kj) ? kj! / 4.184 : null;
}
export function number100(n: Nutriments, name: keyof Nutriments): number | null {
  const value = n[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function servingGrams(size: string): number | null {
  const found = size.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(?:g|гр|г|ml|мл)(?![a-zа-я])/i);
  return found ? Number(found[1]) : null;
}
export function formatValue(value: number | null, digits = 1): string {
  return value == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
}
