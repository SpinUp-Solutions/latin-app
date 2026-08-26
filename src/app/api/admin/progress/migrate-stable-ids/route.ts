import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { LEARNING_UNITS_COLLECTION, USER_PROGRESS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { Lesson, UserProgress } from '@/src/types/lesson';
import { migrateUserProgress } from '@/src/utils/progressMigration';
import { STABLE_ID_PROGRESS_SCHEMA_VERSION } from '@/src/utils/lessonProgress';

const BATCH_SIZE = 200;

const migrationRequestSchema = z
  .object({
    dryRun: z.boolean().optional(),
    confirmWrite: z.boolean().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdminAccess(request);
    const parsedRequest = migrationRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsedRequest.success) {
      return NextResponse.json({ error: 'Invalid migration request' }, { status: 400 });
    }

    const body = parsedRequest.data;
    const dryRun = body.dryRun !== false;

    if (!dryRun && body.confirmWrite !== true) {
      return NextResponse.json({ error: 'confirmWrite: true is required when dryRun is false' }, { status: 400 });
    }

    const [progressSnapshot, lessonSnapshot] = await Promise.all([
      adminDb.collection(USER_PROGRESS_COLLECTION).get(),
      adminDb.collection(LEARNING_UNITS_COLLECTION).get(),
    ]);
    const lessons = new Map(
      lessonSnapshot.docs
        .filter(doc => isLessonDocumentData(doc.data()))
        .map(doc => [doc.id, { id: doc.id, ...doc.data() } as Lesson])
    );
    const now = new Date().toISOString();
    const summary = {
      dryRun,
      documentsScanned: progressSnapshot.size,
      documentsMigrated: 0,
      documentsAlreadyMigrated: 0,
      documentsSkippedMissingLesson: 0,
      mappedExerciseRecords: 0,
      unmappedExerciseRecords: 0,
      deduplicatedExerciseRecords: 0,
      derivedCompletions: 0,
      completedLessonsPreserved: 0,
      batchesCommitted: 0,
    };

    let batch = adminDb.batch();
    let pendingWrites = 0;

    for (const progressDoc of progressSnapshot.docs) {
      const existing = progressDoc.data() as Partial<UserProgress>;
      if ((existing.progressSchemaVersion ?? 1) >= STABLE_ID_PROGRESS_SCHEMA_VERSION) {
        summary.documentsAlreadyMigrated++;
        continue;
      }

      const lessonId = existing.lessonId;
      const lesson = lessonId ? lessons.get(lessonId) : undefined;
      if (!lesson) {
        summary.documentsSkippedMissingLesson++;
        continue;
      }

      const result = migrateUserProgress(lesson, existing, now);
      summary.documentsMigrated++;
      summary.mappedExerciseRecords += result.mappedExerciseRecords;
      summary.unmappedExerciseRecords += result.unmappedExerciseRecords;
      summary.deduplicatedExerciseRecords += result.deduplicatedExerciseRecords;
      if (result.derivedCompletion) summary.derivedCompletions++;
      if (existing.status === 'completed') summary.completedLessonsPreserved++;

      if (!dryRun) {
        const backupRef = adminDb.collection('userProgressMigrationV2Backups').doc(progressDoc.id);
        batch.set(backupRef, {
          progressDocumentId: progressDoc.id,
          migratedAt: now,
          migratedBy: admin.uid,
          data: existing,
        });
        batch.set(progressDoc.ref, { ...result.progress, updatedAt: now }, { merge: true });
        pendingWrites += 2;

        if (pendingWrites >= BATCH_SIZE * 2) {
          await batch.commit();
          summary.batchesCommitted++;
          batch = adminDb.batch();
          pendingWrites = 0;
        }
      }
    }

    if (!dryRun && pendingWrites > 0) {
      await batch.commit();
      summary.batchesCommitted++;
    }

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error migrating progress to stable exercise IDs:', error);
    return NextResponse.json({ error: 'Failed to migrate progress' }, { status: 500 });
  }
}
