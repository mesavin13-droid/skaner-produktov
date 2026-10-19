import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeftRight, ArrowRight, Barcode, Bookmark, Camera, Check,
  ChevronRight, Clock3, Heart, Info, Leaf, ScanLine,
  ShieldCheck, SlidersHorizontal, Trash2, UserRound, X,
} from 'lucide-react';
import { BottomNav } from './components/BottomNav';
import { CameraScanner } from './components/CameraScanner';
import { titleQueries, pickPhotoProduct, type PhotoCandidate } from './lib/photoMatch';
import { MarkingPanel } from './components/MarkingPanel';
import { parseMarking, type MarkingInfo } from './lib/gs1';
import { ProductCard } from './components/ProductCard';
import { ScoreRing } from './components/ScoreRing';
import { ALLERGENS, evaluate } from './lib/evaluate';
import { calorie100, cleanBarcode, formatValue, getProduct, needsCatalogRefresh, ProductNotFound, validBarcode } from './lib/off';
import { makeThumbnail } from './lib/photo';
import { readLabelOnDevice } from './lib/ocrEngine';
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoStatus, setPhotoStatus] = useState('');
  const photoAttempt = useRef(0);
  const [marking, setMarking] = useState<MarkingInfo | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<SavedProduct[]>(getHistory);
  const [favorites, setFavorites] = useState<Product[]>(getFavorites);
  const [profile, changeProfile] = useState<Profile>(getProfile);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<{ kind: 'missing' | 'error'; text: string; code?: string } | null>(null);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const packageInput = useRef<HTMLInputElement>(null);
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
    request.current?.abort(); pending.current = false; photoAttempt.current++;
    setPhotoBusy(false); setPhotoStatus('');
    setCameraOn(false); setProduct(null); setIssue(null); setLoading(false); setMarking(null);
    setScreen(next); setShowComparison(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProduct = (p: Product) => {
    setCameraOn(false); setLoading(false); pending.current = false; setProduct(p);
    setHistory(addHistory(p)); setScreen('scanner'); setIssue(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const lookup = useCallback(async (codeInput: string) => {
    if (pending.current) return;
    const parsedMarking = parseMarking(codeInput);
    const code = parsedMarking?.gtin ?? cleanBarcode(codeInput);
    if (!validBarcode(code)) { setIssue({ kind: 'error', text: 'Не удалось считать штрихкод. Наведите камеру на код ещё раз.' }); return; }
    setMarking(parsedMarking);
    pending.current = true;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setCameraOn(false); setProduct(null); setIssue(null);
    setLoading(true); setScreen('scanner');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const cached = getCached(code);
      const shouldRefresh = cached ? needsCatalogRefresh(cached) : true;
      const result = cached && !shouldRefresh ? cached : await getProduct(code, controller.signal);
      // Preserve an existing image fetched for the exact same barcode if the new source
      // has better text but no image. Do not reuse nutrition or ingredients from old data.
      const complete = cached?.image && !result.image && cached.code === result.code
        ? { ...result, image: cached.image }
        : result;
      if (!cached || shouldRefresh) setCached(complete);
      if (!controller.signal.aborted) openProduct(complete);
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

  const scanFrontPhoto = async (file: File | undefined) => {
    if (!file || photoBusy) return;
    const attempt = ++photoAttempt.current;
    const sameAttempt = () => photoAttempt.current === attempt;
    setCameraOn(false);
    setPhotoBusy(true);
    setIssue(null);
    setPhotoStatus('Распознаём название на упаковке…');
    try {
      const image = await makeThumbnail(file);
      const label = await readLabelOnDevice(image, message => {
        if (sameAttempt()) setPhotoStatus(message);
      });
      if (!sameAttempt()) return;
      const queries = titleQueries(label.rawText);
      if (!queries.length) throw new Error('Название не удалось прочитать. Попробуйте снять упаковку ближе.');
      setPhotoStatus('Находим продукт и проверяем данные…');
      const found = new Map<string, PhotoCandidate>();
      for (const query of queries) {
        if (!sameAttempt()) return;
        const response = await fetch('/api/search-products?q=' + encodeURIComponent(query));
        if (!response.ok) continue;
        const data = await response.json() as { items?: PhotoCandidate[] };
        if (Array.isArray(data.items)) {
          for (const candidate of data.items) {
            if (candidate.code && /^\d{8,14}$/.test(candidate.code)) found.set(candidate.code, candidate);
          }
        }
        if (pickPhotoProduct(label.rawText, [...found.values()])) break;
      }
      if (!sameAttempt()) return;
      const result = pickPhotoProduct(label.rawText, [...found.values()]);
      if (!result) {
        throw new Error('Не удалось надёжно определить именно этот товар. Попробуйте другое фото или сканируйте штрихкод.');
      }
      setPhotoBusy(false);
      setPhotoStatus('');
      void lookup(result.code);
    } catch (error) {
      if (sameAttempt()) {
        setIssue({ kind: 'error', text: error instanceof Error ? error.message : 'Не удалось распознать товар.' });
      }
    } finally {
      if (sameAttempt()) { setPhotoBusy(false); setPhotoStatus(''); }
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
      {product ? <>{marking && <div className="marking-result"><MarkingPanel marking={marking}/></div>}<ProductCard product={product} profile={profile} favorite={favorites.some(p => p.code === product.code)} onBack={() => { setProduct(null); setIssue(null); setMarking(null); }} onFavorite={() => toggleFave(product)} /></> : <>
      {screen === 'scanner' && <div className="scanner-page quick-scanner animate-rise">
        <div className="quick-heading">
          <h1>Проверить продукт</h1>
          <p>Наведи камеру или сделай фото. Остальное сделаем сами.</p>
        </div>
        <div className="quick-actions">
          <button className="quick-action quick-barcode" type="button"
            disabled={loading || photoBusy}
            onClick={() => { setIssue(null); setCameraOn(v => !v); }}>
            <span className="quick-action-icon"><Barcode size={28}/></span>
            <span className="quick-action-label"><strong>Сканировать</strong><small>Штрихкод или Data Matrix</small></span>
            <ArrowRight size={23}/>
          </button>
          <button className="quick-action quick-photo" type="button"
            disabled={loading || photoBusy} onClick={() => packageInput.current?.click()}>
            <span className="quick-action-icon"><Camera size={28}/></span>
            <span className="quick-action-label"><strong>Сфотографировать</strong><small>Упаковку с названием</small></span>
            <ArrowRight size={23}/>
          </button>
        </div>
        {cameraOn && <div className="quick-camera glass-panel">
          <CameraScanner active onDetected={code => void lookup(code)} onCancel={() => setCameraOn(false)}/>
        </div>}
        {photoBusy && <div className="quick-analyzing" role="status">
          <div className="quick-analyzing-thumb"/>
          <div className="quick-analyzing-lines"><strong>{photoStatus || 'Проверяем продукт…'}</strong>
            <div className="shine"/><div className="shine"/></div>
        </div>}
        {issue && <div role="alert" className="quick-error">
          <AlertCircle size={22}/>
          <div><strong>{issue.kind === 'missing' ? 'Не нашли проверенные сведения' : 'Не получилось проверить товар'}</strong>
            <p>{issue.text}</p>
            {issue.code && <small>Штрихкод: {issue.code}</small>}
            <button type="button" onClick={() => { setIssue(null); packageInput.current?.click(); }}>
              <Camera size={17}/> Попробовать фото
            </button>
          </div>
        </div>}
        {marking && <MarkingPanel marking={marking}/>}
        {loading && <SkeletonResult/>}
        <p className="quick-footer">Оценка ориентировочная и не заменяет совет врача.</p>
      </div>}
      {screen === 'history' && <div className="secondary-page animate-rise"><div className="page-title"><span className="eyebrow"><Clock3 size={14}/> СОХРАНЕНО НА УСТРОЙСТВЕ</span><h1>История <span>сканов</span></h1><p>Последние 50 проверок доступны даже без интернета.</p></div>{history.length ? <><div className="list-heading"><b>Просмотренные товары</b><small>{history.length}</small></div><div className="shelf-list">{history.map(({ product: p }) => <ShelfItem key={p.code} product={p} onOpen={() => openProduct(p)}/>)}</div><button type="button" className="delete-history" onClick={() => { if (confirm('Очистить историю проверок?')) { localStorage.removeItem('skaner-products-history-v1'); setHistory([]); } }}><Trash2 size={17}/> Очистить историю</button></> : <div className="empty-card"><div className="empty-symbol"><Clock3 size={42}/></div><h2>Здесь пока пусто</h2><p>Отсканируйте товар — и его карточка появится в истории.</p><button type="button" className="empty-button" onClick={() => setView('scanner')}>Открыть сканер <ArrowRight size={17}/></button></div>}</div>}
      {screen === 'favorites' && <div className="secondary-page animate-rise"><div className="page-title"><span className="eyebrow"><Heart size={14}/> ВАША ПОДБОРКА</span><h1>Любимые <span>продукты</span></h1><p>Сохраняйте товары и сравнивайте состав двух вариантов.</p></div>{favorites.length ? <><div className="list-heading"><b>Избранное</b><small>{favorites.length} товаров</small></div><div className="shelf-list">{favorites.map(p => <ShelfItem key={p.code} product={p} onOpen={() => openProduct(p)} selected={compareIds.includes(p.code)} comparison onCompare={() => toggleCompare(p.code)} />)}</div>{compareIds.length > 0 && <div className="compare-dock"><span>Выбрано: {compareIds.length} из 2</span><button type="button" disabled={compareIds.length !== 2} onClick={() => setShowComparison(true)}>Сравнить <ArrowLeftRight size={18}/></button></div>}{showComparison && compareProducts.length === 2 && <div className="comparison-card glass-panel"><div className="section-headline"><h2>Сравнение</h2><button type="button" onClick={() => setShowComparison(false)} aria-label="Скрыть сравнение"><X size={20}/></button></div><div className="compare-grid">{compareProducts.map(p => { const rating = evaluate(p); return <div className="compare-column" key={p.code}><strong>{p.name}</strong><div className="compare-circle"><ScoreRing rating={rating} size={116}/></div><small>{rating.completeness === 'low' ? 'Мало данных' : rating.title}</small><div className="compare-stat">Ккал / 100 г <b>{formatValue(calorie100(p.nutriments), 0)}</b></div><div className="compare-stat">Сахар / 100 г <b>{formatValue(p.nutriments.sugars_100g ?? null)} г</b></div><div className="compare-stat">Соль / 100 г <b>{formatValue(p.nutriments.salt_100g ?? null)} г</b></div><div className="compare-stat">NOVA <b>{p.novaGroup ?? '—'}</b></div></div>; })}</div><p className="small-note">Индекс ориентировочный. Сравнивайте также порции и полный состав.</p></div>}</> : <div className="empty-card"><div className="empty-symbol"><Bookmark size={42}/></div><h2>Пока нет избранного</h2><p>На карточке товара нажмите на закладку, чтобы сохранить его сюда.</p><button type="button" className="empty-button" onClick={() => setView('scanner')}>Проверить продукт <ArrowRight size={17}/></button></div>}</div>}
      {screen === 'profile' && <div className="secondary-page animate-rise"><div className="page-title"><span className="eyebrow"><SlidersHorizontal size={14}/> ЛИЧНЫЕ НАСТРОЙКИ</span><h1>Мой <span>профиль</span></h1><p>Укажите ограничения, чтобы видеть дополнительные предупреждения.</p></div><div className="profile-hero"><span className="profile-icon"><UserRound size={28}/></span><div><strong>Ваш рацион</strong><span>Настройки хранятся только на этом устройстве</span></div><ShieldCheck size={21}/></div><section className="glass-panel profile-panel"><div className="section-heading"><div><span className="overline">ВАЖНО ЗНАТЬ</span><h2>Аллергены</h2></div></div><p className="small-note">Отметьте компоненты, которые вам нельзя. Проверяйте сведения по упаковке: каталог может быть неполным.</p><div className="allergens-grid">{ALLERGENS.map(a => <button type="button" key={a.id} aria-pressed={profile.allergens.includes(a.id)} className={`allergen-chip ${profile.allergens.includes(a.id) ? 'picked' : ''}`} onClick={() => switchAllergen(a.id)}>{profile.allergens.includes(a.id) ? <Check size={15}/> : <span className="empty-check"/>}{a.label}</button>)}</div></section><section className="glass-panel profile-panel"><div className="section-heading"><div><span className="overline">ПРЕДПОЧТЕНИЯ</span><h2>Питание</h2></div></div><div className="diet-options">{DIETS.map(option => <label key={option.value} className={`diet-option ${profile.diet === option.value ? 'active' : ''}`}><input type="radio" name="diet" value={option.value} checked={profile.diet === option.value} onChange={() => updateProfile({ ...profile, diet: option.value })}/><div><strong>{option.label}</strong><span>{option.description}</span></div><span className="diet-indicator">{profile.diet === option.value && <Check size={14}/>}</span></label>)}</div></section><section className="glass-panel profile-panel"><div className="section-heading"><div><span className="overline">ДЛЯ СПРАВКИ</span><h2>Калории в день</h2></div></div><div className="calorie-input-row"><input type="number" inputMode="numeric" aria-label="Калории в день" min={500} max={10000} step={50} value={profile.calories} onChange={e => { const val = Number(e.target.value); if (Number.isFinite(val)) updateProfile({ ...profile, calories: val }); }}/><span>ккал / день</span></div><p className="small-note">Индивидуальную норму лучше определять со специалистом. В MVP она не влияет на индекс состава.</p></section><div className="quiet-disclaimer"><Info size={16}/> Оценка ориентировочная и не заменяет совет врача.</div></div>}
      </>}
    </main>
<input ref={packageInput} type="file" accept="image/*" capture="environment" className="hidden-photo-input" aria-label="Фото товара" onChange={e => { void scanFrontPhoto(e.target.files?.[0]); e.target.value = ''; }} />
    <BottomNav screen={screen} onSelect={setView}/>
  </div></div>;
}
