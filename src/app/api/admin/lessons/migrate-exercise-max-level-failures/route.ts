import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

const LESSONS_COLLECTION = 'lessons';
const PREVIEW_LIMIT_DEFAULT = 25;
const BATCH_SIZE = 200;

const EXERCISE_TYPES = new Set([
  'matching',
  'fill',
  'multiple-choice',
  'odd-one-out',
  'text-selection',
  'fill-embolded-text',
  'sentence-diagramming',
  'table-fill',
  'click-on-multiple-words',
  'generated-translation',
  'generated-form-identification',
  'translation-grading',
  'listening-passage',
]);

type LessonDocument = {
  title?: string;
  pages?: Array<{
    id?: string;
    items?: Array<Record<string, unknown>>;
  }>;
};

interface MigrationRequest {
  maxLevelFailures?: number | string;
  dryRun?: boolean | string;
  confirmWrite?: boolean | string;
  overwriteExisting?: boolean | string;
  onlyWithEscalationLevels?: boolean | string;
  previewLimit?: number | string;
  lessonIds?: string[] | string;
}

interface MigrationOptions {
  dryRun: boolean;
  maxLevelFailures: number;
  overwriteExisting: boolean;
  onlyWithEscalationLevels: boolean;
  previewLimit: number;
  lessonIds: string[];
}

interface SampleChange {
  lessonId: string;
  lessonTitle: string;
  pageId: string | null;
  itemId: string | null;
  itemType: string;
  escalationLevels: number;
  previousMaxLevelFailures: number | null;
  nextMaxLevelFailures: number;
}

interface LessonError {
  lessonId: string;
  reason: string;
}

interface SnapshotInfo {
  snapshotId: string;
  path: string;
  createdAt: string;
  totalLessons: number;
}

interface MigrationSummary {
  dryRun: boolean;
  maxLevelFailures: number;
  overwriteExisting: boolean;
  onlyWithEscalationLevels: boolean;
  lessonIds: string[];
  missingLessonIds: string[];
  lessonsScanned: number;
  lessonsUpdated: number;
  exercisesScanned: number;
  exercisesMatched: number;
  exercisesUpdated: number;
  exercisesSkippedExisting: number;
  exercisesSkippedNoEscalation: number;
  exercisesSkippedMissingFeedbackConfig: number;
  exercisesAlreadySet: number;
  sampleChanges: SampleChange[];
  lessonErrors: LessonError[];
  batchesCommitted: number;
  snapshot: SnapshotInfo | null;
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

function parsePositiveInteger(value: number | string | undefined): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseLessonIds(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map(id => String(id).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
  }

  return [];
}

function serializeFirestoreValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }

  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        serializeFirestoreValue(nestedValue),
      ])
    );
  }

  return value;
}

function isExerciseItem(item: unknown): item is Record<string, unknown> & { type: string } {
  return (
    !!item &&
    typeof item === 'object' &&
    'type' in item &&
    typeof item.type === 'string' &&
    EXERCISE_TYPES.has(item.type)
  );
}

async function getLessonDocs(lessonIds: string[]) {
  if (lessonIds.length === 0) {
    const snapshot = await adminDb.collection(LESSONS_COLLECTION).get();
    return {
      docs: snapshot.docs,
      missingLessonIds: [] as string[],
    };
  }

  const docs = await Promise.all(lessonIds.map(id => adminDb.collection(LESSONS_COLLECTION).doc(id).get()));

  return {
    docs: docs.filter(doc => doc.exists),
    missingLessonIds: docs.filter(doc => !doc.exists).map(doc => doc.id),
  };
}

