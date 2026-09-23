import { DELETE, GET, PUT } from '@/src/app/api/lesson-exercise-drafts/[lessonId]/[exerciseId]/route';

const mockVerifyRequestAuth = jest.fn();
const mockGetLesson = jest.fn();
const mockCollectWords = jest.fn();
const mockCreateItems = jest.fn();
const mockAccess = jest.fn();
const mockIsLessonDocumentData = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const documents = new Map<string, Record<string, unknown>>();

const lesson = {
  id: 'lesson-1',
  title: 'Morphology',
  type: 'normal',
  version: 36,
  pages: [
    {
      id: 'page-1',
      items: [
        {
          id: 'form-1',
          type: 'generated-form-identification',
          title: 'Conjugate',
          instructions: '',
          feedbackConfig: { escalationLevels: [] },
          data: {
            mode: 'single-field',
            generatorConfig: { wordSource: 'filters', count: 2 },
            paradigmConfigs: {},
          },
        },
      ],
    },
  ],
};

const items = ['word-1', 'word-2'].map((id, index) => ({
  id,
  wordId: id,
  word: id,
  root_word: id,
  dictionary_entry: id,
  selected_form: id,
  hasSelectedForm: true,
  steps: ['tense'],
  correctAnswerDisplay: index === 0 ? 'present' : 'imperfect',
  primaryFormPaths: [{ tense: index === 0 ? 'present' : 'imperfect' }],
  optionalFormPaths: [],
}));

type Ref = {
  path: string;
  id: string;
  get: () => Promise<{ exists: boolean; id: string; data: () => unknown }>;
  collection: (name: string) => { doc: (id: string) => Ref };
};

const ref = (path: string): Ref => ({
  path,
  id: path.split('/').at(-1)!,
  get: async () => ({ exists: documents.has(path), id: path.split('/').at(-1)!, data: () => documents.get(path) }),
  collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }),
});

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyRequestAuth', () => ({
  verifyRequestAuth: (...args: unknown[]) => mockVerifyRequestAuth(...args),
}));
jest.mock('@/src/lib/learning-units/student-dashboard-service', () => ({
  studentDashboardService: { getLesson: (...args: unknown[]) => mockGetLesson(...args) },
}));
jest.mock('@/src/lib/learning-units/progression-access', () => ({
  getLessonProgressAccessInTransaction: (...args: unknown[]) => mockAccess(...args),
}));
jest.mock('@/src/lib/learning-units/domain', () => ({
  isLessonDocumentData: (...args: unknown[]) => mockIsLessonDocumentData(...args),
}));
jest.mock('@/src/lib/tests/generated-word-loader.server', () => ({
  collectWordsForGeneratedExerciseRequest: (...args: unknown[]) => mockCollectWords(...args),
}));
jest.mock('@/src/lib/tests/generated-exercises', () => ({
  createGeneratedFormIdentificationItems: (...args: unknown[]) => mockCreateItems(...args),
}));
jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        get: (documentRef: Ref) => documentRef.get(),
        set: (documentRef: Ref, data: Record<string, unknown>) => {
          mockSet(documentRef.path, data);
          documents.set(documentRef.path, data);
        },
        update: (documentRef: Ref, data: Record<string, unknown>) => {
          mockUpdate(documentRef.path, data);
          documents.set(documentRef.path, { ...documents.get(documentRef.path), ...data });
        },
      }),
  },
}));

const params = { params: Promise.resolve({ lessonId: 'lesson-1', exerciseId: 'form-1' }) };
const request = (body?: unknown) => ({ json: async () => body }) as never;
const draftPath = 'userProgress/student-1_lesson-1/exerciseDrafts/form-1';

beforeEach(() => {
  jest.clearAllMocks();
  documents.clear();
  documents.set('lessons/lesson-1', lesson);
  mockVerifyRequestAuth.mockResolvedValue({ uid: 'student-1' });
  mockGetLesson.mockResolvedValue(lesson);
  mockCollectWords.mockResolvedValue({ words: [{ id: 'word-1' }, { id: 'word-2' }] });
  mockCreateItems.mockReturnValue(items);
  mockAccess.mockResolvedValue('allowed');
  mockIsLessonDocumentData.mockReturnValue(true);
});

