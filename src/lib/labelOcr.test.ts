import {describe,it,expect} from 'vitest';
import {parseRussianLabel,createOcrDraft} from './labelOcr';
describe('Russian label OCR parser',()=>{
 it('reads numbers per 100g and ingredients',()=>{
 const r=parseRussianLabel('Состав: вода, сахар, соль, яблочное пюре.\nПищевая ценность на 100 г:\nБелки 2,5 г\nЖиры 3 г\nУглеводы 17,2 г\nЭнергетическая ценность 104 ккал');
 expect(r.nutrients['energy-kcal_100g']).toBe(104);
 expect(r.nutrients.proteins_100g).toBe(2.5);
 expect(r.nutrients.carbohydrates_100g).toBe(17.2);
 expect(r.ingredients).toContain('яблочное');
 });
 it('does not invent per-100g nutrition from portions or arbitrary numerals',()=>{
 const r=parseRussianLabel('Состав: сахар, соль. На порцию 250 г белки 12 жиры 10 углеводы 23. 340 ккал');
 expect(Object.keys(r.nutrients)).toHaveLength(0);
 expect(r.ingredients).toContain('сахар');
 });
 it('rejects impossible nutrient numbers',()=>{
 const r=parseRussianLabel('Пищевая ценность на 100 мл:\nбелки 900 г\nжиры 15 г\nуглеводы 8 г\nкалорийность 90 ккал');
 expect(r.nutrients.proteins_100g).toBeUndefined();
 expect(r.nutrients.fat_100g).toBe(15);
 });
 it('preserves a known barcode but never guesses a brand',()=>{
 const r=createOcrDraft(parseRussianLabel('Состав: вода, яблоко'), '4640150309491');
 expect(r.code).toBe('4640150309491');
 expect(r.name).toBe('');
 });
});