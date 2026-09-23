import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import {
  EXERCISE_DRAFTS_COLLECTION,
  LEARNING_UNITS_COLLECTION,
  USER_PROGRESS_COLLECTION,
} from '@/shared/constants/firestore';
import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { studentDashboardService } from '@/src/lib/learning-units/student-dashboard-service';
import { getLessonProgressAccessInTransaction } from '@/src/lib/learning-units/progression-access';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { GeneratedExercisePreviewRequestSchema } from '@/src/lib/tests/generated-preview-schema';
import { createGeneratedFormIdentificationItems } from '@/src/lib/tests/generated-exercises';
import { collectWordsForGeneratedExerciseRequest } from '@/src/lib/tests/generated-word-loader.server';
import { SingleFieldFormIdentificationItemSchema } from '@/src/types/exercises/schemas/form-identification';
import { validateSingleFieldFormIdentificationExercise } from '@/src/utils/exercises/generatedFormIdentificationExercise';
import type { Lesson } from '@/src/types/lesson';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { adminDb } from '@/src/services/firebase-admin';

export const dynamic = 'force-dynamic';

const MAX_DRAFT_BYTES = 750_000;
const draftSchema = z.object({
  lessonVersion: z.number().int().nonnegative(),
  items: z.array(SingleFieldFormIdentificationItemSchema).min(1).max(200),
  answers: z.record(z.string(), z.string().max(2_000)),
  updatedAt: z.string(),
});
type ExerciseDraft = z.infer<typeof draftSchema>;

const answerSchema = z
  .object({
    itemId: firestoreDocumentIdSchema,
    answer: z.string().trim().min(1).max(2_000),
  })
  .strict();
const paramsSchema = z.object({ lessonId: firestoreDocumentIdSchema, exerciseId: firestoreDocumentIdSchema });

class ExerciseDraftError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
  }
}

const routeErrorResponse = createRouteErrorResponse(ExerciseDraftError);

const draftRef = (userId: string, lessonId: string, exerciseId: string) =>
  adminDb
    .collection(USER_PROGRESS_COLLECTION)
    .doc(`${userId}_${lessonId}`)
    .collection(EXERCISE_DRAFTS_COLLECTION)
    .doc(exerciseId);

const getVersion = (lesson: Lesson): number => {
  const version = lesson.version;
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 0 ? version : 0;
};

function findExercise(lesson: Lesson, exerciseId: string): GeneratedFormIdentificationExercise {
  const item = lesson.pages.flatMap(page => page.items).find(candidate => candidate.id === exerciseId);
  if (item?.type !== 'generated-form-identification' || item.data.mode !== 'single-field') {
    throw new ExerciseDraftError('Exercise draft is unavailable', 404, 'EXERCISE_NOT_FOUND');
  }
  const parsed = GeneratedExercisePreviewRequestSchema.safeParse(item);
  if (!parsed.success) {
    throw new ExerciseDraftError('Exercise contains invalid persisted data', 409, 'INVALID_EXERCISE');
  }
  return item as unknown as GeneratedFormIdentificationExercise;
}

function readDraft(data: unknown, version: number): ExerciseDraft | null {
  if (data === undefined) return null;
  const parsed = draftSchema.safeParse(data);
  if (!parsed.success) {
    throw new ExerciseDraftError('Saved exercise draft contains invalid data', 409, 'INVALID_EXERCISE_DRAFT');
  }
  if (parsed.data.lessonVersion !== version) return null;
  const ids = new Set<string>();
  let hasGap = false;
  for (const item of parsed.data.items) {
    if (ids.has(item.id)) {
      throw new ExerciseDraftError('Saved exercise draft has duplicate items', 409, 'INVALID_EXERCISE_DRAFT');
    }
    ids.add(item.id);
    const answer = parsed.data.answers[item.id];
    if (!answer) hasGap = true;
    else if (hasGap || !validateSingleFieldFormIdentificationExercise(answer, item).isCorrect) {
      throw new ExerciseDraftError('Saved exercise draft has invalid answers', 409, 'INVALID_EXERCISE_DRAFT');
    }
  }
  if (Object.keys(parsed.data.answers).some(id => !ids.has(id))) {
    throw new ExerciseDraftError('Saved exercise draft has unknown answers', 409, 'INVALID_EXERCISE_DRAFT');
  }
  return parsed.data;
}

