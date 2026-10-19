import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, ExternalLink, Image as ImageIcon, Search, ShieldAlert } from 'lucide-react';
import { readLabelOnDevice } from '../lib/ocrEngine';
import { makeThumbnail } from '../lib/photo';

export interface NameCandidate {
  code: string;
  name: string;
  brand: string;
  quantity: string;
  image?: string;
  source: 'off' | 'upcitemdb';
  hasNutrition: boolean;
  hasIngredients: boolean;
}
interface Props {
  onCancel: () => void;
  onSelect: (candidate: NameCandidate) => void;
}
interface SearchResult {
  items: NameCandidate[];
  sources: { openFoodFacts: boolean; upcItemDb: boolean };
}
function likelyName(text: string): string {
  const ignore = /^(состав|ingredients|пищевая|энергетическая|на 100|хранить|дата|изготовитель|адрес|масс[аы]|белки|жиры|углеводы|телефон|произведено|производитель)\b/i;
  const lines = text.split(/\n/).map(line => line.replace(/[^\p{L}\p{N} "'«».,-]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 4 && line.length < 76 && (line.match(/\p{L}/gu) || []).length >= 3 && !ignore.test(line));
  return lines.slice(0, 2).join(' ').slice(0, 90).trim();
}
export function ProductNameFinder({ onCancel, onSelect }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [picture, setPicture] = useState('');
  const [query, setQuery] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [busy, setBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState<NameCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [sourcesOnline, setSourcesOnline] = useState(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const searchByName = async (name: string) => {
    const q = name.replace(/\s+/g, ' ').trim();
    if (q.length < 3) { setError('Укажите название минимум из трёх символов.'); return; }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setSearchBusy(true);
    setSearched(false);
    setError('');
    setResults([]);
    setStatus('Ищем карточки по названию…');
    try {
      const res = await fetch('/api/search-products?q=' + encodeURIComponent(q), { signal: abort.signal });
      if (!res.ok) throw new Error('Каталоги не ответили. Можно повторить поиск или открыть его в браузере.');
      const data = await res.json() as SearchResult;
      if (!mounted.current || abort.signal.aborted) return;
      const candidates = Array.isArray(data.items) ? data.items.filter(item =>
        typeof item.code === 'string' && /^\d{8,14}$/.test(item.code) && typeof item.name === 'string'
      ) : [];
      setResults(candidates);
      setSourcesOnline(Boolean(data.sources?.openFoodFacts || data.sources?.upcItemDb));
      setSearched(true);
    } catch (e) {
      if (!mounted.current || abort.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Не удалось выполнить поиск.');
    } finally {
      if (mounted.current && !abort.signal.aborted) { setSearchBusy(false); setStatus(''); }
    }
  };
  const takePicture = async (file: File | undefined) => {
    if (!file || busy) return;
    controller.current?.abort();
    setBusy(true);
    setError('');
    setResults([]);
    setSearched(false);
    setStatus('Читаем крупное название с упаковки…');
    try {
      const image = await makeThumbnail(file);
      if (!mounted.current) return;
      setPicture(image);
      const read = await readLabelOnDevice(image, (message) => {
        if (mounted.current) setStatus(message);
      });
      if (!mounted.current) return;
      setOcrText(read.rawText);
      const detectedName = likelyName(read.rawText);
      if (detectedName.length >= 3) {
        setQuery(detectedName);
        await searchByName(detectedName);
      } else {
        setError('Не удалось выделить название. Введите его ниже вручную — поиск всё равно работает.');
      }
    } catch {
      if (mounted.current) setError('Название плохо видно. Сделайте крупное фото лицевой стороны или напишите название вручную.');
    } finally {
      if (mounted.current) { setBusy(false); setStatus(''); }
    }
  };

  const externalQuery = query.trim().slice(0, 90);
  return <div className="name-finder animate-rise">
    <div className="name-finder-header">
      <button type="button" className="name-finder-back" onClick={onCancel} aria-label="Назад к сканеру"><ArrowLeft size={22}/></button>
      <div><span className="overline">ПОИСК ПО НАЗВАНИЮ</span><h1>Найдём продукт по фото</h1></div>
    </div>
    <div className="name-finder-guide glass-panel">
      <div className="name-finder-upload">
        {picture ? <img src={picture} alt="Снимок передней стороны упаковки"/> :
          <div className="name-finder-placeholder"><ImageIcon size={43}/><span>Лицевая сторона упаковки</span></div>}
        <button className="name-finder-photo" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Camera size={20}/> {picture ? 'Сделать другое фото' : 'Сфотографировать название'}
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden-photo-input"
        aria-label="Фото названия товара" onChange={event => {
          void takePicture(event.target.files?.[0]);
          event.target.value = '';
        }}/>
      <p>Наведи камеру на **крупное название и бренд**. Мелкий состав фотографировать не нужно.</p>
      {status && <div className="name-finder-status" role="status">{status}</div>}
      {ocrText && <details className="name-finder-transcript"><summary>Что удалось прочитать с упаковки</summary><p>{ocrText.slice(0, 700)}</p></details>}
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void searchByName(query); }}>
        <label htmlFor="name-search-input">Название для поиска</label>
        <input id="name-search-input" value={query} maxLength={90} onChange={e => setQuery(e.target.value)}
          placeholder="Например, Чебуманы Горячая штучка" autoComplete="off" enterKeyHint="search"/>
        <button type="submit" disabled={searchBusy || busy || query.trim().length < 3}>
          <Search size={19}/> {searchBusy ? 'Ищем…' : 'Найти в каталогах'}
        </button>
      </form>
      {error && <p className="name-finder-error" role="alert">{error}</p>}
    </div>
    {(searched || searchBusy) && <section className="name-finder-results" aria-label="Результаты поиска">
      <div className="name-finder-results-head"><h2>Похожие товары</h2><small>{searchBusy ? 'Поиск…' : results.length + ' вариантов'}</small></div>
      <p>Проверь упаковку, название, бренд и вес. **Выбери только свой продукт.**</p>
      {searchBusy && <div className="name-finder-skeleton"><div/><div/><div/></div>}
      {!searchBusy && results.map(item => <article className="name-finder-hit" key={item.code}>
        <div className="name-finder-hit-photo">{item.image ? <img alt="" src={item.image} loading="lazy"/> : <ImageIcon size={24}/>}</div>
        <div className="name-finder-hit-details"><strong>{item.name}</strong><span>{[item.brand, item.quantity].filter(Boolean).join(' · ') || 'Бренд не указан'}</span>
          <small>Код: {item.code}</small>
          <div className="name-finder-flags">
            {item.hasNutrition ? <span className="has-data"><CheckCircle2 size={13}/> Есть БЖУ</span> : <span className="missing-data">БЖУ не указаны</span>}
            {item.hasIngredients && <span className="has-data">Есть состав</span>}
          </div>
          <button type="button" className="name-finder-choose" onClick={() => onSelect(item)}>
            Это мой товар <ArrowRight size={16}/>
          </button>
        </div>
      </article>)}
      {!searchBusy && results.length === 0 && <div className="name-finder-empty">
        {sourcesOnline ? 'Точного совпадения в подключённых каталогах не найдено.' : 'Источники пока не ответили.'}
        <p>Можно исправить название, переснять упаковку или посмотреть обычный поиск в интернете.</p>
      </div>}
    </section>}
    {externalQuery.length >= 3 && <a className="name-finder-external" href={'https://yandex.ru/search/?text=' + encodeURIComponent(externalQuery + ' состав калорийность БЖУ')} rel="noopener noreferrer" target="_blank">
      Поискать название в интернете <ExternalLink size={16}/>
    </a>}
    <div className="name-finder-disclaimer"><ShieldAlert size={18}/><span>Поиск не гарантирует точного совпадения. Калории и БЖУ берём только из карточки выбранного товара, не из похожих продуктов. Оценка ориентировочная и не заменяет совет врача.</span></div>
  </div>;
}
