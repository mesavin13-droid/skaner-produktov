import { AlertTriangle, ArrowLeft, BadgeCheck, Bookmark, BookmarkCheck, CircleHelp, Droplets, ExternalLink, Leaf, ShieldAlert } from 'lucide-react';
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

interface Props { product: Product; profile: Profile; favorite: boolean; onBack: () => void; onFavorite: () => void; onEdit?: () => void; }
function getAlternative(product: Product): string {
  const category = product.categoriesTags.join(' ').toLowerCase();
  const sugar = number100(product.nutriments, 'sugars_100g');
  if (/soft-drinks|sodas|energy-drinks|sweetened-beverages/.test(category)) return 'Если нужен напиток на каждый день, попробуйте воду без сахара или несладкий чай.';
  if (/yogurts|yoghurts|dairy-desserts/.test(category) && sugar != null && sugar > 10) return 'Поищите натуральный йогурт без добавленного сахара и добавьте фрукты самостоятельно.';
  if (/breakfast-cereals|cereals/.test(category) && sugar != null && sugar > 10) return 'Сравните с обычными овсяными хлопьями без подсластителей.';
  if (/crisps|chips|salty-snacks/.test(category)) return 'В качестве повседневного перекуса можно выбрать несолёные орехи или овощи при отсутствии аллергии.';
  return 'Посмотрите аналогичный продукт с меньшим количеством сахара, соли и насыщенных жиров. Обратите внимание на размер порции.';
}

