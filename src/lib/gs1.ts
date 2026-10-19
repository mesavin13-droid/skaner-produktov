/** GS1 Data Matrix parsing. No serials or cryptographic tail are persisted or sent to product APIs. */
export interface MarkingInfo {
  gtin: string;
  expiryDate?: string;
  expiryKind?: 'use-by' | 'best-before';
  productionDate?: string;
}
export function validGtin(gtin: string): boolean {
  if (!/^\d{14}$/.test(gtin)) return false;
  let sum = 0;
  for (let i = 12; i >= 0; i--) sum += Number(gtin[i]) * ((12 - i) % 2 === 0 ? 3 : 1);
  return (10 - sum % 10) % 10 === Number(gtin[13]);
}
function gs1Date(value: string, today = new Date()): string | undefined {
  if (!/^\d{6}$/.test(value)) return;
  const twoDigitYear = Number(value.slice(0, 2));
  const currentYear = today.getFullYear();
  let year = Math.floor(currentYear / 100) * 100 + twoDigitYear;
  if (year < currentYear - 50) year += 100;
  if (year > currentYear + 49) year -= 100;
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12 || day > 31) return;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return;
  const actualDay = day === 0 ? last : day;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
}
/** Parses only correctly delimited GS1 application identifiers; never seeks "17" in serial data. */
export function parseMarking(input: string, today = new Date()): MarkingInfo | null {
  if (!input || input.length > 500) return null;
  const text = input.replace(/^\]d[12]/i, '').replace(/^\u001d/, '').trim();
  const fields: Record<string, string> = {};
  if (text.startsWith('(01)')) {
    const re = /\((\d{2,4})\)([^()]*)/g;
    let offset = 0;
    for (const match of text.matchAll(re)) {
      if (match.index !== offset) return null;
      if (match[1] in fields) return null;
      fields[match[1]] = match[2];
      offset += match[0].length;
    }
    if (offset !== text.length) return null;
  } else {
    const match = /^01(\d{14})/.exec(text);
    if (!match) return null;
    fields['01'] = match[1];
    let pos = match[0].length;
    while (pos < text.length) {
      if (text[pos] === '\u001d') { pos++; continue; }
      const ai = text.slice(pos, pos + 2);
      if (['11', '13', '15', '17'].includes(ai)) {
        const digits = text.slice(pos + 2, pos + 8);
        if (!/^\d{6}$/.test(digits) || ai in fields) return null;
        fields[ai] = digits;
        pos += 8;
        continue;
      }
      if (['10', '21', '91', '92', '93'].includes(ai)) {
        const gs = text.indexOf('\u001d', pos + 2);
        if (gs === -1) break;
        pos = gs + 1;
        continue;
      }
      break;
    }
  }
  const gtin = fields['01'];
  if (!validGtin(gtin || '')) return null;
  const expiryDate = gs1Date(fields['17'] || fields['15'] || '', today);
  const productionDate = gs1Date(fields['11'] || '', today);
  return {
    gtin,
    ...(expiryDate ? { expiryDate, expiryKind: fields['17'] ? 'use-by' as const : 'best-before' as const } : {}),
    ...(productionDate ? { productionDate } : {}),
  };
}
export function formatMarkingDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
export function remainingDays(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
}
