import { FieldPath, type DocumentData, type Query } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  LEARNING_UNITS_COLLECTION,
  USER_PROGRESS_COLLECTION,
  USER_PROGRESS_V4_BACKUPS_COLLECTION,
} from '@/shared/constants/firestore';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { normalizeLearningUnit } from '@/src/lib/learning-units/domain';
import { adminDb } from '@/src/services/firebase-admin';
import type { Lesson, UserProgress } from '@/src/types/lesson';
import { PROGRESS_SCHEMA_VERSION } from '@/src/utils/lessonProgress';
import { migrateUserProgressToExerciseBasis } from '@/src/utils/progressMigration';

export const dynamic = 'force-dynamic';

const MIGRATION_ID = 'exercise-progress-v4';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

const migrationRequestSchema = z
  .object({
    action: z.enum(['dry-run', 'apply', 'rollback']).default('dry-run'),
    confirmWrite: z.boolean().optional(),
    cursor: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  })
  .strict();

type MigrationOutcome =
  | { kind: 'invalid-progress' }
  | { kind: 'missing-lesson' }
  | { kind: 'invalid-lesson' }
  | { kind: 'deletion-pending-lesson' }
  | { kind: 'backup-conflict' }
  | { kind: 'already-current' }
  | {
      kind: 'migrated';
      mappedExerciseRecords: number;
      unmappedExerciseRecords: number;
      deduplicatedExerciseRecords: number;
      derivedCompletion: boolean;
      completedLessonPreserved: boolean;
      resetIncompleteProgressToZero: boolean;
    };

type RollbackOutcome = { kind: 'rolled-back' | 'missing-backup' | 'missing-progress' | 'conflict' };

function readProgressLessonId(documentId: string, data: DocumentData): string | null {
  const userId = typeof data.userId === 'string' && data.userId.length > 0 ? data.userId : null;
  if (!userId || !documentId.startsWith(`${userId}_`)) return null;
  const documentLessonId = documentId.slice(userId.length + 1);
  if (!documentLessonId) return null;

  if (data.lessonId === undefined) return documentLessonId;
  if (typeof data.lessonId !== 'string' || !data.lessonId || data.lessonId !== documentLessonId) return null;
  return data.lessonId;
}

function isDeletionPending(data: DocumentData | undefined): boolean {
  return data?._deletionPending === true;
}

function canonicalProgressFields(progress: Partial<UserProgress>) {
  return {
    status: progress.status,
    completedAt: progress.completedAt,
    furthestPageIndex: progress.furthestPageIndex,
    currentPageIndex: progress.currentPageIndex,
    exerciseProgress: progress.exerciseProgress,
    completedExerciseCount: progress.completedExerciseCount,
    requiredExerciseCount: progress.requiredExerciseCount,
    progress: progress.progress,
    progressSchemaVersion: progress.progressSchemaVersion,
    progressLessonVersion: progress.progressLessonVersion,
  };
}

function hasCanonicalV4Progress(existing: Partial<UserProgress>, canonical: Partial<UserProgress>): boolean {
  return (
    existing.progressSchemaVersion === PROGRESS_SCHEMA_VERSION &&
    JSON.stringify(canonicalProgressFields(existing)) === JSON.stringify(canonicalProgressFields(canonical))
  );
}

function migrationStats(action: 'dry-run' | 'apply') {
  return {
    action,
    migrationId: MIGRATION_ID,
    documentsScanned: 0,
    documentsWouldMigrate: 0,
    documentsMigrated: 0,
    documentsAlreadyCurrent: 0,
    documentsSkippedInvalidProgress: 0,
    documentsSkippedMissingLesson: 0,
    documentsSkippedInvalidLesson: 0,
    documentsSkippedDeletionPendingLesson: 0,
    documentsSkippedBackupConflict: 0,
    mappedExerciseRecords: 0,
    unmappedExerciseRecords: 0,
    deduplicatedExerciseRecords: 0,
    derivedCompletions: 0,
    completedLessonsPreserved: 0,
    resetIncompleteProgressToZero: 0,
  };
}

