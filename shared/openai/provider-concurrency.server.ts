import { randomUUID } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { AI_PROVIDER_CONCURRENCY_COLLECTION } from '../constants/firestore';

export const OPENAI_GLOBAL_CONCURRENCY_LIMIT = 8;
export const OPENAI_RESERVED_PRODUCTION_CAPACITY = 2;
export const OPENAI_LEASE_TTL_MS = 60 * 1_000;
export const OPENAI_LEASE_HEARTBEAT_MS = 20 * 1_000;
export const OPENAI_LEASE_WAIT_MS = 30 * 1_000;
const OPENAI_LEASE_DOCUMENT_ID = 'openai';
const RETRY_DELAY_MS = 250;

interface ProviderLeaseState {
  leases?: Record<string, unknown>;
}

export type OpenAICapacityClass = 'production' | 'evaluation';

export interface ActiveProviderLease {
  expiresAtMs: number;
  capacityClass: OpenAICapacityClass;
}

export class OpenAIProviderCapacityError extends Error {
  constructor() {
    super('OpenAI provider capacity is temporarily full.');
    this.name = 'OpenAIProviderCapacityError';
  }
}

export class OpenAIProviderLeaseLostError extends Error {
  constructor() {
    super('OpenAI provider capacity lease was lost.');
    this.name = 'OpenAIProviderLeaseLostError';
  }
}

const leaseExpiryMillis = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || !('toMillis' in value)) return undefined;
  const millis = (value as { toMillis?: () => unknown }).toMillis?.();
  return typeof millis === 'number' && Number.isFinite(millis) ? millis : undefined;
};

const parseProviderLease = (value: unknown): ActiveProviderLease | undefined => {
  const legacyExpiry = leaseExpiryMillis(value);
  if (legacyExpiry !== undefined) return { expiresAtMs: legacyExpiry, capacityClass: 'production' };
  if (!value || typeof value !== 'object') return undefined;
  const lease = value as { expiresAt?: unknown; capacityClass?: unknown };
  const expiresAtMs = leaseExpiryMillis(lease.expiresAt);
  if (expiresAtMs === undefined || (lease.capacityClass !== 'production' && lease.capacityClass !== 'evaluation')) {
    return undefined;
  }
  return { expiresAtMs, capacityClass: lease.capacityClass };
};

export function activeProviderLeases(
  value: ProviderLeaseState | undefined,
  nowMs: number
): Record<string, ActiveProviderLease> {
  const leases = value?.leases;
  if (!leases || typeof leases !== 'object') return {};
  return Object.fromEntries(
    Object.entries(leases).flatMap(([id, rawLease]) => {
      const lease = parseProviderLease(rawLease);
      return lease && lease.expiresAtMs > nowMs ? [[id, lease]] : [];
    })
  );
}

export function canAcquireProviderLease(
  leases: Record<string, ActiveProviderLease>,
  capacityClass: OpenAICapacityClass
): boolean {
  const count = Object.keys(leases).length;
  if (count >= OPENAI_GLOBAL_CONCURRENCY_LIMIT) return false;
  return (
    capacityClass === 'production' || count < OPENAI_GLOBAL_CONCURRENCY_LIMIT - OPENAI_RESERVED_PRODUCTION_CAPACITY
  );
}

const delay = (durationMs: number) => new Promise(resolve => setTimeout(resolve, durationMs));

