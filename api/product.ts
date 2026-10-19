import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNationalCatalogProduct } from '../server/nationalCatalog';
import { lookupUpcItemDb } from '../server/upcItemDb';
import { lookupEanOnline } from '../server/eanOnline';
import {
  cacheCanServeStale, cacheIsFresh, readSharedProduct, saveSharedProduct,
  type CacheSource, type CachedRecord,
} from '../server/productsCache';

const FIELDS = 'code,product_name,product_name_ru,brands,quantity,serving_size,image_url,image_front_url,image_front_small_url,nutriments,ingredients_text,ingredients_text_ru,ingredients_tags,additives_tags,allergens_tags,traces_tags,nutrition_grades,nutriscore_grade,nova_group,categories_tags,labels_tags,ingredients_analysis_tags,packaging_tags';
const BARCODE = /^\d{8,14}$/;
const APP_CONTACT_URL = process.env.APP_CONTACT_URL || 'https://github.com/mesavin13-droid';
const CACHE_TTL = 'public, s-maxage=1800, stale-while-revalidate=3600';

type ProductRow = Record<string, unknown>;
const VERIFIED_FALLBACKS: Record<string, ProductRow> = {
  '4607111036568': {
    code: '4607111036568',
    product_name_ru: 'Чебуманы с говядиной',
    brands: 'Горячая штучка',
    quantity: '280 г',
    catalog_source: 'barcode-catalog',
    catalog_source_url: 'https://sostavista.ru/tovar/goryachaya-shtuchka-chebumany-goryachaya-shtuchka-s-govyadinoi-zamorozhe',
    catalog_note: 'Название и БЖУ приведены по независимому каталогу. Сверьте их с этикеткой вашей упаковки.',
    ingredients_text_ru: '',
    nutriments: {
      'energy-kcal_100g': 270,
      proteins_100g: 7,
      fat_100g: 14,
      carbohydrates_100g: 28,
    },
  },
  '4660008080136': {
    code: '4660008080136',
    product_name_ru: 'Морс клюквенный',
    quantity: '1 л', catalog_source: 'barcode-catalog',
    catalog_source_url: 'https://barcode-list.ru/',
    ingredients_text_ru: '', nutriments: {},
  },
  '4606419017033': {
    code: '4606419017033',
    product_name_ru: 'Сметанный продукт «Альпийская коровка», 20%',
    quantity: '400 г', catalog_source: 'barcode-catalog',
    catalog_source_url: 'https://barcode-list.ru/',
    ingredients_text_ru: '', nutriments: {},
  },
};
function matches(code: string, field: unknown) {
  return typeof field === 'string' && BARCODE.test(field) &&
    field.replace(/^0+/, '') === code.replace(/^0+/, '');
}
function sendProduct(res: VercelResponse, code: string, product: ProductRow, cache?: {
  status: 'fresh' | 'stale'; updatedAt: string; source: CacheSource;
}) {
  if (cache?.status === 'stale') res.setHeader('Cache-Control', 'no-store');
  else res.setHeader('Cache-Control', CACHE_TTL);
  return res.status(200).json({
    status: 1, code, product,
    ...(cache ? { cache: { status: cache.status, updated_at: cache.updatedAt, origin: cache.source } } : {}),
  });
}
function sendFromShared(res: VercelResponse, code: string, cached: CachedRecord, status: 'fresh' | 'stale') {
  return sendProduct(res, code, cached.product, {
    status, updatedAt: cached.updated_at, source: cached.source,
  });
}
async function saveAndSend(res: VercelResponse, code: string, raw: ProductRow, source: CacheSource) {
  // Failed cache writes never prevent showing verified source data.
  await saveSharedProduct(code, raw, source);
  return sendProduct(res, code, raw);
}
async function tryNationalOrFallback(code: string): Promise<{ product: ProductRow; source: CacheSource } | null> {
  const national = await getNationalCatalogProduct(code);
  if (national && matches(code, national.code))
    return { product: national as unknown as ProductRow, source: 'national-catalog' };
  const verified = VERIFIED_FALLBACKS[code];
  return verified ? { product: verified, source: 'barcode-catalog' } : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Только GET' });
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!BARCODE.test(code)) return res.status(400).json({ error: 'Некорректный штрихкод' });

  // Best-effort shared catalog: the scanner remains functional with no Supabase configuration.
  const shared = await readSharedProduct(code);
  if (shared && cacheIsFresh(shared)) return sendFromShared(res, code, shared, 'fresh');

  let notFound = false;
  let partialOpenFoodFacts: ProductRow | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4400);
    let upstream: Response;
    try {
      upstream = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, {
        headers: { 'User-Agent': `SkannerProduktov/1.0 (${APP_CONTACT_URL})`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    if (upstream.ok) {
      const data = await upstream.json() as { status?: number; product?: ProductRow };
      if (data.status === 1 && data.product && matches(code, data.product.code)) {
        const raw = data.product;
        const name = String(raw.product_name_ru || raw.product_name || '').trim();
        const curated = VERIFIED_FALLBACKS[code];
        if (curated) {
          // Same GTIN: preserve the photo and any ingredients that OFF really has.
          // The fallback contributes an independently documented identity, not guessed ingredients.
          const merged: ProductRow = {
            ...raw, ...curated,
            image_url: raw.image_url,
            image_front_url: raw.image_front_url,
            image_front_small_url: raw.image_front_small_url,
            ingredients_text: raw.ingredients_text || '',
            ingredients_text_ru: raw.ingredients_text_ru || '',
            nutriments: { ...(curated.nutriments as ProductRow || {}), ...(raw.nutriments as ProductRow || {}) },
          };
          if (name && !/^товар\\s*\\d+$/i.test(name)) {
            merged.product_name_ru = raw.product_name_ru || raw.product_name;
          }
          return saveAndSend(res, code, merged, 'barcode-catalog');
        }
        if (name && !/^товар\\s*\\d+$/i.test(name)) {
          return saveAndSend(res, code, raw, 'openfoodfacts');
        }
        // Partial OFF record: keep its image but search other catalogs for an exact GTIN.
        // Do not cache unnamed or placeholder-only records as authoritative facts.
        partialOpenFoodFacts = raw;
      }
      notFound = data.status === 0;
    } else if (upstream.status === 404) {
      notFound = true;
    }
  } catch {
    // Upstream connection and timeouts are handled by the fallback chain.
  }

  const fallback = await tryNationalOrFallback(code);
  if (fallback) return saveAndSend(res, code, fallback.product, fallback.source);

  // Russian barcode catalog if an authorized token is configured; no token = no request.
  const russianIdentity = await lookupEanOnline(code);
  if (russianIdentity) {
    res.setHeader('Cache-Control', 'public, s-maxage=900');
    return res.status(200).json({ status: 1, code, product: russianIdentity, incomplete: true });
  }

  // Public, independent identifier lookup (100 requests/day and 6/min on free plan).
  // It does NOT give verified nutrition. Do not copy its data into our shared
  // persistent cache until its redistribution licensing is confirmed.
  const item = await lookupUpcItemDb(code);
  if (item) {
    const enriched: ProductRow = {
      ...item,
      image_front_url: item.image_front_url || partialOpenFoodFacts?.image_front_url || partialOpenFoodFacts?.image_url,
    };
    res.setHeader('Cache-Control', 'public, s-maxage=900');
    return res.status(200).json({ status: 1, code, product: enriched, incomplete: true });
  }

  // When UPCitemdb does not know the code either, an image-only OFF record
  // remains useful as a partial product, but must be clearly labeled.
  if (partialOpenFoodFacts) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ status: 1, code, product: partialOpenFoodFacts, incomplete: true });
  }

  // If the source is down or the product was deleted, keep a previously verified
  // record accessible for at most 30 days, clearly labeled as stale in the UI.
  if (shared && cacheCanServeStale(shared))
    return sendFromShared(res, code, shared, 'stale');

  if (notFound) {
    res.setHeader('Cache-Control', 'public, s-maxage=120');
    return res.status(404).json({ status: 0, code });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({ error: 'Источники сведений временно не ответили', code: 'SOURCE_UNAVAILABLE' });
}
