import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Images are never stored by this endpoint; the caller must request consent before upload. */
const IMAGE_DATA = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
type Mode = 'package' | 'food';
type UnknownDict = Record<string, unknown>;

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'brand', 'ingredients', 'sugar', 'salt', 'saturatedFat', 'transFat', 'protein', 'fat', 'carbohydrates', 'fiber', 'calories', 'calorieMin', 'calorieMax', 'nova', 'servingSize', 'allergens', 'confidence', 'notes'],
  properties: {
    name: { type: 'string' }, brand: { type: 'string' }, ingredients: { type: 'string' },
    sugar: { type: ['number', 'null'] }, salt: { type: ['number', 'null'] }, saturatedFat: { type: ['number', 'null'] },
    transFat: { type: ['number', 'null'] }, protein: { type: ['number', 'null'] }, fat: { type: ['number', 'null'] },
    carbohydrates: { type: ['number', 'null'] }, fiber: { type: ['number', 'null'] }, calories: { type: ['number', 'null'] },
    calorieMin: { type: ['number', 'null'] }, calorieMax: { type: ['number', 'null'] },
    nova: { type: ['integer', 'null'] }, servingSize: { type: 'string' },
    allergens: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, notes: { type: 'string' },
  },
};

const numeric = (v: unknown, maximum = 100): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= maximum ? v : null;
const str = (v: unknown, max = 500): string => typeof v === 'string' ? v.trim().slice(0, max) : '';
function isObject(x: unknown): x is UnknownDict { return typeof x === 'object' && x !== null && !Array.isArray(x); }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Только POST' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Распознавание фото пока не подключено: администратору нужно настроить ключ ИИ.' });
  const mode: Mode = req.body?.mode;
  const image: unknown = req.body?.image;
  if ((mode !== 'package' && mode !== 'food') || typeof image !== 'string') return res.status(400).json({ error: 'Выберите тип фотографии.' });
  const match = IMAGE_DATA.exec(image);
  if (!match || match[2].length > 3_700_000) return res.status(413).json({ error: 'Загрузите JPEG, PNG или WebP размером до 2,7 МБ.' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const prompt = mode === 'package'
      ? `Прочитай фото упаковки или состава продукта. Извлекай цифры только если они ЯВНО написаны на этикетке на 100 г/мл. Не выдумывай значения, состав или аллергенные метки. Если фото не позволяет прочитать, укажи null и низкую confidence. Не делай выводов о диагнозах.`
      : `Определи видимый продукт/еду. Это оценка по виду, не лабораторный анализ. Название опиши конкретно, если возможно. Для калорий на 100 г дай правдоподобный диапазон calorieMin/calorieMax. НЕ притворяйся, что видишь пищевую этикетку: calories и остальные числа поставь null, если их нельзя прочесть. Состав оставь пустым, NOVA null, аллергены не заявляй уверенно. В notes напиши, что точность зависит от рецептуры, размера и приготовления.`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini',
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_schema', json_schema: { name: 'food_photo_reading', strict: true, schema } },
        messages: [
          { role: 'system', content: 'Ты извлекаешь сведения о продуктах на русском. Не придумывай факты, не интерпретируй E-добавки как автоматически вредные. Возвращай JSON по схеме. Все числовые значения на 100 грамм или 100 мл. Никогда не давай медицинских советов.' },
          { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image, detail: 'high' } }] },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Do not forward provider error details or credentials to the client.
      return res.status(response.status === 429 ? 429 : 502).json({ error: response.status === 429 ? 'Сервис временно перегружен. Попробуйте позже.' : 'Сервис распознавания пока недоступен.' });
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'Не удалось прочитать фото. Попробуйте снять упаковку крупнее.' });
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { return res.status(502).json({ error: 'Не удалось разобрать ответ распознавания.' }); }
    if (!isObject(parsed)) return res.status(502).json({ error: 'Не удалось разобрать данные товара.' });
    const result = {
      name: str(parsed.name, 110), brand: str(parsed.brand, 80), ingredients: mode === 'package' ? str(parsed.ingredients, 2500) : '',
      calories: mode === 'package' ? numeric(parsed.calories, 1000) : null,
      calorieMin: mode === 'food' ? numeric(parsed.calorieMin, 1000) : null,
      calorieMax: mode === 'food' ? numeric(parsed.calorieMax, 1000) : null,
      protein: mode === 'package' ? numeric(parsed.protein) : null,
      fat: mode === 'package' ? numeric(parsed.fat) : null,
      carbohydrates: mode === 'package' ? numeric(parsed.carbohydrates) : null,
      sugar: mode === 'package' ? numeric(parsed.sugar) : null,
      salt: mode === 'package' ? numeric(parsed.salt) : null,
      saturatedFat: mode === 'package' ? numeric(parsed.saturatedFat) : null,
      transFat: mode === 'package' ? numeric(parsed.transFat) : null,
      fiber: mode === 'package' ? numeric(parsed.fiber) : null,
      nova: mode === 'package' && [1, 2, 3, 4].includes(parsed.nova as number) ? parsed.nova : null,
      servingSize: mode === 'package' ? str(parsed.servingSize, 40) : '',
      allergens: mode === 'package' && Array.isArray(parsed.allergens) ? parsed.allergens.filter((s): s is string => typeof s === 'string').slice(0, 12).map(s => s.slice(0, 60)) : [],
      confidence: parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low',
      notes: str(parsed.notes, 450),
    };
    if (!result.name) return res.status(422).json({ error: 'Продукт не удалось определить. Попробуйте другое фото.' });
    if (mode === 'food' && result.calorieMin != null && result.calorieMax != null && result.calorieMax < result.calorieMin) {
      [result.calorieMin, result.calorieMax] = [result.calorieMax, result.calorieMin];
    }
    return res.status(200).json(result);
  } catch {
    return res.status(504).json({ error: 'Распознавание заняло слишком много времени. Попробуйте ещё раз.' });
  } finally {
    clearTimeout(timeout);
  }
}
