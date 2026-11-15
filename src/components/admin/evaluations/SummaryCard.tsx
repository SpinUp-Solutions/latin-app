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

/** The two compared profiles keep one colour each across a results page: stone for the first, red for the second. */
export function ProfileDot({ primary }: { primary: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${primary ? 'bg-primary' : 'bg-roman-stone'}`}
      aria-hidden="true"
    />
  );
}

/** One profile's figure inside a summary card. */
export function FigureRow({
  label,
  primary,
  leader,
  value,
  detail,
}: {
  label: string;
  primary: boolean;
  leader: boolean;
  value: string;
  detail?: string;
}) {
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex min-w-0 items-center gap-2 ${leader ? 'font-medium' : 'text-roman-stone'}`}>
          <ProfileDot primary={primary} />
          <span className="truncate">{label}</span>
        </span>
        <span className={`shrink-0 tabular-nums ${leader ? 'font-semibold' : ''}`}>{value}</span>
      </div>
      {detail && <p className="pl-[18px] text-[11px] tabular-nums text-roman-stone">{detail}</p>}
    </div>
  );
}

/** "GPT-6 Luna 3.2× cheaper" or "GPT-6 Luna 40% faster", from the percentage less the leader needs. */
export function LeadHeadline({ name, percent, word }: { name: string; percent: number; word: 'cheaper' | 'faster' }) {
  const lead =
    word === 'faster'
      ? `${Math.round(percent)}% faster`
      : percent === 100
        ? 'free'
        : `${Number((100 / (100 - percent)).toPrecision(2))}× cheaper`;
  return (
    <>
      {name} <span className="text-primary">{lead}</span>
    </>
  );
}
