import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { AI_EVALUATION_IN_FLIGHT_COLLECTION } from '../../../shared/constants/firestore';

const CLAIM_TTL_MS = 60 * 1_000;
export const EVALUATION_SINGLE_FLIGHT_HEARTBEAT_MS = 20 * 1_000;
const COMPLETED_TTL_MS = 30 * 1_000;
const JOIN_WAIT_MS = 8 * 60 * 1_000;
const POLL_MS = 250;
const MAX_TERMINAL_OUTCOME_BYTES = 700_000;

interface EvaluationClaim {
  state?: unknown;
  ownerId?: unknown;
  expiresAt?: unknown;
  outcomeAvailable?: unknown;
  outcome?: unknown;
}

interface SingleFlightCodec<T> {
  serialize: (value: T) => unknown;
  deserialize: (value: unknown) => T | null;
}

type ClaimDecision =
  | { kind: 'owner' }
  | { kind: 'waiting'; ownerId: string }
  | { kind: 'completed'; ownerId: string; outcomeAvailable: boolean; outcome: unknown };

export class EvaluationSingleFlightOutcomeError extends Error {
  constructor(message = 'An identical evaluation completed without a reusable result.') {
    super(message);
    this.name = 'EvaluationSingleFlightOutcomeError';
  }
}

export class EvaluationSingleFlightPublishError<T = unknown> extends Error {
  readonly cause: unknown;

  constructor(
    public readonly completedValue: T,
    cause: unknown
  ) {
    super('Evaluation completed, but its single-flight outcome could not be published.');
    this.name = 'EvaluationSingleFlightPublishError';
    this.cause = cause;
  }
}

const timestampMillis = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object' || !('toMillis' in value)) return undefined;
  const millis = (value as { toMillis?: () => unknown }).toMillis?.();
  return typeof millis === 'number' && Number.isFinite(millis) ? millis : undefined;
};

const delay = (durationMs: number) => new Promise(resolve => setTimeout(resolve, durationMs));

async function inspectOrAcquire(
  cacheKey: string,
  ownerId: string,
  observedOwnerId: string | undefined,
  db: Firestore
): Promise<ClaimDecision> {
  const reference = db.collection(AI_EVALUATION_IN_FLIGHT_COLLECTION).doc(cacheKey);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const existing = snapshot.exists ? (snapshot.data() as EvaluationClaim) : undefined;
    const nowMs = Date.now();
    if (typeof existing?.ownerId === 'string' && (timestampMillis(existing.expiresAt) ?? 0) > nowMs) {
      if (existing.state === 'completed') {
        if (observedOwnerId === existing.ownerId) {
          return {
            kind: 'completed',
            ownerId: existing.ownerId,
            outcomeAvailable: existing.outcomeAvailable === true,
            outcome: existing.outcome,
          };
        }
      } else {
        return existing.ownerId === ownerId ? { kind: 'owner' } : { kind: 'waiting', ownerId: existing.ownerId };
      }
    }
    transaction.set(reference, {
      state: 'running',
      ownerId,
      createdAt: Timestamp.fromMillis(nowMs),
      expiresAt: Timestamp.fromMillis(nowMs + CLAIM_TTL_MS),
    });
    return { kind: 'owner' };
  });
}

async function renew(cacheKey: string, ownerId: string, db: Firestore): Promise<boolean> {
  const reference = db.collection(AI_EVALUATION_IN_FLIGHT_COLLECTION).doc(cacheKey);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.data()?.ownerId !== ownerId || snapshot.data()?.state !== 'running') {
      return false;
    }
    const nowMs = Date.now();
    transaction.set(reference, {
      ...snapshot.data(),
      expiresAt: Timestamp.fromMillis(nowMs + CLAIM_TTL_MS),
      renewedAt: Timestamp.fromMillis(nowMs),
    });
    return true;
  });
}

const serializedOutcome = (value: unknown): { available: boolean; value?: unknown } => {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return { available: false };
  }
  if (json === undefined || Buffer.byteLength(json, 'utf8') > MAX_TERMINAL_OUTCOME_BYTES) {
    return { available: false };
  }
  return { available: true, value: JSON.parse(json) as unknown };
};

