import type { ComponentType, ReactNode } from 'react';
import { RomanCard, RomanCardContent, RomanCardHeader } from './roman-card';
import { cn } from '@/src/lib/utils';

type PlayerIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
type HeadingElement = 'h1' | 'h2' | 'h3' | 'div';

interface RomanPlayerShellProps {
  icon: PlayerIcon;
  label: string;
  currentPage: number;
  totalPages: number;
  title: ReactNode;
  description?: ReactNode;
  headingAs?: HeadingElement;
  iconAdornment?: ReactNode;
  headerAside?: ReactNode;
  headerFooter?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function RomanPlayerShell({
  icon: Icon,
  label,
  currentPage,
  totalPages,
  title,
  description,
  headingAs: Heading = 'h3',
  iconAdornment,
  headerAside,
  headerFooter,
  children,
  className,
  contentClassName,
}: RomanPlayerShellProps) {
  return (
    <RomanCard className={className}>
      <RomanCardHeader className="relative overflow-hidden border-b border-roman-red/10 bg-roman-parchment/40">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-roman-red" />
        <div className="relative flex min-w-0 items-start gap-4 pt-3">
          <div className="relative shrink-0">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-roman-gold/40 bg-roman-parchment shadow-sm">
              <Icon className="h-7 w-7 text-roman-red" aria-hidden="true" />
            </div>
            {iconAdornment}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-roman-red/15 bg-roman-red/10 px-2.5 py-0.5 text-xs font-medium text-roman-red">
                <Icon className="h-3 w-3" aria-hidden="true" />
                {label}
              </span>
              <span className="text-xs tabular-nums text-roman-stone">
                Page {currentPage} of {totalPages}
              </span>
            </div>
            <Heading className="truncate font-serif text-2xl leading-tight tracking-wide text-roman-red">
              {title}
            </Heading>
            {description && (
              <div className="mt-1 line-clamp-2 text-sm leading-relaxed text-roman-stone">{description}</div>
            )}
          </div>

          {headerAside}
        </div>
        {headerFooter}
      </RomanCardHeader>

      <RomanCardContent className={cn(contentClassName)}>{children}</RomanCardContent>
    </RomanCard>
  );
}
