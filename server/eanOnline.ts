/**
 * Optional Russian barcode catalog integration: https://ean-online.ru/api/
 * Public API requires a provider-issued Bearer token. Not automatically enabled.
 * Never expose the token in VITE_ variables or browser requests.
 * Response includes product identity only; do not fabricate nutrition facts.
 */
type RecordLike = Record<string, unknown>;
export interface EanOnlineIdentity {
  code: string;
  product_name_ru: string;
  brands?: string;
  catalog_source: 'ean-online';
  catalog_source_url: string;
  catalog_note: string;
  ingredients_text_ru: '';
  nutriments: Record<string, never>;
}
function obj(x: unknown): x is RecordLike { return typeof x === 'object' && x !== null && !Array.isArray(x); }
export function parseEanOnline(json: unknown, requested: string): EanOnlineIdentity | null {
  if (!/^\d{8,14}$/.test(requested) || !obj(json)) return null;
  const barcode = json.barcode;
  const title = json.name;
  if (typeof barcode !== 'string' || barcode.replace(/^0+/, '') !== requested.replace(/^0+/, '') ||
    typeof title !== 'string' || !title.trim() || title.length > 250) return null;
  const brand = typeof json.vendor === 'string' ? json.vendor.trim().slice(0, 100) : '';
  return {
    code: requested, product_name_ru: title.trim().slice(0, 180),
    ...(brand ? { brands: brand } : {}),
    catalog_source: 'ean-online',
    catalog_source_url: 'https://ean-online.ru/',
    catalog_note: 'Название из российского каталога EAN-online. Точный состав, БЖУ и срок годности не предоставлены; сверьте с упаковкой.',
    ingredients_text_ru: '',
    nutriments: {},
  };
}
export async function lookupEanOnline(code: string): Promise<EanOnlineIdentity | null> {
  const token = process.env.EAN_ONLINE_API_TOKEN?.trim();
  if (!token || !/^\d{8,14}$/.test(code)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`https://ean-online.ru/api/v1/barcode/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseEanOnline(await res.json() as unknown, code);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
