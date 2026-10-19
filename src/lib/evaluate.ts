import type { Allergen, Product, Profile, Rating } from '../types';
import { number100 } from './off';

const limit = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const has = (tags: string[], ...needles: string[]) => tags.some(tag => needles.some(needle => tag.includes(needle)));

export function isWaterProduct(p: Product): boolean {
  return has(p.categoriesTags, ':waters', ':mineral-waters', ':spring-waters', ':sparkling-waters', ':still-waters') ||
    (/^(вода|water|eau\s|mineral water)/i.test(p.name.trim()) && !has(p.categoriesTags, ':soft-drinks', ':sodas'));
}

export function evaluate(p: Product): Rating {
  const n = p.nutriments;
  const water = isWaterProduct(p);
  const bad: string[] = [];
  const good: string[] = [];
  const notices: string[] = [];
  let score = water ? 4 : 12;
  let known = 0;
  const sugar = number100(n, 'sugars_100g');
  const salt = number100(n, 'salt_100g') ?? (number100(n, 'sodium_100g') != null ? number100(n, 'sodium_100g')! * 2.5 : null);
  const sat = number100(n, 'saturated-fat_100g');
  const trans = number100(n, 'trans-fat_100g');
  const fiber = number100(n, 'fiber_100g');
  const protein = number100(n, 'proteins_100g');
  const drink = has(p.categoriesTags, ':beverages', ':soft-drinks', ':sodas', ':juices');

  if (water) {
    good.push('Вода обычно не содержит сахара и калорий.');
    if (sugar != null && sugar > 0.5) {
      score += 20;
      bad.push(`Сахар: ${sugar.toLocaleString('ru-RU')} г на 100 мл.`);
    }
    if (has(p.categoriesTags, ':sparkling-waters') || /газирован/i.test(p.name)) notices.push('Газированная вода. Газирование само по себе не делает воду вредной.');
    if (salt != null && salt > 0.3) notices.push('Проверьте количество натрия и солей, если ограничиваете соль.');
  } else {
    if (sugar != null) {
      known++;
      const t = drink ? [2.5, 5, 10] : [5, 12.5, 22.5];
      if (sugar > t[2]) { score += 31; bad.push(`Много сахара: ${sugar.toLocaleString('ru-RU')} г на 100 ${drink ? 'мл' : 'г'}.`); }
      else if (sugar > t[1]) { score += 20; bad.push(`Повышенное содержание сахара: ${sugar.toLocaleString('ru-RU')} г.`); }
      else if (sugar > t[0]) { score += 8; bad.push('Есть добавленный или природный сахар — учитывайте порцию.'); }
      else good.push('Невысокое содержание сахаров на 100 г/мл.');
    }
    if (salt != null) {
      known++;
      if (salt > 1.5) { score += 19; bad.push(`Много соли: ${salt.toFixed(1)} г на 100 г.`); }
      else if (salt > 0.3) { score += 7; bad.push('Соль стоит учитывать при частом употреблении.'); }
      else good.push('Небольшое количество соли.');
    }
    if (sat != null) {
      known++;
      if (sat > 5) { score += 18; bad.push(`Много насыщенных жиров: ${sat.toFixed(1)} г.`); }
      else if (sat > 1.5) { score += 7; bad.push('Есть насыщенные жиры.'); }
      else good.push('Невысокое содержание насыщенных жиров.');
    }
    if (trans != null) {
      known++;
      if (trans > 0.1) { score += trans > 1 ? 19 : 10; bad.push('Указаны трансжиры — лучше ограничивать.'); }
    }
    if (fiber != null && fiber >= 3) { score -= 6; good.push(`Источник клетчатки: ${fiber.toFixed(1)} г.`); }
    if (protein != null && protein >= 10) { score -= 4; good.push(`Содержит белок: ${protein.toFixed(1)} г.`); }
    if (p.novaGroup === 4) { score += 19; bad.push('Ультрапереработанный продукт (NOVA 4).'); }
    else if (p.novaGroup === 3) { score += 7; notices.push('Переработанный продукт (NOVA 3).'); }
    else if (p.novaGroup === 1) { score -= 8; good.push('Минимальная обработка (NOVA 1).'); }
    if (p.novaGroup) known++;
    const grade = (p.nutritionGrade ?? '').toLowerCase();
    const adjustment: Record<string, number> = { a: -12, b: -6, c: 4, d: 12, e: 20 };
    if (grade in adjustment) {
      score += adjustment[grade]; known++;
      notices.push(`Оценка Nutri-Score из каталога: ${grade.toUpperCase()}.`);
    }
    if (has(p.ingredientsTags, 'palm-oil', 'palm-fat') || /пальмов(ое|ый)|palm oil/i.test(p.ingredients)) {
      score += 5;
      notices.push('Содержит пальмовое масло. Само наличие не доказывает вред, важно общее содержание жиров.');
    }
    if (has(p.ingredientsTags, 'sweetener', 'aspartame', 'sucralose', 'acesulfame') || /подсластител|аспартам|сукралоз|acesulfame/i.test(p.ingredients)) {
      score += 4;
      notices.push('Есть подсластители. Их наличие не означает автоматически, что продукт опасен.');
    }
    if (p.additivesTags.length) {
      score += Math.min(7, p.additivesTags.length * 2);
      notices.push(`В составе отмечено пищевых добавок: ${p.additivesTags.length}. Не все E-добавки вредны.`);
    }
  }

  const completeness: Rating['completeness'] = known >= 3 ? 'full' : known >= 1 || (water && p.source !== 'ai-food' && p.source !== 'ai-package') ? 'partial' : 'low';
  if (!p.ingredients) notices.push('Полный состав не указан в каталоге — проверьте этикетку.');
  if (completeness === 'low') notices.push('Недостаточно сведений для надёжной оценки: балл очень приблизительный.');
  if (completeness === 'partial') notices.push('Не все показатели доступны: оценка предварительная.');
  if (!bad.length) bad.push('По доступным данным выраженных замечаний не обнаружено. Это не гарантия безопасности.');
  if (!good.length) good.push('Положительные свойства требуют более полных данных о составе.');
  if (completeness === 'low') score = 50; // Не объявляем неизвестный продукт полезным.
  score = limit(score);
  const band = score < 35 ? 'good' : score < 65 ? 'medium' : 'bad';
  const title = completeness === 'low' ? 'Недостаточно данных' : band === 'good' ? 'Хороший состав' : band === 'medium' ? 'Есть нюансы' : 'Лучше ограничивать';
  const summary = completeness === 'low' ? 'Данных пока недостаточно: не делайте вывод только по цифре.' :
    band === 'good' ? 'По доступным данным состав выглядит благоприятно.' :
    band === 'medium' ? 'Можно учитывать в рационе, но стоит посмотреть на ингредиенты и порцию.' :
    'В составе есть показатели, из-за которых стоит реже выбирать этот продукт.';
  return { score, band, title, summary, good, bad, notices, completeness, isWater: water };
}

