/** Internal state helpers shared by pool readers and mutation boundaries. */

export function isVocabularyPoolCreationPending(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return Boolean((data as Record<string, unknown>)._creationPending);
}

export class VocabularyPoolStateError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code = 'VOCABULARY_POOL_STATE_CONFLICT', status = 409) {
    super(message);
    this.name = 'VocabularyPoolStateError';
    this.status = status;
    this.code = code;
  }
}
