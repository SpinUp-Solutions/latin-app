import { randomUUID } from 'node:crypto';
import { AIRequestThrottleError } from '@/src/lib/openai/request-throttle';
import { createOpenAISafetyIdentifier } from '@/shared/openai/safety';
import { TestAttemptService, TRANSLATION_GRADING_RESERVATION_MS } from '@/src/lib/tests/attempt-service';
import { testAttemptDocumentSchema } from '@/src/lib/tests/schemas';
import { FakeFirestore } from './helpers/testAttemptFirestore';
import type { StudentSectionedTestAttempt } from '@/src/types/test';

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn() } }));
const initialTime = '2026-09-19T12:00:00.000Z';
const fill = {
  id: 'fill-1',
  type: 'fill',
  title: 'First question',
  instructions: '',
  maxPoints: 3,
  feedbackConfig: { escalationLevels: [] },
  data: {
    items: [
      { text: 'amo', answer: 'love' },
      { text: 'video', answer: 'see' },
    ],
  },
};
const translation = {
  id: 'translation-1',
  type: 'translation-grading',
  title: 'Translate',
  instructions: '',
  maxPoints: 10,
  feedbackConfig: { escalationLevels: [] },
  data: { items: [{ latinText: 'Puella cantat.' }, { latinText: 'Puer currit.' }] },
};

async function fixture(
  options: {
    translations?: boolean;
    mock?: boolean;
    contentOnly?: boolean;
    grader?: jest.Mock;
    consumeGlobalAIQuota?: jest.Mock;
    maxAttemptDocumentBytes?: number;
  } = {}
) {
  const db = new FakeFirestore();
  let now = initialTime;
  const pages = [
    {
      id: 'page-1',
      items: options.contentOnly
        ? [{ id: 'passage', type: 'text', content: 'Read this passage.' }]
        : [options.translations ? translation : fill],
    },
    { id: 'page-2', items: [{ ...fill, id: 'fill-2', title: 'Future question' }] },
  ];
  const totalExercises = options.contentOnly ? 1 : 2;
  const totalPoints = options.contentOnly ? 3 : options.translations ? 13 : 6;
  db.seed('testVersions', 'v1', {
    id: 'v1',
    name: 'Frozen version',
    pages,
    totalPages: 2,
    totalItems: 2,
    totalExercises,
    totalPoints,
  });
  db.seed('lessons', 'test-1', {
    id: 'test-1',
    kind: 'test',
    title: 'Test',
    description: '',
    passingPercentage: null,
    rotationVersions: options.mock ? [] : [{ versionId: 'v1' }],
  });
  if (options.mock)
    db.seed('learningPaths', 'default', {
      id: 'default',
      revision: 1,
      unitIds: [],
      updatedAt: initialTime,
      updatedBy: 'admin',
    });
  if (options.mock)
    db.seed('mockTests', 'mock-1', {
      id: 'mock-1',
      versionId: 'v1',
      parent: { kind: 'standalone' },
      title: 'Mock',
      description: '',
      passingPercentage: null,
      status: 'active',
      isLive: true,
      mockOrder: 1,
    });
  const grader = options.grader ?? jest.fn().mockResolvedValue({ score: 8, feedback: 'PRIVATE_TRANSLATION_FEEDBACK' });
  const service = new TestAttemptService(db as never, () => now, {
    gradeTestTranslation: grader,
    consumeGlobalAIQuota: options.consumeGlobalAIQuota,
    maxAttemptDocumentBytes: options.maxAttemptDocumentBytes,
  });
  const origin = options.mock
    ? { kind: 'mock-test' as const, mockTestId: 'mock-1' }
    : { kind: 'normal-test' as const, testId: 'test-1' };
  const started = await service.startAttempt({ origin }, 'student-1');
  const id = started.attempt.id;
  const current = async () => (await service.getAttempt(id, 'student-1')) as StudentSectionedTestAttempt;
  const save = async (answers: Parameters<TestAttemptService['saveAttemptAnswers']>[1]['answers']) => {
    const attempt = await current();
    return service.saveAttemptAnswers(
      id,
      {
        answers,
        section: {
          pageId: attempt.section.pageId,
          expectedRevision: attempt.section.revision,
          mutationId: randomUUID(),
        },
      },
      'student-1'
    );
  };
  const confirm = async (acknowledgeIncomplete = true) => {
    const attempt = await current();
    return service.confirmSection(
      id,
      attempt.section.pageId,
      { expectedRevision: attempt.section.revision, requestId: randomUUID(), acknowledgeIncomplete },
      'student-1'
    );
  };
  return {
    db,
    service,
    started,
    id,
    current,
    save,
    confirm,
    grader,
    setTime: (value: string) => {
      now = value;
    },
  };
}

