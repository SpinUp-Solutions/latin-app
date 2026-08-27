import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import {
  LEARNING_UNITS_COLLECTION,
  LEARNING_PATHS_COLLECTION,
  DEFAULT_LEARNING_PATH_ID,
  TEST_ATTEMPTS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
  USER_PROGRESS_COLLECTION,
} from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import type {
  Lesson,
  LessonSummary,
  LessonWithProgress,
  StudentDashboard,
  StudentLearningUnitSummary,
  StudentLessonSummary,
  StudentTestSummary,
  UserProgress,
} from '@/src/types/lesson';
import type { LearningUnit, LessonUnitType } from '@/src/types/learning-unit';
import type { TestAttemptOriginSummary, TestUnitSummary, TestVersionSummary } from '@/src/types/test';
import {
  calculateStoredProgress,
  getFurthestPageIndex,
  isStoredLessonComplete,
  summarizeLessonCompletion,
} from '@/src/utils/lessonProgress';
import { toLessonSummary } from '@/src/utils/lessonSummary';
import type { PracticeCategoryService } from '@/src/lib/practice-categories/service';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';
import { testAttemptService, type TestAttemptService } from '@/src/lib/tests/attempt-service';
import { mockTestService, type MockTestService } from '@/src/lib/tests/mock-service';
import { TEST_VERSION_SUMMARY_FIELDS, toTestUnitSummary } from '@/src/lib/tests/domain';
import { testVersionSummaryDocumentSchema } from '@/src/lib/tests/schemas';
import { isLessonDocumentData, normalizeLearningUnit } from './domain';
import { parseLearningPathSnapshot } from './learning-path-service';
import {
  collectAttemptedNormalTestIds,
  isProgressionUnitComplete,
  isProgressionUnitUnlocked,
  type ProgressionActivity,
  type ProgressionUnit,
} from './progression';

const LESSON_SUMMARY_FIELDS = [
  'kind',
  'title',
  'description',
  'type',
  'vocabulary_pool',
  'showWordSearch',
  'isLive',
  'liveOrder',
  'publishedAt',
  'publishedBy',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'version',
  'totalPages',
  'totalItems',
  'totalExercises',
] as const;

const LEARNING_UNIT_SUMMARY_FIELDS = [...LESSON_SUMMARY_FIELDS, 'rotationVersions', 'passingPercentage'] as const;

/**
 * The dashboard projection never consumes per-exercise history, so the
 * progress read excludes the unbounded `exerciseProgress` arrays that grow
 * with student activity. `getLesson` still reads full progress documents.
 */
const PROGRESS_SUMMARY_FIELDS = [
  'userId',
  'lessonId',
  'status',
  'completedAt',
  'furthestPageIndex',
  'currentPageIndex',
  'score',
  'lastAccessedAt',
  'progressSchemaVersion',
] as const;

const PRACTICE_TYPE_ORDER: LessonUnitType[] = ['vocab', 'sentence-diagramming', 'listening'];

type CanonicalLessonSummary = LessonSummary & { kind: 'lesson' };
type LearningPathUnitSummary = CanonicalLessonSummary | TestUnitSummary;
type ProjectedLearningPathUnit = CanonicalLessonSummary | Extract<LearningUnit, { kind: 'test' }> | TestUnitSummary;

const toProgressionUnit = (unit: LearningPathUnitSummary): ProgressionUnit =>
  unit.kind === 'lesson' ? { id: unit.id, kind: 'lesson', totalPages: unit.totalPages } : { id: unit.id, kind: 'test' };

export type StudentDashboardServiceErrorCode = 'LESSON_NOT_FOUND' | 'LESSON_LOCKED' | 'STALE_LESSON_DATA';

export class StudentDashboardServiceError extends Error {
  constructor(
    public readonly code: StudentDashboardServiceErrorCode,
    message: string,
    public readonly status: 403 | 404 | 409
  ) {
    super(message);
    this.name = 'StudentDashboardServiceError';
  }
}

