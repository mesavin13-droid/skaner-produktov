import type { Nutriments, Product } from '../types';

export interface LabelRead {
  ingredients: string;
  nutrients: Nutriments;
  hasBasis100: boolean;
  warnings: string[];
}
const num=(input: string): number|null=>{
  const x=Number(input.replace(',','.').replace(/\s/g,''));
  return Number.isFinite(x)&&x>=0?x:null;
};
/** Deliberately conservative parser: numeric labels only if the photo clearly says "per 100 g/ml". */
export function parseRussianLabel(raw:string): LabelRead {
  const text=raw.replace(/\r/g,'\n').replace(/[\u00a0\t]+/g,' ').replace(/[‐‑–—]/g,'-').slice(0,12000);
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
  const warnings:string[]=[];
  const basis=/(?:на|в|из|для)\s*100\s*(?:г|гр\.?|грамм|ml|мл)(?![а-яa-z])|100\s*(?:г|гр\.?|мл)\s*(?:продукта|содержит)|пищевая\s+ценность\s*(?:\(\s*100\s*(?:г|мл)\s*\))/i.test(text);
  const field: Array<{name:keyof Nutriments; re:RegExp;max:number}>=[
    {name:'energy-kcal_100g',re:/(?:энергетическ[а-я]*\s+ценност[а-я]*|калори[йь][а-я]*|энергетическая\s+ценность)\s*[:=\-]?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:ккал|kcal)(?:\s|$)/i,max:1000},
    {name:'proteins_100g',re:/(?:белки|белков)\s*[:=\-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:г|гр|g)?(?:\s|$)/i,max:100},
    {name:'fat_100g',re:/(?:жиры|жиров)\s*[:=\-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:г|гр|g)?(?:\s|$)/i,max:100},
    {name:'carbohydrates_100g',re:/(?:углеводы|углеводов)\s*[:=\-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:г|гр|g)?(?:\s|$)/i,max:100},
    {name:'sugars_100g',re:/(?:из\s+них\s+сахара|сахаров|сахара)\s*[:=\-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:г|гр|g)?(?:\s|$)/i,max:100},
    {name:'salt_100g',re:/(?:соль|соли)\s*[:=\-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:г|гр|g)?(?:\s|$)/i,max:100},
    {name:'saturated-fat_100g',re:/(?:насыщенные\s+жиры|насыщенных\s+жирных\s+кислот)\s*[:=\-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:г|гр|g)?(?:\s|$)/i,max:100},
  ];
  const nutrients:Nutriments={};
  if(basis){
    for(const {name,re,max} of field){
      // Only OCR lines after / adjacent to the nutrition heading; ignore descriptions and recipes.
      const matching=lines.map((l,i)=>({l,i})).filter(({l})=>re.test(l));
      if(matching.length===1){
        const match=matching[0].l.match(re);
        const parsed=match&&num(match[1]);
        if(parsed!==null&&parsed!==undefined&&parsed<=max)nutrients[name]=parsed;
      }
    }
    if(nutrients['energy-kcal_100g']===undefined){
      const kj=text.match(/(?:энергетическ[а-я]*\s+ценност[а-я]*|калори[йь][а-я]*)\s*[:=\-]?\s*(\d{2,4})\s*(?:кдж|kj)(?:\s|$)/i);
      const kjNum=kj?num(kj[1]):null;
      if(kjNum!==null&&kjNum!==undefined)nutrients['energy-kcal_100g']=Math.round(kjNum/4.184);
    }
  } else warnings.push('Не видно подписи «на 100 г/мл», поэтому цифры не перенесены автоматически.');
  const marker=/(?:^|\n)\s*(?:состав|ингредиенты)\s*[:.\-]\s*/i.exec(text);
  let ingredients='';
  if(marker){
    const rest=text.slice(marker.index+marker[0].length);
    const stop=/(?:\n\s*(?:пищевая\s+ценность|энергетическая\s+ценность|условия\s+хранения|срок\s+годности|изготовитель|адрес|масса\s+нетто|производитель|на\s+100\s*(?:г|мл)))/i.exec(rest);
    ingredients=(stop?rest.slice(0,stop.index):rest).replace(/\s*\n\s*/g,' ').trim().slice(0,2500);
    // Avoid the OCR capturing the entire package as ingredients.
    if(ingredients.length>1400){ingredients=ingredients.slice(0,1400);warnings.push('Состав очень длинный: проверьте, где он заканчивается.');}
  }
  if(!Object.keys(nutrients).length)warnings.push('Пищевая ценность не распознана уверенно. При необходимости введите её вручную.');
  if(!ingredients)warnings.push('Состав не найден в тексте. Проверьте снимок.');
  return {ingredients,nutrients,hasBasis100:basis,warnings};
}
export function createOcrDraft(ocr:LabelRead,code:string,previous?:Product|null):Product {
  const valid=/^\d{8,14}$/.test(code);
  const name=previous && !previous.name.startsWith('Товар ') ? previous.name : '';
  return {
    code: valid?code:`label-${Date.now()}`,
    name, brand:previous?.brand||'',quantity:previous?.quantity||'',image:previous?.image,
    ingredients:ocr.ingredients, ingredientsTags:[], allergensTags:[], tracesTags:[],
    additivesTags:[],categoriesTags:[],labelsTags:[],ingredientsAnalysisTags:[],
    servingSize:'',nutriments:ocr.nutrients,source:'manual',
    confidence:'low',
    sourceNote:'Текст получен распознаванием фотографии на устройстве и подтверждён пользователем. Сверьте цифры с упаковкой.',
  };
}