function expectPrivate(attempt: unknown) {
  expect(attempt).not.toHaveProperty('translationGrades');
  expect(attempt).not.toHaveProperty('sections');
  expect(attempt).not.toHaveProperty('translationGradeReservations');
  expect(attempt).not.toHaveProperty('translationGradeRequestWindows');
  expect(JSON.stringify(attempt)).not.toContain('PRIVATE_TRANSLATION_FEEDBACK');
  expect(attempt).not.toHaveProperty('score');
}

describe('sectioned test attempts', () => {
  it.each([false, true])('reveals only the active page and submits atomically (mock=%s)', async mock => {
    const f = await fixture({ mock });
    expect(f.started.attempt.flowVersion).toBe(1);
    expectPrivate(f.started.attempt);
    expect(JSON.stringify(f.started.attempt)).not.toContain('Future question');
    await f.save({ 'fill-1': { type: 'fill', answers: ['love', 'see'] } });
    const first = await f.confirm(false);
    expect(first).toMatchObject({ pending: false, attempt: { section: { pageId: 'page-2', revision: 0 } } });
    expect(JSON.stringify(first)).not.toContain('First question');
    expectPrivate(first.attempt);
    expect(await f.service.startAttempt({ origin: f.started.attempt.origin }, 'student-1')).toMatchObject({
      resumed: true,
      attempt: { section: { pageId: 'page-2' } },
    });
    await f.save({ 'fill-2': { type: 'fill', answers: ['love', 'see'] } });
    const result = await f.confirm();
    expect(result).toMatchObject({
      pending: false,
      completionGranted: !mock,
      attempt: { status: 'submitted', percentage: 100 },
    });
    expect(f.db.readAll('testResultReviews')).toHaveLength(1);
    expect(f.db.readAll('testAttemptSessions')).toHaveLength(0);
    expect(f.db.readAll('userProgress')).toHaveLength(mock ? 0 : 1);
    const duplicate = await f.service.confirmSection(
      f.id,
      'page-2',
      { expectedRevision: 1, requestId: randomUUID(), acknowledgeIncomplete: true },
      'student-1'
    );
    expect(duplicate).toMatchObject({ pending: false, completionGranted: false, attempt: { status: 'submitted' } });
    expect(f.db.readAll('testResultReviews')).toHaveLength(1);
  });

  it('persists review and returning to an editable section without clearing answers', async () => {
    const f = await fixture();
    await f.save({ 'fill-1': { type: 'fill', answers: ['love', ''] } });
    await f.service.setSectionPhase(f.id, 'page-1', { expectedRevision: 1, phase: 'review' }, 'student-1');
    expect(await f.current()).toMatchObject({
      section: { phase: 'review' },
      answers: { 'fill-1': { answers: ['love', ''] } },
    });
    await f.service.setSectionPhase(f.id, 'page-1', { expectedRevision: 1, phase: 'answering' }, 'student-1');
    expect(await f.current()).toMatchObject({
      section: { phase: 'answering' },
      answers: { 'fill-1': { answers: ['love', ''] } },
    });
    await expect(f.confirm(false)).rejects.toMatchObject({ code: 'ATTEMPT_INCOMPLETE_ACK_REQUIRED' });
    await f.confirm(true);
    const result = await f.confirm(true);
    expect(result.attempt).toMatchObject({ score: 1.5, maxScore: 6 });
  });

  it('requires explicit confirmation for a content-only page', async () => {
    const f = await fixture({ contentOnly: true });
    expect((await f.current()).section.pageId).toBe('page-1');
    expect(await f.confirm(false)).toMatchObject({ attempt: { section: { pageId: 'page-2' } } });
  });

  it('rejects future, locked, unknown, and stale writes and confirmation', async () => {
    const f = await fixture();
    await expect(f.save({ 'fill-2': { type: 'fill', answers: ['later'] } })).rejects.toMatchObject({
      code: 'ATTEMPT_SECTION_LOCKED',
    });
    const request = {
      answers: { 'fill-1': { type: 'fill' as const, answers: ['love'] } },
      section: { pageId: 'page-1', expectedRevision: 0, mutationId: randomUUID() },
    };
    await f.service.saveAttemptAnswers(f.id, request, 'student-1');
    await expect(
      f.service.saveAttemptAnswers(
        f.id,
        { ...request, section: { ...request.section, mutationId: randomUUID() } },
        'student-1'
      )
    ).rejects.toMatchObject({ code: 'ATTEMPT_REVISION_CONFLICT' });
    await expect(
      f.service.confirmSection(
        f.id,
        'page-2',
        { expectedRevision: 0, requestId: randomUUID(), acknowledgeIncomplete: true },
        'student-1'
      )
    ).rejects.toMatchObject({ code: 'ATTEMPT_SECTION_LOCKED' });
    await f.confirm();
    await expect(f.service.saveAttemptAnswers(f.id, request, 'student-1')).rejects.toMatchObject({
      code: 'ATTEMPT_SECTION_LOCKED',
    });
    await expect(
      f.service.setSectionPhase(f.id, 'page-1', { expectedRevision: 1, phase: 'answering' }, 'student-1')
    ).rejects.toMatchObject({ code: 'ATTEMPT_SECTION_LOCKED' });
  });

  it('makes lost-response save retries idempotent and rejects mutation ID reuse', async () => {
    const f = await fixture();
    const input = {
      answers: { 'fill-1': { type: 'fill' as const, answers: ['love'] } },
      section: { pageId: 'page-1', expectedRevision: 0, mutationId: randomUUID() },
    };
    await f.service.saveAttemptAnswers(f.id, input, 'student-1');
    const retry = await f.service.saveAttemptAnswers(f.id, input, 'student-1');
    expect(retry.section?.revision).toBe(1);
    await expect(
      f.service.saveAttemptAnswers(
        f.id,
        { ...input, answers: { 'fill-1': { type: 'fill', answers: ['changed'] } } },
        'student-1'
      )
    ).rejects.toMatchObject({ code: 'ATTEMPT_REVISION_CONFLICT' });
  });

  it('retains replay protection across later saves without reverting their answers', async () => {
    const f = await fixture();
    const first = {
      answers: { 'fill-1': { type: 'fill' as const, answers: ['first'] } },
      section: { pageId: 'page-1', expectedRevision: 0, mutationId: randomUUID() },
    };
    await f.service.saveAttemptAnswers(f.id, first, 'student-1');
    await f.save({ 'fill-1': { type: 'fill', answers: ['later'] } });
    const retry = await f.service.saveAttemptAnswers(f.id, first, 'student-1');
    expect(retry.section?.revision).toBe(2);
    expect(retry.answers['fill-1']).toEqual({ type: 'fill', answers: ['later'] });
    await expect(
      f.service.saveAttemptAnswers(
        f.id,
        {
          ...first,
          section: { ...first.section, expectedRevision: 2 },
          answers: { 'fill-1': { type: 'fill', answers: ['conflicting replay'] } },
        },
        'student-1'
      )
    ).rejects.toMatchObject({ code: 'ATTEMPT_REVISION_CONFLICT' });
    await f.confirm();
    expect(f.db.read('testAttempts', f.id)?.sections).toMatchObject({
      'page-1': { phase: 'confirmed' },
    });
    expect((f.db.read('testAttempts', f.id)?.sections as Record<string, unknown>)['page-1']).not.toHaveProperty(
      'saveMutations'
    );
  });

  it('cannot bypass confirmation using legacy routes or omit revision control', async () => {
    const f = await fixture({ translations: true });
    await expect(
      f.service.saveAttemptAnswers(
        f.id,
        { answers: { 'translation-1': { type: 'translation-grading', translations: ['A girl sings.'] } } },
        'student-1'
      )
    ).rejects.toMatchObject({ code: 'ATTEMPT_SECTION_REQUIRED' });
    await expect(
      f.service.gradeTranslationItem(
        f.id,
        { exerciseId: 'translation-1', itemIndex: 0, userTranslation: 'A girl sings.' },
        'student-1'
      )
    ).rejects.toMatchObject({ code: 'ATTEMPT_SECTION_REQUIRED' });
    await expect(f.service.submitAttempt(f.id, 'student-1')).rejects.toMatchObject({
      code: 'ATTEMPT_SECTION_REQUIRED',
    });
    expect(f.grader).not.toHaveBeenCalled();
  });

  it('ownership and missing attempts fail before any work', async () => {
    const f = await fixture();
    await expect(f.service.getAttempt(f.id, 'stranger')).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
    await expect(
      f.service.confirmSection(
        f.id,
        'page-1',
        { expectedRevision: 0, requestId: randomUUID(), acknowledgeIncomplete: true },
        'stranger'
      )
    ).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
    await expect(f.service.getAttempt('missing', 'student-1')).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
  });

  it('checkpoints one translation per request, keeps grades private, and reveals them only after submission', async () => {
    const f = await fixture({ translations: true });
    await f.save({ 'translation-1': { type: 'translation-grading', translations: ['A girl sings.', 'A boy runs.'] } });
    expect(f.grader).not.toHaveBeenCalled();
    expectPrivate((await f.confirm()).attempt);
    expect(f.grader).toHaveBeenCalledTimes(1);
    expectPrivate((await f.confirm()).attempt);
    expect(f.grader).toHaveBeenCalledTimes(2);
    expect((await f.confirm()).attempt).toMatchObject({ section: { pageId: 'page-2' } });
    const result = await f.confirm();
    expect(result.attempt.status).toBe('submitted');
    expect(JSON.stringify(await f.service.getSubmittedResult(f.id, 'student-1'))).toContain(
      'PRIVATE_TRANSLATION_FEEDBACK'
    );
  });

  it('retains successful hidden grades after a provider failure and retries only missing work', async () => {
    const grader = jest
      .fn()
      .mockResolvedValueOnce({ score: 8, feedback: 'PRIVATE_TRANSLATION_FEEDBACK' })
      .mockRejectedValueOnce(new Error('provider failed'))
      .mockResolvedValue({ score: 7, feedback: 'PRIVATE_TRANSLATION_FEEDBACK' });
    const f = await fixture({ translations: true, grader });
    await f.save({ 'translation-1': { type: 'translation-grading', translations: ['A girl sings.', 'A boy runs.'] } });
    await f.confirm();
    await expect(f.confirm()).rejects.toMatchObject({ code: 'ATTEMPT_GRADING_UNAVAILABLE' });
    expect((await f.current()).section.phase).toBe('review');
    expectPrivate(await f.current());
    await f.confirm();
    await f.confirm();
    expect(grader).toHaveBeenCalledTimes(3);
    expect(grader.mock.calls[2][0].userTranslation).toBe('A boy runs.');
  });

  it('excludes blank translations from AI grading', async () => {
    const f = await fixture({ translations: true });
    await f.save({ 'translation-1': { type: 'translation-grading', translations: ['', '  '] } });
    await f.confirm();
    expect(f.grader).not.toHaveBeenCalled();
  });

  it('blocks edits and concurrent provider calls while confirmation is reserved', async () => {
    let resolve!: (value: unknown) => void;
    const grader = jest.fn(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    const f = await fixture({ translations: true, grader });
    await f.save({ 'translation-1': { type: 'translation-grading', translations: ['A girl sings.'] } });
    const first = f.confirm();
    for (let i = 0; i < 30 && !resolve; i++) await Promise.resolve();
    expect(await f.confirm()).toMatchObject({ pending: true });
    expect(grader).toHaveBeenCalledTimes(1);
    await expect(
      f.save({ 'translation-1': { type: 'translation-grading', translations: ['changed'] } })
    ).rejects.toMatchObject({ code: 'ATTEMPT_SECTION_LOCKED' });
    resolve({ score: 7, feedback: 'PRIVATE_TRANSLATION_FEEDBACK' });
    await first;
    await f.confirm();
    expect(grader).toHaveBeenCalledTimes(1);
  });

  it('rejects late work after an expired lease is replaced', async () => {
    let resolve!: (value: unknown) => void;
    const grader = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise(r => {
            resolve = r;
          })
      )
      .mockResolvedValue({ score: 9, feedback: 'new grade' });
    const f = await fixture({ translations: true, grader });
    await f.save({ 'translation-1': { type: 'translation-grading', translations: ['A girl sings.'] } });
    const old = f.confirm();
    const rejected = expect(old).rejects.toMatchObject({ code: 'ATTEMPT_REVISION_CONFLICT' });
    for (let i = 0; i < 30 && !resolve; i++) await Promise.resolve();
    f.setTime(new Date(Date.parse(initialTime) + TRANSLATION_GRADING_RESERVATION_MS + 1).toISOString());
    await f.confirm();
    resolve({ score: 1, feedback: 'stale grade' });
    await rejected;
    expect(f.db.read('testAttempts', f.id)?.translationGrades).toMatchObject({
      'translation-1': { '0': { score: 9 } },
    });
    await f.confirm();
  });

  it('rejects unsupported versions and malformed confirmation order', async () => {
    const f = await fixture();
    const stored = f.db.read('testAttempts', f.id)!;
    expect(testAttemptDocumentSchema.safeParse({ ...stored, flowVersion: 2 }).success).toBe(false);
    expect(testAttemptDocumentSchema.safeParse({ ...stored, sections: undefined }).success).toBe(false);
    expect(
      testAttemptDocumentSchema.safeParse({
        ...stored,
        answers: { 'fill-2': { type: 'fill', answers: ['Future answer'] } },
      }).success
    ).toBe(false);
    expect(
      testAttemptDocumentSchema.safeParse({
        ...stored,
        sections: {
          'page-1': { revision: 0, phase: 'answering' },
          'page-2': { revision: 1, phase: 'answering' },
        },
      }).success
    ).toBe(false);
    expect(
      testAttemptDocumentSchema.safeParse({
        ...stored,
        sections: {
          'page-1': { revision: 0, phase: 'answering' },
          'page-2': { revision: 0, phase: 'confirmed', confirmedAt: initialTime },
        },
      }).success
    ).toBe(false);
  });
});

