import type { Nutriments, Product } from '../types';

interface RawProduct {
  code?: string;
  catalog_source?: string;
  catalog_source_url?: string;
  catalog_note?: string;
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
    source: raw.catalog_source === 'barcode-catalog' ? 'barcode-catalog' : raw.catalog_source === 'national-catalog' ? 'national-catalog' : raw.catalog_source === 'upcitemdb' ? 'upcitemdb' : 'off',
    sourceUrl: raw.catalog_source_url,
    sourceNote: raw.catalog_note,
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

/** Old image-only / nameless catalog responses must not permanently block enrichment. */
export function needsCatalogRefresh(p: Product): boolean {
  if (!validBarcode(p.code) || ['manual', 'ai-food', 'ai-package'].includes(p.source || '')) return false;
  const name = p.name.trim();
  const placeholder = name.length === 0 || name.toLowerCase() === ('товар ' + p.code).toLowerCase();
  const hasNutrition = Object.values(p.nutriments).some(v => typeof v === 'number' && Number.isFinite(v));
  return placeholder || (!p.ingredients.trim() && !hasNutrition);
}

const OFF_FIELDS = [
  'code','product_name','product_name_ru','brands','quantity','serving_size',
  'image_url','image_front_url','image_front_small_url','nutriments',
  'ingredients_text','ingredients_text_ru','ingredients_tags','additives_tags',
  'allergens_tags','traces_tags','nutrition_grades','nutriscore_grade',
  'nova_group','categories_tags','labels_tags','ingredients_analysis_tags',
].join(',');

type ProductReply = { status?: number; product?: RawProduct; cache?: { status: 'fresh' | 'stale'; updated_at: string } };

/** OFF allows cross-origin GETs; browser fallback uses the user's own connection/IP.
 * The browser may reject it due to CORS or a temporary rate-limit; that is handled safely.
 */
async function directProductLookup(code: string, signal: AbortSignal): Promise<Product | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;
  try {
    const response = await fetch(url, {
      method: 'GET', headers: { Accept: 'application/json' },
      credentials: 'omit', signal, cache: 'default',
    });
    if (response.status === 404) throw new ProductNotFound('Товар не найден в Open Food Facts.');
    if (!response.ok) return null;
    const data = await response.json() as ProductReply;
    if (data.status !== 1 || !data.product) throw new ProductNotFound('Товар не найден в Open Food Facts.');
    return normalizeProduct(data.product, code);
  } catch (error) {
    if (error instanceof ProductNotFound) throw error;
    if (signal.aborted) throw error;
    return null; // Browser CORS or OFF outage. Never mislabel these as "not found".
  }
}

export async function getProduct(code: string, signal?: AbortSignal): Promise<Product> {
  const clean = cleanBarcode(code);
  if (!validBarcode(clean)) throw new Error('Введите штрихкод от 8 до 14 цифр.');
  const controller = new AbortController();
  // Server can time out, then the browser needs additional time for fallback.
  const timeout = window.setTimeout(() => controller.abort(), 18000);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    let server: Response | undefined;
    try {
      server = await fetch(`/api/product?code=${encodeURIComponent(clean)}`, {
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      // Network/backend is unavailable; try the Open Food Facts public API.
    }
    if (server?.status === 404) throw new ProductNotFound('Товар пока отсутствует в доступных каталогах.');
    if (server?.ok) {
      const data = await server.json() as ProductReply;
      if (data.status !== 1 || !data.product) throw new ProductNotFound('Товар пока отсутствует в доступных каталогах.');
      const normalized = normalizeProduct(data.product, clean);
      if (data.cache?.status === 'fresh' || data.cache?.status === 'stale') {
        normalized.cacheStatus = data.cache.status;
        if (data.cache.updated_at) normalized.cacheUpdatedAt = data.cache.updated_at;
      }
      return normalized;
    }
    // Only try fallback for transient upstream / server errors.
    // Do not silently bypass invalid client input or authorization errors.
    if (server && server.status < 500 && server.status !== 429) {
      throw new Error('Не получилось выполнить запрос к каталогу. Попробуйте ещё раз.');
    }
    const direct = await directProductLookup(clean, controller.signal);
    if (direct) return direct;
    throw new Error('Не удалось связаться с каталогами продуктов. Штрихкод сохранён — попробуйте ещё раз или сфотографируйте состав.');
  } catch (error) {
    if (error instanceof ProductNotFound) throw error;
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw new Error('Каталог не ответил вовремя. Попробуйте повторить поиск или сделать фото этикетки.');
    }
    if (!navigator.onLine) throw new Error('Нет интернета. Ранее просмотренные товары доступны в истории.');
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
