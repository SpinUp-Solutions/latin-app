import { cn } from '@/src/lib/utils';
import { differingSpan } from '@/src/utils/vocabulary/word-diff';

/** `text` with the letters that differ from `other` marked, so a changed macron stands out. */
export function MarkedText({ text, other, markClass }: { text: string; other: string; markClass: string }) {
  const [start, changed, end] = differingSpan(text, other);
  return (
    <>
      {start}
      {changed && <mark className={cn('rounded-sm px-px text-inherit', markClass)}>{changed}</mark>}
      {end}
    </>
  );
}
