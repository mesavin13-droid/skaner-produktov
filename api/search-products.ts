import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Name search for photographed front labels.
 * Only actual catalog records are returned. No generated nutrition data.
 * Open Food Facts: full-text legacy v1 endpoint (v2 does not support text).
 * UPCitemdb: independent keyword source, identity only, free-plan quota applies.
 */
interface Candidate {
  code: string;
  name: string;
  brand: string;
  quantity: string;
  image?: string;
  source: 'off' | 'upcitemdb';
  hasNutrition: boolean;
  hasIngredients: boolean;
  relevance: number;
}
type Obj = Record<string, unknown>;
const obj = (x: unknown): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x);
const asText = (x: unknown, max = 180) => typeof x === 'string' ? x.trim().slice(0, max) : '';
const imageUrl = (x: unknown) => {
  const url = asText(x, 600);
  return /^https:\/\//i.test(url) ? url : undefined;
};
const barcode = (x: unknown) => {
  const value = asText(x, 16);
  return /^\d{8,14}$/.test(value) ? value : '';
};
function tokens(input: string): string[] {
  return input.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/).filter(x => x.length >= 3 && !['для','или','with','and','the','грамм','состав'].includes(x));
}
function related(query: string, title: string, brand: string): number {
  const queryTerms = tokens(query);
  const productTerms = tokens(title + ' ' + brand);
  if (!queryTerms.length || !productTerms.length) return 0;
  let score = 0;
  for (const q of queryTerms) {
    if (productTerms.some(t => t === q)) score += 4;
    else if (q.length >= 5 && productTerms.some(t => t.startsWith(q.slice(0, Math.min(6, q.length))) ||
      q.startsWith(t.slice(0, Math.min(6, t.length))))) score += 2;
  }
  return score;
}
function nutrition(x: unknown): boolean {
  if (!obj(x)) return false;
  return ['energy-kcal_100g','proteins_100g','fat_100g','carbohydrates_100g'].some(k => {
    const v = x[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
  });
}
async function fetchWithDeadline(url: string, ms: number, userAgent?: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { headers: {
      Accept: 'application/json', ...(userAgent ? { 'User-Agent': userAgent } : {}),
    }, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json() as unknown;
  } catch { return null; } finally { clearTimeout(timer); }
}
async function searchOff(query: string): Promise<Candidate[] | null> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '25');
  url.searchParams.set('fields', [
    'code','product_name','product_name_ru','brands','quantity','image_front_small_url',
    'image_front_url','image_url','nutriments','ingredients_text','ingredients_text_ru',
  ].join(','));
  const json = await fetchWithDeadline(url.toString(), 7500,
    'SkannerProduktov/1.0 (https://github.com/mesavin13-droid)');
  if (!obj(json) || !Array.isArray(json.products)) return null;
  const items: Candidate[] = [];
  for (const item of json.products) {
    if (!obj(item)) continue;
    const code = barcode(item.code);
    const name = asText(item.product_name_ru || item.product_name);
    const brand = asText(item.brands, 110);
    const relevance = related(query, name, brand);
    if (!code || !name || relevance === 0) continue;
    items.push({
      code, name, brand, quantity: asText(item.quantity, 60),
      image: imageUrl(item.image_front_small_url || item.image_front_url || item.image_url),
      source: 'off',
      hasNutrition: nutrition(item.nutriments),
      hasIngredients: Boolean(asText(item.ingredients_text_ru || item.ingredients_text)),
      relevance,
    });
  }
  return items;
}
async function searchUpc(query: string): Promise<Candidate[] | null> {
  const url = new URL('https://api.upcitemdb.com/prod/trial/search');
  url.searchParams.set('s', query);
  url.searchParams.set('match_mode', '0');
  url.searchParams.set('type', 'product');
  const json = await fetchWithDeadline(url.toString(), 4500);
  if (!obj(json) || json.code !== 'OK' || !Array.isArray(json.items)) return null;
  const items: Candidate[] = [];
  for (const item of json.items) {
    if (!obj(item)) continue;
    const code = barcode(item.ean || item.gtin || item.upc);
    const name = asText(item.title);
    const brand = asText(item.brand, 110);
    const relevance = related(query, name, brand);
    if (!code || !name || relevance === 0) continue;
    const images = Array.isArray(item.images) ? item.images : [];
    items.push({
      code, name, brand, quantity: '',
      image: imageUrl(images[0]),
      source: 'upcitemdb', hasNutrition: false, hasIngredients: false,
      relevance,
    });
  }
  return items;
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Только GET' });
  const query = typeof req.query.q === 'string' ? req.query.q.replace(/\s+/g, ' ').trim() : '';
  if (query.length < 3 || query.length > 90 || !/[\p{L}\p{N}]/u.test(query)) {
    return res.status(400).json({ error: 'Введите название товара от 3 до 90 символов.' });
  }
  const off = await searchOff(query);
  // Limited UPC free searches: use only when OFF has too few relevant entries.
  const upc = (off?.filter(p => p.hasNutrition).length ?? 0) >= 3 ? [] : await searchUpc(query);
  const results = new Map<string, Candidate>();
  for (const entry of [...(off || []), ...(upc || [])]) {
    const key = entry.code.replace(/^0+/, '');
    const previous = results.get(key);
    if (!previous || (entry.hasNutrition && !previous.hasNutrition) ||
        (entry.source === 'off' && previous.source !== 'off')) results.set(key, entry);
  }
  const items = [...results.values()].sort((a, b) =>
    (b.relevance - a.relevance) || (Number(b.hasNutrition) - Number(a.hasNutrition)))
    .slice(0, 12).map(({ relevance, ...rest }) => rest);
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
  return res.status(200).json({
    query, items, sources: { openFoodFacts: off !== null, upcItemDb: upc !== null },
    warning: 'Поиск по названию может показать похожие товары. Проверьте бренд, вес, упаковку и штрихкод.',
  });
}