async function publish(
  cacheKey: string,
  ownerId: string,
  db: Firestore,
  terminal: { available: boolean; value?: unknown }
): Promise<boolean> {
  const reference = db.collection(AI_EVALUATION_IN_FLIGHT_COLLECTION).doc(cacheKey);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.data()?.ownerId !== ownerId) return false;
    const nowMs = Date.now();
    transaction.set(reference, {
      state: 'completed',
      ownerId,
      outcomeAvailable: terminal.available,
      ...(terminal.available ? { outcome: terminal.value } : {}),
      completedAt: Timestamp.fromMillis(nowMs),
      expiresAt: Timestamp.fromMillis(nowMs + COMPLETED_TTL_MS),
    });
    return true;
  });
}

async function publishWithRetry(
  cacheKey: string,
  ownerId: string,
  db: Firestore,
  terminal: { available: boolean; value?: unknown }
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (!(await publish(cacheKey, ownerId, db, terminal))) {
        throw new EvaluationSingleFlightOutcomeError('Evaluation single-flight ownership was lost before publish.');
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(100 * 2 ** attempt);
    }
  }
  throw lastError;
}

/**
 * Coalesces the same evaluation cell across function instances. The owner's
 * validated terminal outcome is retained briefly so waiters reuse failures
 * and unmetered responses as well as cacheable successes.
 */
export async function runEvaluationSingleFlight<T>(
  cacheKey: string,
  db: Firestore,
  operation: (signal: AbortSignal) => Promise<T>,
  codec: SingleFlightCodec<T>
): Promise<{ value: T; joined: boolean }> {
  const ownerId = randomUUID();
  const deadline = Date.now() + JOIN_WAIT_MS;
  let observedOwnerId: string | undefined;

  while (Date.now() < deadline) {
    const decision = await inspectOrAcquire(cacheKey, ownerId, observedOwnerId, db);
    if (decision.kind === 'owner') {
      const abortController = new AbortController();
      let rejectClaimLost!: (error: Error) => void;
      const claimLost = new Promise<never>((_resolve, reject) => {
        rejectClaimLost = reject;
      });
      let claimLossError: Error | undefined;
      let renewal = Promise.resolve();
      const heartbeat = setInterval(() => {
        renewal = renewal
          .then(async () => {
            if (!(await renew(cacheKey, ownerId, db))) {
              throw new EvaluationSingleFlightOutcomeError('Evaluation single-flight ownership was lost.');
            }
          })
          .catch(error => {
            const claimError =
              error instanceof Error
                ? error
                : new EvaluationSingleFlightOutcomeError('Evaluation single-flight renewal failed.');
            console.error('[ai-evaluations] failed to renew single-flight claim', claimError);
            claimLossError = claimError;
            abortController.abort(claimError);
            rejectClaimLost(claimError);
          });
      }, EVALUATION_SINGLE_FLIGHT_HEARTBEAT_MS);
      try {
        const value = await Promise.race([operation(abortController.signal), claimLost]);
        clearInterval(heartbeat);
        await renewal;
        if (claimLossError) throw claimLossError;
        const terminal = serializedOutcome(codec.serialize(value));
        try {
          await publishWithRetry(cacheKey, ownerId, db, terminal);
        } catch (error) {
          throw new EvaluationSingleFlightPublishError(value, error);
        }
        return { value, joined: false };
      } catch (error) {
        clearInterval(heartbeat);
        await renewal;
        await publishWithRetry(cacheKey, ownerId, db, { available: false }).catch(publishError => {
          console.error('[ai-evaluations] failed to publish single-flight failure', publishError);
        });
        throw error;
      } finally {
        clearInterval(heartbeat);
      }
    }
    if (decision.kind === 'completed') {
      if (!decision.outcomeAvailable) throw new EvaluationSingleFlightOutcomeError();
      const completed = codec.deserialize(decision.outcome);
      if (!completed) throw new EvaluationSingleFlightOutcomeError('An identical evaluation returned invalid data.');
      return { value: completed, joined: true };
    }
    observedOwnerId = decision.ownerId;
    await delay(POLL_MS);
  }

  throw new Error('Timed out waiting for an identical evaluation request');
}
