export const AI_EVALUATION_RUN_WINDOW_MS = 10 * 60 * 1_000;
export const AI_EVALUATION_RUN_LIMIT = 10;
export const AI_EVALUATION_FORCE_REFRESH_LIMIT = 3;
export const AI_EVALUATION_CELL_LIMIT = 200;
export const AI_EVALUATION_FORCE_REFRESH_CELL_LIMIT = 80;

export interface EvaluationThrottleState {
  windowStartedAtMs: number;
  runCount: number;
  forceRefreshCount: number;
  cellCount: number;
  forceRefreshCellCount: number;
}

export interface ThrottleDecision {
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
  if (!Number.isSafeInteger(requestedCells) || requestedCells < 1 || requestedCells > 40) {
    throw new Error('requestedCells must be an integer between 1 and 40');
  }
  const currentStart =
    typeof current?.windowStartedAtMs === 'number' && Number.isFinite(current.windowStartedAtMs)
      ? current.windowStartedAtMs
      : nowMs;
  const windowExpired = nowMs - currentStart >= AI_EVALUATION_RUN_WINDOW_MS || nowMs < currentStart;
  const windowStartedAtMs = windowExpired ? nowMs : currentStart;
  const runCount =
    windowExpired ||
    typeof current?.runCount !== 'number' ||
    !Number.isSafeInteger(current.runCount) ||
    current.runCount < 0
      ? 0
      : current.runCount;
  const forceRefreshCount =
    windowExpired ||
    typeof current?.forceRefreshCount !== 'number' ||
    !Number.isSafeInteger(current.forceRefreshCount) ||
    current.forceRefreshCount < 0
      ? 0
      : current.forceRefreshCount;
  const cellCount =
    windowExpired ||
    typeof current?.cellCount !== 'number' ||
    !Number.isSafeInteger(current.cellCount) ||
    current.cellCount < 0
      ? 0
      : current.cellCount;
  const forceRefreshCellCount =
    windowExpired ||
    typeof current?.forceRefreshCellCount !== 'number' ||
    !Number.isSafeInteger(current.forceRefreshCellCount) ||
    current.forceRefreshCellCount < 0
      ? 0
      : current.forceRefreshCellCount;
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
