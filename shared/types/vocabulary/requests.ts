import type { CostBreakdown } from '../../openai/types';
import type { VocabularyWord } from './schemas';
import type { PartOfSpeech } from './schemas/enums';

export const VOCABULARY_WORD_REQUEST_STATUSES = ['pending', 'approved', 'dismissed'] as const;

export type VocabularyWordRequestStatus = (typeof VOCABULARY_WORD_REQUEST_STATUSES)[number];

export type RootWordCandidate = {
  word: string;
  part_of_speech: PartOfSpeech;
  dictionary_entry?: string | null;
  translation_hint?: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason?: string | null;
};

export type VocabularyWordRequest = {
  id: string;
  status: VocabularyWordRequestStatus;
  sourceText: string;
  selectedCandidate: RootWordCandidate;
  candidates: RootWordCandidate[];
  draftWord: VocabularyWord;
  aiMeta?: {
    model?: string;
    cost?: CostBreakdown;
    fieldStatus?: Record<string, 'filled' | 'missing'>;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvedWordId?: string | null;
  dismissedReason?: string | null;
};
