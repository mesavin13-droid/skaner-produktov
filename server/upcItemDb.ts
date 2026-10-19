/**
 * UPCitemdb is a SECOND independent barcode identity provider.
 * It does not provide authoritative food composition or nutrition.
 * Free trial: 100 calls/day, 6 lookups/minute (shared Vercel IP).
 * Do not store or redistribute UPCitemdb data in the shared Supabase database
 * without confirming the provider's licensing terms.
 */
type AnyRecord = Record<string, unknown>;
export interface UpcIdentity {
  code: string;
  product_name_ru: string;
  brands?: string;
  image_front_url?: string;
  catalog_source: 'upcitemdb';
  catalog_source_url: string;
  catalog_note: string;
  nutriments: Record<string, never>;
  ingredients_text_ru: '';
}
const isRecord = (v: unknown): v is AnyRecord => !!v && typeof v === 'object' && !Array.isArray(v);
const CODE = /^\d{8,14}$/;
export function sameBarcode(a: string, b: string): boolean {
  return CODE.test(a) && CODE.test(b) && a.replace(/^0+/, '') === b.replace(/^0+/, '');
}
export function parseUpcItemDb(result: unknown, code: string): UpcIdentity | null {
  if (!CODE.test(code) || !isRecord(result) || result.code !== 'OK' || !Array.isArray(result.items)) return null;
  for (const item of result.items) {
    if (!isRecord(item)) continue;
    const identifiers = [item.ean, item.upc, item.gtin].filter((v): v is string => typeof v === 'string');
    if (!identifiers.some(id => sameBarcode(code, id))) continue;
    const name = typeof item.title === 'string' ? item.title.trim().slice(0, 180) : '';
    if (!name || /^unknown|^unnamed|^n\/a$/i.test(name)) continue;
    const brand = typeof item.brand === 'string' ? item.brand.trim().slice(0, 100) : '';
    const photoCandidate = Array.isArray(item.images) && typeof item.images[0] === 'string' ? item.images[0] : '';
    const photo = photoCandidate.startsWith('https://') && photoCandidate.length <= 800 ? photoCandidate : undefined;
    return {
      code, product_name_ru: name,
      ...(brand ? { brands: brand } : {}),
      ...(photo ? { image_front_url: photo } : {}),
      catalog_source: 'upcitemdb',
      catalog_source_url: 'https://www.upcitemdb.com/',
      catalog_note: 'Название и фото из дополнительного каталога UPCitemdb. Данные о составе, БЖУ и сроке годности не подтверждены; сверьте с упаковкой.',
      nutriments: {}, ingredients_text_ru: '',
    };
  }
  return null;
}
export async function lookupUpcItemDb(code: string): Promise<UpcIdentity | null> {
  if (!CODE.test(code)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3800);
  try {
    const url = new URL('https://api.upcitemdb.com/prod/trial/lookup');
    url.searchParams.set('upc', code);
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    // 404 = not found, 429 = provider quota reached. Never equate either with missing data everywhere.
    if (!r.ok) return null;
    const json: unknown = await r.json();
    return parseUpcItemDb(json, code);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
