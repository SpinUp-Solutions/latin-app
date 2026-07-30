import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface AdminIconChipProps {
  icon: LucideIcon;
  className?: string;
}

export function AdminIconChip({ icon: Icon, className }: AdminIconChipProps) {
  return (
    <div
      className={cn(
        'relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.16] via-primary/[0.09] to-roman-gold/20 text-primary shadow-[0_3px_10px_-5px_hsl(var(--primary)/0.55)] transition-[transform,box-shadow,border-color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-[0_8px_18px_-7px_hsl(var(--primary)/0.6)] motion-reduce:transition-none',
        className
      )}>
      <span className="absolute inset-x-1 top-0 h-px bg-white/80" aria-hidden="true" />
      <Icon className="relative h-[1.15rem] w-[1.15rem]" strokeWidth={2.25} aria-hidden="true" />
    </div>
  );
}
