'use client';

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-bg hover:bg-white border border-ink',
  secondary: 'bg-surface-2 text-ink border border-line-strong hover:border-ink-3 hover:bg-surface-3',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:text-ink hover:bg-surface-2',
  danger: 'bg-transparent text-down border border-down/50 hover:bg-down/10',
};
const SIZES: Record<Size, string> = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-base gap-2' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Shown as a tooltip and to screen readers when the button is disabled. */
  disabledReason?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, disabledReason, className, children, title, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      title={isDisabled && disabledReason ? disabledReason : title}
      aria-description={isDisabled && disabledReason ? disabledReason : undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

const fieldBase =
  'w-full rounded-[var(--radius-control)] border border-line-strong bg-bg/60 px-3 text-base text-ink placeholder:text-ink-3 ' +
  'hover:border-ink-3 focus:border-gold focus:outline-none aria-[invalid=true]:border-down disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(fieldBase, 'h-10', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, 'min-h-24 py-2 leading-relaxed', className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cx(fieldBase, 'h-10 pr-8', className)} {...p}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, htmlFor, children, className }: { label: string; hint?: ReactNode; error?: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-caption text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ id, label, description, checked, onChange, disabled }: { id: string; label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label htmlFor={id} className={cx('flex cursor-pointer items-start gap-3 py-1', disabled && 'cursor-not-allowed opacity-50')}>
      <input id={id} type="checkbox" className="mt-1 size-4 accent-[var(--color-signal)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-base text-ink">{label}</span>
        {description && <span className="block text-sm text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

/** Panels are separated by hairlines; the header is optional. */
export function Panel({ title, action, children, className, bodyClassName, id, as: As = 'section' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string; as?: 'section' | 'div' | 'article' }) {
  return (
    <As id={id} aria-labelledby={title && id ? `${id}-title` : undefined} className={cx('print-plain min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface-1', className)}>
      {(title || action) && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          {title && (
            <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold text-ink">
              {title}
            </h2>
          )}
          {action && <div className="flex items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </As>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-serif text-[2rem] leading-tight font-medium text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-[68ch] text-base text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-[var(--radius-control)] bg-surface-3/70', className)} />;
}

export function SkeletonRows({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cx('h-5', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-3">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 text-caption text-ink-2">{children}</kbd>;
}
