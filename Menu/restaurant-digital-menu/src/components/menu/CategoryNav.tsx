import { useRef, useEffect } from 'react';
import type { Category } from '../../types';

interface CategoryNavProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function CategoryNav({ categories, activeId, onSelect }: CategoryNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const isFirstMount = useRef(true);

  // Scroll active pill into view when it changes (skip on initial mount to avoid forced reflow)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId]);

  if (categories.length === 0) return null;

  return (
    <nav
      className="category-nav"
      aria-label="Category navigation"
      data-aos="fade-up"
      data-aos-delay="100"
    >
      <div className="category-nav-inner" ref={navRef}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            ref={activeId === cat.id ? activeRef : undefined}
            type="button"
            className={`category-pill${activeId === cat.id ? ' active' : ''}`}
            onClick={() => onSelect(cat.id)}
            aria-current={activeId === cat.id ? 'true' : undefined}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </nav>
  );
}
