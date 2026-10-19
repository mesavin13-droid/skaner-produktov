import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { explainProduct } from './explain';

const base: Product = {
 code:'1234567890123', name:'Продукт', brand:'', quantity:'250 г', servingSize:'250 г',
 ingredients:'', ingredientsTags:[],allergensTags:[],tracesTags:[],additivesTags:[],
 categoriesTags:[],labelsTags:[],ingredientsAnalysisTags:[],nutriments:{},
};
describe('human explanations',()=>{
 it('explains NOVA4 and ingredients without declaring E-additives automatically harmful',()=>{
  const result=explainProduct({...base,novaGroup:4, ingredients:'Начинка: мясо механической обвалки, соль, нитрит натрия, сыр, белок соевый, сахар. На предприятии также используются: кунжут, орехи', additivesTags:['en:e250','en:e450','en:e451','en:e452','en:e412']});
  expect(result.verdict).toMatch(/не делать ежедневным/);
  expect(result.points.map(x=>x.title)).toContain('Есть нитрит натрия');
  expect(result.allergenNames).toContain('Молоко');
  expect(result.allergenNames).toContain('Соя');
  expect(result.allergenNames).not.toContain('Орехи');
  expect(result.points.every(x=>!x.explanation.includes('все вредны'))).toBe(true);
 });
 it('never treats unknown sugar as zero',()=>{
  const result=explainProduct({...base, ingredients:'Вода, сахар, мука'});
  expect(result.points.some(x=>x.title==='Есть сахар')).toBe(true);
  expect(result.points.some(x=>x.explanation.includes('количество') && x.explanation.includes('неизвестно'))).toBe(true);
 });
 it('shows missing data rather than a made-up positive verdict',()=>{
  expect(explainProduct(base).verdict).toBe('Пока недостаточно данных');
 });
});