it('rejects invalid section IDs even after submission', async () => {
  const f = await fixture();
  await f.confirm();
  await f.confirm();
  await expect(
    f.service.confirmSection(
      f.id,
      'not-a-page',
      {
        expectedRevision: 0,
        requestId: randomUUID(),
        acknowledgeIncomplete: true,
      },
      'student-1'
    )
  ).rejects.toMatchObject({ code: 'ATTEMPT_SECTION_LOCKED' });
});

it('keeps provider budgets across failures and edits, then resets them with time', async () => {
  const grader = jest.fn().mockRejectedValue(new Error('Unavailable'));
  const f = await fixture({ translations: true, grader });
  for (let index = 0; index < 5; index++) {
    await f.save({ 'translation-1': { type: 'translation-grading', translations: [`Draft ${index}`] } });
    await expect(f.confirm()).rejects.toMatchObject({ code: 'ATTEMPT_GRADING_UNAVAILABLE' });
  }
  await expect(f.confirm()).rejects.toMatchObject({ code: 'ATTEMPT_TRANSLATION_GRADING_RATE_LIMITED' });
  expect(grader).toHaveBeenCalledTimes(5);
  f.setTime(new Date(Date.parse(initialTime) + 11 * 60_000).toISOString());
  grader.mockResolvedValue({ score: 5, feedback: 'Stored privately' });
  await f.confirm();
  expect(grader).toHaveBeenCalledTimes(6);
});
it('invalidates only edited translation grades after returning from a failed confirmation', async () => {
  const grader = jest
    .fn()
    .mockResolvedValueOnce({ score: 8, feedback: 'First grade' })
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue({ score: 6, feedback: 'New grade' });
  const f = await fixture({ translations: true, grader });
  await f.save({ 'translation-1': { type: 'translation-grading', translations: ['First', 'Second'] } });
  await f.confirm();
  await expect(f.confirm()).rejects.toMatchObject({ code: 'ATTEMPT_GRADING_UNAVAILABLE' });
  await f.save({ 'translation-1': { type: 'translation-grading', translations: ['Changed first', 'Second'] } });
  await f.confirm();
  expect(grader.mock.calls[2][0].userTranslation).toBe('Changed first');
  expectPrivate(await f.current());
});
it('rejects malformed AI output and returns the page to review', async () => {
  const f = await fixture({
    translations: true,
    grader: jest.fn().mockResolvedValue({ score: 99, feedback: 'SECRET INVALID' }),
  });
  await f.save({ 'translation-1': { type: 'translation-grading', translations: ['First'] } });
  await expect(f.confirm()).rejects.toMatchObject({ code: 'ATTEMPT_GRADING_UNAVAILABLE' });
  expect((await f.current()).section.phase).toBe('review');
  expect(f.db.read('testAttempts', f.id)?.translationGrades).toEqual({ 'translation-1': {} });
});
it('times out provider work before the route deadline and leaves a retryable review', async () => {
  const f = await fixture({ translations: true, grader: jest.fn(() => new Promise(() => undefined)) });
  await f.save({ 'translation-1': { type: 'translation-grading', translations: ['First'] } });
  jest.useFakeTimers();
  try {
    const pending = f.confirm();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ATTEMPT_GRADING_UNAVAILABLE' });
    await jest.advanceTimersByTimeAsync(90_001);
    await rejected;
    expect((await f.current()).section.phase).toBe('review');
  } finally {
    jest.useRealTimers();
  }
});
it('does not confirm the final section if frozen review persistence cannot fit', async () => {
  const f = await fixture();
  await f.confirm();
  const restricted = new TestAttemptService(f.db as never, () => initialTime, { maxReviewDocumentBytes: 1 });
  await expect(
    restricted.confirmSection(
      f.id,
      'page-2',
      { expectedRevision: 0, requestId: randomUUID(), acknowledgeIncomplete: true },
      'student-1'
    )
  ).rejects.toMatchObject({ code: 'ATTEMPT_TOO_LARGE' });
  expect((await f.current()).section).toMatchObject({ pageId: 'page-2', phase: 'answering' });
  expect(f.db.readAll('testResultReviews')).toHaveLength(0);
  expect(f.db.readAll('testAttemptSessions')).toHaveLength(1);
});
it('converges concurrent final confirmations on one result and completion', async () => {
  const f = await fixture();
  await f.confirm();
  const results = await Promise.all([f.confirm(), f.confirm()]);
  expect(results.map(result => result.completionGranted).sort()).toEqual([false, true]);
  expect(f.db.readAll('testResultReviews')).toHaveLength(1);
  expect(f.db.readAll('userProgress')).toHaveLength(1);
});
it('retains size limits and fails closed on invalid persisted references', async () => {
  const f = await fixture();
  await expect(f.save({ 'fill-1': { type: 'fill', answers: ['x'.repeat(950 * 1024)] } })).rejects.toMatchObject({
    code: 'ATTEMPT_TOO_LARGE',
  });
  expect((await f.current()).answers).toEqual({});
  const stored = f.db.read('testAttempts', f.id)!;
  f.db.seed('testAttempts', f.id, { ...stored, answers: { 'not-a-question': { type: 'fill', answers: ['x'] } } });
  await expect(f.current()).rejects.toMatchObject({ code: 'STALE_TEST_ATTEMPT_DATA' });
});
it('enforces current normal-test access when confirming and refreshing', async () => {
  const f = await fixture();
  f.db.seed('learningPaths', 'default', {
    id: 'default',
    revision: 2,
    unitIds: [],
    updatedAt: initialTime,
    updatedBy: 'admin',
  });
  await expect(
    f.service.confirmSection(
      f.id,
      'page-1',
      { expectedRevision: 0, requestId: randomUUID(), acknowledgeIncomplete: true },
      'student-1'
    )
  ).rejects.toMatchObject({ code: 'TEST_NOT_AVAILABLE' });
  await expect(f.current()).rejects.toMatchObject({ code: 'TEST_NOT_AVAILABLE' });
});

