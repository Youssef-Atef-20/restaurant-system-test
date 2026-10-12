import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'accent';
}

const variants = {
  default: 'bg-[var(--color-surface-2)] text-[var(--color-text-2)]',
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  danger:  'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  accent:  'bg-[var(--color-accent-bg)] text-[var(--color-accent)]',
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2 py-0.5 rounded-full
        text-xs font-medium
        ${variants[variant]}
      `}
    >
      {children}
    </span>
  );
}
