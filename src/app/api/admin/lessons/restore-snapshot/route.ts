import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { PracticeCategoryError, practiceCategoryService } from '@/src/lib/practice-categories/service';
import {
  assertLegacyNormalPlacementChangeAllowedInTransaction,
  assertPlacedLessonReplacementAllowedInTransaction,
} from '@/src/lib/learning-units/learning-path-service';
import type { Lesson } from '@/src/types/lesson';
import { LearningPathServiceError } from '@/src/lib/learning-units/learning-path-errors';

const SNAPSHOT_PREFIX = 'lesson-snapshots/';
const BATCH_SIZE = 200;
const RESTORE_CONCURRENCY = 10;

interface RestoreSnapshotRequest {
  snapshotPath?: string;
  confirmRestore?: boolean | string;
}

interface SnapshotLesson {
  id: string;
  [key: string]: unknown;
}

interface SnapshotPayload {
  snapshotId?: string;
  createdAt?: string;
  lessons?: SnapshotLesson[];
}

class SnapshotRestoreError extends Error {
  constructor(
    public readonly failures: Array<{ lessonId: string; cause: unknown }>,
    public readonly restoredLessons: number,
    public readonly batchesCommitted: number
  ) {
    const firstFailure = failures[0];
    super(
      `Snapshot restore stopped after ${failures.length} lesson ${failures.length === 1 ? 'failure' : 'failures'}; first failure was ${firstFailure.lessonId}: ${
        firstFailure.cause instanceof Error ? firstFailure.cause.message : 'Unknown restore error'
      }`
    );
    this.name = 'SnapshotRestoreError';
  }
}

function parseBoolean(value: boolean | string | undefined, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function isSnapshotLesson(value: unknown): value is SnapshotLesson {
  return (
    !!value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && isLessonDocumentData(value)
  );
}

async function restoreSnapshotLesson(lesson: SnapshotLesson, actorId: string) {
  const {
    id,
    practiceCategorySelections: _practiceCategorySelections,
    practiceCategoryIds: _practiceCategoryIds,
    practiceCategories: _practiceCategories,
    practiceCategoryPlacements: _practiceCategoryPlacements,
    ...lessonData
  } = lesson;
  lessonData.kind = 'lesson';
  const lessonRef = adminDb.collection('lessons').doc(id);

  await adminDb.runTransaction(async transaction => {
    const existingLesson = await transaction.get(lessonRef);
    if (existingLesson.exists && !isLessonDocumentData(existingLesson.data())) {
      throw new Error(`Learning unit ${id} is not a lesson`);
    }
    await assertLegacyNormalPlacementChangeAllowedInTransaction(
      transaction,
      adminDb,
      existingLesson.exists ? existingLesson.data() : undefined,
      lessonData
    );
    await assertPlacedLessonReplacementAllowedInTransaction(transaction, adminDb, id, {
      type: (lessonData.type ?? 'normal') as Lesson['type'],
      pages: Array.isArray(lessonData.pages) ? (lessonData.pages as Lesson['pages']) : [],
    });
    await practiceCategoryService.reconcileLessonCategoriesInTransaction(transaction, {
      lessonId: id,
      lesson: lessonData,
      actorId,
    });
    transaction.set(lessonRef, lessonData);
  });
}

async function restoreLessonsFromSnapshot(lessons: SnapshotLesson[], actorId: string) {
  let batchesCommitted = 0;
  let restoredLessons = 0;

  for (let index = 0; index < lessons.length; index += BATCH_SIZE) {
    const chunk = lessons.slice(index, index + BATCH_SIZE);
    for (let groupIndex = 0; groupIndex < chunk.length; groupIndex += RESTORE_CONCURRENCY) {
      const group = chunk.slice(groupIndex, groupIndex + RESTORE_CONCURRENCY);
      const results = await Promise.allSettled(group.map(lesson => restoreSnapshotLesson(lesson, actorId)));
      const failures: Array<{ lessonId: string; cause: unknown }> = [];
      results.forEach((result, resultIndex) => {
        if (result.status === 'fulfilled') restoredLessons += 1;
        else failures.push({ lessonId: group[resultIndex].id, cause: result.reason });
      });
      if (failures.length > 0) {
        throw new SnapshotRestoreError(failures, restoredLessons, batchesCommitted);
      }
    }
    batchesCommitted += 1;
  }

  return { batchesCommitted, restoredLessons };
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as RestoreSnapshotRequest;
    const snapshotPath = typeof body.snapshotPath === 'string' ? body.snapshotPath.trim() : '';
    const confirmRestore = parseBoolean(body.confirmRestore, false);

    if (!snapshotPath) {
      return NextResponse.json({ success: false, error: 'snapshotPath is required' }, { status: 400 });
    }

    if (!snapshotPath.startsWith(SNAPSHOT_PREFIX)) {
      return NextResponse.json({ success: false, error: 'Invalid snapshotPath' }, { status: 400 });
    }

    if (!confirmRestore) {
      return NextResponse.json({ success: false, error: 'confirmRestore=true is required' }, { status: 400 });
    }

    const [contents] = await adminStorage.bucket().file(snapshotPath).download();
    const payload = JSON.parse(contents.toString('utf8')) as SnapshotPayload;
    const lessons = Array.isArray(payload.lessons) ? payload.lessons.filter(isSnapshotLesson) : [];

    if (lessons.length === 0) {
      return NextResponse.json({ success: false, error: 'Snapshot contains no lessons to restore' }, { status: 400 });
    }

    const restoreResult = await restoreLessonsFromSnapshot(lessons, user.uid);

    return NextResponse.json({
      success: true,
      message: `Restored ${lessons.length} lessons from snapshot.`,
      data: {
        snapshotId: payload.snapshotId ?? null,
        snapshotPath,
        snapshotCreatedAt: payload.createdAt ?? null,
        restoredLessons: restoreResult.restoredLessons,
        batchesCommitted: restoreResult.batchesCommitted,
        restoredBy: user.uid,
      },
    });
  } catch (error) {
    console.error('Error restoring lessons snapshot:', error);

    if (error instanceof SnapshotRestoreError) {
      const cause = error.failures[0].cause;
      const domainCause =
        cause instanceof PracticeCategoryError || cause instanceof LearningPathServiceError ? cause : null;
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          ...(domainCause ? { code: domainCause.code } : {}),
          data: {
            partialRestore: error.restoredLessons > 0,
            restoredLessons: error.restoredLessons,
            batchesCommitted: error.batchesCommitted,
            failedLessonIds: error.failures.map(failure => failure.lessonId),
          },
        },
        { status: domainCause ? domainCause.status : 500 }
      );
    }

    if (error instanceof PracticeCategoryError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof LearningPathServiceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