it('applies the global AI quota to section grading and releases rejected confirmation for retry', async () => {
  const quota = jest.fn().mockRejectedValueOnce(new AIRequestThrottleError(1000)).mockResolvedValue(undefined);
  const f = await fixture({ translations: true, consumeGlobalAIQuota: quota });
  await f.save({ 'translation-1': { type: 'translation-grading', translations: ['A girl sings.', ''] } });
  await expect(f.confirm()).rejects.toMatchObject({ code: 'ATTEMPT_TRANSLATION_GRADING_RATE_LIMITED', status: 429 });
  expect(f.grader).not.toHaveBeenCalled();
  expect((await f.current()).section.phase).toBe('review');
  expect(f.db.read('testAttempts', f.id)?.sections).toMatchObject({ 'page-1': { phase: 'review' } });
  expect(await f.confirm()).toMatchObject({ pending: true });
  expect(quota).toHaveBeenNthCalledWith(1, 1);
  expect(quota).toHaveBeenNthCalledWith(2, 1);
  expect(f.grader).toHaveBeenCalledWith(
    expect.objectContaining({ userTranslation: 'A girl sings.' }),
    expect.any(AbortSignal),
    createOpenAISafetyIdentifier('student-1')
  );
  expect(await f.confirm()).toMatchObject({ pending: false });
  expect(quota).toHaveBeenCalledTimes(2);
});
