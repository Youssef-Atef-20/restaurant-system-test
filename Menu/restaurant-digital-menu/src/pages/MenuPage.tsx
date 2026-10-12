import { useEffect, useRef, useState } from 'react';
import AOS from 'aos';
import 'aos/dist/aos.css';

import { useMenu } from '../hooks/useMenu';
import { useTheme } from '../hooks/useTheme';
import { MenuHeader } from '../components/menu/MenuHeader';
import { CategoryNav } from '../components/menu/CategoryNav';
import { CategorySection } from '../components/menu/CategorySection';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';

export function MenuPage() {
  const { restaurantName, categories, loading, error, retry } = useMenu();
  const { theme, toggle } = useTheme();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const isScrollingTo = useRef(false);

  useEffect(() => {
    AOS.init({ once: true, duration: 500, easing: 'ease-out-cubic', offset: 60 });
  }, []);

  // Refresh AOS after menu content is mounted and rendered to the DOM
  useEffect(() => {
    if (!loading && categories.length > 0) {
      const handle = requestAnimationFrame(() => {
        AOS.refresh();
      });
      return () => cancelAnimationFrame(handle);
    }
  }, [loading, categories]);

  // Derive active category (defaults to first category without triggering cascading re-render)
  const effectiveActiveId = activeCategoryId ?? (categories[0]?.id ?? null);

  // Track active category via IntersectionObserver
  useEffect(() => {
    if (categories.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingTo.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id.replace('cat-', '');
          setActiveCategoryId(id);
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );

    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  function scrollToCategory(id: string) {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    setActiveCategoryId(id);
    isScrollingTo.current = true;

    // Measure actual sticky element heights instead of relying on CSS vars
    // (CSS custom properties inside calc() are unreliable on iOS Safari)
    const header = document.querySelector<HTMLElement>('.menu-header');
    const nav    = document.querySelector<HTMLElement>('.category-nav');
    const headerH = header?.offsetHeight ?? 64;
    const navH    = nav?.offsetHeight    ?? 52;
    const gap     = 16;

    const top = el.getBoundingClientRect().top + window.scrollY - headerH - navH - gap;
    window.scrollTo({ top, behavior: 'smooth' });

    setTimeout(() => { isScrollingTo.current = false; }, 1200);
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!restaurantName || categories.length === 0) return <EmptyState />;

  return (
    <div className="page-wrapper">
      <MenuHeader
        restaurantName={restaurantName}
        theme={theme}
        onToggleTheme={toggle}
      />

      <CategoryNav
        categories={categories}
        activeId={effectiveActiveId}
        onSelect={scrollToCategory}
      />

      <main className="menu-content">
        {categories.map((cat) => (
          <div
            key={cat.id}
            ref={(el) => {
              if (el) sectionRefs.current.set(cat.id, el);
              else sectionRefs.current.delete(cat.id);
            }}
          >
            <CategorySection category={cat} />
          </div>
        ))}
      </main>

      <footer className="menu-footer">
        <p>© {new Date().getFullYear()} {restaurantName} • All rights reserved</p>
      </footer>
    </div>
  );
}
