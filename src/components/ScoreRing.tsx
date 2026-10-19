import type { Rating } from '../types';

export function ScoreRing({ rating, size = 156 }: { rating: Rating; size?: number }) {
  const radius = 53;
  const circumference = 2 * Math.PI * radius;
  const unknown = rating.completeness === 'low';
  return (
    <div className={`score-ring score-${unknown ? 'unknown' : rating.band}`} style={{ width: size, height: size }} role="img" aria-label={unknown ? 'Недостаточно данных для оценки' : `Ориентировочный индекс замечаний к составу ${rating.score} из 100`}>
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r={radius} stroke="currentColor" strokeWidth="11" className="score-track" fill="none" />
        <circle cx="70" cy="70" r={radius} stroke="currentColor" strokeWidth="11" strokeLinecap="round" fill="none"
          strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference - (unknown ? 0 : rating.score / 100) * circumference}
          transform="rotate(-90 70 70)" className="score-progress" />
      </svg>
      <div className="score-center"><strong>{unknown ? '—' : rating.score}</strong><span>{unknown ? 'мало данных' : 'из 100'}</span></div>
    </div>
  );
}