function progressLessonId(snapshot: DocumentSnapshot): string | undefined {
  const data = snapshot.data() ?? {};
  if (typeof data.lessonId === 'string' && data.lessonId.length > 0) return data.lessonId;
  const separatorIndex = snapshot.id.indexOf('_');
  return separatorIndex >= 0 ? snapshot.id.slice(separatorIndex + 1) || undefined : undefined;
}

function lessonSummaryFromSnapshot(snapshot: DocumentSnapshot): CanonicalLessonSummary | null {
  const data = snapshot.data();
  if (!isLessonDocumentData(data)) return null;
  return toLessonSummary(snapshot.id, data as Partial<Lesson>) as CanonicalLessonSummary;
}

function testUnitFromSnapshot(snapshot: DocumentSnapshot): Extract<LearningUnit, { kind: 'test' }> | null {
  if (!snapshot.exists) return null;
  try {
    const unit = normalizeLearningUnit(snapshot.data(), snapshot.id);
    return unit.kind === 'test' ? unit : null;
  } catch (error) {
    console.error(`Learning Path references invalid test unit ${snapshot.id}`, error);
    return null;
  }
}

function unavailableTestSummaryFromSnapshot(snapshot: DocumentSnapshot): TestUnitSummary {
  const data = snapshot.data() ?? {};
  const passingPercentage =
    data.passingPercentage === null ||
    (Number.isInteger(data.passingPercentage) && data.passingPercentage >= 1 && data.passingPercentage <= 100)
      ? data.passingPercentage
      : null;
  return {
    id: snapshot.id,
    kind: 'test',
    title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Unavailable test',
    description: typeof data.description === 'string' ? data.description : '',
    passingPercentage,
    rotationVersionCount: Array.isArray(data.rotationVersions) ? data.rotationVersions.length : 0,
    minTotalPoints: 0,
    maxTotalPoints: 0,
    configurationStatus: 'unavailable',
  };
}

function hasPersistedSummaryCounts(data: DocumentSnapshot['data'] extends () => infer Data ? Data : never) {
  return (
    data !== undefined &&
    Number.isSafeInteger(data.totalPages) &&
    data.totalPages >= 0 &&
    Number.isSafeInteger(data.totalItems) &&
    data.totalItems >= 0 &&
    Number.isSafeInteger(data.totalExercises) &&
    data.totalExercises >= 0
  );
}

function fullLessonFromSnapshot(snapshot: DocumentSnapshot): Lesson {
  const data = snapshot.data();
  if (!snapshot.exists || !isLessonDocumentData(data)) {
    throw new StudentDashboardServiceError('LESSON_NOT_FOUND', 'Lesson not found', 404);
  }

  if (
    !data ||
    typeof data.title !== 'string' ||
    !Array.isArray(data.pages) ||
    typeof (data.type ?? 'normal') !== 'string'
  ) {
    throw new StudentDashboardServiceError(
      'STALE_LESSON_DATA',
      `Lesson ${snapshot.id} contains invalid persisted data`,
      409
    );
  }

  return {
    id: snapshot.id,
    kind: 'lesson',
    title: data.title,
    description: typeof data.description === 'string' ? data.description : '',
    type: (data.type ?? 'normal') as Lesson['type'],
    vocabulary_pool: typeof data.vocabulary_pool === 'string' ? data.vocabulary_pool : undefined,
    showWordSearch: data.showWordSearch !== false,
    pages: data.pages,
    isLive: data.isLive === true,
    liveOrder: typeof data.liveOrder === 'number' ? data.liveOrder : null,
    publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : null,
    publishedBy: typeof data.publishedBy === 'string' ? data.publishedBy : null,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
    version: typeof data.version === 'number' ? data.version : undefined,
  };
}

