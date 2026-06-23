import type { VocabularyPool, VocabularyPoolSummary } from '@/src/types/vocabulary-pool';

const MAX_SEARCH_TOKEN_LENGTH = 40;

export function normalizePoolSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildPoolSearchTokens(name: string): string[] {
  const normalized = normalizePoolSearchText(name);
  if (!normalized) return [];

  const tokenSource = normalized.slice(0, 100);
  const tokens = new Set<string>();

  for (let start = 0; start < tokenSource.length; start += 1) {
    for (let end = start + 1; end <= tokenSource.length && end - start <= MAX_SEARCH_TOKEN_LENGTH; end += 1) {
      tokens.add(tokenSource.slice(start, end));
    }
  }

  return Array.from(tokens);
}

export function toVocabularyPoolSummary(id: string, data: Partial<VocabularyPool>): VocabularyPoolSummary {
  const metadata = data.metadata || {
    createdAt: new Date(0),
    createdBy: '',
    updatedAt: new Date(0),
    updatedBy: '',
    wordCount: 0,
    isActive: false,
    tags: [],
    difficulty: 'beginner' as const,
  };

  return {
    id,
    name: data.name || '',
    description: data.description || '',
    metadata,
  };
}
