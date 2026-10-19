import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeftRight, ArrowRight, Barcode, Bookmark, Camera, Check,
  ChevronRight, Clock3, Heart, Info, Leaf, ScanLine,
  ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UserRound, X,
} from 'lucide-react';
import { BottomNav } from './components/BottomNav';
import { CameraScanner } from './components/CameraScanner';
import { MarkingPanel } from './components/MarkingPanel';
import { parseMarking, type MarkingInfo } from './lib/gs1';
import { ProductEditor } from './components/ProductEditor';
import { ProductCard } from './components/ProductCard';
import { ScoreRing } from './components/ScoreRing';
import { ALLERGENS, evaluate } from './lib/evaluate';
import { calorie100, cleanBarcode, formatValue, getProduct, ProductNotFound, validBarcode } from './lib/off';
import { analyzePhoto, makeThumbnail, type PhotoMode } from './lib/photo';
import { addHistory, getCached, getFavorites, getHistory, getProfile, setCached, setProfile, toggleFavorite } from './lib/storage';
import type { Allergen, Diet, Product, Profile, SavedProduct, Screen } from './types';

const DIETS: { value: Diet; label: string; description: string }[] = [
  { value: 'none', label: 'Без ограничений', description: 'Обычный рацион' },
  { value: 'no-sugar', label: 'Без сахара', description: 'Следить за количеством сахаров' },
  { value: 'diabetes', label: 'Контроль углеводов', description: 'При диабете: учитывать все углеводы' },
  { value: 'vegetarian', label: 'Вегетарианство', description: 'Исключить мясо и рыбу' },
];

function ShelfItem({ product, onOpen, selected, onCompare, comparison }: {
  product: Product; onOpen: () => void; selected?: boolean;
  onCompare?: () => void; comparison?: boolean;
}) {
  const rating = evaluate(product);
  return <div className={`shelf-item ${selected ? 'marked' : ''}`}>
    <button className="shelf-open" type="button" onClick={onOpen}>
      <div className="shelf-image">{product.image ? <img alt="" src={product.image} loading="lazy" /> : <Leaf size={23} />}</div>
      <div className="shelf-content"><b>{product.name}</b><small>{product.brand || product.code}</small><span className={`tiny-label ${rating.completeness === 'low' ? 'unknown' : rating.band}`}>{rating.completeness === 'low' ? 'Мало данных' : `${rating.score}/100 · ${rating.title}`}</span></div>
      <ChevronRight className="shelf-arrow" size={20} />
    </button>
    {comparison && onCompare && <button type="button" className={`compare-toggle ${selected ? 'checked' : ''}`} onClick={onCompare} aria-label={selected ? `Исключить ${product.name} из сравнения` : `Выбрать ${product.name} для сравнения`}>{selected ? <Check size={18} /> : <ArrowLeftRight size={17} />}</button>}
  </div>;
}

