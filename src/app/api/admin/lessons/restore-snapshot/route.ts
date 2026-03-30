import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

const SNAPSHOT_PREFIX = 'lesson-snapshots/';
const BATCH_SIZE = 200;

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
  return !!value && typeof value === 'object' && 'id' in value && typeof value.id === 'string';
}

async function restoreLessonsFromSnapshot(lessons: SnapshotLesson[]) {
  let batchesCommitted = 0;

  for (let index = 0; index < lessons.length; index += BATCH_SIZE) {
    const chunk = lessons.slice(index, index + BATCH_SIZE);
    const batch = adminDb.batch();

    for (const lesson of chunk) {
      const { id, ...lessonData } = lesson;
      batch.set(adminDb.collection('lessons').doc(id), lessonData);
    }

    await batch.commit();
    batchesCommitted += 1;
  }

  return batchesCommitted;
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

    const batchesCommitted = await restoreLessonsFromSnapshot(lessons);

    return NextResponse.json({
      success: true,
      message: `Restored ${lessons.length} lessons from snapshot.`,
      data: {
        snapshotId: payload.snapshotId ?? null,
        snapshotPath,
        snapshotCreatedAt: payload.createdAt ?? null,
        restoredLessons: lessons.length,
        batchesCommitted,
        restoredBy: user.uid,
      },
    });
  } catch (error) {
    console.error('Error restoring lessons snapshot:', error);

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
