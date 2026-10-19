import { AlertTriangle, ArrowLeft, BadgeCheck, Bookmark, BookmarkCheck, ChevronDown, ChevronUp, CircleHelp, Droplets, ExternalLink, Leaf, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { explainProduct } from '../lib/explain';
import type { Product, Profile } from '../types';
import { evaluate, profileWarnings } from '../lib/evaluate';
import { calorie100, formatValue, number100, servingGrams } from '../lib/off';
import { ScoreRing } from './ScoreRing';

const INGREDIENT_ALERT = /(сахар(?:а|ом)?|соль|пальмов(?:ое|ый|ого)\s+масл[а-я]*|глюкозно-фруктозный сироп|аспартам|сукралоза|трансжир[а-я]*|сироп глюкозы|\bE\d{3,4}\b)/gi;
function ingredientMarkup(text: string) {
  return text.split(INGREDIENT_ALERT).map((part, index) =>
    /^(сахар(?:а|ом)?|соль|пальмов(?:ое|ый|ого)\s+масл[а-я]*|глюкозно-фруктозный сироп|аспартам|сукралоза|трансжир[а-я]*|сироп глюкозы|E\d{3,4})$/i.test(part)
      ? <mark className="ingredient-highlight" key={index} title="Компонент, на который стоит обратить внимание">{part}</mark>
      : <span key={index}>{part}</span>,
  );
}

interface Props { product: Product; profile: Profile; favorite: boolean; onBack: () => void; onFavorite: () => void; onEdit?: () => void; onPhotoLabel?: () => void; }
function getAlternative(product: Product): string {
  const category = product.categoriesTags.join(' ').toLowerCase();
  const sugar = number100(product.nutriments, 'sugars_100g');
  if (product.novaGroup === 4 && /пицц|чебупиц|чебупел|булоч|перекус/i.test(product.name.toLowerCase())) return 'Для частого перекуса сравните с домашним бутербродом из цельнозернового хлеба, курицы и овощей. Учитывайте личные ограничения в питании.';
  if (/soft-drinks|sodas|energy-drinks|sweetened-beverages/.test(category)) return 'Если нужен напиток на каждый день, попробуйте воду без сахара или несладкий чай.';
  if (/yogurts|yoghurts|dairy-desserts/.test(category) && sugar != null && sugar > 10) return 'Поищите натуральный йогурт без добавленного сахара и добавьте фрукты самостоятельно.';
  if (/breakfast-cereals|cereals/.test(category) && sugar != null && sugar > 10) return 'Сравните с обычными овсяными хлопьями без подсластителей.';
  if (/crisps|chips|salty-snacks/.test(category)) return 'В качестве повседневного перекуса можно выбрать несолёные орехи или овощи при отсутствии аллергии.';
  return 'Посмотрите аналогичный продукт с меньшим количеством сахара, соли и насыщенных жиров. Обратите внимание на размер порции.';
}

export function ProductCard({ product, profile, favorite, onBack, onFavorite, onEdit, onPhotoLabel }: Props) {
  const rating = evaluate(product);
  const plain = explainProduct(product);
  const [showAllReasons, setShowAllReasons] = useState(false);
  const [showFullIngredients, setShowFullIngredients] = useState(false);
  const n = product.nutriments;
  const energy = calorie100(n);
  const serving = servingGrams(product.servingSize);
  const energyServing = energy != null && serving != null ? energy * serving / 100 : null;
  const packageSize = servingGrams(product.quantity);
  const wholePackage = serving != null && packageSize != null && Math.abs(serving - packageSize) < .1;
  const portionDescription = wholePackage ? 'В упаковке' : 'На порцию';
  const longIngredients = product.ingredients.length > 470;
  const shortIngredients = longIngredients ? product.ingredients.slice(0, 390).replace(/\s+\S*$/, '') + '…' : product.ingredients;
  const visibleReasons = showAllReasons ? plain.points : plain.points.slice(0, 3);
  const isPhoto = product.source === 'ai-food' || product.source === 'ai-package';
  const warnings = profileWarnings(product, profile);
  const alternative = getAlternative(product);
  const hasNutrition = Object.values(product.nutriments).some(v => typeof v === 'number' && Number.isFinite(v));
  const needsMoreInfo = !product.ingredients.trim() || !hasNutrition || /^Товар\\s*\\d+$/i.test(product.name);
  const nutrients: { label: string; key: keyof typeof n; accent: string }[] = [
    { label: 'Белки', key: 'proteins_100g', accent: 'mint' },
    { label: 'Жиры', key: 'fat_100g', accent: 'peach' },
    { label: 'Углеводы', key: 'carbohydrates_100g', accent: 'blue' },
    { label: 'Сахара', key: 'sugars_100g', accent: 'pink' },
  ];
  return (
    <article className="result animate-rise">
      <div className="result-head"><button className="icon-press" onClick={onBack} aria-label="Назад"><ArrowLeft size={21} /></button><span className="overline">РЕЗУЛЬТАТ ПРОВЕРКИ</span><button className="icon-press" onClick={onFavorite} aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}>{favorite ? <BookmarkCheck size={21} fill="#7187d9" /> : <Bookmark size={21} />}</button></div>
      <div className="glass-panel result-hero">
        <div className="result-brand"><div className="product-image-frame">{product.image ? <img src={product.image} alt={product.name} /> : <span className="product-placeholder"><Leaf size={38} /></span>}</div><div className="product-identity"><span className="muted-label">{product.brand || 'Продукт'}</span><h1>{product.name}</h1><span className="product-detail">{product.quantity || (isPhoto ? 'Результат по фотографии' : `Штрихкод ${product.code}`)}</span></div></div>
        <div className={`plain-verdict ${product.novaGroup === 4 ? 'caution' : rating.completeness === 'low' ? 'unknown' : rating.band}`}>
          <span>ГЛАВНЫЙ ВЫВОД</span>
          <h2>{plain.verdict}</h2>
          <p>{plain.meaning}</p>
        </div>
        <div className="result-score compact-score"><ScoreRing rating={rating} size={112}/><div>
          <span className={`score-pill score-${rating.completeness === 'low' ? 'unknown' : rating.band}`}>Ориентировочная оценка</span>
          <h2>Индекс замечаний</h2>
          <p>Это наша приблизительная оценка, а не медицинский показатель.</p>
          <small>0 — меньше замечаний, 100 — больше. Не показывает вероятность вреда.</small>
        </div></div>
        {product.cacheStatus === 'stale' && <div className="stale-product-warning" role="status"><CircleHelp size={19}/><span>
          <b>Данные из сохранённой карточки.</b> Каталоги временно не ответили. Сведения могли измениться — перед покупкой сверьте состав и аллергены с упаковкой.
        </span></div>}
        {rating.completeness === 'low' && <div className="notice caution"><CircleHelp size={18} /> Мало сведений о продукте. Балл не следует считать достоверным.</div>}
        {(product.source === 'barcode-catalog' || product.source === 'national-catalog') && <div className="verified-identity"><BadgeCheck size={18}/><span>Название подтверждено по штрихкоду. Если пищевая ценность или состав отсутствуют в источнике, мы не подставляем сведения о похожем товаре.</span></div>}
        {product.sourceNote && <div className="catalog-source-note"><CircleHelp size={17}/><span>{product.sourceNote}</span></div>}
        {needsMoreInfo && onEdit && <div className="missing-label-data"><strong>Карточка пока неполная</strong><p>Сфотографируйте данные с упаковки или заполните состав и БЖУ вручную. Отсутствующие цифры не считаются нулём.</p>{onPhotoLabel && <button className="edit-label-button" type="button" onClick={onPhotoLabel}>Сфотографировать состав и БЖУ</button>}
        <button className="edit-label-button" type="button" onClick={onEdit}>Ввести данные вручную</button></div>}
        {!needsMoreInfo && (product.source === 'barcode-catalog' || product.source === 'national-catalog' || product.source === 'ean-online' || product.source === 'upcitemdb' || product.source === 'foodbase' || product.source === 'manual') && onEdit && <button className="edit-label-button" type="button" onClick={onEdit}>Уточнить данные с этикетки</button>}
      </div>
      {isPhoto && <div className="photo-result-notice"><CircleHelp size={20}/><div><b>Распознано ИИ · {product.confidence === 'high' ? 'высокая' : product.confidence === 'medium' ? 'средняя' : 'низкая'} уверенность</b><div>{product.source === 'ai-food' ? 'Состав и точные БЖУ нельзя определить по внешнему виду.' : 'Цифры и состав могли быть прочитаны с ошибками — сверьте этикетку.'}</div>{product.aiNotes && <div>{product.aiNotes}</div>}{product.aiAllergens?.length ? <div><b>Возможные аллергены с фото: </b>{product.aiAllergens.join(', ')}. Обязательно проверьте упаковку.</div> : null}</div></div>}
      {warnings.length > 0 && <section className="alert-panel" role="alert"><ShieldAlert size={23} /><div><h3>Проверьте аллергены и ограничения</h3>{warnings.map(w => <p key={w}>{w}</p>)}<small>Информация в базе может быть неполной. Всегда читайте упаковку.</small></div></section>}
      <section className="glass-panel easy-insights" aria-label="Понятный разбор">
        <div className="section-heading"><div><span className="overline">БЕЗ СЛОЖНЫХ ТЕРМИНОВ</span><h2>Почему такой вывод?</h2></div></div>
        <div className="easy-points">{visibleReasons.map(item => <div className={`easy-point easy-${item.tone}`} key={item.title}>
          <span className="easy-point-symbol">{item.tone === 'attention' ? <AlertTriangle size={18}/> : item.tone === 'positive' ? <Leaf size={18}/> : <CircleHelp size={18}/>}</span>
          <div><strong>{item.title}</strong><p>{item.explanation}</p></div>
        </div>)}</div>
        {plain.points.length > 3 && <button className="expand-content" type="button" onClick={() => setShowAllReasons(v => !v)}>
          {showAllReasons ? 'Свернуть пояснения' : `Показать ещё ${plain.points.length - 3} пункта`}
          {showAllReasons ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}
        </button>}
      </section>
      <section className="glass-panel easy-allergens">
        <div className="easy-allergen-head"><ShieldAlert size={22}/><div><span className="overline">ВАЖНО ПРИ АЛЛЕРГИИ</span><h2>Аллергены</h2></div></div>
        {plain.allergenNames.length > 0 ? <><p>В составе или в отметках каталога обнаружены упоминания:</p>
          <div className="allergen-tags">{plain.allergenNames.map(a => <span key={a}>{a}</span>)}</div>
        </> : <p>Не удалось надёжно определить аллергены по доступным данным. Это не значит, что их нет.</p>}
        {plain.possibleTraces.length > 0 && <p><b>Возможные следы:</b> {plain.possibleTraces.join(', ')}.</p>}
        <small>При аллергии всегда проверяйте официальную этикетку: сведения в каталоге могут быть неполными.</small>
      </section>
      <section className="glass-panel nutrition-section"><div className="section-heading"><div><span className="overline">ПИЩЕВАЯ ЦЕННОСТЬ</span><h2>Калории и БЖУ</h2></div><span className="section-chip">на 100 г/мл</span></div>
        <div className="calories-row"><div className="calories-primary"><span>Калорийность</span><strong>{formatValue(energy, 0)} <small>{energy == null ? '' : 'ккал'}</small></strong></div><div className="calories-secondary"><span>{portionDescription} {serving != null ? `(${formatValue(serving)} г/мл)` : ''}</span><strong>{formatValue(energyServing, 0)} <small>{energyServing == null ? '' : 'ккал'}</small></strong></div></div>
        {product.calorieRange && <p className="calorie-range">≈ {formatValue(product.calorieRange[0], 0)}–{formatValue(product.calorieRange[1], 0)} ккал / 100 г</p>}
        {energyServing != null && profile.calories > 0 && <p className="small-note">{wholePackage ? 'Вся упаковка' : 'Порция'} ≈ {Math.round(energyServing / profile.calories * 100)}% от вашего дневного ориентира ({profile.calories} ккал).</p>}
        <div className="nutrition-grid">{nutrients.map(item => <div key={item.label} className={`nutrition-tile ${item.accent}`}><span>{item.label}</span><strong>{number100(n, item.key) == null ? <span className="nutrient-unknown">нет данных</span> : <>{formatValue(number100(n, item.key))} <small>г</small></>}</strong></div>)}</div>
        {!serving && <p className="small-note">Производитель не указал размер порции — показываем значения на 100 г/мл.</p>}
      </section>
      {rating.isWater && <section className="glass-panel water-section"><div className="section-heading"><div><span className="overline">ДОПОЛНИТЕЛЬНО</span><h2>Сведения о воде</h2></div><Droplets color="#6a93e7" size={24} /></div>
        <div className="water-grid"><span>Минерализация</span><strong>Нет данных</strong><span>Жёсткость</span><strong>Нет данных</strong><span>Кальций</span><strong>{formatValue(number100(n, 'calcium_100g') != null ? number100(n, 'calcium_100g')! * 1000 : null)} мг/100 мл</strong><span>Магний</span><strong>{formatValue(number100(n, 'magnesium_100g') != null ? number100(n, 'magnesium_100g')! * 1000 : null)} мг/100 мл</strong><span>Натрий</span><strong>{formatValue(number100(n, 'sodium_100g') != null ? number100(n, 'sodium_100g')! * 1000 : null)} мг/100 мл</strong><span>Калий</span><strong>{formatValue(number100(n, 'potassium_100g') != null ? number100(n, 'potassium_100g')! * 1000 : null)} мг/100 мл</strong><span>Газирование</span><strong>{product.categoriesTags.some(tag => tag.includes(':sparkling-waters')) ? 'Газированная' : product.categoriesTags.some(tag => tag.includes(':still-waters')) ? 'Негазированная' : 'Не указано'}</strong></div>
        <p className="small-note">Минерализацию и жёсткость показываем только при наличии подтверждённых данных.</p>
      </section>}
      <section className="glass-panel ingredients-section">
        <div className="section-heading"><div><span className="overline">ПОДРОБНОСТИ С ЭТИКЕТКИ</span><h2>Полный состав</h2></div></div>
        {product.ingredients ? <>
          <p className="ingredients-text">{ingredientMarkup(showFullIngredients ? product.ingredients : shortIngredients)}</p>
          {longIngredients && <button type="button" className="expand-content" aria-expanded={showFullIngredients} onClick={() => setShowFullIngredients(v => !v)}>
            {showFullIngredients ? 'Свернуть состав' : 'Показать весь состав'} {showFullIngredients ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}
          </button>}
          <p className="small-note">Подсвеченные ингредиенты — повод разобраться подробнее, а не признак автоматической опасности.</p>
        </> : <p className="ingredients-text">Полный состав пока неизвестен. Сверьте информацию с упаковкой.</p>}
        {rating.notices.length > 0 && <details className="technical-notes"><summary>Дополнительные сведения и ограничения оценки</summary>
          {rating.notices.map(note => <p key={note}>{note}</p>)}
        </details>}
      </section>
      <section className="swap-panel"><span className="swap-icon"><Leaf size={24} /></span><div><strong>Более здоровая альтернатива</strong><p>{alternative}</p></div></section>
      {isPhoto ? <div className="source-link">Источник: распознавание фотографии с помощью ИИ (требуется проверка).</div> : product.source === 'manual' ? <div className="source-link">БЖУ и состав: введены пользователем с этикетки.</div> : product.source === 'barcode-catalog' || product.source === 'national-catalog' || product.source === 'ean-online' || product.source === 'upcitemdb' || product.source === 'foodbase' ? <a className="source-link" href={product.sourceUrl} target="_blank" rel="noopener noreferrer">Название: {product.source === 'national-catalog' ? 'Национальный каталог' : product.source === 'upcitemdb' ? 'UPCitemdb' : product.source === 'ean-online' ? 'EAN-online' : product.source === 'foodbase' ? 'FoodBase' : 'каталог штрихкодов'} <ExternalLink size={14}/></a> : <a className="source-link" href={`https://world.openfoodfacts.org/product/${encodeURIComponent(product.code)}`} target="_blank" rel="noopener noreferrer">Источник: Open Food Facts <ExternalLink size={14} /></a>}
      <div className="medical-disclaimer">Оценка ориентировочная и не заменяет совет врача.</div>
    </article>
  );
}
