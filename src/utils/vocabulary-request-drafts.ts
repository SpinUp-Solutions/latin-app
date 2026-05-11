import type { VocabularyWord, VocabularyWordWithId } from '@/shared/types/vocabulary/schemas';
import type { RootWordCandidate } from '@/shared/types/vocabulary/requests';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import { buildEmptyWord } from './vocabulary-defaults';

const stripMacrons = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0304]/g, '')
    .normalize('NFC')
    .toLowerCase();

const stripUndefined = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => stripUndefined(item)) as T;
  }

  if (value && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (entry !== undefined) {
        cleaned[key] = stripUndefined(entry);
      }
    });
    return cleaned as T;
  }

  return value;
};

export const buildDraftVocabularyWord = (
  candidate: RootWordCandidate,
  autocompleteData: Partial<VocabularyWord> = {}
): VocabularyWord => {
  const emptyWord = buildEmptyWord(candidate.part_of_speech as PartOfSpeech) as VocabularyWordWithId;
  const { id, ...baseWord } = emptyWord;
  void id;

  const now = new Date().toISOString();
  const draft = {
    ...baseWord,
    ...autocompleteData,
    word: candidate.word,
    part_of_speech: candidate.part_of_speech,
    sort_key: stripMacrons(candidate.word),
    random_index: Math.random(),
    dictionary_entry:
      autocompleteData.dictionary_entry !== undefined
        ? autocompleteData.dictionary_entry
        : (candidate.dictionary_entry ?? null),
    translation:
      autocompleteData.translation && autocompleteData.translation.trim().length > 0
        ? autocompleteData.translation
        : (candidate.translation_hint ?? ''),
    createdAt: now,
    updatedAt: now,
  } as VocabularyWord;

  return stripUndefined(draft);
};

export const cleanVocabularyPayload = <T extends Record<string, unknown>>(value: T): T => stripUndefined(value);
