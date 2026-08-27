import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  DEFAULT_LEARNING_PATH_ID,
  LEARNING_PATHS_COLLECTION,
  LEARNING_UNITS_COLLECTION,
  TEST_ATTEMPTS_COLLECTION,
  USER_PROGRESS_COLLECTION,
} from '@/shared/constants/firestore';
import type { LearningPathDocument, LessonUnit } from '@/src/types/learning-unit';
import type { UserProgress } from '@/src/types/lesson';
import { canonicalizeLessonProgressForRead } from '@/src/utils/lessonProgress';
import { isLessonDocumentData, normalizeLearningUnit } from './domain';
import { parseLearningPathSnapshot } from './learning-path-service';
import {
  collectAttemptedNormalTestIds,
  isProgressionLockingDisabled,
  isProgressionUnitUnlocked,
  type ProgressionUnit,
} from './progression';

type ProgressionAccessOptions = {
  hasPersistedTargetActivity?: boolean;
};

export type LessonProgressAccessDecision = 'allowed' | 'not-found' | 'locked';

async function isUnitSequenceUnlockedInTransaction(
  transaction: Transaction,
  db: Firestore,
  unitIds: string[],
  studentId: string,
  targetId: string,
  options: ProgressionAccessOptions = {}
): Promise<boolean> {
  const targetIndex = unitIds.indexOf(targetId);
  if (targetIndex < 0) return false;
  if (isProgressionLockingDisabled() || targetIndex === 0 || options.hasPersistedTargetActivity) {
    return true;
  }

  const [unitSnapshots, progressSnapshot] = await Promise.all([
    transaction.getAll(...unitIds.map(unitId => db.collection(LEARNING_UNITS_COLLECTION).doc(unitId)), {
      fieldMask: ['kind', 'type'],
    }),
    transaction.get(
      db
        .collection(USER_PROGRESS_COLLECTION)
        .where('userId', '==', studentId)
        .select('lessonId', 'status', 'progressSchemaVersion', 'currentPageIndex', 'furthestPageIndex')
    ),
  ]);
  // Match the dashboard's defensive projection: dangling and ineligible lesson
  // references are skipped, while an invalid kind:test record remains a
  // blocking assessment configuration.
  const units = unitSnapshots.flatMap((snapshot): ProgressionUnit[] => {
    if (!snapshot.exists) return [];
    const data = snapshot.data();
    if (data?.kind === 'test') return [{ id: snapshot.id, kind: 'test' }];
    return isLessonDocumentData(data) && (data.type ?? 'normal') === 'normal'
      ? [{ id: snapshot.id, kind: 'lesson' }]
      : [];
  });
  const effectiveTargetIndex = units.findIndex(unit => unit.id === targetId);
  if (effectiveTargetIndex < 0) return false;

  const progressByUnitId = new Map<string, Partial<UserProgress>>();
  const progressSnapshotByUnitId = new Map<string, (typeof progressSnapshot.docs)[number]>();
  for (const snapshot of progressSnapshot.docs) {
    const data = snapshot.data() as Partial<UserProgress>;
    const unitId =
      typeof data.lessonId === 'string'
        ? data.lessonId
        : snapshot.id.startsWith(`${studentId}_`)
          ? snapshot.id.slice(studentId.length + 1)
          : null;
    if (!unitId) continue;
    progressByUnitId.set(unitId, data);
    progressSnapshotByUnitId.set(unitId, snapshot);
  }
  const attemptedTestIds = new Set<string>();
  const activity = { progressByUnitId, attemptedTestIds };
  if (isProgressionUnitUnlocked(units, effectiveTargetIndex, activity)) return true;

  // Full lesson and progress data are loaded only for the previous lesson whose
  // canonical completion could unlock the target.
  const previous = units[effectiveTargetIndex - 1];
  const previousProgress = progressByUnitId.get(previous.id);
  const previousProgressSnapshot = progressSnapshotByUnitId.get(previous.id);
  if (previous.kind === 'lesson' && previousProgress && previousProgressSnapshot) {
    const [previousUnitSnapshot, fullProgressSnapshot] = await Promise.all([
      transaction.get(db.collection(LEARNING_UNITS_COLLECTION).doc(previous.id)),
      transaction.get(previousProgressSnapshot.ref),
    ]);
    if (previousUnitSnapshot.exists && fullProgressSnapshot.exists) {
      try {
        const previousUnit = normalizeLearningUnit(previousUnitSnapshot.data(), previous.id);
        if (previousUnit.kind === 'lesson') {
          previous.totalPages = previousUnit.pages.length;
          progressByUnitId.set(
            previous.id,
            canonicalizeLessonProgressForRead(
              { pages: previousUnit.pages, version: previousUnit.version },
              fullProgressSnapshot.data() as Partial<UserProgress>
            )
          );
          if (isProgressionUnitUnlocked(units, effectiveTargetIndex, activity)) return true;
        }
      } catch {
        // The dashboard also skips invalid lesson summaries; attempt history
        // below may still establish a sticky frontier for the target.
      }
    }
  }

  const attemptSnapshot = await transaction.get(
    db.collection(TEST_ATTEMPTS_COLLECTION).where('studentId', '==', studentId).select('origin', 'status')
  );
  for (const testId of collectAttemptedNormalTestIds(attemptSnapshot.docs.map(snapshot => snapshot.data()))) {
    attemptedTestIds.add(testId);
  }
  return isProgressionUnitUnlocked(units, effectiveTargetIndex, activity);
}

/**
 * Applies the same sticky-frontier rule as the student dashboard at the write
 * boundary. Progress records are server-authored, so their existence is the
 * durable signal that a learner had already reached a unit before a path edit.
 */
export async function isLearningPathUnitUnlockedInTransaction(
  transaction: Transaction,
  db: Firestore,
  path: LearningPathDocument,
  studentId: string,
  targetId: string,
  options: ProgressionAccessOptions = {}
): Promise<boolean> {
  return isUnitSequenceUnlockedInTransaction(transaction, db, path.unitIds, studentId, targetId, options);
}

/**
 * Resolves lesson write access from the same transaction that persists the
 * progress signal, so a concurrent path edit retries against the new order.
 */
export async function getLessonProgressAccessInTransaction(
  transaction: Transaction,
  db: Firestore,
  lesson: Pick<LessonUnit, 'id' | 'type' | 'isLive'>,
  studentId: string,
  hasPersistedTargetActivity: boolean
): Promise<LessonProgressAccessDecision> {
  if (lesson.type !== 'normal') {
    return lesson.isLive ? 'allowed' : 'not-found';
  }

  const pathSnapshot = await transaction.get(db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID));
  const path = parseLearningPathSnapshot(pathSnapshot);
  if (!path) return 'not-found';
  const unitIds = path.unitIds;

  if (!unitIds.includes(lesson.id)) return 'not-found';
  return (await isUnitSequenceUnlockedInTransaction(transaction, db, unitIds, studentId, lesson.id, {
    hasPersistedTargetActivity,
  }))
    ? 'allowed'
    : 'locked';
}