async function createMigrationSnapshot(params: {
  userId: string;
  options: MigrationOptions;
  docs: FirebaseFirestore.DocumentSnapshot[];
}): Promise<SnapshotInfo> {
  const createdAt = new Date().toISOString();
  const snapshotId = `migrate-exercise-max-level-failures-${createdAt.replace(/[:.]/g, '-')}`;
  const path = `lesson-snapshots/migrate-exercise-max-level-failures/${snapshotId}.json`;

  const payload = {
    snapshotId,
    createdAt,
    createdBy: params.userId,
    migration: 'migrate-exercise-max-level-failures',
    options: params.options,
    totalLessons: params.docs.length,
    lessons: params.docs
      .map(doc => {
        const serializedData = serializeFirestoreValue(doc.data()) as Record<string, unknown>;

        return {
          id: doc.id,
          ...serializedData,
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
  };

  await adminStorage
    .bucket()
    .file(path)
    .save(JSON.stringify(payload, null, 2), {
      contentType: 'application/json',
    });

  return {
    snapshotId,
    path,
    createdAt,
    totalLessons: params.docs.length,
  };
}

function migrateLesson(
  doc: FirebaseFirestore.DocumentSnapshot,
  options: MigrationOptions,
  summary: MigrationSummary
): { lessonId: string; pages: LessonDocument['pages'] } | null {
  const lesson = doc.data() as LessonDocument | undefined;

  if (!lesson || !Array.isArray(lesson.pages)) {
    summary.lessonErrors.push({
      lessonId: doc.id,
      reason: 'Missing or invalid pages array',
    });
    return null;
  }

  let lessonChanged = false;

  const updatedPages = lesson.pages.map(page => {
    if (!page || !Array.isArray(page.items)) {
      return page;
    }

    let pageChanged = false;

    const updatedItems = page.items.map(item => {
      if (!isExerciseItem(item)) {
        return item;
      }

      summary.exercisesScanned += 1;

      const feedbackConfig =
        item.feedbackConfig && typeof item.feedbackConfig === 'object'
          ? (item.feedbackConfig as Record<string, unknown>)
          : null;

      if (!feedbackConfig) {
        summary.exercisesSkippedMissingFeedbackConfig += 1;
        return item;
      }

      const escalationLevels = Array.isArray(feedbackConfig.escalationLevels) ? feedbackConfig.escalationLevels : [];

      if (options.onlyWithEscalationLevels && escalationLevels.length === 0) {
        summary.exercisesSkippedNoEscalation += 1;
        return item;
      }

      const currentValue = parsePositiveInteger(feedbackConfig.maxLevelFailures as number | string | undefined);

      if (currentValue === options.maxLevelFailures) {
        summary.exercisesAlreadySet += 1;
        return item;
      }

      if (!options.overwriteExisting && currentValue !== null) {
        summary.exercisesSkippedExisting += 1;
        return item;
      }

      summary.exercisesMatched += 1;
      summary.exercisesUpdated += 1;
      pageChanged = true;
      lessonChanged = true;

      if (summary.sampleChanges.length < options.previewLimit) {
        summary.sampleChanges.push({
          lessonId: doc.id,
          lessonTitle: typeof lesson.title === 'string' ? lesson.title : '',
          pageId: typeof page.id === 'string' ? page.id : null,
          itemId: typeof item.id === 'string' ? item.id : null,
          itemType: item.type,
          escalationLevels: escalationLevels.length,
          previousMaxLevelFailures: currentValue,
          nextMaxLevelFailures: options.maxLevelFailures,
        });
      }

      return {
        ...item,
        feedbackConfig: {
          ...feedbackConfig,
          maxLevelFailures: options.maxLevelFailures,
        },
      };
    });

    return pageChanged ? { ...page, items: updatedItems } : page;
  });

  if (!lessonChanged) {
    return null;
  }

  return {
    lessonId: doc.id,
    pages: updatedPages,
  };
}

async function commitLessonUpdates(
  updates: Array<{ lessonId: string; pages: LessonDocument['pages'] }>,
  userId: string
) {
  let batchesCommitted = 0;

  for (let index = 0; index < updates.length; index += BATCH_SIZE) {
    const chunk = updates.slice(index, index + BATCH_SIZE);
    const batch = adminDb.batch();

    for (const update of chunk) {
      const docRef = adminDb.collection(LESSONS_COLLECTION).doc(update.lessonId);
      batch.update(docRef, {
        pages: update.pages,
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
        version: FieldValue.increment(1),
      });
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

    const body = (await request.json()) as MigrationRequest;
    const maxLevelFailures = parsePositiveInteger(body.maxLevelFailures);

    if (maxLevelFailures === null) {
      return NextResponse.json(
        { success: false, error: 'Wrong answers before reset must be a positive integer' },
        { status: 400 }
      );
    }

    const dryRun = parseBoolean(body.dryRun, true);
    const confirmWrite = parseBoolean(body.confirmWrite, false);

    if (!dryRun && !confirmWrite) {
      return NextResponse.json(
        { success: false, error: 'confirmWrite=true is required when dryRun=false' },
        { status: 400 }
      );
    }

    const options: MigrationOptions = {
      dryRun,
      maxLevelFailures,
      overwriteExisting: parseBoolean(body.overwriteExisting, false),
      onlyWithEscalationLevels: parseBoolean(body.onlyWithEscalationLevels, false),
      previewLimit: parsePositiveInteger(body.previewLimit) ?? PREVIEW_LIMIT_DEFAULT,
      lessonIds: parseLessonIds(body.lessonIds),
    };

    const { docs, missingLessonIds } = await getLessonDocs(options.lessonIds);

    const summary: MigrationSummary = {
      dryRun: options.dryRun,
      maxLevelFailures: options.maxLevelFailures,
      overwriteExisting: options.overwriteExisting,
      onlyWithEscalationLevels: options.onlyWithEscalationLevels,
      lessonIds: options.lessonIds,
      missingLessonIds,
      lessonsScanned: docs.length,
      lessonsUpdated: 0,
      exercisesScanned: 0,
      exercisesMatched: 0,
      exercisesUpdated: 0,
      exercisesSkippedExisting: 0,
      exercisesSkippedNoEscalation: 0,
      exercisesSkippedMissingFeedbackConfig: 0,
      exercisesAlreadySet: 0,
      sampleChanges: [],
      lessonErrors: [],
      batchesCommitted: 0,
      snapshot: null,
    };

    const updates: Array<{ lessonId: string; pages: LessonDocument['pages'] }> = [];

    for (const doc of docs) {
      const update = migrateLesson(doc, options, summary);
      if (!update) {
        continue;
      }

      summary.lessonsUpdated += 1;
      updates.push(update);
    }

    if (!options.dryRun && updates.length > 0) {
      const updatedLessonIds = new Set(updates.map(update => update.lessonId));
      const snapshotDocs = docs.filter(doc => updatedLessonIds.has(doc.id));

      summary.snapshot = await createMigrationSnapshot({
        userId: user.uid,
        options,
        docs: snapshotDocs,
      });

      summary.batchesCommitted = await commitLessonUpdates(updates, user.uid);
    }

    return NextResponse.json({
      success: true,
      message: options.dryRun
        ? `Dry run complete. ${summary.exercisesUpdated} exercises would be updated across ${summary.lessonsUpdated} lessons.`
        : `Migration complete. Updated ${summary.exercisesUpdated} exercises across ${summary.lessonsUpdated} lessons.`,
      data: summary,
    });
  } catch (error) {
    console.error('Error migrating exercise maxLevelFailures:', error);

    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ success: false, error: error.message }, { status: 401 });
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
