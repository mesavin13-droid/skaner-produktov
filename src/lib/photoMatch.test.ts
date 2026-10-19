import { describe,it,expect } from 'vitest';
import { pickPhotoProduct, titleQueries, type PhotoCandidate } from './photoMatch';
const base: PhotoCandidate = {code:'4607111036568',name:'Чебуманы с говядиной',brand:'Горячая штучка',quantity:'280 г',source:'off',hasNutrition:true,hasIngredients:true};
describe('photo front-label exact matching',()=>{
  it('creates name searches from large label words',()=> {
    expect(titleQueries('Горячая штучка\nЧЕБУМАНЫ С ГОВЯДИНОЙ\n280 г')[0]).toContain('горячая');
  });
  it('selects a matching brand and product, not the one with richer nutrition',()=>{
    const wrong={...base,code:'4607111036569',name:'Чебуманы с курицей',hasNutrition:true};
    expect(pickPhotoProduct('Горячая штучка\nЧебуманы с говядиной\n280 г',[wrong,base])?.code).toBe(base.code);
  });
  it('never silently selects among ambiguous products',()=>{
    const other={...base,code:'4607111036569',name:'Чебуманы с говядиной'};
    expect(pickPhotoProduct('Горячая штучка\nЧебуманы с говядиной',[other,base])).toBeNull();
  });
  it('refuses a weak single-word brand match',()=>{
    expect(pickPhotoProduct('Штучка',[base])).toBeNull();
  });
});