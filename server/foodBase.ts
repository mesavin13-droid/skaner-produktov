/**
 * Optional FoodBase.ru/Belarus KБЖУ service.
 * Paid licensed API, NEVER scrape demo pages and NEVER cache provider data
 * in the public shared database unless the user's contract permits.
 * https://food-bd.com/dokumentaciya-api
 */
type RecordMap=Record<string,unknown>;
const isRecord=(v:unknown):v is RecordMap=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const number=(v:unknown,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:undefined;
export function parseFoodBaseResponse(payload:unknown, barcode:string):RecordMap|null {
  if(!/^\d{8,14}$/.test(barcode)||!isRecord(payload)||!Array.isArray(payload.data))return null;
  const row=payload.data.find((r:unknown)=>isRecord(r) &&
    typeof r.barcode==='string' &&
    /^\d{8,14}$/.test(r.barcode) &&
    r.barcode.replace(/^0+/,'')===barcode.replace(/^0+/,''));
  if(!isRecord(row))return null;
  const title=typeof row.name==='string'?row.name.trim().slice(0,180):'';
  if(!title)return null;
  const nutrients:RecordMap={};
  const values=isRecord(row.per_100g)?row.per_100g:{};
  for(const [out,key,max] of [
    ['energy-kcal_100g','kcal',1000],
    ['proteins_100g','protein',100],
    ['fat_100g','fat',100],
    ['carbohydrates_100g','carbs',100]
  ] as const) {
    const v=number(values[key],max);
    if(v!==undefined)nutrients[out]=v;
  }
  const attribution=isRecord(payload.meta)&&typeof payload.meta.attribution==='string'?
    payload.meta.attribution.trim().slice(0,200):'';
  return {
    code:barcode,
    product_name_ru:title,
    brands:typeof row.brand==='string'?row.brand.slice(0,100):'',
    nutriments:nutrients,
    ingredients_text_ru:'', // FoodBase doesn't provide the ingredient label.
    catalog_source:'foodbase',
    catalog_source_url:'https://food-bd.com/',
    catalog_note:(attribution?attribution+' · ':'')+
      'Калорийность и БЖУ: лицензированный FoodBase, для этого штрихкода. Точный состав и аллергены проверяйте по упаковке.',
  };
}
export async function lookupFoodBase(barcode:string):Promise<RecordMap|null>{
  const token=process.env.FOODBASE_API_KEY?.trim();
  if(!token||!/^\d{8,14}$/.test(barcode))return null;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4000);
  try{
    const r=await fetch('https://food-bd.com/api/v1/barcode/'+encodeURIComponent(barcode),{
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:controller.signal
    });
    if(!r.ok)return null;
    return parseFoodBaseResponse(await r.json() as unknown,barcode);
  }catch{return null}
  finally{clearTimeout(timer)}
}
