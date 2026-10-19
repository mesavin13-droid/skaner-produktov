import { describe, it, expect } from 'vitest';
import { parseUpcItemDb, sameBarcode } from '../../server/upcItemDb';

describe('independent UPCitemdb barcode lookup', () => {
  const q = '4640150309491';
  it('accepts only exact EAN/GTIN identifiers', () => {
    expect(sameBarcode(q, '0'+q)).toBe(true);
    expect(sameBarcode(q, '4640150309492')).toBe(false);
    expect(parseUpcItemDb({code:'OK',items:[{ean:'4640150309492',title:'WRONG'}]},q)).toBeNull();
  });
  it('provides just product identity, not invented ingredients or BJU', () => {
    const p = parseUpcItemDb({code:'OK', items:[{ean:q, title:'  Продукт 1  ', brand:'Марка',images:['https://example.org/a.jpg']}]},q);
    expect(p?.product_name_ru).toBe('Продукт 1');
    expect(p?.brands).toBe('Марка');
    expect(p?.ingredients_text_ru).toBe('');
    expect(p?.nutriments).toEqual({});
  });
  it('rejects malicious mismatching identity, HTTP images, and empty names', () => {
    expect(parseUpcItemDb({code:'OK',items:[{ean:q,title:'   '}]},q)).toBeNull();
    const p = parseUpcItemDb({code:'OK',items:[{ean:q,title:'Товар',images:['http://localhost/secret']}]},q);
    expect(p?.image_front_url).toBeUndefined();
  });
});