function SkeletonResult() {
  return <div className="skeleton-stack" aria-label="Загрузка сведений о товаре" role="status">
    <div className="skeleton-block skeleton-tall"><div className="skeleton-row"><div className="sk-thumb shine"/><div className="sk-txt"><div className="sk-line shine"/><div className="sk-line short shine" /></div></div><div className="sk-sphere shine"/><div className="sk-line shine"/></div>
    <div className="skeleton-block"><div className="sk-line shine"/><div className="sk-tiles"><div className="shine"/><div className="shine"/><div className="shine"/></div></div>
  </div>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('scanner');
  const [cameraOn, setCameraOn] = useState(false);
  const [marking, setMarking] = useState<MarkingInfo | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<SavedProduct[]>(getHistory);
  const [favorites, setFavorites] = useState<Product[]>(getFavorites);
  const [profile, changeProfile] = useState<Profile>(getProfile);
  const [manualCode, setManualCode] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<{ kind: 'missing' | 'error'; text: string; code?: string } | null>(null);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const packageInput = useRef<HTMLInputElement>(null);
  const foodInput = useRef<HTMLInputElement>(null);
  const [photoDraft, setPhotoDraft] = useState<{ image: string; mode: PhotoMode } | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const request = useRef<AbortController | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const online = () => setOffline(false);
    const disconnected = () => { setOffline(true); setCameraOn(false); };
    window.addEventListener('online', online);
    window.addEventListener('offline', disconnected);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', disconnected); request.current?.abort(); };
  }, []);

  const setView = (next: Screen) => {
    request.current?.abort(); pending.current = false;
    setCameraOn(false); setProduct(null); setIssue(null); setLoading(false); setPhotoDraft(null); setEditingProduct(null); setMarking(null);
    setScreen(next); setShowComparison(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProduct = (p: Product) => {
    setCameraOn(false); setLoading(false); setPhotoDraft(null); setEditingProduct(null); pending.current = false; setProduct(p);
    setHistory(addHistory(p)); setScreen('scanner'); setIssue(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const lookup = useCallback(async (codeInput: string) => {
    if (pending.current) return;
    const parsedMarking = parseMarking(codeInput);
    const code = parsedMarking?.gtin ?? cleanBarcode(codeInput);
    if (!validBarcode(code)) { setIssue({ kind: 'error', text: 'Введите штрихкод от 8 до 14 цифр.' }); setManualOpen(true); return; }
    setMarking(parsedMarking);
    pending.current = true;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setCameraOn(false); setProduct(null); setManualOpen(false); setManualCode(''); setIssue(null);
    setLoading(true); setScreen('scanner');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const cached = getCached(code);
      const result = cached || await getProduct(code, controller.signal);
      if (!cached) setCached(result);
      if (!controller.signal.aborted) openProduct(result);
    } catch (err) {
      if (!controller.signal.aborted) {
        const previous = err instanceof ProductNotFound ? null : getHistory().find(entry => entry.product.code === code);
        if (previous) {
          // Read-only offline fallback: do not silently present old information as current.
          openProduct({
            ...previous.product,
            cacheStatus: 'stale',
            cacheUpdatedAt: new Date(previous.scannedAt).toISOString(),
          });
        } else {
          setIssue({ kind: err instanceof ProductNotFound ? 'missing' : 'error', text: err instanceof Error ? err.message : 'Не удалось прочитать данные товара.', code });
        }
      }
    } finally {
      if (!controller.signal.aborted) { pending.current = false; setLoading(false); }
    }
  }, []);

  const preparePhoto = async (file: File | undefined, mode: PhotoMode) => {
    if (!file || loading) return;
    setCameraOn(false); setIssue(null); setLoading(true);
    try {
      const image = await makeThumbnail(file);
      setPhotoDraft({ image, mode });
    } catch (error) {
      setIssue({ kind: 'error', text: error instanceof Error ? error.message : 'Не удалось открыть фотографию.' });
    } finally { setLoading(false); }
  };

  const sendPhoto = async () => {
    if (!photoDraft || pending.current) return;
    if (offline) { setPhotoDraft(null); setIssue({ kind: 'error', text: 'Нет интернета. Откройте историю ранее просмотренных товаров.' }); return; }
    pending.current = true;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const { image, mode } = photoDraft;
    setPhotoDraft(null); setIssue(null); setLoading(true);
    try {
      const result = await analyzePhoto(image, mode, controller.signal);
      if (!controller.signal.aborted) openProduct(result);
    } catch (error) {
      if (!controller.signal.aborted) setIssue({ kind: 'error', text: error instanceof Error ? error.message : 'Ошибка анализа фото.' });
    } finally {
      if (!controller.signal.aborted) { pending.current = false; setLoading(false); }
    }
  };

  const toggleFave = (p: Product) => setFavorites(toggleFavorite(p));
  const updateProfile = (next: Profile) => { changeProfile(next); setProfile(next); };
  const switchAllergen = (a: Allergen) => updateProfile({ ...profile, allergens: profile.allergens.includes(a) ? profile.allergens.filter(x => x !== a) : [...profile.allergens, a] });
  const compareProducts = compareIds.map(code => favorites.find(p => p.code === code)).filter((p): p is Product => Boolean(p));
  const toggleCompare = (code: string) => {
    setShowComparison(false);
    setCompareIds(previous => previous.includes(code) ? previous.filter(item => item !== code) : [...previous.slice(-1), code]);
  };

  return <div className="app-backdrop"><div className="app-shell">
    {!product && <header className="site-head"><div className="app-brand"><div className="brand-mark"><ScanLine size={22} strokeWidth={2.4}/></div><div><b>Сканер</b><span>продуктов</span></div></div><div className="head-actions"><div className="head-status"><span className={`pulse-dot ${offline ? 'disconnected' : ''}`} />{offline ? 'Офлайн' : 'Онлайн'}</div><button type="button" className="head-avatar" onClick={() => setView('profile')} aria-label="Открыть профиль"><UserRound size={20}/></button></div></header>}
    <main className="content-area">
      {product ? <>{marking && <div className="marking-result"><MarkingPanel marking={marking}/></div>}<ProductCard product={product} profile={profile} favorite={favorites.some(p => p.code === product.code)} onBack={() => { setProduct(null); setIssue(null); setMarking(null); }} onFavorite={() => toggleFave(product)} onEdit={() => setEditingProduct(product)} /></> : <>
      {screen === 'scanner' && <div className="scanner-page animate-rise">
        <div className="intro-row"><div><span className="eyebrow"><Sparkles size={14} /> ПРОВЕРЯЙ ОСОЗНАННО</span><h1>Что внутри <span>продукта?</span></h1><p>Сканируйте штрихкод или Data Matrix. Покажем данные товара и доступный срок годности.</p></div></div>
        <div className="scanner-card glass-panel"><div className="scanner-topline"><span><span className="small-led"/> СКАНИРОВАНИЕ</span><span className="glass-label">EAN / Data Matrix</span></div>
          <CameraScanner active={cameraOn} onDetected={(code) => void lookup(code)} onCancel={() => setCameraOn(false)} />
          <div className="scanner-actions"><button className="primary-cta" type="button" onClick={() => { if (loading) return; setIssue(null); setCameraOn(!cameraOn); }}><Barcode size={21}/>{cameraOn ? 'Закрыть камеру' : 'Сканировать код'}<ArrowRight size={20}/></button>
            <div className="scan-mini-actions"><button type="button" className="soft-action" onClick={() => { setCameraOn(false); setManualOpen(v => !v); setIssue(null); }}><ScanLine size={18}/> Ввести код</button><button type="button" className="soft-action" onClick={() => packageInput.current?.click()}><Camera size={18}/> Фото состава</button></div>
          </div>
          <div className="photo-extra"><button type="button" className="soft-action photo-food" onClick={() => foodInput.current?.click()}><Leaf size={17}/> Фото еды или фрукта</button></div>
          <input ref={packageInput} type="file" accept="image/*" capture="environment" className="hidden-photo-input" aria-label="Фото упаковки или состава" onChange={e => { void preparePhoto(e.target.files?.[0], 'package'); e.target.value = ''; }} />
          <input ref={foodInput} type="file" accept="image/*" capture="environment" className="hidden-photo-input" aria-label="Фото готового продукта" onChange={e => { void preparePhoto(e.target.files?.[0], 'food'); e.target.value = ''; }} />
          {photoDraft && <div className="photo-confirm"><img src={photoDraft.image} alt="Фото перед отправкой" /><div className="photo-confirm-content"><b>{photoDraft.mode === 'package' ? 'Анализ упаковки' : 'Оценка еды по фото'}</b><p>Снимок будет отправлен ИИ-сервису для распознавания. Результаты приблизительные; для аллергий проверяйте этикетку.</p><div className="photo-confirm-actions"><button type="button" onClick={() => setPhotoDraft(null)}>Отмена</button><button type="button" onClick={() => void sendPhoto()}>Отправить на анализ <ArrowRight size={16}/></button></div></div></div>}
          {manualOpen && <form className="manual-form" onSubmit={e => { e.preventDefault(); void lookup(manualCode); }}><label htmlFor="barcode-input">Штрихкод с упаковки</label><div><input id="barcode-input" type="text" inputMode="numeric" autoComplete="off" value={manualCode} maxLength={18} onChange={e => setManualCode(e.target.value)} placeholder="Например, 460..."/><button type="submit" disabled={loading}>Найти <ArrowRight size={17}/></button></div></form>}
        </div>
        {issue && <div role="alert" className={`feedback ${issue.kind}`}>
          <AlertCircle size={21}/>
          <div>
            <strong>{issue.kind === 'missing' ? 'Товар не найден' : issue.code ? 'Не получилось получить товар' : 'Информация'}</strong>
            <p>{issue.text}</p>
            {issue.code && <span className="feedback-code">Считан штрихкод: <b>{issue.code}</b></span>}
            {issue.code && <>
              <small>{issue.kind === 'missing'
                ? 'В доступных каталогах этого товара пока нет. Можете заполнить карточку по этикетке.'
                : 'Это ошибка получения данных, а не признак отсутствия товара в базе.'}</small>
              <div className="feedback-actions">
                <button type="button" onClick={() => { void lookup(issue.code!); }}>
                  <ScanLine size={16}/> Повторить поиск
                </button>
                <button type="button" onClick={() => packageInput.current?.click()}>
                  <Camera size={16}/> Фото состава
                </button>
                <button type="button" onClick={() => {
                  setEditingProduct({
                    code: issue.code!, name: `Товар ${issue.code}`, brand: '', quantity: '',
                    ingredients: '', ingredientsTags: [], allergensTags: [], tracesTags: [],
                    additivesTags: [], categoriesTags: [], labelsTags: [],
                    ingredientsAnalysisTags: [], servingSize: '', nutriments: {},
                  });
                  setIssue(null);
                }}>
                  <Leaf size={16}/> Добавить вручную
                </button>
              </div>
            </>}
          </div>
          <button type="button" aria-label="Закрыть" onClick={() => setIssue(null)}><X size={18}/></button>
        </div>}
        {marking && <MarkingPanel marking={marking}/>}
        {loading && <SkeletonResult/>}
        <div className="feature-grid"><div className="feature-tile"><span className="feature-icon green-glow"><Leaf size={22}/></span><strong>Состав без сложностей</strong><small>Сахар, жиры, добавки и объяснения</small></div><div className="feature-tile"><span className="feature-icon purple-glow"><ShieldCheck size={22}/></span><strong>Оценка от 0 до 100</strong><small>С учётом данных о продукте</small></div></div>
        {history.length > 0 && <section className="recent-section"><div className="section-headline"><div><span className="overline">ВАШИ ПРОДУКТЫ</span><h2>Недавно смотрели</h2></div><button type="button" onClick={() => setView('history')}>Все <ChevronRight size={17}/></button></div><div className="recent-list">{history.slice(0, 3).map(({ product: p }) => <ShelfItem key={p.code} product={p} onOpen={() => openProduct(p)} />)}</div></section>}
        <div className="quiet-disclaimer"><Info size={15}/> Оценка ориентировочная и не заменяет совет врача.</div>
      </div>}
      {screen === 'history' && <div className="secondary-page animate-rise"><div className="page-title"><span className="eyebrow"><Clock3 size={14}/> СОХРАНЕНО НА УСТРОЙСТВЕ</span><h1>История <span>сканов</span></h1><p>Последние 50 проверок доступны даже без интернета.</p></div>{history.length ? <><div className="list-heading"><b>Просмотренные товары</b><small>{history.length}</small></div><div className="shelf-list">{history.map(({ product: p }) => <ShelfItem key={p.code} product={p} onOpen={() => openProduct(p)}/>)}</div><button type="button" className="delete-history" onClick={() => { if (confirm('Очистить историю проверок?')) { localStorage.removeItem('skaner-products-history-v1'); setHistory([]); } }}><Trash2 size={17}/> Очистить историю</button></> : <div className="empty-card"><div className="empty-symbol"><Clock3 size={42}/></div><h2>Здесь пока пусто</h2><p>Отсканируйте товар — и его карточка появится в истории.</p><button type="button" className="empty-button" onClick={() => setView('scanner')}>Открыть сканер <ArrowRight size={17}/></button></div>}</div>}
      {screen === 'favorites' && <div className="secondary-page animate-rise"><div className="page-title"><span className="eyebrow"><Heart size={14}/> ВАША ПОДБОРКА</span><h1>Любимые <span>продукты</span></h1><p>Сохраняйте товары и сравнивайте состав двух вариантов.</p></div>{favorites.length ? <><div className="list-heading"><b>Избранное</b><small>{favorites.length} товаров</small></div><div className="shelf-list">{favorites.map(p => <ShelfItem key={p.code} product={p} onOpen={() => openProduct(p)} selected={compareIds.includes(p.code)} comparison onCompare={() => toggleCompare(p.code)} />)}</div>{compareIds.length > 0 && <div className="compare-dock"><span>Выбрано: {compareIds.length} из 2</span><button type="button" disabled={compareIds.length !== 2} onClick={() => setShowComparison(true)}>Сравнить <ArrowLeftRight size={18}/></button></div>}{showComparison && compareProducts.length === 2 && <div className="comparison-card glass-panel"><div className="section-headline"><h2>Сравнение</h2><button type="button" onClick={() => setShowComparison(false)} aria-label="Скрыть сравнение"><X size={20}/></button></div><div className="compare-grid">{compareProducts.map(p => { const rating = evaluate(p); return <div className="compare-column" key={p.code}><strong>{p.name}</strong><div className="compare-circle"><ScoreRing rating={rating} size={116}/></div><small>{rating.completeness === 'low' ? 'Мало данных' : rating.title}</small><div className="compare-stat">Ккал / 100 г <b>{formatValue(calorie100(p.nutriments), 0)}</b></div><div className="compare-stat">Сахар / 100 г <b>{formatValue(p.nutriments.sugars_100g ?? null)} г</b></div><div className="compare-stat">Соль / 100 г <b>{formatValue(p.nutriments.salt_100g ?? null)} г</b></div><div className="compare-stat">NOVA <b>{p.novaGroup ?? '—'}</b></div></div>; })}</div><p className="small-note">Индекс ориентировочный. Сравнивайте также порции и полный состав.</p></div>}</> : <div className="empty-card"><div className="empty-symbol"><Bookmark size={42}/></div><h2>Пока нет избранного</h2><p>На карточке товара нажмите на закладку, чтобы сохранить его сюда.</p><button type="button" className="empty-button" onClick={() => setView('scanner')}>Проверить продукт <ArrowRight size={17}/></button></div>}</div>}
      {screen === 'profile' && <div className="secondary-page animate-rise"><div className="page-title"><span className="eyebrow"><SlidersHorizontal size={14}/> ЛИЧНЫЕ НАСТРОЙКИ</span><h1>Мой <span>профиль</span></h1><p>Укажите ограничения, чтобы видеть дополнительные предупреждения.</p></div><div className="profile-hero"><span className="profile-icon"><UserRound size={28}/></span><div><strong>Ваш рацион</strong><span>Настройки хранятся только на этом устройстве</span></div><ShieldCheck size={21}/></div><section className="glass-panel profile-panel"><div className="section-heading"><div><span className="overline">ВАЖНО ЗНАТЬ</span><h2>Аллергены</h2></div></div><p className="small-note">Отметьте компоненты, которые вам нельзя. Проверяйте сведения по упаковке: каталог может быть неполным.</p><div className="allergens-grid">{ALLERGENS.map(a => <button type="button" key={a.id} aria-pressed={profile.allergens.includes(a.id)} className={`allergen-chip ${profile.allergens.includes(a.id) ? 'picked' : ''}`} onClick={() => switchAllergen(a.id)}>{profile.allergens.includes(a.id) ? <Check size={15}/> : <span className="empty-check"/>}{a.label}</button>)}</div></section><section className="glass-panel profile-panel"><div className="section-heading"><div><span className="overline">ПРЕДПОЧТЕНИЯ</span><h2>Питание</h2></div></div><div className="diet-options">{DIETS.map(option => <label key={option.value} className={`diet-option ${profile.diet === option.value ? 'active' : ''}`}><input type="radio" name="diet" value={option.value} checked={profile.diet === option.value} onChange={() => updateProfile({ ...profile, diet: option.value })}/><div><strong>{option.label}</strong><span>{option.description}</span></div><span className="diet-indicator">{profile.diet === option.value && <Check size={14}/>}</span></label>)}</div></section><section className="glass-panel profile-panel"><div className="section-heading"><div><span className="overline">ДЛЯ СПРАВКИ</span><h2>Калории в день</h2></div></div><div className="calorie-input-row"><input type="number" inputMode="numeric" aria-label="Калории в день" min={500} max={10000} step={50} value={profile.calories} onChange={e => { const val = Number(e.target.value); if (Number.isFinite(val)) updateProfile({ ...profile, calories: val }); }}/><span>ккал / день</span></div><p className="small-note">Индивидуальную норму лучше определять со специалистом. В MVP она не влияет на индекс состава.</p></section><div className="quiet-disclaimer"><Info size={16}/> Оценка ориентировочная и не заменяет совет врача.</div></div>}
      </>}
    </main>
    <BottomNav screen={screen} onSelect={setView}/>
    {editingProduct && <ProductEditor initial={editingProduct} onCancel={() => setEditingProduct(null)} onSave={saved => { setCached(saved); openProduct(saved); }}/>}
  </div></div>;
}