describe('generated morphology exercise drafts', () => {
  it('rejects unauthenticated reads and writes before touching progress', async () => {
    mockVerifyRequestAuth.mockResolvedValue(null);
    const read = (await GET(request(), params)) as unknown as { status: number };
    const write = (await PUT(request({ itemId: 'word-1', answer: 'present' }), params)) as unknown as {
      status: number;
    };
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(mockGetLesson).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('holds the generated item set stable and resumes an accepted item after leaving', async () => {
    const first = (await GET(request(), params)) as unknown as {
      body: { draftItems: typeof items; draftAnswers: Record<string, string> };
    };
    expect(first.body.draftItems).toHaveLength(2);
    expect(first.body.draftAnswers).toEqual({});
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(draftPath, expect.objectContaining({ lessonVersion: 36 }));

    const saved = (await PUT(request({ itemId: 'word-1', answer: 'present' }), params)) as unknown as {
      status: number;
      body: { draftAnswers: Record<string, string> };
    };
    expect(saved.status).toBe(200);
    expect(saved.body.draftAnswers).toEqual({ 'word-1': 'present' });
    const resumed = (await GET(request(), params)) as unknown as {
      body: { draftItems: typeof items; draftAnswers: Record<string, string> };
    };
    expect(resumed.body.draftItems).toEqual(first.body.draftItems);
    expect(resumed.body.draftAnswers).toEqual({ 'word-1': 'present' });
    expect(mockCollectWords).toHaveBeenCalledTimes(1);
  });

  it('rejects skipping items, incorrect answers, and locked lessons without updating the draft', async () => {
    await GET(request(), params);
    const skipped = (await PUT(request({ itemId: 'word-2', answer: 'imperfect' }), params)) as unknown as {
      status: number;
    };
    const incorrect = (await PUT(request({ itemId: 'word-1', answer: 'future' }), params)) as unknown as {
      status: number;
    };
    mockAccess.mockResolvedValue('locked');
    const locked = (await PUT(request({ itemId: 'word-1', answer: 'present' }), params)) as unknown as {
      status: number;
    };
    expect([skipped.status, incorrect.status, locked.status]).toEqual([409, 422, 403]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects a lesson edit that races an accepted answer', async () => {
    await GET(request(), params);
    documents.set('lessons/lesson-1', { ...lesson, version: 37 });
    const response = (await PUT(request({ itemId: 'word-1', answer: 'present' }), params)) as unknown as {
      status: number;
    };
    expect(response.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects a lesson edit that races initial draft creation', async () => {
    documents.set('lessons/lesson-1', { ...lesson, version: 37 });
    const response = (await GET(request(), params)) as unknown as { status: number };
    expect(response.status).toBe(409);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('rejects missing and deletion-pending lesson references', async () => {
    mockGetLesson.mockResolvedValue({ ...lesson, pages: [{ id: 'page-1', items: [] }] });
    const missing = (await GET(request(), params)) as unknown as { status: number };
    expect(missing.status).toBe(404);

    mockGetLesson.mockResolvedValue(lesson);
    await GET(request(), params);
    mockIsLessonDocumentData.mockReturnValue(false);
    const deletionPending = (await PUT(request({ itemId: 'word-1', answer: 'present' }), params)) as unknown as {
      status: number;
    };
    expect(deletionPending.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('clears accepted items when the student deliberately restarts the exercise', async () => {
    await GET(request(), params);
    await PUT(request({ itemId: 'word-1', answer: 'present' }), params);
    const reset = (await DELETE(request(), params)) as unknown as {
      status: number;
      body: { draftAnswers: Record<string, string> };
    };
    expect(reset.status).toBe(200);
    expect(reset.body.draftAnswers).toEqual({});
    const reopened = (await GET(request(), params)) as unknown as { body: { draftAnswers: Record<string, string> } };
    expect(reopened.body.draftAnswers).toEqual({});
    expect(mockCollectWords).toHaveBeenCalledTimes(1);
  });
});