export class StudentDashboardService {
  constructor(
    private readonly db: Firestore = adminDb,
    private readonly categories: Pick<PracticeCategoryService, 'getAssignmentsForLessonIds'> = practiceCategoryService,
    private readonly attempts: Pick<TestAttemptService, 'getAttemptSummary'> = testAttemptService,
    private readonly mocks: Pick<
      MockTestService,
      'listStudentLiveMocks' | 'getRelatedLiveMocks' | 'listPastStudentMockResults'
    > = mockTestService
  ) {}

  private get units() {
    return this.db.collection(LEARNING_UNITS_COLLECTION);
  }

  private get progress() {
    return this.db.collection(USER_PROGRESS_COLLECTION);
  }

  private get versions() {
    return this.db.collection(TEST_VERSIONS_COLLECTION);
  }

  private async getAttemptSummary(origin: { kind: 'normal-test'; testId: string }, userId: string) {
    return this.attempts.getAttemptSummary(origin, userId);
  }

  private async getLiveLessonSummaries(): Promise<LessonSummary[]> {
    const snapshot = await this.units
      .where('isLive', '==', true)
      .orderBy('liveOrder', 'asc')
      .select(...LESSON_SUMMARY_FIELDS)
      .get();

    const summaries = await Promise.all(
      snapshot.docs.map(async document => {
        const data = document.data();
        if (!isLessonDocumentData(data)) return null;

        if (hasPersistedSummaryCounts(data)) {
          return lessonSummaryFromSnapshot(document);
        }

        // Compatibility for legacy documents that predate the summary backfill.
        // Only these exceptional documents load pages; the normal dashboard query
        // remains summary-only and never downloads page bodies.
        const fullDocument = await document.ref.get();
        return lessonSummaryFromSnapshot(fullDocument);
      })
    );

    return summaries.filter((lesson): lesson is CanonicalLessonSummary => lesson !== null);
  }

  /**
   * Missing and invalid aggregate references are isolated and logged so one
   * dangling ID cannot take down the student dashboard or alter the relative
   * order of the remaining valid units.
   */
  async getPlacedUnitSummaries(unitIds: string[]): Promise<LearningPathUnitSummary[]> {
    if (unitIds.length === 0) return [];
    const snapshots = await this.db.getAll(...unitIds.map(unitId => this.units.doc(unitId)), {
      fieldMask: [...LEARNING_UNIT_SUMMARY_FIELDS],
    });
    const projectedUnits: ProjectedLearningPathUnit[] = [];

    for (const snapshot of snapshots) {
      if (!snapshot.exists) {
        console.error(`Learning Path references missing unit ${snapshot.id}; skipping it`);
        continue;
      }

      if (snapshot.data()?.kind === 'test') {
        const test = testUnitFromSnapshot(snapshot);
        if (!test) {
          console.error(`Learning Path references invalid test ${snapshot.id}; marking it unavailable`);
          projectedUnits.push(unavailableTestSummaryFromSnapshot(snapshot));
          continue;
        }
        projectedUnits.push(test);
        continue;
      }

      const summary = lessonSummaryFromSnapshot(snapshot);
      if (!summary || summary.type !== 'normal') {
        console.error(`Learning Path references ineligible unit ${snapshot.id}; skipping it`);
        continue;
      }
      if (hasPersistedSummaryCounts(snapshot.data())) {
        projectedUnits.push(summary);
        continue;
      }

      const fullDocument = await snapshot.ref.get();
      const fallback = lessonSummaryFromSnapshot(fullDocument);
      if (!fallback || fallback.type !== 'normal') {
        console.error(`Learning Path references invalid unit ${snapshot.id}; skipping it`);
        continue;
      }
      projectedUnits.push(fallback);
    }

    const versionIds = [
      ...new Set(
        projectedUnits.flatMap(unit =>
          unit.kind === 'test' && 'rotationVersions' in unit
            ? unit.rotationVersions.map(reference => reference.versionId)
            : []
        )
      ),
    ];
    const versionsById = new Map<string, TestVersionSummary>();
    if (versionIds.length > 0) {
      const versionSnapshots = await this.db.getAll(...versionIds.map(versionId => this.versions.doc(versionId)), {
        fieldMask: [...TEST_VERSION_SUMMARY_FIELDS],
      });
      for (const snapshot of versionSnapshots) {
        const parsed = testVersionSummaryDocumentSchema.safeParse({
          ...snapshot.data(),
          id: snapshot.id,
        });
        if (parsed.success) {
          versionsById.set(snapshot.id, parsed.data);
        } else {
          console.error(
            `Learning Path test references invalid version ${snapshot.id}; its test will be unavailable`,
            parsed.error.flatten()
          );
        }
      }
    }

    const summaries: LearningPathUnitSummary[] = [];
    for (const unit of projectedUnits) {
      if (unit.kind !== 'test') {
        summaries.push(unit);
        continue;
      }
      if (!('rotationVersions' in unit)) {
        summaries.push(unit);
        continue;
      }
      const versions = unit.rotationVersions
        .map(reference => versionsById.get(reference.versionId))
        .filter((version): version is TestVersionSummary => Boolean(version));
      if (versions.length !== unit.rotationVersions.length || versions.length === 0) {
        console.error(`Learning Path test ${unit.id} has an invalid rotation configuration; marking it unavailable`);
        summaries.push({
          ...toTestUnitSummary(unit, versions),
          configurationStatus: 'unavailable',
        });
        continue;
      }
      summaries.push({
        ...toTestUnitSummary(unit, versions),
        configurationStatus: 'ready',
      });
    }
    return summaries;
  }

