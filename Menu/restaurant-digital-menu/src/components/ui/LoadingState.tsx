export function LoadingState() {
  return (
    <div className="loading-container" aria-label="Loading menu content">
      <div className="skeleton-header" />
      <div className="skeleton-nav" />
      <div className="skeleton-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-desc" />
            <div className="skeleton-line skeleton-variant" />
          </div>
        ))}
      </div>
    </div>
  );
}
