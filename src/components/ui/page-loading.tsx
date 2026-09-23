import { cn } from '@/src/lib/utils';

/** Roman-red ring used for page loading. */
export function RomanSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-8 w-8 animate-spin rounded-full border-b-2 border-roman-red', className)}
      aria-hidden="true"
    />
  );
}

export function PageLoading({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-screen items-center justify-center bg-roman-marble', className)} role="status">
      <RomanSpinner />
      <span className="sr-only">{label}</span>
    </div>
  );
}