  private async getProgressByLessonId(userId: string, fields?: readonly string[]): Promise<Map<string, UserProgress>> {
    const query = fields
      ? this.progress.where('userId', '==', userId).select(...fields)
      : this.progress.where('userId', '==', userId);
    const snapshot = await query.get();
    const progressByLessonId = new Map<string, UserProgress>();

    for (const document of snapshot.docs) {
      const lessonId = progressLessonId(document);
      if (lessonId) progressByLessonId.set(lessonId, document.data() as UserProgress);
    }

    return progressByLessonId;
  }

  private withProgress(
    lesson: LessonSummary,
    progressByLessonId: Map<string, UserProgress>,
    status: StudentLessonSummary['status'],
    lockedReason?: string
  ): StudentLessonSummary {
    const storedProgress = progressByLessonId.get(lesson.id);
    const furthestPageIndex = getFurthestPageIndex(storedProgress, lesson.totalPages);
    const progress =
      status === 'locked'
        ? 0
        : calculateStoredProgress(storedProgress, lesson.totalPages);

    return {
      ...lesson,
      kind: 'lesson',
      progress,
      status,
      ...(lockedReason ? { lockedReason } : {}),
      furthestPageIndex,
      currentPageIndex: Math.max(furthestPageIndex, 0),
      completedAt: storedProgress?.completedAt,
      score: storedProgress?.score,
      lastAccessedAt: storedProgress?.lastAccessedAt,
      progressSchemaVersion: storedProgress?.progressSchemaVersion,
    };
  }

  private unlockedStatus(
    lesson: LessonSummary,
    progressByLessonId: Map<string, UserProgress>
  ): StudentLessonSummary['status'] {
    const storedProgress = progressByLessonId.get(lesson.id);
    if (!storedProgress) return 'available';
    return isStoredLessonComplete(storedProgress, lesson.totalPages) ? 'completed' : 'in-progress';
  }

  private lockedReason(previous: LearningPathUnitSummary): string {
    if (previous.kind === 'test') {
      return previous.passingPercentage === null
        ? `Submit ${previous.title} to unlock`
        : `Pass ${previous.title} to unlock`;
    }
    return `Complete ${previous.title} to unlock`;
  }

  private withTestProgress(
    test: TestUnitSummary,
    progressByUnitId: Map<string, UserProgress>,
    attemptSummary: TestAttemptOriginSummary,
    status: StudentTestSummary['status'],
    lockedReason?: string
  ): StudentTestSummary {
    return {
      ...test,
      status,
      ...(lockedReason ? { lockedReason } : {}),
      completedAt: progressByUnitId.get(test.id)?.completedAt,
      attemptSummary,
    };
  }