async function acquireProviderLease(ownerId: string, capacityClass: OpenAICapacityClass): Promise<void> {
  const db = getFirestore();
  const reference = db.collection(AI_PROVIDER_CONCURRENCY_COLLECTION).doc(OPENAI_LEASE_DOCUMENT_ID);
  const deadline = Date.now() + OPENAI_LEASE_WAIT_MS;

  while (Date.now() < deadline) {
    const acquired = await db.runTransaction(async transaction => {
      const nowMs = Date.now();
      const snapshot = await transaction.get(reference);
      const leases = activeProviderLeases(snapshot.exists ? (snapshot.data() as ProviderLeaseState) : undefined, nowMs);
      if (!canAcquireProviderLease(leases, capacityClass)) return false;
      transaction.set(reference, {
        leases: {
          ...Object.fromEntries(
            Object.entries(leases).map(([id, lease]) => [
              id,
              { expiresAt: Timestamp.fromMillis(lease.expiresAtMs), capacityClass: lease.capacityClass },
            ])
          ),
          [ownerId]: {
            expiresAt: Timestamp.fromMillis(nowMs + OPENAI_LEASE_TTL_MS),
            capacityClass,
          },
        },
        updatedAt: Timestamp.fromMillis(nowMs),
      });
      return true;
    });
    if (acquired) return;
    await delay(RETRY_DELAY_MS);
  }

  throw new OpenAIProviderCapacityError();
}

async function renewProviderLease(ownerId: string, capacityClass: OpenAICapacityClass): Promise<boolean> {
  const db = getFirestore();
  const reference = db.collection(AI_PROVIDER_CONCURRENCY_COLLECTION).doc(OPENAI_LEASE_DOCUMENT_ID);
  return db.runTransaction(async transaction => {
    const nowMs = Date.now();
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return false;
    const leases = activeProviderLeases(snapshot.data() as ProviderLeaseState, nowMs);
    if (!(ownerId in leases)) return false;
    transaction.set(reference, {
      leases: {
        ...Object.fromEntries(
          Object.entries(leases).map(([id, lease]) => [
            id,
            { expiresAt: Timestamp.fromMillis(lease.expiresAtMs), capacityClass: lease.capacityClass },
          ])
        ),
        [ownerId]: {
          expiresAt: Timestamp.fromMillis(nowMs + OPENAI_LEASE_TTL_MS),
          capacityClass,
        },
      },
      updatedAt: Timestamp.fromMillis(nowMs),
    });
    return true;
  });
}

async function releaseProviderLease(ownerId: string): Promise<void> {
  const db = getFirestore();
  const reference = db.collection(AI_PROVIDER_CONCURRENCY_COLLECTION).doc(OPENAI_LEASE_DOCUMENT_ID);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return;
    const leases = activeProviderLeases(snapshot.data() as ProviderLeaseState, Date.now());
    if (!(ownerId in leases)) return;
    delete leases[ownerId];
    transaction.set(reference, {
      leases: Object.fromEntries(
        Object.entries(leases).map(([id, lease]) => [
          id,
          { expiresAt: Timestamp.fromMillis(lease.expiresAtMs), capacityClass: lease.capacityClass },
        ])
      ),
      updatedAt: Timestamp.now(),
    });
  });
}

/** Bounds all OpenAI calls across Next.js and Firebase Functions instances. */
export async function withOpenAIProviderLease<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  capacityClass: OpenAICapacityClass = 'production',
  parentSignal?: AbortSignal
): Promise<T> {
  const ownerId = randomUUID();
  await acquireProviderLease(ownerId, capacityClass);
  const abortController = new AbortController();
  const abortFromParent = () => abortController.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  let renewal = Promise.resolve();
  const heartbeat = setInterval(() => {
    renewal = renewal
      .then(async () => {
        if (!(await renewProviderLease(ownerId, capacityClass))) throw new OpenAIProviderLeaseLostError();
      })
      .catch(error => {
        console.error('[openai] failed to renew provider concurrency lease', error);
        abortController.abort(error instanceof Error ? error : new OpenAIProviderLeaseLostError());
      });
  }, OPENAI_LEASE_HEARTBEAT_MS);
  try {
    return await operation(abortController.signal);
  } finally {
    parentSignal?.removeEventListener('abort', abortFromParent);
    clearInterval(heartbeat);
    await renewal;
    await releaseProviderLease(ownerId).catch(error => {
      console.error('[openai] failed to release provider concurrency lease', error);
    });
  }
}
