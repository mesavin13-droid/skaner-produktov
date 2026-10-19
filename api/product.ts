import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNationalCatalogProduct } from '../server/nationalCatalog';

const FIELDS = 'code,product_name,product_name_ru,brands,quantity,serving_size,image_url,image_front_url,image_front_small_url,nutriments,ingredients_text,ingredients_text_ru,ingredients_tags,additives_tags,allergens_tags,traces_tags,nutrition_grades,nutriscore_grade,nova_group,categories_tags,labels_tags,ingredients_analysis_tags,packaging_tags';
const BARCODE = /^\d{8,14}$/;
const APP_CONTACT_URL = process.env.APP_CONTACT_URL || 'https://github.com/mesavin13-droid';
const CACHE_TTL = 'public, s-maxage=3600, stale-while-revalidate=86400';
// Exact GTIN identity independently verified. Nutrition is unknown (never inferred).
const VERIFIED_FALLBACKS: Record<string, {product_name_ru: string; quantity: string; catalog_source: string; catalog_source_url: string}> = {
  '4660008080136': {
    product_name_ru: 'Морс клюквенный', quantity: '1 л', catalog_source: 'barcode-catalog',
    catalog_source_url: 'https://barcode-list.ru/barcode/RU/%D0%9F%D0%BE%D0%B8%D1%81%D0%BA.htm?barcode=%D0%BA%D0%BB%D1%8E%D0%BA%D0%B2%D0%B5%D0%BD%D0%BD%D1%8B%D0%B9'
  }
};
function verifiedFallback(code: string, res: VercelResponse) {
  const known = VERIFIED_FALLBACKS[code];
  if (!known) return null;
  res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json({status: 1, code, product: {
    code, ...known, nutriments: {}, ingredients_text_ru: '', ingredients_tags: [], allergens_tags: []
  }});
}

async function alternative(code: string, res: VercelResponse, status: 404 | 502) {
  // Enabled only with a legitimate catalog API key configured on the server.
  const national = await getNationalCatalogProduct(code);
  if (national) {
    res.setHeader('Cache-Control', CACHE_TTL);
    return res.status(200).json({ status: 1, code, product: national });
  }
  const known = verifiedFallback(code, res);
  if (known) return known;
  if (status === 404) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(404).json({ status: 0 });
  }
  return res.status(502).json({ error: 'Сервис продуктов недоступен' });
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Только GET' });
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!BARCODE.test(code)) return res.status(400).json({ error: 'Некорректный штрихкод' });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let upstream: Response;
    try {
      upstream = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, {
        headers: { 'User-Agent': `SkannerProduktov/1.0 (${APP_CONTACT_URL})`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    if (upstream.status === 404) return alternative(code, res, 404);
    if (!upstream.ok) return alternative(code, res, 502);
    const data = await upstream.json() as { status?: number };
    res.setHeader('Cache-Control', CACHE_TTL);
    if (data.status !== 1) return alternative(code, res, 404);
    return res.status(200).json(data);
  } catch {
    return alternative(code, res, 502);
  }
}
