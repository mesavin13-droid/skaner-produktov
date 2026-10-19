/**
 * Conservative matching of packaging OCR to food catalog candidates.
 * Never pick a different flavour/variant to get "complete" nutrition.
 */
export interface PhotoCandidate {
  code: string;
  name: string;
  brand: string;
  quantity: string;
  image?: string;
  hasNutrition: boolean;
  hasIngredients: boolean;
  source: 'off' | 'upcitemdb';
}
const unwanted = /^(состав|пищевая|ценность|энергетическая|продукт|продукта|изготовитель|хранить|срок|годности|масса|массы|нетто|ingredients|nutrition|мл|россии|условия|ккал|белки|жиры|углеводы|стандарт)$/i;
export function words(value: string): string[] {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/).filter(w => w.length >= 3 && !unwanted.test(w));
}
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  const min = Math.min(a.length, b.length);
  return a.slice(0, Math.min(5, min)) === b.slice(0, Math.min(5, min));
}
function overlap(a: string[], b: string[]): number {
  return a.filter(w => b.some(x => similar(w, x))).length;
}
export function titleQueries(raw: string): string[] {
  const lines = raw.split(/\n+/).map(l => l.trim().replace(/\s+/g, ' '))
    .filter(line => line.length >= 4 && line.length <= 65 &&
      /[a-zа-яё]/i.test(line) &&
      !/^(состав|ingredients|пищевая|белки|жиры|углеводы|срок|адрес|изготовитель|на 100)/i.test(line));
  const selected = lines.slice(0, 6).map(line => words(line).slice(0, 5).join(' '))
    .filter(x => words(x).length > 0);
  const queries = [
    selected.slice(0, 2).join(' '),
    selected[0],
    selected[1],
    selected[2],
  ].map(q => q.trim()).filter(q => q.length >= 3 && q.length <= 90);
  return [...new Set(queries)].slice(0, 3);
}
export interface RankedCandidate { product: PhotoCandidate; score: number; nameCoverage: number; hits: number }
export function pickPhotoProduct(raw: string, candidates: PhotoCandidate[]): PhotoCandidate | null {
  // Match against only the first lines of OCR: side/back label contains many unrelated words.
  const visible = words(raw.split(/\n/).slice(0, 8).join(' '));
  if (!visible.length) return null;
  const ranked: RankedCandidate[] = candidates
    .filter(c => /^\d{8,14}$/.test(c.code) && c.name.trim())
    .map(product => {
      const title = words(product.name);
      const brand = words(product.brand);
      const nameHits = overlap(title, visible);
      const brandHits = overlap(brand, visible);
      const weight = words(product.quantity).filter(w => /\d/.test(w));
      const weightHits = overlap(weight, visible);
      const nameCoverage = title.length ? nameHits / title.length : 0;
      const hits = nameHits + brandHits;
      const score = nameHits * 4 + brandHits * 3 + weightHits * 2 -
        Math.max(0, title.length - nameHits) * 2;
      return { product, score, nameCoverage, hits };
    })
    .sort((a, b) => b.score - a.score);
  const first = ranked[0], second = ranked[1];
  if (!first || first.hits < 2 || first.nameCoverage < .65 || first.score < 7) return null;
  // A close alternative is an unresolved variant, not a safe automatic match.
  if (second && second.product.code !== first.product.code && second.score >= first.score - 2) return null;
  return first.product;
}