function addMigrationOutcome(
  summary: ReturnType<typeof migrationStats>,
  outcome: MigrationOutcome,
  isDryRun: boolean
) {
  if (outcome.kind === 'invalid-progress') summary.documentsSkippedInvalidProgress++;
  else if (outcome.kind === 'missing-lesson') summary.documentsSkippedMissingLesson++;
  else if (outcome.kind === 'invalid-lesson') summary.documentsSkippedInvalidLesson++;
  else if (outcome.kind === 'deletion-pending-lesson') summary.documentsSkippedDeletionPendingLesson++;
  else if (outcome.kind === 'backup-conflict') summary.documentsSkippedBackupConflict++;
  else if (outcome.kind === 'already-current') summary.documentsAlreadyCurrent++;
  else {
    if (isDryRun) summary.documentsWouldMigrate++;
    else summary.documentsMigrated++;
    summary.mappedExerciseRecords += outcome.mappedExerciseRecords;
    summary.unmappedExerciseRecords += outcome.unmappedExerciseRecords;
    summary.deduplicatedExerciseRecords += outcome.deduplicatedExerciseRecords;
    if (outcome.derivedCompletion) summary.derivedCompletions++;
    if (outcome.completedLessonPreserved) summary.completedLessonsPreserved++;
    if (outcome.resetIncompleteProgressToZero) summary.resetIncompleteProgressToZero++;
  }
}

function evaluateMigration(
  existing: DocumentData,
  lessonData: DocumentData | undefined,
  lessonDocumentId: string,
  now: string
): MigrationOutcome & { canonical?: Partial<UserProgress> } {
  if (!lessonData) return { kind: 'missing-lesson' };
  if (isDeletionPending(lessonData)) return { kind: 'deletion-pending-lesson' };
  if (typeof existing.userId !== 'string' || !existing.userId) {
    return { kind: 'invalid-progress' };
  }

  let lesson: Lesson;
  try {
    const unit = normalizeLearningUnit(lessonData, lessonDocumentId);
    if (unit.kind !== 'lesson') return { kind: 'invalid-lesson' };
    lesson = { ...unit, vocabulary_pool: unit.vocabulary_pool ?? undefined };
  } catch {
    return { kind: 'invalid-lesson' };
  }
  const result = migrateUserProgressToExerciseBasis(lesson, existing as Partial<UserProgress>, now);
  if (hasCanonicalV4Progress(existing as Partial<UserProgress>, result.progress)) {
    return { kind: 'already-current' };
  }
  return {
    kind: 'migrated',
    canonical: result.progress,
    mappedExerciseRecords: result.mappedExerciseRecords,
    unmappedExerciseRecords: result.unmappedExerciseRecords,
    deduplicatedExerciseRecords: result.deduplicatedExerciseRecords,
    derivedCompletion: result.derivedCompletion,
    completedLessonPreserved: existing.status === 'completed',
    resetIncompleteProgressToZero: result.resetIncompleteProgressToZero,
  };
}

async function readPage(collectionName: string, cursor: string | undefined, limit: number) {
  let query: Query = adminDb
    .collection(collectionName)
    .orderBy(FieldPath.documentId())
    .limit(limit + 1);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  return {
    documents: snapshot.docs.slice(0, limit),
    hasMore: snapshot.docs.length > limit,
  };
}

async function dryRunDocument(progressDocument: FirebaseFirestore.QueryDocumentSnapshot, now: string) {
  const existing = progressDocument.data();
  const lessonId = readProgressLessonId(progressDocument.id, existing);
  if (!lessonId) return { kind: 'invalid-progress' } as MigrationOutcome;
  const lessonSnapshot = await adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId).get();
  return evaluateMigration(existing, lessonSnapshot.data(), lessonSnapshot.id, now);
}

async function applyDocument(
  progressDocument: FirebaseFirestore.QueryDocumentSnapshot,
  adminId: string,
  now: string
): Promise<MigrationOutcome> {
  return adminDb.runTransaction(async transaction => {
    const progressSnapshot = await transaction.get(progressDocument.ref);
    if (!progressSnapshot.exists) return { kind: 'invalid-progress' } as const;
    const existing = progressSnapshot.data() ?? {};
    const lessonId = readProgressLessonId(progressSnapshot.id, existing);
    if (!lessonId) return { kind: 'invalid-progress' } as const;

    const lessonRef = adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId);
    const backupRef = adminDb.collection(USER_PROGRESS_V4_BACKUPS_COLLECTION).doc(progressSnapshot.id);
    const [lessonSnapshot, backupSnapshot] = await Promise.all([
      transaction.get(lessonRef),
      transaction.get(backupRef),
    ]);
    const outcome = evaluateMigration(existing, lessonSnapshot.data(), lessonSnapshot.id, now);
    if (outcome.kind !== 'migrated' || !outcome.canonical) return outcome;

    if (backupSnapshot.exists) {
      const backup = backupSnapshot.data();
      if (
        backup?.migrationId !== MIGRATION_ID ||
        backup.progressDocumentId !== progressSnapshot.id ||
        !backup.data ||
        typeof backup.data !== 'object' ||
        Array.isArray(backup.data)
      ) {
        return { kind: 'backup-conflict' } as const;
      }
    } else {
      transaction.create(backupRef, {
        migrationId: MIGRATION_ID,
        progressDocumentId: progressSnapshot.id,
        migratedAt: now,
        migratedBy: adminId,
        data: existing,
      });
    }
    transaction.set(
      progressSnapshot.ref,
      {
        ...outcome.canonical,
        progressMigrationId: MIGRATION_ID,
        progressMigratedAt: now,
        progressMigratedBy: adminId,
      },
      { merge: true }
    );
    return outcome;
  });
}

