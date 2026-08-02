import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { AI_EVALUATION_SINGLE_FLIGHT_COLLECTION } from '../../../shared/constants/firestore';

export const AI_EVALUATION_SINGLE_FLIGHT_LEASE_MS = 10 * 60 * 1_000;

export interface EvaluationSingleFlightLease {
  id: string;
  cacheKey: string;
  refreshMode: 'cached' | 'force';
  ownerId: string;
  startedAt: string;
  expiresAt: string;
}

const hasFirestoreTransactions = (db: Firestore): boolean =>
  Boolean(db && typeof (db as unknown as { runTransaction?: unknown }).runTransaction === 'function');

export function getEvaluationSingleFlightId(cacheKey: string, forceRefresh: boolean): string {
  return createHash('sha256')
    .update(`${forceRefresh ? 'force' : 'cached'}:${cacheKey}`, 'utf8')
    .digest('hex');
}

const isActive = (lease: Partial<EvaluationSingleFlightLease> | undefined, now: number) =>
  Boolean(
    lease?.ownerId &&
      typeof lease.expiresAt === 'string' &&
      Number.isFinite(Date.parse(lease.expiresAt)) &&
      Date.parse(lease.expiresAt) > now
  );

export async function acquireEvaluationSingleFlight(
  cacheKey: string,
  forceRefresh: boolean,
  db: Firestore,
  ownerId: string = randomUUID(),
  now = Date.now,
  leaseMs = AI_EVALUATION_SINGLE_FLIGHT_LEASE_MS
): Promise<{ acquired: boolean; lease: EvaluationSingleFlightLease }> {
  const id = getEvaluationSingleFlightId(cacheKey, forceRefresh);
  const currentTime = now();
  const startedAt = new Date(currentTime).toISOString();
  const candidate: EvaluationSingleFlightLease = {
    id,
    cacheKey,
    refreshMode: forceRefresh ? 'force' : 'cached',
    ownerId,
    startedAt,
    expiresAt: new Date(currentTime + leaseMs).toISOString(),
  };

  if (!hasFirestoreTransactions(db) || typeof db.collection !== 'function') {
    return { acquired: true, lease: candidate };
  }

  const ref = db.collection(AI_EVALUATION_SINGLE_FLIGHT_COLLECTION).doc(id);

  const acquired = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data() as Partial<EvaluationSingleFlightLease> | undefined;
    if (snapshot.exists && isActive(existing, currentTime) && existing?.ownerId !== ownerId) return false;
    transaction.set(ref, candidate);
    return true;
  });

  if (acquired) return { acquired: true, lease: candidate };
  const snapshot = await ref.get();
  return {
    acquired: false,
    lease: {
      ...candidate,
      ...(snapshot.data() as Partial<EvaluationSingleFlightLease> | undefined),
      id,
      cacheKey,
      refreshMode: forceRefresh ? 'force' : 'cached',
    },
  };
}

export async function getEvaluationSingleFlight(
  cacheKey: string,
  forceRefresh: boolean,
  db: Firestore
): Promise<EvaluationSingleFlightLease | null> {
  if (!hasFirestoreTransactions(db) || typeof db.collection !== 'function') return null;
  const id = getEvaluationSingleFlightId(cacheKey, forceRefresh);
  const snapshot = await db.collection(AI_EVALUATION_SINGLE_FLIGHT_COLLECTION).doc(id).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as Partial<EvaluationSingleFlightLease> | undefined;
  if (!data?.ownerId || !data.startedAt || !data.expiresAt) return null;
  return { ...data, id, cacheKey, refreshMode: forceRefresh ? 'force' : 'cached' } as EvaluationSingleFlightLease;
}

export async function releaseEvaluationSingleFlight(lease: EvaluationSingleFlightLease, db: Firestore): Promise<void> {
  if (!hasFirestoreTransactions(db) || typeof db.collection !== 'function') return;
  const ref = db.collection(AI_EVALUATION_SINGLE_FLIGHT_COLLECTION).doc(lease.id);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data() as Partial<EvaluationSingleFlightLease> | undefined;
    if (snapshot.exists && current?.ownerId === lease.ownerId) transaction.delete(ref);
  });
}
