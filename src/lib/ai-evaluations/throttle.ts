import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { AI_EVALUATION_RUN_THROTTLES_COLLECTION } from '../../../shared/constants/firestore';
import { AI_EVALUATION_RUN_WINDOW_MS, decideEvaluationThrottle, type EvaluationThrottleState } from './throttle-policy';

export {
  AI_EVALUATION_CELL_LIMIT,
  AI_EVALUATION_FORCE_REFRESH_LIMIT,
  AI_EVALUATION_FORCE_REFRESH_CELL_LIMIT,
  AI_EVALUATION_RUN_LIMIT,
  AI_EVALUATION_RUN_WINDOW_MS,
  decideEvaluationThrottle,
} from './throttle-policy';
export type { EvaluationThrottleState } from './throttle-policy';

export class AIEvaluationThrottleError extends Error {
  readonly code = 'AI_EVALUATION_RATE_LIMITED';
  readonly status = 429;

  constructor(
    public readonly retryAfterMs: number,
    message = 'Evaluation run limit reached. Try again later.'
  ) {
    super(message);
    this.name = 'AIEvaluationThrottleError';
  }
}

export async function consumeEvaluationRunQuota(
  adminId: string,
  forceRefresh: boolean,
  requestedCells: number,
  db: Firestore,
  now = () => Date.now()
): Promise<void> {
  const reference = db.collection(AI_EVALUATION_RUN_THROTTLES_COLLECTION).doc(adminId);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists ? (snapshot.data() as Partial<EvaluationThrottleState>) : undefined;
    const decision = decideEvaluationThrottle(current, now(), forceRefresh, requestedCells);
    if (!decision.allowed) {
      throw new AIEvaluationThrottleError(
        decision.retryAfterMs,
        decision.reason === 'force-refresh' || decision.reason === 'force-refresh-cells'
          ? 'Force-refresh evaluation limit reached. Try again later.'
          : 'Evaluation run limit reached. Try again later.'
      );
    }
    transaction.set(reference, {
      ...decision.state,
      expiresAt: Timestamp.fromMillis(decision.state.windowStartedAtMs + AI_EVALUATION_RUN_WINDOW_MS),
    });
  });
}
