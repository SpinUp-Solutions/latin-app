import type { ReactNode } from 'react';

export function SummaryCard({
  title,
  headline,
  className = '',
  children,
}: {
  title: string;
  headline: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col rounded-xl border border-border/70 bg-white p-4 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-roman-stone">{title}</p>
      <p className="mt-1 font-serif text-xl leading-snug">{headline}</p>
      <div className="mt-3 flex-1 space-y-2">{children}</div>
    </div>
  );
}
