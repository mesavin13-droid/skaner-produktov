import type { Product } from '../types';
import { number100 } from './off';

export interface ClearPoint {
  title: string;
  explanation: string;
  tone: 'attention' | 'neutral' | 'positive';
}
export interface ClearExplanation {
  verdict: string;
  meaning: string;
  points: ClearPoint[];
  allergenNames: string[];
  possibleTraces: string[];
}

function labels(tags: string[]): string[] {
  const joined = tags.join(' ').toLowerCase();
  const items: [string, string[]][] = [
    ['Молоко', ['milk', 'lait', 'молок']], ['Пшеница / глютен', ['gluten', 'wheat', 'пшениц']],
    ['Яйца', ['eggs', 'egg', 'яйц']], ['Соя', ['soy', 'soja', 'соев', 'соя']],
    ['Орехи', ['nuts', 'almonds', 'hazelnuts', 'walnuts', 'орех']], ['Арахис', ['peanut', 'арахис']],
    ['Кунжут', ['sesame', 'кунжут']], ['Рыба', ['fish', 'рыб']], ['Сельдерей', ['celery', 'сельдер']],
    ['Горчица', ['mustard', 'горчиц']],
  ];
  return items.filter(([, needles]) => needles.some(t => joined.includes(t))).map(([name]) => name);
}
const ingredientAllergens: [string, RegExp][] = [
  ['Молоко', /молок|сыр|сыворотк|сливк|казеин/i],
  ['Пшеница / глютен', /пшениц|клейковин|глютен/i],
  ['Яйца', /яйц|яичн/i],
  ['Соя', /соев|\bсоя\b/i],
];
export function explainProduct(product: Product): ClearExplanation {
  const text = product.ingredients.toLowerCase();
  // Mentions after factory cross-contact notices are not ingredients.
  const recipe = text.split(/(?:на\s+(?:предприятии|производстве)|может\s+содержать\s+следы|могут\s+содержаться\s+следы)/i)[0];
  const sugar = number100(product.nutriments, 'sugars_100g');
  const salt = number100(product.nutriments, 'salt_100g');
  const protein = number100(product.nutriments, 'proteins_100g');
  const nova4 = product.novaGroup === 4;
  const points: ClearPoint[] = [];
  const add = (title: string, explanation: string, tone: ClearPoint['tone']) => {
    if (points.length < 5) points.push({ title, explanation, tone });
  };
  if (nova4) add('Сильно переработанный продукт', 'NOVA 4 означает промышленную переработку. Это не значит, что одна порция опасна, но для ежедневного рациона лучше выбирать менее переработанную еду.', 'attention');
  if (/нитрит\s+натрия|нитрит[а-я]*\s+натри|(?:^|[^a-z0-9а-я])e\s?250(?:[^a-z0-9а-я]|$)/i.test(recipe)) {
    add('Есть нитрит натрия', 'Это консервант, часто используемый в мясных начинках. Его наличие само по себе не доказывает вред конкретного продукта.', 'attention');
  }
  if (/механическ[а-я\s]+обвалк/i.test(recipe)) add('Мясо механической обвалки', 'Это мясо, отделённое механическим способом; оно отличается от цельного филе. Сам способ не означает, что мясо несъедобно.', 'neutral');
  if (salt != null && salt > 1.5) add('Много соли', `По данным карточки — ${salt.toLocaleString('ru-RU')} г соли на 100 г. Учитывайте и другие солёные продукты за день.`, 'attention');
  else if (salt === null && /соль/i.test(recipe)) add('Соль указана в составе', 'Но точное количество на 100 г неизвестно, поэтому нельзя оценить, много её или мало.', 'neutral');
  if (sugar != null && sugar > 12.5) add('Повышенное содержание сахаров', `В карточке указано ${sugar.toLocaleString('ru-RU')} г на 100 г. Учтите размер порции.`, 'attention');
  else if (sugar === null && /сахар[а-я]*/i.test(recipe)) add('Есть сахар', 'Он указан среди ингредиентов, но его количество на 100 г в каталоге неизвестно.', 'neutral');
  if (product.additivesTags.length >= 5) add('Есть пищевые добавки', `В каталоге отмечено ${product.additivesTags.length} добавок. Не все они опасны; важно, какие именно используются и в каком количестве.`, 'neutral');
  if (protein != null && protein >= 10) add('Содержит белок', `В 100 г — ${protein.toLocaleString('ru-RU')} г белка. Но это не отменяет остальные особенности состава.`, 'positive');
  if (!points.length) add('Проверка пока неполная', 'По имеющимся данным нельзя уверенно описать плюсы и минусы. Сверьте состав и пищевую ценность с упаковкой.', 'neutral');

  const allergens = labels(product.allergensTags);
  const recipeDetected = ingredientAllergens.filter(([, regex]) => regex.test(recipe)).map(([name]) => name);
  const allergenNames = [...new Set([...allergens, ...recipeDetected])];
  const possibleTraces = labels(product.tracesTags).filter(name => !allergenNames.includes(name));

  if (nova4) return {
    verdict: 'Лучше не делать ежедневным перекусом',
    meaning: 'В составе есть признаки сильной переработки. Иногда съесть такой продукт — не то же самое, что питаться им постоянно. Важно смотреть на весь рацион.',
    points, allergenNames, possibleTraces,
  };
  if (sugar != null && sugar > 22.5 || salt != null && salt > 1.5) return {
    verdict: 'Лучше выбирать не каждый день',
    meaning: 'Есть показатели, которые стоит ограничивать при частом употреблении. Разовая порция не определяет качество всего питания.',
    points, allergenNames, possibleTraces,
  };
  if (!product.ingredients && sugar == null && salt == null && product.novaGroup == null) return {
    verdict: 'Пока недостаточно данных',
    meaning: 'Название товара известно, но без состава и пищевой ценности нельзя обоснованно судить о нём.',
    points, allergenNames, possibleTraces,
  };
  return {
    verdict: 'Можно рассматривать с учётом порции',
    meaning: 'По доступным данным серьёзных выводов делать нельзя: важны количество, частота употребления и весь рацион.',
    points, allergenNames, possibleTraces,
  };
}
