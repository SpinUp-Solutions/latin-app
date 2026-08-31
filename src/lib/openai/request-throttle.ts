import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { AI_REQUEST_THROTTLES_COLLECTION } from '../../../shared/constants/firestore';

export const AI_REQUEST_WINDOW_MS = 10 * 60 * 1_000;

export const AI_REQUEST_LIMITS = {
  autocomplete: 20,
  'root-resolver': 30,
  'lesson-grading': 30,
} as const;

export const AI_GLOBAL_REQUEST_LIMITS = {
  autocomplete: 80,
  'root-resolver': 120,
  'lesson-grading': 240,
  'test-grading': 400,
  evaluation: 400,
} as const;

export type AIRequestOperation = keyof typeof AI_REQUEST_LIMITS;
export type AIGlobalRequestOperation = keyof typeof AI_GLOBAL_REQUEST_LIMITS;

interface AIRequestThrottleState {
  windowStartedAtMs: number;
  requestCount: number;
}

export class AIRequestThrottleError extends Error {
  readonly code = 'AI_REQUEST_RATE_LIMITED';

  constructor(public readonly retryAfterMs: number) {
    super('AI request limit reached. Try again later.');
    this.name = 'AIRequestThrottleError';
  }
}

export function decideAIRequestThrottle(
  current: Partial<AIRequestThrottleState> | undefined,
  nowMs: number,
  limit: number,
  requestUnits = 1
): { allowed: boolean; retryAfterMs: number; state: AIRequestThrottleState } {
  if (!Number.isSafeInteger(requestUnits) || requestUnits < 1) throw new Error('AI request units must be positive');
  const validStart =
    typeof current?.windowStartedAtMs === 'number' && Number.isFinite(current.windowStartedAtMs)
      ? current.windowStartedAtMs
      : nowMs;
  const expired = nowMs < validStart || nowMs - validStart >= AI_REQUEST_WINDOW_MS;
  const windowStartedAtMs = expired ? nowMs : validStart;
  const requestCount =
    expired || !Number.isSafeInteger(current?.requestCount) || (current?.requestCount ?? -1) < 0
      ? 0
      : current!.requestCount!;
  const retryAfterMs = Math.max(1, windowStartedAtMs + AI_REQUEST_WINDOW_MS - nowMs);

  const allowed = requestCount + requestUnits <= limit;
  return {
    allowed,
    retryAfterMs,
    state: { windowStartedAtMs, requestCount: requestCount + (allowed ? requestUnits : 0) },
  };
}

const throttleReference = (scope: string, operation: AIGlobalRequestOperation, db: Firestore) => {
  const documentId = createHash('sha256').update(`${scope}:${operation}`, 'utf8').digest('hex');
  return db.collection(AI_REQUEST_THROTTLES_COLLECTION).doc(documentId);
};

export async function consumeAIRequestQuota(
  actorId: string,
  operation: AIRequestOperation,
  db: Firestore,
  now = () => Date.now()
): Promise<void> {
  const actorReference = throttleReference(`actor:${actorId}`, operation, db);
  const globalReference = throttleReference('global', operation, db);
  await db.runTransaction(async transaction => {
    const nowMs = now();
    const actorSnapshot = await transaction.get(actorReference);
    const globalSnapshot = await transaction.get(globalReference);
    const actorDecision = decideAIRequestThrottle(
      actorSnapshot.exists ? (actorSnapshot.data() as Partial<AIRequestThrottleState>) : undefined,
      nowMs,
      AI_REQUEST_LIMITS[operation]
    );
    const globalDecision = decideAIRequestThrottle(
      globalSnapshot.exists ? (globalSnapshot.data() as Partial<AIRequestThrottleState>) : undefined,
      nowMs,
      AI_GLOBAL_REQUEST_LIMITS[operation]
    );
    if (!actorDecision.allowed || !globalDecision.allowed) {
      throw new AIRequestThrottleError(
        Math.max(
          actorDecision.allowed ? 0 : actorDecision.retryAfterMs,
          globalDecision.allowed ? 0 : globalDecision.retryAfterMs
        )
      );
    }
    transaction.set(actorReference, {
      operation,
      scope: 'actor',
      ...actorDecision.state,
      expiresAt: Timestamp.fromMillis(actorDecision.state.windowStartedAtMs + AI_REQUEST_WINDOW_MS),
    });
    transaction.set(globalReference, {
      operation,
      scope: 'global',
      ...globalDecision.state,
      expiresAt: Timestamp.fromMillis(globalDecision.state.windowStartedAtMs + AI_REQUEST_WINDOW_MS),
    });
  });
}

export async function consumeAIGlobalRequestQuota(
  operation: AIGlobalRequestOperation,
  requestUnits: number,
  db: Firestore,
  now = () => Date.now()
): Promise<void> {
  const reference = throttleReference('global', operation, db);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists ? (snapshot.data() as Partial<AIRequestThrottleState>) : undefined;
    const decision = decideAIRequestThrottle(current, now(), AI_GLOBAL_REQUEST_LIMITS[operation], requestUnits);
    if (!decision.allowed) throw new AIRequestThrottleError(decision.retryAfterMs);
    transaction.set(reference, {
      operation,
      scope: 'global',
      ...decision.state,
      expiresAt: Timestamp.fromMillis(decision.state.windowStartedAtMs + AI_REQUEST_WINDOW_MS),
    });
  });
}
