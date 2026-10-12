import { Menu, Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button } from '../ui/Button';

interface TopbarProps {
  onMenuClick: () => void;
  pageTitle?: string;
}

export function Topbar({ onMenuClick, pageTitle }: TopbarProps) {
  const { signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <header
      className="
        sticky top-0 z-20 h-[var(--topbar-h)]
        flex items-center justify-between
        px-4 lg:px-6
        bg-[var(--color-surface)]/90 backdrop-blur-md
        border-b border-[var(--color-border)]
      "
    >
      {/* Left side — hamburger + page title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="
            lg:hidden p-2 rounded-[var(--radius-md)]
            text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]
            hover:text-[var(--color-text)] transition-colors
          "
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        {pageTitle && (
          <h1 className="text-sm font-semibold text-[var(--color-text)]">{pageTitle}</h1>
        )}
      </div>

      {/* Right side — theme toggle + sign out */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className="
            p-2 rounded-[var(--radius-md)]
            text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]
            hover:text-[var(--color-text)] transition-colors
          "
          aria-label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          loading={signingOut}
          className="gap-1.5"
        >
          <LogOut size={15} />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}
