import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  id,
  className = '',
  ...props
}: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-[var(--color-text)]"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute right-3 text-[var(--color-text-3)] pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          id={id}
          {...props}
          className={`
            w-full px-3 py-2 text-sm
            bg-[var(--color-surface)] border border-[var(--color-border)]
            rounded-[var(--radius-md)] text-[var(--color-text)]
            placeholder:text-[var(--color-text-3)]
            transition-all duration-200
            hover:border-[var(--color-border-2)]
            focus:outline-none focus:border-[var(--color-accent)]
            focus:ring-2 focus:ring-[var(--color-accent)]/20
            disabled:opacity-50 disabled:cursor-not-allowed
            ${leftIcon ? 'pr-9' : ''}
            ${rightIcon ? 'pl-9' : ''}
            ${error ? 'border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20' : ''}
            ${className}
          `}
        />
        {rightIcon && (
          <span className="absolute left-3 text-[var(--color-text-3)]">
            {rightIcon}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-text-3)]">{hint}</p>}
    </div>
  );
}

// Textarea variant
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, id, className = '', ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[var(--color-text)]">
          {label}
        </label>
      )}
      <textarea
        id={id}
        {...props}
        className={`
          w-full px-3 py-2 text-sm resize-none
          bg-[var(--color-surface)] border border-[var(--color-border)]
          rounded-[var(--radius-md)] text-[var(--color-text)]
          placeholder:text-[var(--color-text-3)]
          transition-all duration-200
          hover:border-[var(--color-border-2)]
          focus:outline-none focus:border-[var(--color-accent)]
          focus:ring-2 focus:ring-[var(--color-accent)]/20
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-[var(--color-danger)]' : ''}
          ${className}
        `}
      />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

// Select variant
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, error, id, options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[var(--color-text)]">
          {label}
        </label>
      )}
      <select
        id={id}
        {...props}
        className={`
          w-full px-3 py-2 text-sm
          bg-[var(--color-surface)] border border-[var(--color-border)]
          rounded-[var(--radius-md)] text-[var(--color-text)]
          transition-all duration-200
          hover:border-[var(--color-border-2)]
          focus:outline-none focus:border-[var(--color-accent)]
          focus:ring-2 focus:ring-[var(--color-accent)]/20
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-[var(--color-danger)]' : ''}
          ${className}
        `}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
