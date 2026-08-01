import {
  AI_EVALUATION_FORCE_REFRESH_LIMIT,
  AI_EVALUATION_FORCE_REFRESH_CELL_LIMIT,
  AI_EVALUATION_RUN_LIMIT,
  AI_EVALUATION_RUN_WINDOW_MS,
  decideEvaluationThrottle,
} from '@/src/lib/ai-evaluations/throttle-policy';
import { AIEvaluationThrottleError, consumeEvaluationRunQuota } from '@/src/lib/ai-evaluations/throttle';

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromMillis: (millis: number) => ({ millis }) },
}));
jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));

describe('AI evaluation run throttle', () => {
  it('allows the named window budget and blocks the next normal run', () => {
    let state = undefined;
    for (let index = 0; index < AI_EVALUATION_RUN_LIMIT; index += 1) {
      const decision = decideEvaluationThrottle(state, 1_000, false);
      expect(decision.allowed).toBe(true);
      state = decision.state;
    }

    const blocked = decideEvaluationThrottle(state, 1_000, false);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('runs');
    expect(blocked.retryAfterMs).toBe(AI_EVALUATION_RUN_WINDOW_MS);
  });

  it('uses a Firestore transaction and exposes a typed 429 when the quota is exhausted', async () => {
    const transaction = {
      get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      set: jest.fn(),
    };
    const reference = {};
    const db = {
      collection: jest.fn(() => ({ doc: jest.fn(() => reference) })),
      runTransaction: jest.fn(async (callback: (value: typeof transaction) => Promise<void>) => callback(transaction)),
    };

    await consumeEvaluationRunQuota('admin-1', false, 4, db as never, () => 1_000);
    expect(db.runTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.set).toHaveBeenCalledWith(
      reference,
      expect.objectContaining({ runCount: 1, forceRefreshCount: 0, cellCount: 4, expiresAt: expect.any(Object) })
    );

    transaction.get.mockResolvedValue({
      exists: true,
      data: () => ({ windowStartedAtMs: 1_000, runCount: AI_EVALUATION_RUN_LIMIT, forceRefreshCount: 0 }),
    });
    await expect(consumeEvaluationRunQuota('admin-1', false, 4, db as never, () => 1_000)).rejects.toBeInstanceOf(
      AIEvaluationThrottleError
    );
    await expect(consumeEvaluationRunQuota('admin-1', false, 4, db as never, () => 1_000)).rejects.toMatchObject({
      status: 429,
      code: 'AI_EVALUATION_RATE_LIMITED',
    });
  });

  it('uses the stricter force-refresh budget and resets at the next fixed window', () => {
    let state = undefined;
    for (let index = 0; index < AI_EVALUATION_FORCE_REFRESH_LIMIT; index += 1) {
      const decision = decideEvaluationThrottle(state, 2_000, true);
      expect(decision.allowed).toBe(true);
      state = decision.state;
    }

    const blocked = decideEvaluationThrottle(state, 2_000, true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('force-refresh');

    const reset = decideEvaluationThrottle(state, 2_000 + AI_EVALUATION_RUN_WINDOW_MS, true);
    expect(reset.allowed).toBe(true);
    expect(reset.state.runCount).toBe(1);
    expect(reset.state.forceRefreshCount).toBe(1);
  });

  it('weights force-refresh quota by unique evaluation cells', () => {
    const first = decideEvaluationThrottle(undefined, 3_000, true, 40);
    expect(first.allowed).toBe(true);
    expect(first.state.forceRefreshCellCount).toBe(40);

    const second = decideEvaluationThrottle(first.state, 3_000, true, 40);
    expect(second.allowed).toBe(true);
    expect(second.state.forceRefreshCellCount).toBe(AI_EVALUATION_FORCE_REFRESH_CELL_LIMIT);

    const blocked = decideEvaluationThrottle(second.state, 3_000, true, 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('force-refresh-cells');
  });
});