  private processNormalUnits(
    units: LearningPathUnitSummary[],
    progressByUnitId: Map<string, UserProgress>,
    attemptSummaries: Map<string, TestAttemptOriginSummary>
  ): StudentLearningUnitSummary[] {
    const progressionUnits = units.map(toProgressionUnit);
    const activity: ProgressionActivity = {
      progressByUnitId,
      attemptedTestIds: new Set(
        units.flatMap(unit => {
          if (unit.kind !== 'test') return [];
          const summary = attemptSummaries.get(unit.id);
          return summary && (summary.inProgressAttemptId || summary.attemptCount > 0) ? [unit.id] : [];
        })
      ),
    };

    return units.map((unit, index) => {
      const isUnlocked = isProgressionUnitUnlocked(progressionUnits, index, activity);
      const reason = isUnlocked ? undefined : this.lockedReason(units[index - 1]);

      if (unit.kind === 'lesson') {
        const status = isUnlocked ? this.unlockedStatus(unit, progressByUnitId) : 'locked';
        return this.withProgress(unit, progressByUnitId, status, reason);
      }

      const attemptSummary = attemptSummaries.get(unit.id) ?? {
        origin: { kind: 'normal-test', testId: unit.id },
        inProgressAttemptId: null,
        attemptCount: 0,
        best: null,
        latest: null,
      };
      const status = !isUnlocked
        ? 'locked'
        : isProgressionUnitComplete(progressionUnits[index], activity)
          ? 'completed'
          : attemptSummary.inProgressAttemptId
            ? 'in-progress'
            : 'available';
      return this.withTestProgress(unit, progressByUnitId, attemptSummary, status, reason);
    });
  }

  private processPracticeLessons(
    lessons: LessonSummary[],
    progressByLessonId: Map<string, UserProgress>
  ): StudentLessonSummary[] {
    return lessons.map(lesson =>
      this.withProgress(lesson, progressByLessonId, this.unlockedStatus(lesson, progressByLessonId))
    );
  }

  private async enrichPracticeLessons(lessons: LessonSummary[]): Promise<LessonSummary[]> {
    if (lessons.length === 0) return lessons;

    try {
      const assignments = await this.categories.getAssignmentsForLessonIds(lessons.map(lesson => lesson.id));
      return lessons.map(lesson => {
        const assignment = assignments.get(lesson.id);
        if (!assignment) return lesson;

        const practiceCategories = assignment.practiceCategories
          .filter(category => category.status === 'active')
          .map(({ id, lessonType, name, description, status, categoryOrder, tags }) => ({
            id,
            lessonType,
            name,
            description,
            status,
            categoryOrder,
            tags: tags
              .filter(tag => tag.status === 'active')
              .sort((a, b) => a.tagOrder - b.tagOrder || a.id.localeCompare(b.id))
              .map(({ id: tagId, name: tagName, status: tagStatus, tagOrder }) => ({
                id: tagId,
                name: tagName,
                status: tagStatus,
                tagOrder,
              })),
          }));
        const activeCategoryIds = new Set(practiceCategories.map(category => category.id));
        const activeTagIdsByCategory = new Map(
          practiceCategories.map(category => [category.id, new Set(category.tags.map(tag => tag.id))])
        );

        return {
          ...lesson,
          practiceCategories,
          practiceCategoryPlacements: assignment.memberships
            .filter(membership => activeCategoryIds.has(membership.categoryId))
            .map(membership => ({
              categoryId: membership.categoryId,
              lessonOrder: membership.lessonOrder,
              tagIds: membership.tagIds.filter(tagId => activeTagIdsByCategory.get(membership.categoryId)?.has(tagId)),
            })),
        };
      });
    } catch (error) {
      console.error('Unable to enrich student practice lessons with categories:', error);
      return lessons;
    }
  }