export function ProductCard({ product, profile, favorite, onBack, onFavorite, onEdit }: Props) {
  const rating = evaluate(product);
  const n = product.nutriments;
  const energy = calorie100(n);
  const serving = servingGrams(product.servingSize);
  const energyServing = energy != null && serving != null ? energy * serving / 100 : null;
  const isPhoto = product.source === 'ai-food' || product.source === 'ai-package';
  const warnings = profileWarnings(product, profile);
  const alternative = getAlternative(product);
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
        <div className="result-score"><ScoreRing rating={rating} /><div><span className={`score-pill score-${rating.completeness === 'low' ? 'unknown' : rating.band}`} >{rating.completeness === 'low' ? 'Мало данных' : rating.title}</span><h2>Индекс состава</h2><p>{rating.summary}</p><small>0 — меньше замечаний, 100 — больше</small></div></div>
        {rating.completeness === 'low' && <div className="notice caution"><CircleHelp size={18} /> Мало сведений о продукте. Балл не следует считать достоверным.</div>}
        {product.source === 'barcode-catalog' && <div className="verified-identity"><BadgeCheck size={18}/><span>Название подтверждено по штрихкоду. Калории и состав пока не найдены, данные другого морса не подставляем.</span></div>}
        {(product.source === 'barcode-catalog' || product.source === 'manual') && onEdit && <button className="edit-label-button" type="button" onClick={onEdit}>Добавить данные с этикетки</button>}
      </div>
      {isPhoto && <div className="photo-result-notice"><CircleHelp size={20}/><div><b>Распознано ИИ · {product.confidence === 'high' ? 'высокая' : product.confidence === 'medium' ? 'средняя' : 'низкая'} уверенность</b><div>{product.source === 'ai-food' ? 'Состав и точные БЖУ нельзя определить по внешнему виду.' : 'Цифры и состав могли быть прочитаны с ошибками — сверьте этикетку.'}</div>{product.aiNotes && <div>{product.aiNotes}</div>}{product.aiAllergens?.length ? <div><b>Возможные аллергены с фото: </b>{product.aiAllergens.join(', ')}. Обязательно проверьте упаковку.</div> : null}</div></div>}
      {warnings.length > 0 && <section className="alert-panel" role="alert"><ShieldAlert size={23} /><div><h3>Проверьте аллергены и ограничения</h3>{warnings.map(w => <p key={w}>{w}</p>)}<small>Информация в базе может быть неполной. Всегда читайте упаковку.</small></div></section>}
      <section className="glass-panel nutrition-section"><div className="section-heading"><div><span className="overline">ПИЩЕВАЯ ЦЕННОСТЬ</span><h2>Калории и БЖУ</h2></div><span className="section-chip">на 100 г/мл</span></div>
        <div className="calories-row"><div className="calories-primary"><span>Калорийность</span><strong>{formatValue(energy, 0)} <small>{energy == null ? '' : 'ккал'}</small></strong></div><div className="calories-secondary"><span>На порцию {serving != null ? `(${formatValue(serving)} г/мл)` : ''}</span><strong>{formatValue(energyServing, 0)} <small>{energyServing == null ? '' : 'ккал'}</small></strong></div></div>
        {product.calorieRange && <p className="calorie-range">≈ {formatValue(product.calorieRange[0], 0)}–{formatValue(product.calorieRange[1], 0)} ккал / 100 г</p>}
        {energyServing != null && profile.calories > 0 && <p className="small-note">Порция ≈ {Math.round(energyServing / profile.calories * 100)}% от вашего дневного ориентира ({profile.calories} ккал).</p>}
        <div className="nutrition-grid">{nutrients.map(item => <div key={item.label} className={`nutrition-tile ${item.accent}`}><span>{item.label}</span><strong>{formatValue(number100(n, item.key))} <small>г</small></strong></div>)}</div>
        {!serving && <p className="small-note">Производитель не указал размер порции — показываем значения на 100 г/мл.</p>}
      </section>
      {rating.isWater && <section className="glass-panel water-section"><div className="section-heading"><div><span className="overline">ДОПОЛНИТЕЛЬНО</span><h2>Сведения о воде</h2></div><Droplets color="#6a93e7" size={24} /></div>
        <div className="water-grid"><span>Минерализация</span><strong>Нет данных</strong><span>Жёсткость</span><strong>Нет данных</strong><span>Кальций</span><strong>{formatValue(number100(n, 'calcium_100g') != null ? number100(n, 'calcium_100g')! * 1000 : null)} мг/100 мл</strong><span>Магний</span><strong>{formatValue(number100(n, 'magnesium_100g') != null ? number100(n, 'magnesium_100g')! * 1000 : null)} мг/100 мл</strong><span>Натрий</span><strong>{formatValue(number100(n, 'sodium_100g') != null ? number100(n, 'sodium_100g')! * 1000 : null)} мг/100 мл</strong><span>Калий</span><strong>{formatValue(number100(n, 'potassium_100g') != null ? number100(n, 'potassium_100g')! * 1000 : null)} мг/100 мл</strong><span>Газирование</span><strong>{product.categoriesTags.some(tag => tag.includes(':sparkling-waters')) ? 'Газированная' : product.categoriesTags.some(tag => tag.includes(':still-waters')) ? 'Негазированная' : 'Не указано'}</strong></div>
        <p className="small-note">Минерализацию и жёсткость показываем только при наличии подтверждённых данных.</p>
      </section>}
      <section className="glass-panel highlights-section"><div className="section-heading"><div><span className="overline">РАЗБОР СОСТАВА</span><h2>Что важно знать</h2></div><BadgeCheck size={23} color="#788ac6" /></div>
        <div className="highlight-column"><div className="highlight-subtitle positive"><Leaf size={16} /> Что хорошо</div>{rating.good.map(item => <div className="highlight-row" key={item}><span className="small-dot green" />{item}</div>)}
          <div className="highlight-subtitle negative"><AlertTriangle size={16} /> На что обратить внимание</div>{rating.bad.map(item => <div className="highlight-row" key={item}><span className="small-dot yellow" />{item}</div>)}</div>
      </section>
      <section className="glass-panel ingredients-section"><div className="section-heading"><div><span className="overline">С ЭТИКЕТКИ</span><h2>Состав</h2></div></div><p className="ingredients-text">{product.ingredients ? ingredientMarkup(product.ingredients) : 'Состав пока отсутствует в базе. Сверьте информацию с упаковкой.'}</p>{product.ingredients && <p className="small-note">Выделены компоненты для дополнительной проверки. Это не означает, что каждый из них опасен.</p>}{rating.notices.map(text => <div className="inline-notice" key={text}><CircleHelp size={16} />{text}</div>)}</section>
      <section className="swap-panel"><span className="swap-icon"><Leaf size={24} /></span><div><strong>Более здоровая альтернатива</strong><p>{alternative}</p></div></section>
      {isPhoto ? <div className="source-link">Источник: распознавание фотографии с помощью ИИ (требуется проверка).</div> : product.source === 'manual' ? <div className="source-link">БЖУ и состав: введены пользователем с этикетки.</div> : product.source === 'barcode-catalog' ? <a className="source-link" href={product.sourceUrl} target="_blank" rel="noopener noreferrer">Название: каталог штрихкодов <ExternalLink size={14}/></a> : <a className="source-link" href={`https://world.openfoodfacts.org/product/${encodeURIComponent(product.code)}`} target="_blank" rel="noopener noreferrer">Источник: Open Food Facts <ExternalLink size={14} /></a>}
      <div className="medical-disclaimer">Оценка ориентировочная и не заменяет совет врача.</div>
    </article>
  );
}
