'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { useDebounce } from '@/src/hooks/useDebounce';
import { useFindWordsByHeadwordQuery } from '@/src/store/api/vocabularyApi';
import type { HeadwordMatch } from '@/src/types/vocabulary/index';

/** How long the headword must stay unchanged before it is looked up. */
export const HEADWORD_LOOKUP_DELAY_MS = 300;

/**
 * The words already stored under the headword of a word being added, looked up as the admin types it so a
 * duplicate is caught before anyone runs the AI or fills in the rest. `checking` holds until the lookup has
 * answered for the headword as it is now.
 */
export function useExistingHeadword(headword: string, enabled: boolean) {
  const typed = headword.trim();
  const settled = useDebounce(typed, HEADWORD_LOOKUP_DELAY_MS);
  const lookup = enabled && settled !== '';
  // `currentData` belongs to this headword only; `data` would still show the previous one's matches.
  const { currentData, isFetching } = useFindWordsByHeadwordQuery(settled, { skip: !lookup });
  const current = lookup && settled === typed;
  return {
    words: current ? (currentData?.words ?? []) : [],
    checking: enabled && typed !== '' && (!current || isFetching),
  };
}

/** Shown above the fields of a new word whose headword is already in the vocabulary. */
export function ExistingHeadwordNotice({
  headword,
  words,
  onOpen,
}: {
  headword: string;
  words: HeadwordMatch[];
  onOpen?: (word: HeadwordMatch) => void;
}) {
  if (words.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
        &ldquo;{headword.trim()}&rdquo; is already in the vocabulary
      </p>
      <ul aria-label="Words already in the vocabulary" className="mt-2 space-y-1.5">
        {words.map(word => (
          <li key={word.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="font-serif font-semibold">{word.word}</span> · {word.part_of_speech} · {word.translation}
            </span>
            {onOpen && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 bg-white"
                aria-label={`Open ${word.word} (${word.part_of_speech})`}
                onClick={() => onOpen(word)}>
                Open
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800">
        If this is a different word with the same spelling (like cum the preposition and cum the conjunction), carry on.
      </p>
    </div>
  );
}
