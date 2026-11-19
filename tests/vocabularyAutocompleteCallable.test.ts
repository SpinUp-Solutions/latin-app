/** @jest-environment node */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { autocompleteVocabularyWord } from '@/shared/openai/autocomplete';
import {
  readVocabularyAIGuidance,
  VocabularyAIGuidanceError,
} from '@/src/lib/vocabulary-ai-guidance/persistence.server';

// Importing the callable must never load local secrets, initialize live clients or contact services.
jest.mock('@/shared/openai/autocomplete', () => ({ autocompleteVocabularyWord: jest.fn() }));
jest.mock('@/shared/openai/root-resolver', () => ({ resolveRootWord: jest.fn() }));
jest.mock('@/shared/openai/translation-grading', () => ({ gradeTranslation: jest.fn() }));
jest.mock('@/src/lib/ai-evaluations/execution', () => ({
  countEvaluationCells: jest.fn(),
  runEvaluationCase: jest.fn(),
}));
jest.mock('@/src/lib/ai-evaluations/persistence', () => ({
  aiEvaluationCases: {},
  AIEvaluationServiceError: class extends Error {},
}));
jest.mock('@/src/lib/ai-evaluations/throttle', () => ({
  consumeEvaluationRunQuota: jest.fn(),
  AIEvaluationThrottleError: class extends Error {},
}));
jest.mock('@/src/lib/vocabulary-autocomplete-evaluations/execution', () => ({
  countVocabularyEvaluationCells: jest.fn(),
  runVocabularyEvaluationCase: jest.fn(),
}));
jest.mock('@/src/lib/vocabulary-autocomplete-evaluations/persistence', () => ({ vocabularyEvaluationCases: {} }));
jest.mock('@/src/lib/vocabulary-ai-guidance/persistence.server', () => ({
  readVocabularyAIGuidance: jest.fn(),
  VocabularyAIGuidanceError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

const mockGetUser = jest.fn();
// Functions can have their own node_modules. Mock the dependencies as resolved from
// the callable, not just the app's copies (particularly dotenv and Admin SDK).
const functionsRequire = createRequire(resolve(__dirname, '../functions/src/index.ts'));
function mockCallableDependency(name: string, factory: () => unknown) {
  let resolved: string;
  try {
    resolved = functionsRequire.resolve(name);
  } catch {
    jest.doMock(name, factory, { virtual: true });
    return;
  }
  jest.doMock(resolved, factory);
}
mockCallableDependency('dotenv', () => ({ config: jest.fn() }));
mockCallableDependency('firebase-admin/app', () => ({ getApps: () => [{}], initializeApp: jest.fn() }));
mockCallableDependency('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: mockGetUser }) }) }),
}));
mockCallableDependency('firebase-functions/params', () => ({ defineSecret: () => 'mock-secret' }));
mockCallableDependency('firebase-functions/v2/https', () => ({
  onCall: (_options: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));
const { autocompleteWord } = jest.requireActual('../functions/src/index');
const read = jest.mocked(readVocabularyAIGuidance);
const autocomplete = jest.mocked(autocompleteVocabularyWord);
const call = autocompleteWord as unknown as (request: { auth?: { uid: string }; data: unknown }) => Promise<unknown>;
const validData = { word: 'et', part_of_speech: 'conjunction' };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: () => ({ role: 'admin' }) });
  read.mockResolvedValue({ revision: 0, rules: [], updatedAt: null, updatedBy: null });
  autocomplete.mockResolvedValue({
    success: true,
    data: { translation: 'and' },
    uncertainties: [],
  });
});

it('requires authentication before reading trusted guidance or using the model', async () => {
  await expect(call({ data: validData })).rejects.toMatchObject({ code: 'unauthenticated' });
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(autocomplete).not.toHaveBeenCalled();
});

it('rejects nonadmins before guidance reads or generation', async () => {
  mockGetUser.mockResolvedValue({ data: () => ({ role: 'student' }) });
  await expect(call({ auth: { uid: 'student' }, data: validData })).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(read).not.toHaveBeenCalled();
  expect(autocomplete).not.toHaveBeenCalled();
});

it.each([
  { ...validData, part_of_speech: 'unsupported' },
  { ...validData, conversation: { message: 'x'.repeat(2001), history: [] } },
  { ...validData, conversation: { message: 'Fix it', history: [] }, fieldsToComplete: ['translation'] },
  { ...validData, fieldsToComplete: ['conjugation'] },
  { ...validData, globalGuidance: [] },
  {
    ...validData,
    existingData: { ai_review: { uncertainties: [], guidance: [{ id: 'rule', instruction: 'x'.repeat(2001) }] } },
  },
])('validates the request before spending model tokens', async data => {
  await expect(call({ auth: { uid: 'admin' }, data })).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(read).not.toHaveBeenCalled();
  expect(autocomplete).not.toHaveBeenCalled();
});