async function rollbackDocument(
  backupDocument: FirebaseFirestore.QueryDocumentSnapshot,
  adminId: string,
  now: string
): Promise<RollbackOutcome> {
  return adminDb.runTransaction(async transaction => {
    const backupRef = backupDocument.ref;
    const backupSnapshot = await transaction.get(backupRef);
    if (!backupSnapshot.exists) return { kind: 'missing-backup' } as const;
    const backup = backupSnapshot.data();
    const progressDocumentId = typeof backup?.progressDocumentId === 'string' ? backup.progressDocumentId : null;
    const original = backup?.data;
    if (
      backup?.migrationId !== MIGRATION_ID ||
      !progressDocumentId ||
      backupRef.id !== progressDocumentId ||
      !original ||
      typeof original !== 'object' ||
      Array.isArray(original)
    ) {
      return { kind: 'missing-backup' } as const;
    }

    const progressRef = adminDb.collection(USER_PROGRESS_COLLECTION).doc(progressDocumentId);
    const progressSnapshot = await transaction.get(progressRef);
    if (!progressSnapshot.exists) return { kind: 'missing-progress' } as const;
    const current = progressSnapshot.data() ?? {};
    const unchangedSinceMigration =
      current.progressMigrationId === MIGRATION_ID &&
      JSON.stringify(current.updatedAt) === JSON.stringify(original.updatedAt) &&
      JSON.stringify(current.lastAccessedAt) === JSON.stringify(original.lastAccessedAt);
    if (!unchangedSinceMigration) return { kind: 'conflict' } as const;

    transaction.set(progressRef, original);
    transaction.set(backupRef, { rolledBackAt: now, rolledBackBy: adminId }, { merge: true });
    return { kind: 'rolled-back' } as const;
  });
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdminAccess(request);
    const parsed = migrationRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid migration request' }, { status: 400 });
    }
    const input = parsed.data;
    if (input.action !== 'dry-run' && input.confirmWrite !== true) {
      return NextResponse.json({ error: 'confirmWrite: true is required for apply and rollback' }, { status: 400 });
    }

    const collectionName =
      input.action === 'rollback' ? USER_PROGRESS_V4_BACKUPS_COLLECTION : USER_PROGRESS_COLLECTION;
    const page = await readPage(collectionName, input.cursor, input.limit);
    const now = new Date().toISOString();

    if (input.action === 'rollback') {
      const summary = {
        action: input.action,
        migrationId: MIGRATION_ID,
        documentsScanned: page.documents.length,
        documentsRolledBack: 0,
        documentsSkippedMissingBackup: 0,
        documentsSkippedMissingProgress: 0,
        documentsSkippedConflict: 0,
      };
      for (const document of page.documents) {
        const outcome = await rollbackDocument(document, admin.uid, now);
        if (outcome.kind === 'rolled-back') summary.documentsRolledBack++;
        else if (outcome.kind === 'missing-backup') summary.documentsSkippedMissingBackup++;
        else if (outcome.kind === 'missing-progress') summary.documentsSkippedMissingProgress++;
        else summary.documentsSkippedConflict++;
      }
      return NextResponse.json({
        ...summary,
        hasMore: page.hasMore,
        nextCursor: page.hasMore ? page.documents.at(-1)?.id ?? null : null,
      });
    }

    const summary = migrationStats(input.action);
    summary.documentsScanned = page.documents.length;
    for (const document of page.documents) {
      const outcome =
        input.action === 'dry-run'
          ? await dryRunDocument(document, now)
          : await applyDocument(document, admin.uid, now);
      addMigrationOutcome(summary, outcome, input.action === 'dry-run');
    }
    return NextResponse.json({
      ...summary,
      hasMore: page.hasMore,
      nextCursor: page.hasMore ? page.documents.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error migrating exercise-based lesson progress:', error);
    return NextResponse.json({ error: 'Failed to migrate exercise-based lesson progress' }, { status: 500 });
  }
}
