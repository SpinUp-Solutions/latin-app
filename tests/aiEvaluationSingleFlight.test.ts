import {
  EVALUATION_SINGLE_FLIGHT_HEARTBEAT_MS,
  EvaluationSingleFlightOutcomeError,
  EvaluationSingleFlightPublishError,
  runEvaluationSingleFlight,
} from '@/src/lib/ai-evaluations/single-flight';

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromMillis: (value: number) => ({ toMillis: () => value }) },
}));

type FakeReference = { path: string };

class FakeFirestore {
  private readonly values = new Map<string, Record<string, unknown>>();
  private transactionQueue: Promise<unknown> = Promise.resolve();
  private nextGetGate?: Promise<void>;

  collection(name: string) {
    return {
      doc: (id: string): FakeReference => ({ path: `${name}/${id}` }),
    };
  }

  runTransaction<T>(update: (transaction: unknown) => Promise<T>): Promise<T> {
    const pending = this.transactionQueue.then(() =>
      update({
        get: async (reference: FakeReference) => {
          const gate = this.nextGetGate;
          this.nextGetGate = undefined;
          if (gate) await gate;
          return {
            exists: this.values.has(reference.path),
            data: () => this.values.get(reference.path),
          };
        },
        set: (reference: FakeReference, value: Record<string, unknown>) => {
          this.values.set(reference.path, value);
        },
        delete: (reference: FakeReference) => {
          this.values.delete(reference.path);
        },
      })
    );
    this.transactionQueue = pending.then(
      () => undefined,
      () => undefined
    );
    return pending;
  }

  deleteClaim(cacheKey: string) {
    this.values.delete(`aiEvaluationInFlight/${cacheKey}`);
  }

  pauseNextGet(): () => void {
    let release!: () => void;
    this.nextGetGate = new Promise<void>(resolve => {
      release = resolve;
    });
    return release;
  }
}

describe('AI evaluation distributed single-flight', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('lets one owner execute while another caller joins the published result', async () => {
    const db = new FakeFirestore();
    let releaseOwner: (() => void) | undefined;
    let markOwnerStarted: (() => void) | undefined;
    const ownerStarted = new Promise<void>(resolve => {
      markOwnerStarted = resolve;
    });
    const ownerGate = new Promise<void>(resolve => {
      releaseOwner = resolve;
    });
    const operation = jest.fn(async () => {
      markOwnerStarted?.();
      await ownerGate;
      return 'shared-result';
    });
    const codec = {
      serialize: (value: string) => ({ value }),
      deserialize: (value: unknown) =>
        value && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'string'
          ? (value as { value: string }).value
          : null,
    };

    const owner = runEvaluationSingleFlight('cache-key', db as never, operation, codec);
    await ownerStarted;
    const joiner = runEvaluationSingleFlight('cache-key', db as never, operation, codec);
    releaseOwner?.();

    await expect(owner).resolves.toEqual({ value: 'shared-result', joined: false });
    await expect(joiner).resolves.toEqual({ value: 'shared-result', joined: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('reuses a terminal provider failure instead of issuing another billable call', async () => {
    const db = new FakeFirestore();
    let ownerStarted!: () => void;
    let releaseOwner!: () => void;
    const started = new Promise<void>(resolve => {
      ownerStarted = resolve;
    });
    const gate = new Promise<void>(resolve => {
      releaseOwner = resolve;
    });
    const operation = jest.fn(async () => {
      ownerStarted();
      await gate;
      return { success: false as const, code: 'provider-error' };
    });
    const codec = {
      serialize: (value: { success: false; code: string }) => value,
      deserialize: (value: unknown) =>
        value && typeof value === 'object' && (value as { success?: unknown }).success === false
          ? (value as { success: false; code: string })
          : null,
    };

    const owner = runEvaluationSingleFlight('failed-key', db as never, operation, codec);
    await started;
    const joiner = runEvaluationSingleFlight('failed-key', db as never, operation, codec);
    releaseOwner();

    await expect(owner).resolves.toEqual({
      value: { success: false, code: 'provider-error' },
      joined: false,
    });
    await expect(joiner).resolves.toEqual({
      value: { success: false, code: 'provider-error' },
      joined: true,
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('executes a sequential force-refresh instead of reusing a completed claim', async () => {
    const db = new FakeFirestore();
    let callCount = 0;
    const operation = jest.fn(async () => `fresh-${++callCount}`);
    const codec = {
      serialize: (value: string) => value,
      deserialize: (value: unknown) => (typeof value === 'string' ? value : null),
    };

    await expect(runEvaluationSingleFlight('force-key', db as never, operation, codec)).resolves.toEqual({
      value: 'fresh-1',
      joined: false,
    });
    await expect(runEvaluationSingleFlight('force-key', db as never, operation, codec)).resolves.toEqual({
      value: 'fresh-2',
      joined: false,
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('aborts active work when the distributed claim is lost', async () => {
    jest.useFakeTimers();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = new FakeFirestore();
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => {
      markStarted = resolve;
    });
    const operation = jest.fn(
      (signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          markStarted();
          signal.addEventListener('abort', () => reject(signal.reason));
        })
    );
    const pending = runEvaluationSingleFlight('lost-key', db as never, operation, {
      serialize: value => value,
      deserialize: () => null,
    });
    const rejection = expect(pending).rejects.toBeInstanceOf(EvaluationSingleFlightOutcomeError);
    await started;
    db.deleteClaim('lost-key');
    await jest.advanceTimersByTimeAsync(EVALUATION_SINGLE_FLIGHT_HEARTBEAT_MS);
    await jest.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(operation).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
    jest.useRealTimers();
  });

  it('does not return success when work finishes before a pending renewal reports claim loss', async () => {
    jest.useFakeTimers();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = new FakeFirestore();
    let markStarted!: () => void;
    let finishOperation!: (value: string) => void;
    const started = new Promise<void>(resolve => {
      markStarted = resolve;
    });
    const operationResult = new Promise<string>(resolve => {
      finishOperation = resolve;
    });
    const operation = jest.fn(async () => {
      markStarted();
      return operationResult;
    });
    const pending = runEvaluationSingleFlight('renewal-race-key', db as never, operation, {
      serialize: value => value,
      deserialize: value => (typeof value === 'string' ? value : null),
    });
    const rejection = expect(pending).rejects.toBeInstanceOf(EvaluationSingleFlightOutcomeError);
    await started;
    const releaseRenewal = db.pauseNextGet();
    await jest.advanceTimersByTimeAsync(EVALUATION_SINGLE_FLIGHT_HEARTBEAT_MS);
    db.deleteClaim('renewal-race-key');
    finishOperation('must-not-return');
    releaseRenewal();
    await jest.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(operation).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
    jest.useRealTimers();
  });

  it('does not return success when ownership is lost immediately before publishing', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = new FakeFirestore();
    const operation = jest.fn(async () => {
      db.deleteClaim('publish-loss-key');
      return 'must-not-return';
    });

    await expect(
      runEvaluationSingleFlight('publish-loss-key', db as never, operation, {
        serialize: value => value,
        deserialize: value => (typeof value === 'string' ? value : null),
      })
    ).rejects.toBeInstanceOf(EvaluationSingleFlightPublishError);

    expect(operation).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
