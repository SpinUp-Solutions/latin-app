import type { HTMLAttributes } from 'react';
import { cn } from '@/src/lib/utils';

export function AdminPage({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <main className={cn('min-h-0 flex-1 overflow-y-auto focus:outline-none', className)} {...props}>
      <div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
    </main>
  );
}
