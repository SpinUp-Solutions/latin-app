import { Word } from './admin-vocabulary';

export interface VocabularyPool {
  id: string; // Firestore doc ID
  name: string;
  description: string;
  wordDocIds: string[]; // Array of word document IDs
  searchTokens?: string[];
  metadata: VocabularyPoolMetadata;
}

export type VocabularyPoolSummary = Omit<VocabularyPool, 'wordDocIds' | 'searchTokens'>;

export interface VocabularyPoolMetadata {
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  wordCount: number;
  isActive: boolean;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export interface VocabularyPoolWithWords extends VocabularyPool {
  words: Word[]; // Populated from wordDocIds
}

export interface VocabularyPoolsResponse {
  success: boolean;
  data: {
    pools: VocabularyPoolSummary[];
    hasMore: boolean;
    lastPoolId: string | null;
  };
}

export interface VocabularyPoolResponse {
  success: boolean;
  data: {
    pool: VocabularyPoolWithWords;
    missingWordIds?: string[];
    actualWordCount: number;
  };
}

export interface CreatePoolRequest {
  name: string;
  description: string;
  wordDocIds?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  tags?: string[];
}

export interface AddWordsRequest {
  wordDocIds: string[];
  skipDuplicates?: boolean;
}

export interface AddWordsResponse {
  success: boolean;
  data: {
    addedCount: number;
    duplicateCount: number;
    invalidIds: string[];
    pool: VocabularyPool;
  };
}
