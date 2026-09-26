import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';

export function PlayerActionBar({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-roman-red/15 bg-white/95 p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center',
        className
      )}
      aria-label={label}>
      {children}
    </div>
  );
}

type PlayerBarButtonProps = Omit<ComponentProps<typeof Button>, 'variant'> & {
  tone?: 'primary' | 'outline' | 'ghost';
};

export function PlayerBarButton({ tone = 'primary', className, ...props }: PlayerBarButtonProps) {
  return (
    <Button
      variant={tone === 'primary' ? 'default' : tone}
      className={cn(
        'rounded-xl',
        tone === 'outline' && 'border-roman-red/20 hover:bg-roman-parchment',
        tone === 'primary' && 'bg-roman-red text-white hover:bg-roman-red/90',
        tone === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        className
      )}
      {...props}
    />
  );
}
