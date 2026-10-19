import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ClipboardList, X } from 'lucide-react';
import type { Product, Nutriments } from '../types';

type Key = 'calories' | 'protein' | 'fat' | 'carbs' | 'sugar' | 'salt';
const FIELDS: { id: Key; label: string; unit: string; nutrient: keyof Nutriments }[] = [
  { id: 'calories', label: 'Калорийность', unit: 'ккал', nutrient: 'energy-kcal_100g' },
  { id: 'protein', label: 'Белки', unit: 'г', nutrient: 'proteins_100g' },
  { id: 'fat', label: 'Жиры', unit: 'г', nutrient: 'fat_100g' },
  { id: 'carbs', label: 'Углеводы', unit: 'г', nutrient: 'carbohydrates_100g' },
  { id: 'sugar', label: 'Из них сахара', unit: 'г', nutrient: 'sugars_100g' },
  { id: 'salt', label: 'Соль', unit: 'г', nutrient: 'salt_100g' },
];

export function ProductEditor({ initial, recognizedText, onCancel, onSave }: {
  initial: Product; recognizedText?: string; onCancel: () => void; onSave: (product: Product) => void;
}) {
  const [name, setName] = useState(initial.name.startsWith('Товар ') ? '' : initial.name);
  const [brand, setBrand] = useState(initial.brand);
  const [quantity, setQuantity] = useState(initial.quantity);
  const [ingredients, setIngredients] = useState(initial.ingredients);
  const [values, setValues] = useState<Record<Key, string>>(() => Object.fromEntries(
    FIELDS.map(({ id, nutrient }) => [id, initial.nutriments[nutrient] == null ? '' : String(initial.nutriments[nutrient])])
  ) as Record<Key, string>);
  const [error, setError] = useState('');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) { setError('Укажите название продукта.'); return; }
    const nutriments: Nutriments = { ...initial.nutriments };
    for (const { id, nutrient } of FIELDS) {
      const raw = values[id].trim().replace(',', '.');
      if (!raw) { delete nutriments[nutrient]; continue; }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > (id === 'calories' ? 1000 : 100)) {
        setError('Проверьте значения на 100 г/мл: неотрицательные числа, для БЖУ не более 100 г.');
        return;
      }
      nutriments[nutrient] = value;
    }
    onSave({
      ...initial, name: name.trim(), brand: brand.trim(), quantity: quantity.trim(),
      ingredients: ingredients.trim(), nutriments, source: 'manual',
    });
  };
  return <div className="editor-overlay" role="dialog" aria-modal="true" aria-label="Заполнить товар вручную">
    <section className="editor-sheet">
      <div className="editor-top"><div><span className="overline">ДАННЫЕ С УПАКОВКИ</span><h2>Добавить товар</h2></div><button type="button" onClick={onCancel} aria-label="Закрыть"><X size={22} /></button></div>
      <p>Штрихкод: <b>{initial.code}</b>. Перенесите сведения именно с этой этикетки, неизвестные поля оставьте пустыми.</p>
      {initial.aiNotes && <p className="editor-ocr-note">{initial.aiNotes}</p>}
      {initial.sourceNote && <p className="editor-ocr-note">{initial.sourceNote}</p>}
      {recognizedText && <details className="editor-transcript" open><summary>Распознанный текст — сверьте с этикеткой</summary><p>Можно выделить и скопировать нужные значения в поля ниже. В этом тексте возможны ошибки.</p><textarea readOnly rows={5} value={recognizedText} aria-label="Текст, распознанный с этикетки" /></details>}
      <form onSubmit={save}>
        <label className="editor-label">Название продукта<input required value={name} onChange={e => setName(e.target.value)} placeholder="Например, морс клюквенный" /></label>
        <div className="editor-two">
          <label className="editor-label">Бренд<input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Необязательно" /></label>
          <label className="editor-label">Объём / вес<input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Например, 1 л" /></label>
        </div>
        <div className="editor-group-title"><ClipboardList size={17} /> Пищевая ценность на 100 г / 100 мл</div>
        <div className="editor-two">
          {FIELDS.map(field => <label className="editor-label" key={field.id}>{field.label} · {field.unit}<input inputMode="decimal" type="text" value={values[field.id]} onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))} placeholder="Не указано" /></label>)}
        </div>
        <label className="editor-label">Состав<textarea rows={3} value={ingredients} onChange={e => setIngredients(e.target.value)} placeholder="Перепишите состав с этикетки…" /></label>
        {error && <p className="editor-error" role="alert">{error}</p>}
        <div className="editor-reminder">Данные сохраняются только на этом устройстве. Сверяйте аллергены с оригинальной упаковкой.</div>
        <button className="editor-save" type="submit">Сохранить карточку <ArrowRight size={18} /></button>
      </form>
    </section>
  </div>;
}
