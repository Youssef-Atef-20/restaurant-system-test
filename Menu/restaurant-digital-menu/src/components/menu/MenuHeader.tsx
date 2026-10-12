import { Sun, Moon } from 'lucide-react';

interface MenuHeaderProps {
  restaurantName: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function MenuHeader({ restaurantName, theme, onToggleTheme }: MenuHeaderProps) {
  const brandInitial = (restaurantName || '').trim().charAt(0) || '🍽️';

  return (
    <header className="menu-header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-logo" aria-hidden="true">{brandInitial}</div>
          <div>
            <h1 className="header-title">{restaurantName}</h1>
            <p className="header-subtitle">Digital Menu</p>
          </div>
        </div>

        <button
          onClick={onToggleTheme}
          className="theme-toggle"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          type="button"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
