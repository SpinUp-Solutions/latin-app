import { createHash, randomUUID } from 'node:crypto';
import type { VocabularyPoolUsage } from '@/src/types/vocabulary-pool';
import type { VocabularyPoolUsageScan } from '@/src/lib/vocabulary-pools/usage.server';

export const DELETION_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type StoredVocabularyPoolDeletionChallenge = {
  tokenHash: string;
  actorUid: string;
  poolId: string;
  archiveId: string;
  usageFingerprint: string;
  poolFingerprint: string;
  wordContentRevision: number;
  expiresAt: Date;
};

export class VocabularyPoolDeletionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly code: string
  ) {
    super(message);
    this.name = 'VocabularyPoolDeletionError';
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const deletionChallengeDocumentId = (poolId: string, actorUid: string) => sha256(`${poolId}\0${actorUid}`);
export const deletionTokenHash = (token: string) => sha256(token);

const timestampValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return value ?? null;
};

export function vocabularyPoolContentFingerprint(poolData: Record<string, unknown>): string {
  const metadata =
    poolData.metadata && typeof poolData.metadata === 'object' ? (poolData.metadata as Record<string, unknown>) : {};
  return sha256(
    JSON.stringify({
      name: poolData.name ?? null,
      description: poolData.description ?? null,
      wordDocIds: Array.isArray(poolData.wordDocIds) ? poolData.wordDocIds : [],
      assignmentRevision: poolData._assignmentRevision ?? null,
      wordContentRevision: poolData._wordContentRevision ?? null,
      updatedAt: timestampValue(metadata.updatedAt),
      updatedBy: metadata.updatedBy ?? null,
    })
  );
}

export function poolUsagesForScan(scan: VocabularyPoolUsageScan, poolId: string): VocabularyPoolUsage[] {
  return scan.status === 'available' ? scan.usages.filter(usage => usage.poolId === poolId) : [];
}

export function vocabularyPoolUsageFingerprint(scan: VocabularyPoolUsageScan, poolId: string): string {
  const payload =
    scan.status === 'available'
      ? {
          status: scan.status,
          documentCount: scan.documentCount,
          usages: poolUsagesForScan(scan, poolId)
            .map(({ id, kind, label, editorUrl }) => ({ id, kind, label, editorUrl: editorUrl ?? null }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        }
      : {
          status: scan.status,
          documentCount: scan.documentCount ?? null,
          message: scan.message,
        };

  return sha256(JSON.stringify(payload));
}

export function createVocabularyPoolDeletionChallenge(input: {
  actorUid: string;
  poolId: string;
  usageFingerprint: string;
  poolFingerprint: string;
  wordContentRevision?: number;
  now?: number;
}) {
  const { actorUid, poolId, usageFingerprint, poolFingerprint, wordContentRevision = 0, now = Date.now() } = input;
  const token = randomUUID();
  return {
    token,
    stored: {
      tokenHash: deletionTokenHash(token),
      actorUid,
      poolId,
      archiveId: randomUUID(),
      usageFingerprint,
      poolFingerprint,
      wordContentRevision,
      expiresAt: new Date(now + DELETION_CHALLENGE_TTL_MS),
    } satisfies StoredVocabularyPoolDeletionChallenge,
  };
}

function expiryMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  return null;
}

export function validateVocabularyPoolDeletionChallenge(input: {
  stored: unknown;
  token: string;
  actorUid: string;
  poolId: string;
  usageFingerprint: string;
  poolFingerprint: string;
  wordContentRevision?: number;
  now?: number;
}): VocabularyPoolDeletionError | null {
  const {
    stored,
    token,
    actorUid,
    poolId,
    usageFingerprint,
    poolFingerprint,
    wordContentRevision = 0,
    now = Date.now(),
  } = input;
  if (!stored || typeof stored !== 'object') {
    return new VocabularyPoolDeletionError(
      'Deletion confirmation is missing. Review the current assignments and try again.',
      409,
      'VOCABULARY_POOL_CONFIRMATION_REQUIRED'
    );
  }

  const challenge = stored as Record<string, unknown>;
  const expiresAt = expiryMillis(challenge.expiresAt);
  if (
    challenge.tokenHash !== deletionTokenHash(token) ||
    challenge.actorUid !== actorUid ||
    challenge.poolId !== poolId ||
    challenge.usageFingerprint !== usageFingerprint ||
    challenge.poolFingerprint !== poolFingerprint ||
    challenge.wordContentRevision !== wordContentRevision ||
    expiresAt === null ||
    expiresAt <= now
  ) {
    return new VocabularyPoolDeletionError(
      'The pool assignments changed or the confirmation expired. Review the latest warning and try again.',
      409,
      'VOCABULARY_POOL_CONFIRMATION_STALE'
    );
  }
  return null;
}
