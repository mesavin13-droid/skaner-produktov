import type { Product, Profile, SavedProduct } from '../types';

const HISTORY = 'skaner-products-history-v1';
const FAVORITES = 'skaner-products-favorites-v1';
const PROFILE = 'skaner-products-profile-v1';
const CACHE = 'skaner-products-cache-v1';

function read<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* заполненное или отключённое хранилище */ }
}
export function getHistory(): SavedProduct[] { return read<SavedProduct[]>(HISTORY, []); }
export function addHistory(product: Product): SavedProduct[] {
  const updated = [ { product, scannedAt: Date.now() }, ...getHistory().filter(item => item.product.code !== product.code) ].slice(0, 50);
  write(HISTORY, updated);
  return updated;
}
export function getFavorites(): Product[] { return read<Product[]>(FAVORITES, []); }
export function toggleFavorite(product: Product): Product[] {
  const current = getFavorites();
  const next = current.some(p => p.code === product.code) ? current.filter(p => p.code !== product.code) : [product, ...current].slice(0, 50);
  write(FAVORITES, next);
  return next;
}
export function getProfile(): Profile { return read<Profile>(PROFILE, { allergens: [], diet: 'none', calories: 2000 }); }
export function setProfile(profile: Profile) { write(PROFILE, profile); }
interface CacheItem { product: Product; time: number; }
export function getCached(code: string): Product | null {
  const cached = read<Record<string, CacheItem>>(CACHE, {});
  const item = cached[code];
  if (!item || !item.product) return null;
  const age = Date.now() - item.time;
  const source = item.product.source;
  // Identity-only external records are short-lived to avoid stale labels, but
  // are reused briefly to respect the secondary provider's free rate limits.
  const ttlHours = source === 'upcitemdb' ? 12 : source === 'barcode-catalog' || source === 'national-catalog' ? 24 : 48;
  return age >= 0 && age < ttlHours * 3600_000 ? item.product : null;
}
export function setCached(product: Product): void {
  const cached = read<Record<string, CacheItem>>(CACHE, {});
  cached[product.code] = { product, time: Date.now() };
  const trimmed = Object.entries(cached).sort((a, b) => b[1].time - a[1].time).slice(0, 70);
  write(CACHE, Object.fromEntries(trimmed));
}
