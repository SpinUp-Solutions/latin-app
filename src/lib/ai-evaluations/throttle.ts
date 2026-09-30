import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { AI_EVALUATION_RUN_THROTTLES_COLLECTION } from '../../../shared/constants/firestore';
import { EVALUATION_TRANSLATION_PROFILE_IDS } from '../../../shared/openai/model-registry';
import { TRANSLATION_GRADING_MODES } from '../../../shared/openai/types';
import { AI_EVALUATION_MAX_ANSWERS } from './contracts';

export const AI_EVALUATION_RUN_WINDOW_MS = 10 * 60 * 1_000;
export const AI_EVALUATION_RUN_LIMIT = 10;
export const AI_EVALUATION_FORCE_REFRESH_LIMIT = 3;
const AI_EVALUATION_CELL_LIMIT = 200;
export const AI_EVALUATION_FORCE_REFRESH_CELL_LIMIT = 80;
export const AI_EVALUATION_MAX_CELLS_PER_RUN =
  AI_EVALUATION_MAX_ANSWERS * TRANSLATION_GRADING_MODES.length * EVALUATION_TRANSLATION_PROFILE_IDS.length;

interface EvaluationThrottleState {
  windowStartedAtMs: number;
  runCount: number;
  forceRefreshCount: number;
  cellCount: number;
  forceRefreshCellCount: number;
}

interface ThrottleDecision {
  allowed: boolean;
  state: EvaluationThrottleState;
  retryAfterMs: number;
  reason?: 'runs' | 'force-refresh' | 'cells' | 'force-refresh-cells';
}

export function decideEvaluationThrottle(
  current: Partial<EvaluationThrottleState> | undefined,
  nowMs: number,
  forceRefresh: boolean,
  requestedCells = 1
): ThrottleDecision {
  if (!Number.isSafeInteger(requestedCells) || requestedCells < 1 || requestedCells > AI_EVALUATION_MAX_CELLS_PER_RUN) {
    throw new Error(`requestedCells must be an integer between 1 and ${AI_EVALUATION_MAX_CELLS_PER_RUN}`);
  }
  const currentStart =
    typeof current?.windowStartedAtMs === 'number' && Number.isFinite(current.windowStartedAtMs)
      ? current.windowStartedAtMs
      : nowMs;
  const windowExpired = nowMs - currentStart >= AI_EVALUATION_RUN_WINDOW_MS || nowMs < currentStart;
  const windowStartedAtMs = windowExpired ? nowMs : currentStart;
  const counter = (value: unknown) =>
    !windowExpired && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const runCount = counter(current?.runCount);
  const forceRefreshCount = counter(current?.forceRefreshCount);
  const cellCount = counter(current?.cellCount);
  const forceRefreshCellCount = counter(current?.forceRefreshCellCount);
  const retryAfterMs = Math.max(1, windowStartedAtMs + AI_EVALUATION_RUN_WINDOW_MS - nowMs);
  const state: EvaluationThrottleState = {
    windowStartedAtMs,
    runCount,
    forceRefreshCount,
    cellCount,
    forceRefreshCellCount,
  };

  if (runCount >= AI_EVALUATION_RUN_LIMIT) {
    return { allowed: false, state, retryAfterMs, reason: 'runs' };
  }
  if (forceRefresh && forceRefreshCount >= AI_EVALUATION_FORCE_REFRESH_LIMIT) {
    return { allowed: false, state, retryAfterMs, reason: 'force-refresh' };
  }
  if (cellCount + requestedCells > AI_EVALUATION_CELL_LIMIT) {
    return { allowed: false, state, retryAfterMs, reason: 'cells' };
  }
  if (forceRefresh && forceRefreshCellCount + requestedCells > AI_EVALUATION_FORCE_REFRESH_CELL_LIMIT) {
    return { allowed: false, state, retryAfterMs, reason: 'force-refresh-cells' };
  }

  return {
    allowed: true,
    retryAfterMs,
    state: {
      ...state,
      runCount: runCount + 1,
      forceRefreshCount: forceRefreshCount + (forceRefresh ? 1 : 0),
      cellCount: cellCount + requestedCells,
      forceRefreshCellCount: forceRefreshCellCount + (forceRefresh ? requestedCells : 0),
    },
  };
}

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
