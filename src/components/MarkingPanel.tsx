import { CalendarDays, ShieldAlert, BadgeHelp, ExternalLink } from 'lucide-react';
import type { MarkingInfo } from '../lib/gs1';
import { formatMarkingDate, remainingDays } from '../lib/gs1';

export function MarkingPanel({ marking }: { marking: MarkingInfo }) {
  const days = marking.expiryDate ? remainingDays(marking.expiryDate) : null;
  const status = days === null ? 'unknown' : days < 0 ? 'expired' : days <= 3 ? 'soon' : 'valid';
  return <section className={`marking-panel marking-${status}`} aria-label="Информация по Data Matrix">
    <div className="marking-heading"><CalendarDays size={23}/><div><span className="overline">КОД МАРКИРОВКИ · DATA MATRIX</span><h2>Данные с упаковки</h2></div></div>
    <div className="marking-gtin">GTIN <b>{marking.gtin}</b></div>
    {marking.expiryDate ? <>
      <div className="marking-expiry"><span>{marking.expiryKind === 'best-before' ? 'Лучше употребить до' : 'Срок годности до'}</span><strong>{formatMarkingDate(marking.expiryDate)}</strong></div>
      <div className="marking-status" role="status">{days! < 0 ? `По дате в коде срок закончился ${Math.abs(days!)} дн. назад` : days === 0 ? 'Последний день указанного срока — сегодня' : `До указанной даты: ${days} дн.`}</div>
      {marking.productionDate && <p className="marking-detail">Дата производства из кода: {formatMarkingDate(marking.productionDate)}</p>}
      <p className="marking-explanation"><BadgeHelp size={16}/> Дата извлечена из поля GS1 в самом Data Matrix. Это не ответ базы «Честный ЗНАК», не проверка подлинности и не гарантия безопасности хранения.</p>
    </> : <>
      <div className="marking-no-date"><ShieldAlert size={19}/><span>В считанном коде нет доступного поля со сроком годности.</span></div>
      {marking.productionDate && <p className="marking-detail">Дата производства из кода: {formatMarkingDate(marking.productionDate)}</p>}
      <p className="marking-explanation">Сверьте дату на этикетке. Полный срок или статус конкретной марки требуется проверять через официальный «Честный ЗНАК» с разрешённым доступом.</p>
    </>}
    <a className="marking-external" href="https://честныйзнак.рф/" target="_blank" rel="noopener noreferrer">Официальный «Честный ЗНАК» <ExternalLink size={15}/></a>
  </section>;
}
