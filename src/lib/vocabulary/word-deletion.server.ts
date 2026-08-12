import { createHash, randomUUID } from 'node:crypto';

export const VOCABULARY_WORD_DELETION_CHALLENGE_COLLECTION = 'vocabulary_word_deletion_challenges';
export const WORD_DELETION_CHALLENGE_TTL_MS = 5 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const wordDeletionTokenHash = (token: string): string => sha256(token);

export function firestoreVersionFingerprint(value: unknown): string {
  if (!value || typeof value !== 'object') throw new Error('Firestore document version is unavailable');
  const timestamp = value as { seconds?: unknown; nanoseconds?: unknown; _seconds?: unknown; _nanoseconds?: unknown };
  const seconds = timestamp.seconds ?? timestamp._seconds;
  const nanoseconds = timestamp.nanoseconds ?? timestamp._nanoseconds;
  if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(nanoseconds)) {
    throw new Error('Firestore document version is unavailable');
  }
  return `${seconds}:${nanoseconds}`;
}

export const wordDeletionChallengeDocumentId = (wordId: string, actorUid: string) => sha256(`${wordId}\0${actorUid}`);

export function createWordDeletionChallenge(input: {
  wordId: string;
  actorUid: string;
  poolIds: string[];
  wordFingerprint: string;
  now?: number;
}) {
  const token = randomUUID();
  return {
    token,
    stored: {
      tokenHash: wordDeletionTokenHash(token),
      wordId: input.wordId,
      actorUid: input.actorUid,
      poolFingerprint: sha256(JSON.stringify([...input.poolIds].sort())),
      poolCount: input.poolIds.length,
      wordFingerprint: input.wordFingerprint,
      expiresAt: new Date((input.now ?? Date.now()) + WORD_DELETION_CHALLENGE_TTL_MS),
    },
  };
}

const expiryMillis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  return null;
};

export function isWordDeletionChallengeValid(input: {
  stored: unknown;
  token: string;
  wordId: string;
  actorUid: string;
  poolIds: string[];
  wordFingerprint: string;
  now?: number;
}): boolean {
  if (!input.stored || typeof input.stored !== 'object') return false;
  const stored = input.stored as Record<string, unknown>;
  const currentPoolIds = [...input.poolIds].sort();
  return (
    stored.tokenHash === wordDeletionTokenHash(input.token) &&
    stored.wordId === input.wordId &&
    stored.actorUid === input.actorUid &&
    stored.wordFingerprint === input.wordFingerprint &&
    stored.poolFingerprint === sha256(JSON.stringify(currentPoolIds)) &&
    stored.poolCount === currentPoolIds.length &&
    (expiryMillis(stored.expiresAt) ?? 0) > (input.now ?? Date.now())
  );
}