it('passes server-loaded approved rules as trusted context', async () => {
  const rules = [{ id: 'approved', instruction: 'Use Classical Latin.' }];
  read.mockResolvedValue({ revision: 2, rules, updatedAt: null, updatedBy: null });
  await expect(call({ auth: { uid: 'admin' }, data: validData })).resolves.toMatchObject({ success: true });
  expect(autocomplete).toHaveBeenCalledWith(validData, rules);
  expect(mockGetUser.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]);
  expect(read.mock.invocationCallOrder[0]).toBeLessThan(autocomplete.mock.invocationCallOrder[0]);
});

it('fails closed for corrupt saved guidance without exposing persistence details', async () => {
  read.mockRejectedValue(new VocabularyAIGuidanceError(409, 'INVALID', 'Sensitive persistence details'));
  await expect(call({ auth: { uid: 'admin' }, data: validData })).rejects.toMatchObject({
    code: 'failed-precondition',
    message: 'Saved AI guidance is invalid. Ask an administrator to review it.',
  });
  expect(autocomplete).not.toHaveBeenCalled();
});

describe('usage log', () => {
  const lines = (log: jest.SpyInstance) =>
    log.mock.calls
      .map(([line]) => (typeof line === 'string' && line.startsWith('{') ? JSON.parse(line) : null))
      .filter(entry => entry?.event === 'vocabulary_ai_call');
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes one line per fill with who, word, model, cost and time', async () => {
    autocomplete.mockResolvedValue({
      success: true,
      data: { translation: 'and' },
      model: 'gpt-test',
      cost: {
        inputCost: 0.001,
        outputCost: 0.002,
        totalCost: 0.003,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      },
    });
    await call({ auth: { uid: 'admin' }, data: validData });
    expect(lines(log)).toEqual([
      {
        severity: 'INFO',
        message: 'autocompleteWord fill success',
        event: 'vocabulary_ai_call',
        uid: 'admin',
        intent: 'fill',
        word: 'et',
        outcome: 'success',
        model: 'gpt-test',
        cost: 0.003,
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: expect.any(Number),
      },
    ]);
  });

  it('marks a conversation turn as a message and never logs what the admin wrote', async () => {
    const data = { ...validData, conversation: { message: 'A private remark about et', history: [] } };
    await call({ auth: { uid: 'admin' }, data });
    expect(lines(log)).toEqual([expect.objectContaining({ intent: 'message', outcome: 'success' })]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('A private remark');
  });

  it.each([
    [
      'a model failure',
      () => autocomplete.mockResolvedValue({ success: false, errorCode: 'provider-error' }),
      'model-error',
    ],
    ['an unexpected error', () => autocomplete.mockRejectedValue(new Error('boom')), 'internal'],
    [
      'invalid saved guidance',
      () => read.mockRejectedValue(new VocabularyAIGuidanceError(409, 'INVALID', 'x')),
      'failed-precondition',
    ],
  ])('logs %s with its outcome', async (_name, arrange, outcome) => {
    arrange();
    await call({ auth: { uid: 'admin' }, data: validData }).catch(() => undefined);
    expect(lines(log)).toEqual([expect.objectContaining({ severity: 'WARNING', uid: 'admin', word: 'et', outcome })]);
  });

  it('logs rejected calls too, before any word is known', async () => {
    await call({ data: validData }).catch(() => undefined);
    mockGetUser.mockResolvedValue({ data: () => ({ role: 'student' }) });
    await call({ auth: { uid: 'student' }, data: validData }).catch(() => undefined);
    mockGetUser.mockResolvedValue({ data: () => ({ role: 'admin' }) });
    await call({ auth: { uid: 'admin' }, data: { ...validData, part_of_speech: 'unsupported' } }).catch(
      () => undefined
    );
    expect(lines(log)).toEqual([
      expect.objectContaining({ uid: null, outcome: 'unauthenticated' }),
      expect.objectContaining({ uid: 'student', outcome: 'permission-denied' }),
      expect.objectContaining({ uid: 'admin', outcome: 'invalid-argument' }),
    ]);
    expect(lines(log).some(entry => 'word' in entry)).toBe(false);
  });

  it('keeps the code of an HttpsError raised while answering, in the response and the log', async () => {
    const { HttpsError } = callableHttps();
    autocomplete.mockRejectedValue(new HttpsError('resource-exhausted', 'Too many requests'));
    await expect(call({ auth: { uid: 'admin' }, data: validData })).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    expect(lines(log)).toEqual([expect.objectContaining({ outcome: 'resource-exhausted' })]);
  });

  it('still returns the answer when the log line cannot be written', async () => {
    log.mockImplementation(() => {
      throw new Error('stdout closed');
    });
    await expect(call({ auth: { uid: 'admin' }, data: validData })).resolves.toMatchObject({
      success: true,
      data: { translation: 'and' },
    });
  });
});

/** The callable's HttpsError, as mocked where the callable resolves it. */
function callableHttps(): { HttpsError: new (code: string, message: string) => Error } {
  try {
    return jest.requireMock(functionsRequire.resolve('firebase-functions/v2/https'));
  } catch {
    return jest.requireMock('firebase-functions/v2/https');
  }
}
