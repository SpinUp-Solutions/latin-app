import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/src/lib/utils';

type AdminPageHeadingProps = ComponentPropsWithoutRef<'h1'> & {
  'data-dialog-focus-fallback'?: boolean;
};

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  headingProps?: AdminPageHeadingProps;
}

export function AdminPageHeader({ title, description, actions, headingProps }: AdminPageHeaderProps) {
  const { className: headingClassName, ...restHeadingProps } = headingProps ?? {};

  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1
          className={cn('font-serif text-2xl leading-tight sm:text-3xl', headingClassName)}
          {...restHeadingProps}>
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-roman-stone sm:text-base">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