  private async getProjectedLessonSummaries(): Promise<{
    normalUnits: LearningPathUnitSummary[];
    rawPracticeLessons: LessonSummary[];
  }> {
    const [allLessons, pathSnapshot] = await Promise.all([
      this.getLiveLessonSummaries(),
      this.db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID).get(),
    ]);

    const path = parseLearningPathSnapshot(pathSnapshot);
    const normalUnits: LearningPathUnitSummary[] = path ? await this.getPlacedUnitSummaries(path.unitIds) : [];
    const rawPracticeLessons = PRACTICE_TYPE_ORDER.flatMap(type => allLessons.filter(lesson => lesson.type === type));

    return { normalUnits, rawPracticeLessons };
  }

  private async getNormalUnitSummaries(): Promise<LearningPathUnitSummary[]> {
    const pathSnapshot = await this.db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID).get();
    const path = parseLearningPathSnapshot(pathSnapshot);
    return path ? this.getPlacedUnitSummaries(path.unitIds) : [];
  }

  async getNormalSequenceUnitIds(): Promise<string[]> {
    return (await this.getNormalUnitSummaries()).map(unit => unit.id);
  }

  async getDashboard(userId: string): Promise<StudentDashboard> {
    const [{ normalUnits, rawPracticeLessons }, progressByLessonId] = await Promise.all([
      this.getProjectedLessonSummaries(),
      this.getProgressByLessonId(userId, PROGRESS_SUMMARY_FIELDS),
    ]);
    const testUnits = normalUnits.filter((unit): unit is TestUnitSummary => unit.kind === 'test');

    // Attempt summaries, practice enrichment, and mock listing are independent
    // of each other, so they all run concurrently instead of one-after-another.
    // The past-result projection runs unfiltered here and is reconciled against
    // the live cards below, which keeps it off the mock listing's critical path.
    const [attemptSummaries, practiceLessons, mockTests, pastMockResults] = await Promise.all([
      this.getAttemptSummaries(testUnits, userId),
      this.enrichPracticeLessons(rawPracticeLessons),
      this.mocks.listStudentLiveMocks(userId),
      this.mocks.listPastStudentMockResults(userId),
    ]);

    const liveMockTests = mockTests ?? [];
    const liveMockIds = new Set(liveMockTests.map(mock => mock.id));
    const reviewablePastMockResults = pastMockResults.filter(result => !liveMockIds.has(result.id));

    const learningPath = this.processNormalUnits(normalUnits, progressByLessonId, attemptSummaries);
    await Promise.all(
      learningPath.map(async unit => {
        // The frozen attempt outcome, rather than the test's current settings,
        // is the only remediation signal.  Settings can change after submit.
        if (unit.kind === 'test' && unit.attemptSummary.latest?.outcome === 'not-passed') {
          unit.relatedLiveMocks = await this.mocks.getRelatedLiveMocks(unit.id);
        }
      })
    );
    return {
      learningPath,
      practiceLessons: this.processPracticeLessons(practiceLessons, progressByLessonId),
      ...(liveMockTests.length ? { mockTests: liveMockTests } : {}),
      ...(reviewablePastMockResults.length ? { pastMockResults: reviewablePastMockResults } : {}),
    };
  }

  private async getAttemptSummaries(
    testUnits: TestUnitSummary[],
    userId: string
  ): Promise<Map<string, TestAttemptOriginSummary>> {
    const attemptSummaries = new Map<string, TestAttemptOriginSummary>();
    await Promise.all(
      testUnits.map(async test => {
        const origin = { kind: 'normal-test' as const, testId: test.id };
        attemptSummaries.set(test.id, await this.getAttemptSummary(origin, userId));
      })
    );
    return attemptSummaries;
  }

  /**
   * Loads one lesson with only the data required to authorize it: the lesson
   * document, the student's progress, and — for normal lessons — the normal
   * sequence plus attempt activity when the sticky frontier needs it. The full
   * dashboard (practice libraries, mocks, attempt summaries) is never loaded.
   */
  async getLesson(userId: string, lessonId: string): Promise<LessonWithProgress> {
    const [lessonSnapshot, progressByLessonId] = await Promise.all([
      this.units.doc(lessonId).get(),
      this.getProgressByLessonId(userId),
    ]);
    const data = lessonSnapshot.data();
    if (!lessonSnapshot.exists || !isLessonDocumentData(data)) {
      throw new StudentDashboardServiceError('LESSON_NOT_FOUND', 'Lesson not found', 404);
    }

    if ((data.type ?? 'normal') !== 'normal') {
      if (data.isLive !== true) {
        throw new StudentDashboardServiceError('LESSON_NOT_FOUND', 'Lesson not found', 404);
      }
      const lesson = fullLessonFromSnapshot(lessonSnapshot);
      const [enriched] = await this.enrichPracticeLessons([toLessonSummary(lesson.id, lesson)]);
      return this.toLessonDetail(lesson, progressByLessonId.get(lessonId), enriched);
    }

    await this.assertNormalLessonUnlocked(userId, lessonId, progressByLessonId);
    return this.toLessonDetail(fullLessonFromSnapshot(lessonSnapshot), progressByLessonId.get(lessonId));
  }

  private async assertNormalLessonUnlocked(
    userId: string,
    lessonId: string,
    progressByLessonId: Map<string, UserProgress>
  ): Promise<void> {
    const units = (await this.getNormalUnitSummaries()).map(toProgressionUnit);
    const targetIndex = units.findIndex(unit => unit.id === lessonId);
    if (targetIndex < 0) {
      throw new StudentDashboardServiceError('LESSON_NOT_FOUND', 'Lesson not found', 404);
    }

    const activity: ProgressionActivity = { progressByUnitId: progressByLessonId, attemptedTestIds: new Set() };
    const isUnlocked =
      isProgressionUnitUnlocked(units, targetIndex, activity) ||
      (units.some(unit => unit.kind === 'test') &&
        isProgressionUnitUnlocked(units, targetIndex, {
          ...activity,
          attemptedTestIds: await this.getAttemptedTestIds(userId),
        }));
    if (!isUnlocked) {
      throw new StudentDashboardServiceError('LESSON_LOCKED', 'Complete the previous lesson to unlock this one', 403);
    }
  }

  private async getAttemptedTestIds(userId: string): Promise<Set<string>> {
    const snapshot = await this.db
      .collection(TEST_ATTEMPTS_COLLECTION)
      .where('studentId', '==', userId)
      .select('origin', 'status')
      .get();
    return collectAttemptedNormalTestIds(snapshot.docs.map(document => document.data()));
  }

  private toLessonDetail(
    lesson: Lesson,
    storedProgress: UserProgress | undefined,
    practice?: LessonSummary
  ): LessonWithProgress {
    const totalPages = lesson.pages.length;
    const furthestPageIndex = getFurthestPageIndex(storedProgress, totalPages);
    const summary = summarizeLessonCompletion(lesson, storedProgress);
    return {
      ...lesson,
      progress: summary.progress,
      status: !storedProgress ? 'available' : summary.isCompleted ? 'completed' : 'in-progress',
      furthestPageIndex,
      currentPageIndex: Math.max(furthestPageIndex, 0),
      exerciseProgress: summary.exerciseProgress,
      completedExerciseCount: summary.completedExerciseCount,
      requiredExerciseCount: summary.requiredExerciseCount,
      completedAt: storedProgress?.completedAt,
      score: storedProgress?.score,
      lastAccessedAt: storedProgress?.lastAccessedAt,
      progressSchemaVersion: storedProgress?.progressSchemaVersion,
      ...(practice
        ? {
            practiceCategories: practice.practiceCategories,
            practiceCategoryPlacements: practice.practiceCategoryPlacements,
          }
        : {}),
    };
  }
}

export const studentDashboardService = new StudentDashboardService();
