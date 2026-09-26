import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';

export function ConnectionRetryBanner({
  message,
  onRetry,
  retrying = false,
  className,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950',
        className
      )}>
      <span>{message}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Trying again…' : 'Try again'}
      </Button>
    </div>
  );
}
