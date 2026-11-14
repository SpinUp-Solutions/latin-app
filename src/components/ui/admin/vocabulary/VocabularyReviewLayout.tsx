import type { ReactNode } from 'react';
import { cn } from '@/src/lib/utils';

export function VocabularyReviewLayout({ list, children }: { list: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(18rem,42%)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[34%_66%] lg:grid-rows-none">
      <aside className="min-h-0 overflow-y-auto border-b border-gray-200 bg-white lg:border-b-0 lg:border-r">
        {list}
      </aside>
      <section className="flex min-h-0 flex-col overflow-hidden bg-white">{children}</section>
    </main>
  );
}

export function VocabularyReviewRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={selected}
      onClick={onSelect}
      className={cn(
        'w-full border-l-2 p-4 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-roman-parchment/60'
      )}>
      {children}
    </button>
  );
}
