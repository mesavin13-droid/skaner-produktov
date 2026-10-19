/** Optional authorized integration with the Russian National Catalog.
 * Not a consumer-facing True API authenticity check. Never expose API key to the client.
 */
interface Dict { [key: string]: unknown }
export interface NationalProduct {
  code: string;
  product_name_ru: string;
  brands?: string;
  ingredients_text_ru?: string;
  nutriments: Record<string, never>;
  catalog_source: 'national-catalog';
  catalog_source_url: string;
}
function obj(value: unknown): Dict | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Dict : null;
}
function txt(value: unknown, max = 250): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function sameGtin(a: string, b: string) { return a.replace(/^0+/, '') === b.replace(/^0+/, ''); }
export async function getNationalCatalogProduct(code: string): Promise<NationalProduct | null> {
  const key = process.env.NATIONAL_CATALOG_API_KEY;
  if (!key || !/^\d{8,14}$/.test(code)) return null;
  const gtin = code.padStart(14, '0');
  const url = new URL('https://апи.национальный-каталог.рф/v3/product');
  url.searchParams.set('gtin', gtin);
  url.searchParams.set('apikey', key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const result = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!result.ok) return null; // Credentials, quotas and unavailable goods fail closed.
    const json: unknown = await result.json();
    const root = obj(json);
    const payload = obj(root?.result) || obj(root?.data) || obj(root?.product) || root;
    if (!payload) return null;
    const returnedGtin = txt(payload.gtin ?? payload.GTIN ?? payload.code, 32);
    if (!returnedGtin || !sameGtin(returnedGtin, gtin)) return null;
    const name = txt(payload.good_name ?? payload.name ?? payload.product_name, 180);
    if (!name) return null;
    // Only explicit composition text from a named attribute may be used as ingredients.
    const attrs = Array.isArray(payload.attributes) ? payload.attributes : [];
    const composition = attrs.map(obj).find(a => a && ['состав', 'состав продукта', 'ингредиенты'].includes(txt(a.attr_name ?? a.name ?? a.attribute_name, 100).toLowerCase()));
    const ingredients = txt(composition?.attr_value ?? composition?.value, 2500);
    return {
      code, product_name_ru: name,
      brands: txt(payload.brand_name ?? payload.brand, 100),
      ingredients_text_ru: ingredients, nutriments: {},
      catalog_source: 'national-catalog',
      catalog_source_url: 'https://национальный-каталог.рф/',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
