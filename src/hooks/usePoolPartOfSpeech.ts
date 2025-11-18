import { useMemo } from 'react';
import { useGetPoolQuery } from '@/src/store/api/vocabularyPoolApi';
import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';

const PART_OF_SPEECH_VALUES: ReadonlyArray<PartOfSpeech> = [
  'verb',
  'noun',
  'adjective',
  'pronoun',
  'adverb',
  'preposition',
  'conjunction',
  'interjection',
];

const normalizePartOfSpeech = (value: string | undefined): PartOfSpeech | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  return PART_OF_SPEECH_VALUES.find(pos => pos === normalized) as PartOfSpeech | undefined;
};

export const usePoolPartOfSpeech = (poolId: string | null | undefined) => {
  const shouldSkip = !poolId;
  const { data, isLoading } = useGetPoolQuery(poolId as string, { skip: shouldSkip });

  const { uniquePartOfSpeech, availablePartOfSpeech } = useMemo(() => {
    if (!data?.words || data.words.length === 0) {
      return {
        uniquePartOfSpeech: undefined,
        availablePartOfSpeech: [] as PartOfSpeech[],
      };
    }

    const parts = new Set<PartOfSpeech>();
    data.words.forEach(word => {
      const normalized = normalizePartOfSpeech(word.wordType);
      if (normalized) {
        parts.add(normalized);
      }
    });

    const available = Array.from(parts);
    const unique = available.length === 1 ? available[0] : undefined;

    return {
      uniquePartOfSpeech: unique,
      availablePartOfSpeech: available,
    };
  }, [data]);

  return {
    pool: data,
    isLoading,
    uniquePartOfSpeech,
    availablePartOfSpeech,
  };
};
