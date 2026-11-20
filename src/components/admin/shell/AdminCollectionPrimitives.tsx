'use client';

import type { ReactNode } from 'react';
import { Search, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { RomanSpinner } from '@/src/components/ui/page-loading';
import { cn } from '@/src/lib/utils';

interface AdminMetricProps {
  icon: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  className?: string;
  iconClassName?: string;
}

export function AdminMetric({ icon: Icon, label, value, className, iconClassName }: AdminMetricProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3 px-5 py-4', className)}>
      <Icon className={cn('h-4 w-4 shrink-0 text-primary', iconClassName)} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

interface AdminSearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  placeholder: string;
  clearLabel?: string;
  /** Classes for the bar itself, such as its width. */
  className?: string;
  inputClassName?: string;
  type?: 'text' | 'search';
  disabled?: boolean;
  id?: string;
  autoFocus?: boolean;
  /** `sm` for tight spots such as dialogs and side panels. */
  size?: 'default' | 'sm';
  /** Controls inside the bar after the input, such as a filters toggle. */
  trailing?: ReactNode;
}

/**
 * The admin panel's search bar: a rounded bar with the search icon, a clear button once something is typed,
 * and room for controls of its own at the end.
 */
export function AdminSearchInput({
  value,
  onValueChange,
  label,
  placeholder,
  clearLabel = 'Clear search',
  className,
  inputClassName,
  type = 'text',
  disabled,
  id,
  autoFocus,
  size = 'default',
  trailing,
}: AdminSearchInputProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-full bg-white shadow-sm ring-1 ring-gray-200 transition-shadow focus-within:ring-2 focus-within:ring-roman-red/30',
        size === 'sm' ? 'h-9 pl-3 pr-1' : 'h-11 pl-4 pr-1.5',
        disabled && 'opacity-60',
        className
      )}>
      <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      <input
        type={type}
        id={id}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:hidden',
          inputClassName
        )}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onValueChange('')}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red/30',
            size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
          )}
          aria-label={clearLabel}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {trailing}
    </div>
  );
}

export function AdminLoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-12', className)} role="status">
      <RomanSpinner />
      <span className="sr-only">{label}</span>
    </div>
  );
}

interface AdminErrorStateProps {
  message: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function AdminErrorState({ message, onRetry, retryLabel = 'Try again', className }: AdminErrorStateProps) {
  return (
    <div role="alert" className={cn('rounded-md border border-red-200 bg-red-50 p-6 text-red-700', className)}>
      <p>{message}</p>
      {onRetry && (
        <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
