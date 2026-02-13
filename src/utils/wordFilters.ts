import type { PoolFilters } from '@/src/types/pool-filters';

export function cascadeFilterUpdates(currentFilters: PoolFilters, updates: Partial<PoolFilters>): PoolFilters {
  if (!('partOfSpeech' in updates)) {
    return { ...currentFilters, ...updates };
  }

  const newPos = updates.partOfSpeech;
  const cleanedUpdates = { ...updates };

  if (newPos !== 'verb') {
    cleanedUpdates.verbConjugation = 'all';
    cleanedUpdates.isDeponent = 'both';
  }
  if (newPos !== 'noun') {
    cleanedUpdates.nounDeclension = 'all';
  }
  if (newPos !== 'adjective') {
    cleanedUpdates.adjectiveDeclension = 'all';
  }
  if (newPos !== 'pronoun') {
    cleanedUpdates.pronounType = 'all';
    cleanedUpdates.pronounPerson = 'all';
  }

  return { ...currentFilters, ...cleanedUpdates };
}

export const POOL_WORD_FIELDS = [
  'word',
  'translation',
  'part_of_speech',
  'gender',
  'declension',
  'conjugation',
  'is_deponent',
  'section',
] as const;

export const buildAdvancedFilterParams = (
  filters: PoolFilters,
  options?: {
    select?: string[];
    limit?: number;
    lastWordId?: string;
    fetchAll?: boolean;
  }
): URLSearchParams => {
  const params = new URLSearchParams();

  if (filters.partOfSpeech && filters.partOfSpeech !== 'all') {
    params.append('wordType', filters.partOfSpeech);
  }

  if (filters.search && filters.search.trim()) {
    params.append('search', filters.search.trim());
  }

  if (filters.partOfSpeech === 'verb') {
    if (filters.verbConjugation && filters.verbConjugation !== 'all') {
      params.append('verbConjugation', filters.verbConjugation);
    }
    if (filters.isDeponent && filters.isDeponent !== 'both') {
      params.append('isDeponent', filters.isDeponent);
    }
  }

  if (filters.partOfSpeech === 'noun') {
    if (filters.nounDeclension && filters.nounDeclension !== 'all') {
      params.append('nounDeclension', filters.nounDeclension);
    }
  }

  if (filters.partOfSpeech === 'adjective') {
    if (filters.adjectiveDeclension && filters.adjectiveDeclension !== 'all') {
      params.append('adjectiveDeclension', filters.adjectiveDeclension);
    }
  }

  if (filters.partOfSpeech === 'pronoun') {
    if (filters.pronounType && filters.pronounType !== 'all') {
      params.append('pronounType', filters.pronounType);
    }
    if (filters.pronounType === 'personal' && filters.pronounPerson && filters.pronounPerson !== 'all') {
      params.append('pronounPerson', filters.pronounPerson);
    }
  }

  if (options?.select && options.select.length > 0) {
    params.append('select', options.select.join(','));
  }

  if (options?.fetchAll) {
    params.append('fetchAll', 'true');
  } else if (options?.limit !== undefined) {
    params.append('limit', String(options.limit));
  }

  if (options?.lastWordId) {
    params.append('lastWordId', options.lastWordId);
  }

  return params;
};
