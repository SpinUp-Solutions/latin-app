import { Word } from './admin-vocabulary';

export interface VocabularyPool {
  id: string; // Firestore doc ID
  name: string;
  description: string;
  wordDocIds: string[]; // Array of word document IDs
  sourcePoolIds?: string[];
  directWordDocIds?: string[];
  inheritedWordDocIds?: string[];
  sources?: Array<{ id: string; name: string }>;
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

export type VocabularyPoolUsageKind =
  | 'pool'
  | 'lesson'
  | 'lesson-exercise'
  | 'test-version'
  | 'test-version-exercise'
  | 'test-version-draft'
  | 'test-version-draft-exercise';

/** A saved lesson, test version, or draft that currently references a pool. */
export interface VocabularyPoolUsage {
  id: string;
  poolId: string;
  kind: VocabularyPoolUsageKind;
  label: string;
  editorUrl?: string;
}

export interface VocabularyPoolUsageResponse {
  status: 'available' | 'unavailable';
  usagesByPoolId: Record<string, VocabularyPoolUsage[]>;
  message?: string;
}

export interface VocabularyPoolDeletionChallenge {
  token: string;
  expiresAt: string;
  poolName: string;
  wordCount: number;
  usageStatus: 'available' | 'unavailable';
  usages: VocabularyPoolUsage[];
  message?: string;
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
  directWordDocIds?: string[];
  /** Create-mode composition fields. Ordinary create callers omit these. */
  sourcePoolIds?: string[];
  requestId?: string;
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
