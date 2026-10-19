import {describe,it,expect} from 'vitest';
import {parseFoodBaseResponse} from '../../server/foodBase';
describe('FoodBase licensed provider',()=>{
 it('maps macros for an exact barcode, with missing ingredient label',()=>{
 const p=parseFoodBaseResponse({data:[{barcode:'4607053473803',name:'Кефир',brand:'Простоквашино',per_100g:{kcal:57,protein:3,fat:3.2,carbs:4}}],meta:{attribution:'Данные: FoodBase'}},'4607053473803');
 expect(p?.product_name_ru).toBe('Кефир');
 expect((p?.nutriments as Record<string,number>)?.['energy-kcal_100g']).toBe(57);
 expect(p?.ingredients_text_ru).toBe('');
 });
 it('rejects another product barcode and invalid calories',()=>{
 const p=parseFoodBaseResponse({data:[{barcode:'4607053473804',name:'Wrong'}]},'4607053473803');
 expect(p).toBeNull();
 const q=parseFoodBaseResponse({data:[{barcode:'4607053473803',name:'Test',per_100g:{kcal:9999}}]},'4607053473803');
 expect((q?.nutriments as Record<string,number>)?.['energy-kcal_100g']).toBeUndefined();
 });
});