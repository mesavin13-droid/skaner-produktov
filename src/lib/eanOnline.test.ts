import { describe, it, expect } from 'vitest';
import { parseEanOnline } from '../../server/eanOnline';
describe('Russian EAN-online barcode adapter',()=>{
 const code='4640150309491';
 it('keeps only exact barcode identity and leaves nutrition unknown',()=>{
  expect(parseEanOnline({barcode:'4640150309492',name:'wrong'},code)).toBeNull();
  const p=parseEanOnline({barcode:code,name:'Тестовый продукт',vendor:'Производитель'},code);
  expect(p?.product_name_ru).toBe('Тестовый продукт');
  expect(p?.ingredients_text_ru).toBe('');
  expect(p?.nutriments).toEqual({});
 });
 it('rejects missing fields without guessing',()=>{
  expect(parseEanOnline({name:'Без кода'},code)).toBeNull();
  expect(parseEanOnline({barcode:code},code)).toBeNull();
 });
});