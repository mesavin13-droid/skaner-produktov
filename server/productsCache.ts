/**
 * Shared read-through cache for public product records.
 * This module is imported ONLY by serverless endpoints. Never use in src/.
 * Local manual entries, photos, GS1 serials and user profiles never enter this table.
 */
type JsonObject = Record<string, unknown>;
export type CacheSource = 'openfoodfacts' | 'national-catalog' | 'barcode-catalog';
export interface CachedRecord {
  barcode: string;
  product: JsonObject;
  source: CacheSource;
  updated_at: string;
  expires_at: string;
}

const CODE = /^\d{8,14}$/;
function config() {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!base || !key) return null;
  try {
    const u = new URL(base);
    if (u.protocol !== 'https:' || !/\.supabase\.co$/i.test(u.hostname)) return null;
    return { base: u.origin, key };
  } catch { return null; }
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function safelyMatches(expected: string, actual: unknown): boolean {
  if (typeof actual !== 'string' || !CODE.test(actual)) return false;
  // Allow a zero-padded GTIN-14 form of the same EAN-13 but no different product.
  return actual.replace(/^0+/, '') === expected.replace(/^0+/, '');
}
function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}
function headers(key: string): Record<string, string> {
  // Modern sb_secret keys are opaque, not JWTs; the gateway resolves their role.
  // Only legacy service_role JWTs belong in the Authorization header.
  return key.startsWith('sb_secret_')
    ? { apikey: key, Accept: 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
}

export async function readSharedProduct(barcode: string): Promise<CachedRecord | null> {
  const env = config();
  if (!env || !CODE.test(barcode)) return null;
  const url = new URL(env.base + '/rest/v1/products_cache');
  url.searchParams.set('select', 'barcode,product,source,updated_at,expires_at');
  url.searchParams.set('barcode', `eq.${barcode}`);
  url.searchParams.set('limit', '1');
  const t = timeoutSignal(1700);
  try {
    const res = await fetch(url, { headers: headers(env.key), signal: t.signal });
    if (!res.ok) return null;
    const rows: unknown = await res.json();
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const row = rows[0] as Record<string, unknown>;
    if (row.barcode !== barcode || !isObject(row.product) || !safelyMatches(barcode, row.product.code)) return null;
    if (typeof row.updated_at !== 'string' || typeof row.expires_at !== 'string') return null;
    const source = row.source;
    if (!['openfoodfacts', 'national-catalog', 'barcode-catalog'].includes(String(source))) return null;
    return row as unknown as CachedRecord;
  } catch { return null; }
  finally { t.done(); }
}

export function cacheIsFresh(row: CachedRecord): boolean {
  const until = Date.parse(row.expires_at);
  return Number.isFinite(until) && until > Date.now();
}
/** Cache fallback only for last 30 days; ingredient data changes over time. */
export function cacheCanServeStale(row: CachedRecord): boolean {
  const updated = Date.parse(row.updated_at);
  return Number.isFinite(updated) && updated <= Date.now() && Date.now() - updated < 30 * 86400_000;
}

const TTLS: Record<CacheSource, number> = {
  'openfoodfacts': 48 * 3600_000,
  'national-catalog': 24 * 3600_000,
  'barcode-catalog': 3 * 3600_000,
};

/** Write only validated public records originating from server-controlled sources. */
export async function saveSharedProduct(barcode: string, product: JsonObject, source: CacheSource): Promise<boolean> {
  const env = config();
  if (!env || !CODE.test(barcode) || !isObject(product) || !safelyMatches(barcode, product.code)) return false;
  if (typeof (product.product_name_ru ?? product.product_name) !== 'string') return false;
  const serialized = JSON.stringify(product);
  if (serialized.length > 150_000) return false;
  const now = Date.now();
  const body = JSON.stringify([{
    barcode, product, source,
    updated_at: new Date(now).toISOString(),
    expires_at: new Date(now + TTLS[source]).toISOString(),
  }]);
  const url = new URL(env.base + '/rest/v1/products_cache');
  url.searchParams.set('on_conflict', 'barcode');
  const t = timeoutSignal(1500);
  try {
    const response = await fetch(url, {
      method: 'POST', signal: t.signal,
      headers: { ...headers(env.key), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body,
    });
    return response.ok;
  } catch { return false; }
  finally { t.done(); }
}
