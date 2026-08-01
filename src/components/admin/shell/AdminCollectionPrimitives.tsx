'use client';

import type { ReactNode } from 'react';
import { Loader2, Search, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
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
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
}

export function AdminSearchInput({
  value,
  onValueChange,
  label,
  placeholder,
  clearLabel = 'Clear search',
  className,
  inputClassName,
  disabled,
  id,
}: AdminSearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        aria-hidden="true"
      />
      <Input
        id={id}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        className={cn('pl-10 pr-10', inputClassName)}
        disabled={disabled}
      />
      {value && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onValueChange('')}
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-roman-stone"
          aria-label={clearLabel}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

export function AdminLoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-12', className)} role="status">
      <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
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
