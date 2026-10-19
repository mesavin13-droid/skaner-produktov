import type { VercelRequest, VercelResponse } from '@vercel/node';

const FIELDS = 'code,product_name,product_name_ru,brands,quantity,serving_size,image_url,image_front_url,image_front_small_url,nutriments,ingredients_text,ingredients_text_ru,ingredients_tags,additives_tags,allergens_tags,traces_tags,nutrition_grades,nutriscore_grade,nova_group,categories_tags,labels_tags,ingredients_analysis_tags,packaging_tags';
const BARCODE = /^\d{8,14}$/;
const APP_CONTACT_URL = process.env.APP_CONTACT_URL || 'https://github.com/mesavin13-droid';
const CACHE_TTL = 'public, s-maxage=3600, stale-while-revalidate=86400';

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
    if (upstream.status === 404) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(404).json({ status: 0 }); }
    if (!upstream.ok) return res.status(502).json({ error: 'Сервис продуктов недоступен' });
    const data = await upstream.json() as { status?: number };
    res.setHeader('Cache-Control', CACHE_TTL);
    if (data.status !== 1) return res.status(404).json({ status: 0 });
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: 'Не удалось получить товар' });
  }
}