export const ALLERGENS: { id: Allergen; label: string; tags: string[] }[] = [
  { id: 'milk', label: 'Молоко', tags: ['milk', 'lait', 'молок'] },
  { id: 'peanuts', label: 'Арахис', tags: ['peanut', 'arachide', 'арахис'] },
  { id: 'nuts', label: 'Орехи', tags: ['tree-nuts', 'almond', 'hazelnut', 'walnut', 'cashew', 'pistachio', 'орех'] },
  { id: 'gluten', label: 'Глютен', tags: ['gluten', 'wheat', 'пшениц', 'глютен'] },
  { id: 'soybeans', label: 'Соя', tags: ['soy', 'соя', 'соев'] },
  { id: 'eggs', label: 'Яйца', tags: ['egg', 'яйц'] },
  { id: 'fish', label: 'Рыба', tags: ['fish', 'рыб'] },
  { id: 'sesame', label: 'Кунжут', tags: ['sesame', 'кунжут'] },
];

export function profileWarnings(p: Product, profile: Profile): string[] {
  const warnings: string[] = [];
  for (const allergen of ALLERGENS) {
    if (!profile.allergens.includes(allergen.id)) continue;
    const tags = [...p.allergensTags, ...p.tracesTags].join(' ').toLowerCase();
    // Поиск только по размеченным аллергенам и следам: текст состава может содержать отрицания.
    if (allergen.tags.some(t => tags.includes(t))) warnings.push(`Возможен аллерген: ${allergen.label}. Проверьте упаковку!`);
  }
  if (profile.diet === 'no-sugar' || profile.diet === 'diabetes') {
    const sugar = number100(p.nutriments, 'sugars_100g');
    if (sugar != null && sugar > 5) warnings.push(`Сахара: ${sugar.toFixed(1)} г/100 г. Учитывайте индивидуальные рекомендации.`);
  }
  if (profile.diet === 'diabetes') {
    const carbs = number100(p.nutriments, 'carbohydrates_100g');
    if (carbs != null) warnings.push(`Всего углеводов: ${carbs.toFixed(1)} г/100 г. При диабете учитывайте порцию и ваш план питания.`);
  }
  if (profile.diet === 'vegetarian' && has(p.ingredientsAnalysisTags, ':non-vegetarian')) {
    warnings.push('По данным каталога продукт не относится к вегетарианским.');
  }
  return warnings;
}
