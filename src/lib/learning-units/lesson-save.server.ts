import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { LEARNING_UNITS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import type { Lesson } from '@/src/types/lesson';
import { RequestError } from '@/src/lib/domain-error';
import {
  optionalPracticeCategoryIdsSchema,
  optionalPracticeCategorySelectionsSchema,
} from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';
import { assertVocabularyPoolAssignmentsAllowedInTransaction } from '@/src/lib/vocabulary-pools/assignment.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { validateLessonProgression } from '@/src/utils/lessonProgress';
import { getLessonContentCounts } from '@/src/utils/lessonSummary';
import { isLessonDocumentData } from './domain';
import {
  assertLegacyNormalPlacementChangeAllowedInTransaction,
  assertPlacedLessonReplacementAllowedInTransaction,
} from './learning-path-service';
import { lessonAuthoringInputSchema, lessonUnitDocumentSchema } from './schemas';

/** `create` rejects an existing lesson, `update` requires one, and `create-or-update` accepts either. */
export type LessonSaveMode = 'create' | 'update' | 'create-or-update';

export type LessonSaveInput = ReturnType<typeof parseLessonSaveInput>;

/**
 * Validates a lesson payload before any Firestore read. Practice-category
 * fields travel with the lesson but are stored as memberships, not on it.
 */
export function parseLessonSaveInput(rawLesson: unknown, fallbackCategoryIds?: string[]) {
  if (!isLessonDocumentData(rawLesson)) {
    throw new RequestError(400, 'LESSON_INVALID', 'Only lesson documents can use the lesson endpoint');
  }
  if (rawLesson.showWordSearch !== undefined && typeof rawLesson.showWordSearch !== 'boolean') {
    throw new RequestError(400, 'LESSON_INVALID', 'showWordSearch must be a boolean');
  }
  const practiceCategorySelections = optionalPracticeCategorySelectionsSchema.parse(
    rawLesson.practiceCategorySelections
  );
  const practiceCategoryIds = optionalPracticeCategoryIdsSchema.parse(
    rawLesson.practiceCategoryIds ?? fallbackCategoryIds
  );
  return {
    lesson: lessonAuthoringInputSchema.parse(rawLesson),
    showWordSearch: rawLesson.showWordSearch as boolean | undefined,
    practiceCategorySelections,
    practiceCategoryIds,
  };
}

/**
 * The one lesson write, used by create, update and recovery. It must run inside
 * `runVocabularyContentMutation`. All reads happen before the first write, so a
 * caller may read before calling it and may write after it returns.
 *
 * A save never changes where a lesson is placed or whether it is live: those
 * fields are carried over from the stored lesson, and a new lesson starts
 * unpublished.
 */
export async function saveLessonInTransaction(
  transaction: Transaction,
  db: Firestore,
  input: LessonSaveInput,
  actorId: string,
  mode: LessonSaveMode
) {
  const { lesson } = input;
  const lessonRef = db.collection(LEARNING_UNITS_COLLECTION).doc(lesson.id);
  const snapshot = await transaction.get(lessonRef);
  const stored = snapshot.exists ? snapshot.data() : undefined;
  if (stored && mode === 'create') {
    throw new RequestError(409, 'LESSON_ALREADY_EXISTS', 'A lesson with this ID already exists');
  }
  // A test unit shares the collection and must never be overwritten by a lesson.
  if ((stored && !isLessonDocumentData(stored)) || (!stored && mode === 'update')) {
    throw new RequestError(404, 'LESSON_NOT_FOUND', 'Lesson not found');
  }
  const existing = stored as Partial<Lesson> | undefined;

  await assertLegacyNormalPlacementChangeAllowedInTransaction(transaction, db, existing, {
    type: lesson.type,
    isLive: existing?.isLive ?? false,
    liveOrder: existing?.liveOrder ?? null,
    publishedAt: existing?.publishedAt ?? null,
    publishedBy: existing?.publishedBy ?? null,
  });
  await assertPlacedLessonReplacementAllowedInTransaction(transaction, db, lesson.id, {
    type: lesson.type,
    pages: lesson.pages,
  });
  if (existing?.isLive) {
    const progressionErrors = validateLessonProgression(lesson);
    if (progressionErrors.length > 0) {
      throw new RequestError(400, 'LESSON_PROGRESSION_INVALID', `Cannot update live lesson ${lesson.id}`, {
        progressionErrors,
      });
    }
  }

  const now = new Date().toISOString();
  const document = lessonUnitDocumentSchema.parse({
    ...lesson,
    kind: 'lesson' as const,
    ...getLessonContentCounts(lesson),
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || actorId,
    updatedAt: now,
    updatedBy: actorId,
    version: existing ? (existing.version || 0) + 1 : 1,
    showWordSearch:
      input.showWordSearch ??
      (existing ? (typeof existing.showWordSearch === 'boolean' ? existing.showWordSearch : true) : false),
    isLive: existing?.isLive ?? false,
    liveOrder: existing?.liveOrder ?? null,
    publishedAt: existing?.publishedAt || null,
    publishedBy: existing?.publishedBy || null,
  });

  const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
    transaction,
    db,
    stored,
    document
  );
  const assignments = await practiceCategoryService.reconcileLessonCategoriesInTransaction(transaction, {
    lessonId: lesson.id,
    lesson: document,
    ...(input.practiceCategorySelections !== undefined
      ? { desiredCategorySelections: input.practiceCategorySelections }
      : // An update without category fields keeps the lesson's memberships; a new lesson has none.
        { desiredCategoryIds: existing ? input.practiceCategoryIds : (input.practiceCategoryIds ?? []) }),
    actorId,
  });
  applyVocabularyPoolAssignmentRevisions();
  if (existing) transaction.set(lessonRef, document);
  else transaction.create(lessonRef, document);

  return {
    created: !existing,
    lesson: {
      ...document,
      practiceCategorySelections: assignments.practiceCategorySelections,
      practiceCategoryIds: assignments.practiceCategoryIds,
      practiceCategories: assignments.practiceCategories,
    },
  };
}

/** Creates or updates a lesson from an untrusted payload. */
export async function saveLesson(rawLesson: unknown, actorId: string, mode: LessonSaveMode) {
  const input = parseLessonSaveInput(rawLesson);
  return runVocabularyContentMutation(adminDb, transaction =>
    saveLessonInTransaction(transaction, adminDb, input, actorId, mode)
  );
}
