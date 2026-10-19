import { describe, expect, it } from 'vitest';
import { cacheCanServeStale, cacheIsFresh, type CachedRecord } from '../../server/productsCache';

const reference = (): CachedRecord => ({
  barcode: '3017620422003',
  product: { code: '3017620422003', product_name: 'Nutella' },
  source: 'openfoodfacts',
  updated_at: new Date(Date.now() - 60_000).toISOString(),
  expires_at: new Date(Date.now() + 86400_000).toISOString(),
});
describe('shared catalog date policy', () => {
  it('accepts unexpired cached information', () => {
    expect(cacheIsFresh(reference())).toBe(true);
  });
  it('does not confuse expired and fresh cache', () => {
    const row = reference();
    row.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(cacheIsFresh(row)).toBe(false);
    expect(cacheCanServeStale(row)).toBe(true);
  });
  it('refuses data older than 30 days to avoid pretending stale labels are current', () => {
    const row = reference();
    row.updated_at = new Date(Date.now() - 31 * 86400_000).toISOString();
    expect(cacheCanServeStale(row)).toBe(false);
  });
  it('rejects malformed timestamps', () => {
    const row = reference();
    row.updated_at = 'not-a-date';
    row.expires_at = 'not-a-date';
    expect(cacheIsFresh(row)).toBe(false);
    expect(cacheCanServeStale(row)).toBe(false);
  });
});
