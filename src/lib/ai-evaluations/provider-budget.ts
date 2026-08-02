import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { OPENAI_PROVIDER_LEASES_COLLECTION } from '../../../shared/constants/firestore';

/**
 * A Firestore-backed request semaphore shared by every process that uses the
 * project's OpenAI credentials. The limits are intentionally conservative
 * until queue and rate-limit telemetry supports tuning them upward.
 */
export const OPENAI_PROVIDER_MAX_CONCURRENCY = 4;
export const OPENAI_PROVIDER_MAX_MODEL_CONCURRENCY = 2;
export const OPENAI_PROVIDER_LEASE_MS = 2 * 60 * 1_000;
export const OPENAI_PROVIDER_MAX_WAIT_MS = 90 * 1_000;
export const OPENAI_PROVIDER_POLL_MS = 250;

interface StoredProviderLease {
  ownerId: string;
  model: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface OpenAIProviderLeaseOptions {
  ownerId?: string;
  maxWaitMs?: number;
  pollMs?: number;
  leaseMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface OpenAIProviderLeaseResult<T> {
  value: T;
  queueTimeMs: number;
}

const defaultSleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

const leaseDocumentId = (slot: number) => `slot-${slot}`;

const isLeaseActive = (value: unknown, now: number): value is StoredProviderLease => {
  if (!value || typeof value !== 'object') return false;
  const lease = value as Partial<StoredProviderLease>;
  return (
    typeof lease.ownerId === 'string' &&
    typeof lease.model === 'string' &&
    typeof lease.expiresAt === 'string' &&
    Number.isFinite(Date.parse(lease.expiresAt)) &&
    Date.parse(lease.expiresAt) > now
  );
};

const hasFirestoreTransactions = (db: Firestore): boolean =>
  Boolean(db && typeof (db as unknown as { runTransaction?: unknown }).runTransaction === 'function');

function stableOwnerId(model: string): string {
  return createHash('sha256').update(`${model}:${randomUUID()}`).digest('hex').slice(0, 32);
}

/**
 * Runs one provider call while holding a durable global lease. A missing
 * Firestore test double falls back to the caller's local concurrency control;
 * production Firebase instances always take the distributed path.
 */
export async function withOpenAIProviderLease<T>(
  db: Firestore,
  model: string,
  task: () => Promise<T>,
  options: OpenAIProviderLeaseOptions = {}
): Promise<OpenAIProviderLeaseResult<T>> {
  if (!hasFirestoreTransactions(db) || typeof db.collection !== 'function') {
    return { value: await task(), queueTimeMs: 0 };
  }

  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const maxWaitMs = options.maxWaitMs ?? OPENAI_PROVIDER_MAX_WAIT_MS;
  const pollMs = options.pollMs ?? OPENAI_PROVIDER_POLL_MS;
  const leaseMs = options.leaseMs ?? OPENAI_PROVIDER_LEASE_MS;
  const ownerId = options.ownerId ?? stableOwnerId(model);
  const startedWaitingAt = Date.now();
  const slotRefs = Array.from({ length: OPENAI_PROVIDER_MAX_CONCURRENCY }, (_, slot) =>
    db.collection(OPENAI_PROVIDER_LEASES_COLLECTION).doc(leaseDocumentId(slot))
  );

  let acquiredSlot: number | undefined;
  while (acquiredSlot === undefined) {
    const currentTime = now();
    const acquired = await db.runTransaction(async transaction => {
      const snapshots = await Promise.all(slotRefs.map(reference => transaction.get(reference)));
      const activeLeases = snapshots.map(snapshot => (snapshot.exists ? snapshot.data() : undefined));
      const activeCount = activeLeases.filter(value => isLeaseActive(value, currentTime)).length;
      const activeForModel = activeLeases.filter(
        value => isLeaseActive(value, currentTime) && (value as StoredProviderLease).model === model
      ).length;
      if (activeCount >= OPENAI_PROVIDER_MAX_CONCURRENCY || activeForModel >= OPENAI_PROVIDER_MAX_MODEL_CONCURRENCY) {
        return undefined;
      }

      const slot = activeLeases.findIndex(value => !isLeaseActive(value, currentTime));
      if (slot < 0) return undefined;
      const acquiredAt = new Date(currentTime).toISOString();
      transaction.set(slotRefs[slot], {
        ownerId,
        model,
        acquiredAt,
        expiresAt: new Date(currentTime + leaseMs).toISOString(),
      } satisfies StoredProviderLease);
      return slot;
    });

    if (acquired !== undefined) {
      acquiredSlot = acquired;
      break;
    }

    const waitedMs = Date.now() - startedWaitingAt;
    if (waitedMs >= maxWaitMs) {
      throw new Error('The OpenAI provider concurrency budget is currently exhausted. Please retry shortly.');
    }
    await sleep(Math.min(pollMs, Math.max(1, maxWaitMs - waitedMs)));
  }

  const queueTimeMs = Math.max(0, Date.now() - startedWaitingAt);
  if (queueTimeMs > 0) {
    console.info('[openai-budget] provider request queued', { model, queueTimeMs });
  }
  const slotRef = slotRefs[acquiredSlot];
  try {
    return { value: await task(), queueTimeMs };
  } finally {
    await db
      .runTransaction(async transaction => {
        const snapshot = await transaction.get(slotRef);
        const lease = snapshot.data() as Partial<StoredProviderLease> | undefined;
        if (snapshot.exists && lease?.ownerId === ownerId) transaction.delete(slotRef);
      })
      .catch(error => console.error('[openai-budget] provider lease release failed', error));
  }
}
