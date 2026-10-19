import { Bookmark, History, ScanLine, UserRound } from 'lucide-react';
import type { Screen } from '../types';

const nav: { id: Screen; label: string; Icon: typeof ScanLine }[] = [
  { id: 'scanner', label: 'Сканер', Icon: ScanLine },
  { id: 'history', label: 'История', Icon: History },
  { id: 'favorites', label: 'Избранное', Icon: Bookmark },
  { id: 'profile', label: 'Профиль', Icon: UserRound },
];
export function BottomNav({ screen, onSelect }: { screen: Screen; onSelect: (value: Screen) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {nav.map(({ id, label, Icon }) => (
        <button key={id} className={`bottom-nav-item ${screen === id ? 'selected' : ''}`} type="button" aria-current={screen === id ? 'page' : undefined} onClick={() => onSelect(id)}>
          <span className="bottom-nav-icon"><Icon size={21} strokeWidth={2.1} /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
