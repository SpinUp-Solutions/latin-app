import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';

export interface AdminPillOption<T extends string> {
  value: T;
  label: string;
  /** Shown after the label, like the lesson type counts. */
  count?: string | number | null;
  disabled?: boolean;
}

interface AdminPillPickerProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: AdminPillOption<T>[];
  label: string;
  className?: string;
  role?: 'group' | 'tablist';
}

/** Shared single-choice filters for admin pages. */
export function AdminPillPicker<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
  role = 'group',
}: AdminPillPickerProps<T>) {
  return (
    <div
      className={cn(
        'flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-xl border border-border/80 bg-white/80 p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
      role={role}
      aria-label={label}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Button
            type="button"
            tabIndex={0}
            key={option.value}
            size="sm"
            variant={selected ? 'default' : 'ghost'}
            role={role === 'tablist' ? 'tab' : undefined}
            aria-selected={role === 'tablist' ? selected : undefined}
            aria-pressed={role === 'group' ? selected : undefined}
            disabled={option.disabled}
            className={
              selected
                ? 'h-9 shrink-0 gap-2 rounded-lg px-3.5 text-xs font-semibold shadow-[0_2px_6px_hsl(var(--primary)/0.22)]'
                : 'h-9 shrink-0 gap-2 rounded-lg px-3.5 text-xs font-medium text-roman-stone hover:bg-roman-parchment hover:text-foreground'
            }
            onClick={() => onValueChange(option.value)}>
            {option.label}
            {option.count != null && (
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  selected ? 'text-primary-foreground/75' : 'text-roman-stone/70'
                )}>
                {option.count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