const responseForDraft = (draft: ExerciseDraft) =>
  NextResponse.json(
    {
      words: [],
      draftItems: draft.items,
      draftAnswers: draft.answers,
      diagnostics: [],
      requestedCount: draft.items.length,
      collected: draft.items.length,
      globalScanLimitReached: false,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; exerciseId: string }> }
) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { lessonId, exerciseId } = paramsSchema.parse(await params);
    const lesson = await studentDashboardService.getLesson(student.uid, lessonId);
    const exercise = findExercise(lesson, exerciseId);
    const version = getVersion(lesson);
    const ref = draftRef(student.uid, lessonId, exerciseId);
    const existing = readDraft((await ref.get()).data(), version);
    if (existing) return responseForDraft(existing);

    const generated = await collectWordsForGeneratedExerciseRequest(adminDb, exercise);
    const parsedItems = z
      .array(SingleFieldFormIdentificationItemSchema)
      .min(1)
      .max(200)
      .safeParse(createGeneratedFormIdentificationItems(exercise, generated.words));
    if (!parsedItems.success) {
      throw new ExerciseDraftError('Generated exercise contains invalid items', 409, 'INVALID_EXERCISE');
    }
    const items = parsedItems.data;
    const draft: ExerciseDraft = JSON.parse(
      JSON.stringify({
        lessonVersion: version,
        items,
        answers: {},
        updatedAt: new Date().toISOString(),
      })
    );
    if (Buffer.byteLength(JSON.stringify(draft), 'utf8') > MAX_DRAFT_BYTES) {
      throw new ExerciseDraftError('Generated exercise is too large to save safely', 409, 'EXERCISE_DRAFT_TOO_LARGE');
    }

    const lessonRef = adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId);
    const progressRef = adminDb.collection(USER_PROGRESS_COLLECTION).doc(`${student.uid}_${lessonId}`);
    const saved = await adminDb.runTransaction(async transaction => {
      const [lessonSnapshot, progressSnapshot, snapshot] = await Promise.all([
        transaction.get(lessonRef),
        transaction.get(progressRef),
        transaction.get(ref),
      ]);
      if (!lessonSnapshot.exists || !isLessonDocumentData(lessonSnapshot.data())) {
        throw new ExerciseDraftError('Lesson was not found', 404, 'LESSON_NOT_FOUND');
      }
      const currentLesson = { id: lessonSnapshot.id, ...lessonSnapshot.data() } as Lesson;
      if (getVersion(currentLesson) !== version) {
        throw new ExerciseDraftError('Lesson changed; reload the exercise', 409, 'STALE_LESSON');
      }
      findExercise(currentLesson, exerciseId);
      const access = await getLessonProgressAccessInTransaction(
        transaction,
        adminDb,
        currentLesson,
        student.uid,
        progressSnapshot.exists
      );
      if (access !== 'allowed') {
        throw new ExerciseDraftError(
          'Lesson is not available',
          access === 'locked' ? 403 : 404,
          'LESSON_NOT_AVAILABLE'
        );
      }
      const current = readDraft(snapshot.data(), version);
      if (current) return current;
      transaction.set(ref, draft);
      return draft;
    });
    return responseForDraft(saved);
  } catch (error) {
    return routeErrorResponse(error, 'load exercise draft');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; exerciseId: string }> }
) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { lessonId, exerciseId } = paramsSchema.parse(await params);
    const input = answerSchema.parse(await request.json().catch(() => null));
    const lesson = await studentDashboardService.getLesson(student.uid, lessonId);
    findExercise(lesson, exerciseId);
    const version = getVersion(lesson);
    const lessonRef = adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId);
    const progressRef = adminDb.collection(USER_PROGRESS_COLLECTION).doc(`${student.uid}_${lessonId}`);
    const ref = draftRef(student.uid, lessonId, exerciseId);

    const answers = await adminDb.runTransaction(async transaction => {
      const [lessonSnapshot, progressSnapshot, draftSnapshot] = await Promise.all([
        transaction.get(lessonRef),
        transaction.get(progressRef),
        transaction.get(ref),
      ]);
      if (!lessonSnapshot.exists || !isLessonDocumentData(lessonSnapshot.data())) {
        throw new ExerciseDraftError('Lesson was not found', 404, 'LESSON_NOT_FOUND');
      }
      const currentLesson = { id: lessonSnapshot.id, ...lessonSnapshot.data() } as Lesson;
      if (getVersion(currentLesson) !== version) {
        throw new ExerciseDraftError('Lesson changed; reload the exercise', 409, 'STALE_LESSON');
      }
      findExercise(currentLesson, exerciseId);
      const access = await getLessonProgressAccessInTransaction(
        transaction,
        adminDb,
        currentLesson,
        student.uid,
        progressSnapshot.exists
      );
      if (access !== 'allowed') {
        throw new ExerciseDraftError(
          'Lesson is not available',
          access === 'locked' ? 403 : 404,
          'LESSON_NOT_AVAILABLE'
        );
      }
      const draft = readDraft(draftSnapshot.data(), version);
      if (!draft) {
        throw new ExerciseDraftError('Exercise draft changed; reload the exercise', 409, 'STALE_EXERCISE_DRAFT');
      }
      const itemIndex = draft.items.findIndex(item => item.id === input.itemId);
      if (itemIndex < 0) throw new ExerciseDraftError('Exercise item was not found', 404, 'EXERCISE_ITEM_NOT_FOUND');
      const firstIncompleteIndex = draft.items.findIndex(item => !draft.answers[item.id]);
      if (firstIncompleteIndex >= 0 && itemIndex > firstIncompleteIndex) {
        throw new ExerciseDraftError('Complete the earlier items first', 409, 'EXERCISE_ITEM_OUT_OF_ORDER');
      }
      if (!validateSingleFieldFormIdentificationExercise(input.answer, draft.items[itemIndex]).isCorrect) {
        throw new ExerciseDraftError('Answer was not accepted', 422, 'INCORRECT_EXERCISE_ANSWER');
      }
      if (draft.answers[input.itemId] === input.answer) return draft.answers;
      const updatedAnswers = { ...draft.answers, [input.itemId]: input.answer };
      if (Buffer.byteLength(JSON.stringify({ ...draft, answers: updatedAnswers }), 'utf8') > MAX_DRAFT_BYTES) {
        throw new ExerciseDraftError('Exercise draft is too large to save safely', 409, 'EXERCISE_DRAFT_TOO_LARGE');
      }
      transaction.update(ref, { answers: updatedAnswers, updatedAt: new Date().toISOString() });
      return updatedAnswers;
    });
    return NextResponse.json({ draftAnswers: answers });
  } catch (error) {
    return routeErrorResponse(error, 'save exercise draft');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; exerciseId: string }> }
) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { lessonId, exerciseId } = paramsSchema.parse(await params);
    const lesson = await studentDashboardService.getLesson(student.uid, lessonId);
    findExercise(lesson, exerciseId);
    const version = getVersion(lesson);
    const lessonRef = adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId);
    const progressRef = adminDb.collection(USER_PROGRESS_COLLECTION).doc(`${student.uid}_${lessonId}`);
    const ref = draftRef(student.uid, lessonId, exerciseId);

    await adminDb.runTransaction(async transaction => {
      const [lessonSnapshot, progressSnapshot, draftSnapshot] = await Promise.all([
        transaction.get(lessonRef),
        transaction.get(progressRef),
        transaction.get(ref),
      ]);
      if (!lessonSnapshot.exists || !isLessonDocumentData(lessonSnapshot.data())) {
        throw new ExerciseDraftError('Lesson was not found', 404, 'LESSON_NOT_FOUND');
      }
      const currentLesson = { id: lessonSnapshot.id, ...lessonSnapshot.data() } as Lesson;
      if (getVersion(currentLesson) !== version) {
        throw new ExerciseDraftError('Lesson changed; reload the exercise', 409, 'STALE_LESSON');
      }
      findExercise(currentLesson, exerciseId);
      const access = await getLessonProgressAccessInTransaction(
        transaction,
        adminDb,
        currentLesson,
        student.uid,
        progressSnapshot.exists
      );
      if (access !== 'allowed') {
        throw new ExerciseDraftError(
          'Lesson is not available',
          access === 'locked' ? 403 : 404,
          'LESSON_NOT_AVAILABLE'
        );
      }
      const draft = readDraft(draftSnapshot.data(), version);
      if (!draft) {
        throw new ExerciseDraftError('Exercise draft changed; reload the exercise', 409, 'STALE_EXERCISE_DRAFT');
      }
      if (Object.keys(draft.answers).length > 0) {
        transaction.update(ref, { answers: {}, updatedAt: new Date().toISOString() });
      }
    });
    return NextResponse.json({ draftAnswers: {} });
  } catch (error) {
    return routeErrorResponse(error, 'reset exercise draft');
  }
}
