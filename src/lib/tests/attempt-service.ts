import { confirmSectionInputSchema, sectionPhaseInputSchema } from '@/shared/tests/sections';
import {
  activeSection,
  assertActiveSection,
  fingerprint,
  sectionFingerprint,
  sectionIncomplete,
  translationsToGrade,
  validateSectionAnswer,
} from './sections.server';
import { isExerciseAnswerComplete } from './answer-completion';
import type { Exercise } from '@/src/types/exercises';
import type { ConfirmSectionResult } from '@/src/types/test';
import { createHash, randomUUID } from 'node:crypto';
import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  DEFAULT_LEARNING_PATH_ID,
  LEARNING_PATHS_COLLECTION,
  LEARNING_UNITS_COLLECTION,
  MOCK_TESTS_COLLECTION,
  STUDENT_MOCK_RESULTS_COLLECTION,
  TEST_ATTEMPTS_COLLECTION,
  TEST_ATTEMPT_SESSIONS_COLLECTION,
  TEST_RESULT_REVIEWS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
  USER_PROGRESS_COLLECTION,
} from '@/shared/constants/firestore';
import { isExerciseType, isTestEligibleExerciseType } from '@/src/lib/content/registry';
import { learningPathDocumentSchema } from '@/src/lib/learning-units/schemas';
import { isLearningPathUnitUnlockedInTransaction } from '@/src/lib/learning-units/progression-access';
import { adminDb } from '@/src/services/firebase-admin';
import type { LearningPathDocument, TestUnit, TestUnitCompletionProgress } from '@/src/types/learning-unit';
import type {
  InProgressTestAttempt,
  MockTest,
  StartTestAttemptResult,
  StudentInProgressTestAttempt,
  StudentSubmittedTestAttempt,
  StudentTestAttempt,
  SubmitTestAttemptResult,
  SubmittedTestAttempt,
  TestAttempt,
  TestAttemptOrigin,
  TestAttemptOriginSummary,
  TestAttemptResultSummary,
  TestAttemptSession,
  TestTranslationItemGrade,
  TestTranslationGradeReservations,
  TestTranslationGradeRequestWindows,
  TestVersion,
} from '@/src/types/test';
import { isAnswerForExercise, parseExerciseAnswer } from './answer-schemas';
import {
  createFrozenTestDeliveryState,
  gradeFrozenTestDelivery,
  sanitizeTestDeliveryState,
  type FrozenDeliveryScore,
  type FrozenTestDeliveryState,
} from './delivery';
import {
  testTranslationGradingOutputSchema,
  translationGrader,
  type TestTranslationGradingOutput,
} from '@/shared/openai/translation-grading';
import type { TranslationGradingRequest } from '@/shared/openai/types';
import { richTextToPlainText } from '@/src/utils/exercises/helpers';
import { TEST_VERSION_SUMMARY_FIELDS, selectLeastUsedTestVersion, validateTestAssignmentGraph } from './domain';
import { TestServiceError } from './errors';
import { estimateFirestoreDocumentBytes } from './firestore-size';
import type { GeneratedWordLoader } from './generated-exercises';
import { createFirestoreGeneratedWordLoader } from './generated-word-loader.server';
import { createFirestoreVocabularyPoolLoader, type VocabularyPoolLoader } from './vocabulary-pool-loader.server';
import {
  assertVersionReadyForStudentVisibility,
  configurationError,
  parseMockSnapshot,
  parseTestSnapshot,
  parseVersionSnapshot,
  parseVersionSummarySnapshot,
} from './persistence';
import {
  saveTestAttemptAnswersInputSchema,
  gradeTestTranslationInputSchema,
  startTestAttemptInputSchema,
  submittedAttemptResultProjectionSchema,
  submittedAttemptTrendProjectionSchema,
  studentMockResultDocumentSchema,
  submittedTestAttemptDocumentSchema,
  testAttemptDocumentSchema,
  testAttemptSessionDocumentSchema,
  type SaveTestAttemptAnswersInput,
  type GradeTestTranslationInput,
  type StartTestAttemptInput,
} from './schemas';
import {
  isTestResultReviewDocumentWithinSizeLimit,
  buildSubmittedReview,
  testResultReviewDocumentSchema,
  toStudentTestResultReview,
  type TestResultReview,
} from './review';
import type { StudentTestResult } from '@/src/types/test-results';

export const MAX_TEST_ATTEMPT_DOCUMENT_BYTES = 900 * 1024;

/**
 * Tolerates floating-point representation error at the passing boundary while
 * remaining orders of magnitude below the smallest meaningful score gap.
 */
export const PASSING_THRESHOLD_TOLERANCE = 1e-9;

/** Longer than the route timeout, while still making a crashed grading request recoverable. */
export const TRANSLATION_GRADING_RESERVATION_MS = 5 * 60 * 1000;
export const TRANSLATION_GRADING_REQUEST_WINDOW_MS = 10 * 60 * 1000;
export const MAX_TRANSLATION_GRADING_REQUESTS_PER_WINDOW = 5;

type TestTranslationGrader = (
  request: TranslationGradingRequest,
  signal?: AbortSignal
) => Promise<TestTranslationGradingOutput>;

const originId = (origin: TestAttemptOrigin) => (origin.kind === 'normal-test' ? origin.testId : origin.mockTestId);

const sameOrigin = (left: TestAttemptOrigin, right: TestAttemptOrigin) =>
  left.kind === right.kind && originId(left) === originId(right);

export function getTestAttemptSessionId(studentId: string, origin: TestAttemptOrigin): string {
  return createHash('sha256')
    .update(JSON.stringify([studentId, origin.kind, originId(origin)]))
    .digest('hex');
}

export function getStudentMockResultId(studentId: string, mockTestId: string): string {
  return createHash('sha256')
    .update(JSON.stringify([studentId, mockTestId]))
    .digest('hex');
}

function parseAttemptSnapshot(snapshot: DocumentSnapshot): TestAttempt {
  if (!snapshot.exists) {
    throw new TestServiceError('ATTEMPT_NOT_FOUND', 'Test attempt not found', 404);
  }

  const parsed = testAttemptDocumentSchema.safeParse({ ...snapshot.data(), id: snapshot.id });
  if (!parsed.success) {
    throw new TestServiceError(
      'STALE_TEST_ATTEMPT_DATA',
      `Test attempt ${snapshot.id} contains invalid persisted data`,
      409
    );
  }

  if (parsed.data.status === 'submitted') return parsed.data as TestAttempt;

  try {
    const answers = Object.fromEntries(
      Object.entries(parsed.data.answers).map(([exerciseId, answer]) => [exerciseId, parseExerciseAnswer(answer)])
    );
    if (parsed.data.flowVersion === 1) {
      for (const [id, answer] of Object.entries(answers)) {
        const exercise = parsed.data.deliveryState.pages.flatMap(page => page.items).find(item => item.id === id);
        if (!exercise || !isExerciseType(exercise.type) || answer.type !== exercise.type)
          throw new Error('Invalid persisted exercise reference');
        validateSectionAnswer(
          exercise as unknown as Exercise,
          answer,
          parsed.data.deliveryState.resolvedExercises[id]?.items
        );
      }
    }
    return { ...parsed.data, answers } as InProgressTestAttempt;
  } catch {
    throw new TestServiceError(
      'STALE_TEST_ATTEMPT_DATA',
      `Test attempt ${snapshot.id} contains invalid persisted answers`,
      409
    );
  }
}

function parseSessionSnapshot(snapshot: DocumentSnapshot): TestAttemptSession {
  const parsed = testAttemptSessionDocumentSchema.safeParse({ ...snapshot.data(), id: snapshot.id });
  if (!parsed.success) {
    throw new TestServiceError(
      'STALE_TEST_ATTEMPT_DATA',
      `Test attempt session ${snapshot.id} contains invalid persisted data`,
      409
    );
  }
  return parsed.data as TestAttemptSession;
}

function toStudentAttempt(attempt: TestAttempt): StudentTestAttempt {
  if (attempt.status === 'submitted') {
    const {
      studentId: _studentId,
      answers: _answers,
      translationGrades: _translationGrades,
      deliveryState: _deliveryState,
      confirmedSections: _confirmedSections,
      ...studentAttempt
    } = attempt;
    return studentAttempt;
  }

  if (attempt.flowVersion === 1) {
    const { page, pageIndex, state } = activeSection(attempt);
    const delivery = sanitizeTestDeliveryState(attempt.deliveryState as FrozenTestDeliveryState);
    const exerciseIds = new Set(page.items.map(item => item.id));
    const exercises = delivery.pages.flatMap(page => page.items).filter(item => isExerciseType(item.type));
    return {
      id: attempt.id,
      versionId: attempt.versionId,
      passingPercentage: attempt.passingPercentage,
      origin: attempt.origin,
      startedAt: attempt.startedAt,
      updatedAt: attempt.updatedAt,
      status: 'in-progress',
      flowVersion: 1,
      answers: Object.fromEntries(Object.entries(attempt.answers).filter(([id]) => exerciseIds.has(id))),
      delivery: {
        versionId: delivery.versionId,
        pages: [delivery.pages[pageIndex]],
        resolvedExercises: Object.fromEntries(
          Object.entries(delivery.resolvedExercises).filter(([id]) => exerciseIds.has(id))
        ),
        ...(page.items.some(item => item.type === 'vocabulary-pool') && delivery.vocabularyPool
          ? { vocabularyPool: delivery.vocabularyPool }
          : {}),
      },
      section: {
        pageId: page.id,
        pageIndex,
        totalPages: delivery.pages.length,
        totalExercises: exercises.length,
        answeredCount: exercises.filter(item =>
          isExerciseAnswerComplete(
            item as Exercise,
            attempt.answers[item.id],
            delivery.resolvedExercises[item.id]?.items.length ?? 0
          )
        ).length,
        revision: state.revision,
        phase: state.phase as 'answering' | 'review' | 'confirming',
      },
    };
  }
  const {
    flowVersion: _flowVersion,
    sections: _sections,
    studentId: _studentId,
    deliveryState,
    translationGradeReservations: _translationGradeReservations,
    translationGradeRequestWindows: _translationGradeRequestWindows,
    ...studentAttempt
  } = attempt;
  return {
    ...studentAttempt,
    delivery: sanitizeTestDeliveryState(deliveryState as FrozenTestDeliveryState),
  };
}

const translationReservationIsActive = (expiresAt: string, now: string) => Date.parse(expiresAt) > Date.parse(now);

function withoutTranslationGradeReservation(
  reservations: TestTranslationGradeReservations,
  exerciseId: string,
  itemIndex: number
): TestTranslationGradeReservations {
  const exerciseReservations = { ...reservations[exerciseId] };
  delete exerciseReservations[String(itemIndex)];
  const updated = { ...reservations };
  if (Object.keys(exerciseReservations).length === 0) delete updated[exerciseId];
  else updated[exerciseId] = exerciseReservations;
  return updated;
}

const translationRequestWindowIsActive = (windowStartedAt: string, now: string) =>
  Date.parse(windowStartedAt) + TRANSLATION_GRADING_REQUEST_WINDOW_MS > Date.parse(now);

function assertAttemptOwner(attempt: TestAttempt, studentId: string) {
  if (attempt.studentId !== studentId) {
    throw new TestServiceError('ATTEMPT_NOT_FOUND', 'Test attempt not found', 404);
  }
}

function getTranslationExerciseItem(attempt: InProgressTestAttempt, request: GradeTestTranslationInput) {
  const exercise = attempt.deliveryState.pages.flatMap(page => page.items).find(item => item.id === request.exerciseId);
  if (!exercise || exercise.type !== 'translation-grading') {
    throw new TestServiceError('ATTEMPT_ANSWER_INVALID', 'This translation does not belong to the test attempt', 400);
  }

  const item = exercise.data.items[request.itemIndex];
  if (!item) throw new TestServiceError('ATTEMPT_ANSWER_INVALID', 'This translation item does not exist', 400);
  return { exercise, item };
}

export interface TestAttemptServiceOptions {
  random?: () => number;
  loadGeneratedWords?: GeneratedWordLoader;
  loadVocabularyPool?: VocabularyPoolLoader;
  maxAttemptDocumentBytes?: number;
  maxReviewDocumentBytes?: number;
  gradeTestTranslation?: TestTranslationGrader;
}

export class TestAttemptService {
  private readonly random: () => number;
  private readonly loadGeneratedWords: GeneratedWordLoader;
  private readonly loadVocabularyPool: VocabularyPoolLoader;
  private readonly maxAttemptDocumentBytes: number;
  private readonly maxReviewDocumentBytes?: number;
  private readonly gradeTestTranslation: TestTranslationGrader;

  constructor(
    private readonly db: Firestore = adminDb,
    private readonly now: () => string = () => new Date().toISOString(),
    options: TestAttemptServiceOptions = {}
  ) {
    this.random = options.random ?? Math.random;
    this.loadGeneratedWords = options.loadGeneratedWords ?? createFirestoreGeneratedWordLoader(db);
    this.loadVocabularyPool = options.loadVocabularyPool ?? createFirestoreVocabularyPoolLoader(db);
    this.maxAttemptDocumentBytes = options.maxAttemptDocumentBytes ?? MAX_TEST_ATTEMPT_DOCUMENT_BYTES;
    this.maxReviewDocumentBytes = options.maxReviewDocumentBytes;
    this.gradeTestTranslation =
      options.gradeTestTranslation ??
      (async (request, signal) => {
        const result = await translationGrader.grade(
          'test',
          request,
          undefined,
          signal ? { signal, timeout: 90_000, maxRetries: 0 } : undefined
        );
        if (!result.success) throw new Error(result.error);
        return result.data;
      });
  }

  private get versions() {
    return this.db.collection(TEST_VERSIONS_COLLECTION);
  }

  private get units() {
    return this.db.collection(LEARNING_UNITS_COLLECTION);
  }

  private get mocks() {
    return this.db.collection(MOCK_TESTS_COLLECTION);
  }

  private get attempts() {
    return this.db.collection(TEST_ATTEMPTS_COLLECTION);
  }

  private get attemptSessions() {
    return this.db.collection(TEST_ATTEMPT_SESSIONS_COLLECTION);
  }

  private get reviews() {
    return this.db.collection(TEST_RESULT_REVIEWS_COLLECTION);
  }

  private get studentMockResults() {
    return this.db.collection(STUDENT_MOCK_RESULTS_COLLECTION);
  }

  private get progress() {
    return this.db.collection(USER_PROGRESS_COLLECTION);
  }

  private async getOwnedInProgressAttempt(
    transaction: Transaction,
    attemptRef: DocumentReference,
    studentId: string
  ): Promise<InProgressTestAttempt> {
    const attempt = parseAttemptSnapshot(await transaction.get(attemptRef));
    assertAttemptOwner(attempt, studentId);
    if (attempt.status !== 'in-progress') {
      throw new TestServiceError('ATTEMPT_NOT_IN_PROGRESS', 'This test attempt has already been submitted', 409);
    }
    if (attempt.origin.kind === 'normal-test') {
      await this.assertNormalTestUnlocked(transaction, studentId, attempt.origin.testId, true);
    }
    return attempt;
  }

  private async releaseTranslationGradeReservation(
    attemptRef: DocumentReference,
    studentId: string,
    request: GradeTestTranslationInput,
    reservationToken: string
  ): Promise<void> {
    try {
      await this.db.runTransaction(async transaction => {
        const snapshot = await transaction.get(attemptRef);
        if (!snapshot.exists) return;
        const attempt = parseAttemptSnapshot(snapshot);
        if (attempt.status !== 'in-progress' || attempt.studentId !== studentId) return;
        const reservation = attempt.translationGradeReservations[request.exerciseId]?.[String(request.itemIndex)];
        if (!reservation || reservation.token !== reservationToken) return;

        const updated = testAttemptDocumentSchema.parse({
          ...attempt,
          translationGradeReservations: withoutTranslationGradeReservation(
            attempt.translationGradeReservations,
            request.exerciseId,
            request.itemIndex
          ),
        }) as InProgressTestAttempt;
        transaction.set(attemptRef, updated);
      });
    } catch (error) {
      // The lease expires automatically if cleanup itself is interrupted.
      console.error(`Could not release translation grading reservation for attempt ${attemptRef.id}`, error);
    }
  }

  private submittedAttemptsQuery(studentId: string, origin: TestAttemptOrigin) {
    const scoped = this.attempts
      .where('studentId', '==', studentId)
      .where('origin.kind', '==', origin.kind)
      .where('status', '==', 'submitted');
    return origin.kind === 'normal-test'
      ? scoped.where('origin.testId', '==', origin.testId)
      : scoped.where('origin.mockTestId', '==', origin.mockTestId);
  }

  private submittedHistoryQuery(studentId: string, origin: Extract<TestAttemptOrigin, { kind: 'normal-test' }>) {
    return this.submittedAttemptsQuery(studentId, origin).select('versionId', 'submittedAt');
  }

  private parseAttemptVersion(snapshot: DocumentSnapshot, origin: TestAttemptOrigin): TestVersion {
    try {
      return parseVersionSnapshot(snapshot);
    } catch (error) {
      throw configurationError(
        `Attempt origin ${origin.kind}:${originId(origin)} references an unavailable version ${snapshot.id}`,
        error
      );
    }
  }

  private parseLearningPath(snapshot: DocumentSnapshot): LearningPathDocument {
    if (!snapshot.exists) {
      throw new TestServiceError('TEST_NOT_AVAILABLE', 'Test is not available', 404);
    }
    const parsedPath = learningPathDocumentSchema.safeParse({
      ...snapshot.data(),
      id: snapshot.id,
    });
    if (!parsedPath.success) {
      throw configurationError(
        `Learning Path ${snapshot.id} contains invalid persisted data`,
        parsedPath.error.flatten()
      );
    }
    return parsedPath.data;
  }

  private async assertNormalTestUnlocked(
    transaction: Transaction,
    studentId: string,
    testId: string,
    hasPersistedTargetActivity: boolean
  ): Promise<LearningPathDocument> {
    const pathSnapshot = await transaction.get(
      this.db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID)
    );
    const path = this.parseLearningPath(pathSnapshot);
    const unlocked = await isLearningPathUnitUnlockedInTransaction(transaction, this.db, path, studentId, testId, {
      hasPersistedTargetActivity,
    });
    if (!unlocked) {
      throw new TestServiceError('TEST_NOT_AVAILABLE', 'Test is not available', 404);
    }
    return path;
  }

  private assertAttemptDocumentSize(attempt: InProgressTestAttempt | SubmittedTestAttempt) {
    let estimatedBytes: number;
    try {
      estimatedBytes = estimateFirestoreDocumentBytes({ ...attempt });
    } catch (error) {
      throw configurationError(`Could not serialize attempt ${attempt.id}`, error);
    }

    if (estimatedBytes > this.maxAttemptDocumentBytes) {
      console.error(
        `Attempt ${attempt.id} is approximately ${estimatedBytes} bytes, above the ${this.maxAttemptDocumentBytes}-byte safety limit`
      );
      throw new TestServiceError(
        'ATTEMPT_TOO_LARGE',
        'This test attempt is too large to save safely. Please ask an administrator to review its content size.',
        422
      );
    }
  }

  private buildReviewForAttempt(attempt: InProgressTestAttempt, submittedAt: string) {
    const frozenScore = gradeFrozenTestDelivery(
      attempt.deliveryState as FrozenTestDeliveryState,
      attempt.answers,
      attempt.translationGrades
    );
    const exerciseResults = Object.fromEntries(
      frozenScore.exerciseResults.map(result => [
        result.exerciseId,
        { title: result.title, awardedPoints: result.awardedPoints, maxPoints: result.maxPoints },
      ])
    );
    const review = buildSubmittedReview({
      attemptId: attempt.id,
      studentId: attempt.studentId,
      versionId: attempt.versionId,
      origin: attempt.origin,
      submittedAt,
      deliveryState: attempt.deliveryState as FrozenTestDeliveryState,
      answers: attempt.answers,
      translationGrades: attempt.translationGrades,
      exerciseResults,
    });
    return { frozenScore, exerciseResults, review };
  }

  private assertAttemptCanBeSubmitted(attempt: InProgressTestAttempt) {
    try {
      const { review } = this.buildReviewForAttempt(attempt, attempt.updatedAt);
      if (!isTestResultReviewDocumentWithinSizeLimit(review, this.maxReviewDocumentBytes)) {
        throw new TestServiceError(
          'ATTEMPT_TOO_LARGE',
          'This test attempt is too large to save safely. Please ask an administrator to review its content size.',
          422
        );
      }
    } catch (error) {
      if (error instanceof TestServiceError) throw error;
      throw configurationError(`Could not prepare a review for attempt ${attempt.id}`, error);
    }
  }

  private async resolveAttemptVersion(
    transaction: Transaction,
    studentId: string,
    origin: TestAttemptOrigin
  ): Promise<{ version: TestVersion; passingPercentage: number | null }> {
    // This is deliberately done only while creating a new frozen delivery.
    // A resumed attempt is an historical delivery and must remain usable even
    // if an administrator has subsequently moved its version.
    await this.assertActiveOwnershipGraph(transaction);
    if (origin.kind === 'mock-test') {
      const mock = parseMockSnapshot(await transaction.get(this.mocks.doc(origin.mockTestId)));
      if (mock.status !== 'active' || !mock.isLive) {
        throw new TestServiceError('MOCK_TEST_NOT_AVAILABLE', 'Mock test is not available', 404);
      }
      const version = this.parseAttemptVersion(await transaction.get(this.versions.doc(mock.versionId)), origin);
      return { version, passingPercentage: mock.passingPercentage };
    }

    const historyQuery = this.submittedHistoryQuery(studentId, origin);
    const [testSnapshot, historySnapshot] = await Promise.all([
      transaction.get(this.units.doc(origin.testId)),
      transaction.get(historyQuery),
    ]);

    let test: TestUnit;
    try {
      test = parseTestSnapshot(testSnapshot);
    } catch (error) {
      if (error instanceof TestServiceError && error.code === 'TEST_NOT_FOUND') {
        throw new TestServiceError('TEST_NOT_AVAILABLE', 'Test is not available', 404);
      }
      throw configurationError(`Normal test ${origin.testId} contains invalid persisted data`, error);
    }

    await this.assertNormalTestUnlocked(transaction, studentId, origin.testId, historySnapshot.docs.length > 0);

    // Cold-start rotation validation stays inexpensive: every referenced version
    // must exist and carry its server-derived summary (written transactionally
    // with validated pages), but full page bodies load only for the selected
    // version.
    const rotationSummarySnapshots = test.rotationVersions.length
      ? await transaction.getAll(...test.rotationVersions.map(reference => this.versions.doc(reference.versionId)), {
          fieldMask: [...TEST_VERSION_SUMMARY_FIELDS],
        })
      : [];
    for (const summarySnapshot of rotationSummarySnapshots) {
      try {
        parseVersionSummarySnapshot(summarySnapshot);
      } catch (error) {
        throw configurationError(
          `Normal test ${origin.testId} references an unavailable rotation version ${summarySnapshot.id}`,
          error
        );
      }
    }

    const history = historySnapshot.docs.map(snapshot => {
      const data = snapshot.data();
      if (typeof data.versionId !== 'string' || typeof data.submittedAt !== 'string') {
        throw configurationError(`Submitted attempt ${snapshot.id} contains invalid version-selection history fields`);
      }
      return { versionId: data.versionId, submittedAt: data.submittedAt };
    });

    let versionId: string;
    try {
      versionId = selectLeastUsedTestVersion(
        test.rotationVersions.map(reference => reference.versionId),
        history,
        this.random
      );
    } catch (error) {
      throw configurationError(`Normal test ${origin.testId} has no valid rotation selection`, error);
    }

    const version = this.parseAttemptVersion(await transaction.get(this.versions.doc(versionId)), origin);
    return { version, passingPercentage: test.passingPercentage };
  }

  private async assertActiveOwnershipGraph(transaction: Transaction): Promise<void> {
    const [testSnapshots, mockSnapshots, versionSnapshots, pathSnapshot] = await Promise.all([
      transaction.get(this.db.collection('lessons').where('kind', '==', 'test')),
      transaction.get(this.mocks.where('status', '==', 'active')),
      transaction.get(this.versions),
      transaction.get(this.db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID)),
    ]);
    let tests: TestUnit[];
    let mocks: MockTest[];
    try {
      // `kind: test` makes a document a potential active owner.  Do not skip a
      // malformed one: a new attempt must fail closed against corrupt delivery
      // configuration, even when the selected test itself is otherwise valid.
      tests = testSnapshots.docs.map(parseTestSnapshot);
      mocks = mockSnapshots.docs.map(parseMockSnapshot);
    } catch (error) {
      throw configurationError('Active delivery ownership contains malformed documents', error);
    }
    const errors = validateTestAssignmentGraph({
      tests,
      mocks,
      versionIds: versionSnapshots.docs.map(snapshot => snapshot.id),
    });
    const parsedPath = learningPathDocumentSchema.safeParse({ ...pathSnapshot.data(), id: pathSnapshot.id });
    if (pathSnapshot.exists) {
      if (!parsedPath.success)
        throw configurationError('Learning Path contains invalid data', parsedPath.error.flatten());
      for (const testId of parsedPath.data.unitIds) {
        const test = tests.find(candidate => candidate.id === testId);
        if (!test) continue;
        if (test.rotationVersions.length === 0) errors.push(`Placed test ${test.id} has no rotation version`);
      }
    }
    if (errors.length > 0) throw configurationError(`Active delivery ownership graph is invalid: ${errors.join('; ')}`);
  }

  async startAttempt(input: StartTestAttemptInput, studentId: string): Promise<StartTestAttemptResult> {
    const { origin } = startTestAttemptInputSchema.parse(input) as { origin: TestAttemptOrigin };
    const sessionId = getTestAttemptSessionId(studentId, origin);
    const sessionRef = this.attemptSessions.doc(sessionId);
    const newAttemptRef = this.attempts.doc();

    return this.db.runTransaction(async transaction => {
      const sessionSnapshot = await transaction.get(sessionRef);
      if (sessionSnapshot.exists) {
        const session = parseSessionSnapshot(sessionSnapshot);
        if (session.studentId !== studentId || !sameOrigin(session.origin, origin)) {
          throw configurationError(`Attempt session scope collision for ${sessionId}`);
        }

        const activeAttemptSnapshot = await transaction.get(this.attempts.doc(session.attemptId));
        if (activeAttemptSnapshot.exists) {
          const activeAttempt = parseAttemptSnapshot(activeAttemptSnapshot);
          if (activeAttempt.studentId !== studentId || !sameOrigin(activeAttempt.origin, origin)) {
            throw configurationError(`Attempt session ${sessionId} points outside its student/origin scope`);
          }
          if (activeAttempt.status === 'in-progress') {
            if (origin.kind === 'normal-test') {
              await this.assertNormalTestUnlocked(transaction, studentId, origin.testId, true);
            }
            return {
              attempt: toStudentAttempt(activeAttempt) as StudentInProgressTestAttempt,
              resumed: true,
            };
          }
        }
      }

      const { version, passingPercentage } = await this.resolveAttemptVersion(transaction, studentId, origin);
      assertVersionReadyForStudentVisibility(version);
      let deliveryState: FrozenTestDeliveryState;
      try {
        deliveryState = await createFrozenTestDeliveryState(version, this.loadGeneratedWords, this.loadVocabularyPool);
      } catch (error) {
        throw configurationError(
          `Could not resolve frozen delivery for ${origin.kind}:${originId(origin)} version ${version.id}`,
          error
        );
      }

      const timestamp = this.now();
      let attempt: InProgressTestAttempt;
      try {
        attempt = testAttemptDocumentSchema.parse({
          id: newAttemptRef.id,
          studentId,
          versionId: version.id,
          passingPercentage,
          origin,
          status: 'in-progress',
          flowVersion: 1,
          sections: Object.fromEntries(deliveryState.pages.map(page => [page.id, { revision: 0, phase: 'answering' }])),
          answers: {},
          translationGrades: {},
          translationGradeReservations: {},
          translationGradeRequestWindows: {},
          deliveryState,
          startedAt: timestamp,
          updatedAt: timestamp,
        }) as InProgressTestAttempt;
      } catch (error) {
        throw configurationError(`Could not build attempt for version ${version.id}`, error);
      }
      this.assertAttemptDocumentSize(attempt);
      this.assertAttemptCanBeSubmitted(attempt);

      const session = testAttemptSessionDocumentSchema.parse({
        id: sessionId,
        studentId,
        origin,
        attemptId: attempt.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      }) as TestAttemptSession;

      transaction.create(newAttemptRef, attempt);
      transaction.set(sessionRef, session);
      return { attempt: toStudentAttempt(attempt) as StudentInProgressTestAttempt, resumed: false };
    });
  }

  async saveAttemptAnswers(
    attemptId: string,
    input: SaveTestAttemptAnswersInput,
    studentId: string
  ): Promise<StudentInProgressTestAttempt> {
    const changes = saveTestAttemptAnswersInputSchema.parse(input);
    const attemptRef = this.attempts.doc(attemptId);

    return this.db.runTransaction(async transaction => {
      const attempt = await this.getOwnedInProgressAttempt(transaction, attemptRef, studentId);

      if (attempt.flowVersion === 1) {
        if (!changes.section)
          throw new TestServiceError('ATTEMPT_SECTION_REQUIRED', 'Reload this attempt to save section answers', 409);
        const { pageId, expectedRevision, mutationId } = changes.section;
        const { page, state } = activeSection(attempt);
        const payloadFingerprint = fingerprint(changes.answers);
        const receipt = state.saveMutations?.[mutationId];
        if (page.id === pageId && receipt) {
          if (receipt.fingerprint !== payloadFingerprint || receipt.expectedRevision !== expectedRevision)
            throw new TestServiceError(
              'ATTEMPT_REVISION_CONFLICT',
              'A save identifier was reused with different answers',
              409
            );
          return toStudentAttempt(attempt) as StudentInProgressTestAttempt;
        }
        assertActiveSection(attempt, pageId, expectedRevision);
        if (state.phase === 'confirming')
          throw new TestServiceError('ATTEMPT_SECTION_LOCKED', 'Wait for section confirmation to finish', 409);
        if (Object.keys(changes.answers).some(id => !page.items.some(item => item.id === id)))
          throw new TestServiceError('ATTEMPT_SECTION_LOCKED', 'Only the current section can be edited', 409);
        attempt.sections = {
          ...attempt.sections,
          [pageId]: {
            ...state,
            revision: state.revision + 1,
            saveMutations: {
              ...state.saveMutations,
              [mutationId]: { fingerprint: payloadFingerprint, expectedRevision },
            },
          },
        };
      } else if (changes.section)
        throw new TestServiceError('ATTEMPT_SECTION_REQUIRED', 'This is a legacy attempt', 409);
      const answers = { ...attempt.answers };
      const translationGrades = Object.fromEntries(
        Object.entries(attempt.translationGrades).map(([exerciseId, grades]) => [exerciseId, { ...grades }])
      );
      const translationGradeReservations = Object.fromEntries(
        Object.entries(attempt.translationGradeReservations).map(([exerciseId, reservations]) => [
          exerciseId,
          { ...reservations },
        ])
      );
      const itemsById = new Map(
        attempt.deliveryState.pages.flatMap(page => page.items).map(item => [item.id, item] as const)
      );
      const timestamp = this.now();

      for (const [exerciseId, rawAnswer] of Object.entries(changes.answers)) {
        const item = itemsById.get(exerciseId);
        if (!item || !isExerciseType(item.type) || !isTestEligibleExerciseType(item.type)) {
          throw new TestServiceError(
            'ATTEMPT_ANSWER_INVALID',
            'An answer does not belong to an exercise in this attempt',
            400
          );
        }
        if (item.type === 'translation-grading' && attempt.flowVersion !== 1) {
          if (Object.keys(translationGrades[exerciseId] ?? {}).length > 0) {
            throw new TestServiceError(
              'ATTEMPT_TRANSLATION_ALREADY_GRADED',
              'A graded translation answer is final for this attempt',
              409
            );
          }
          const activeReservation = Object.values(translationGradeReservations[exerciseId] ?? {}).some(reservation =>
            translationReservationIsActive(reservation.expiresAt, timestamp)
          );
          if (activeReservation) {
            throw new TestServiceError(
              'ATTEMPT_TRANSLATION_GRADING_IN_PROGRESS',
              'This translation is already being graded',
              409
            );
          }
          // An abandoned provider request must not permanently lock the answer.
          delete translationGradeReservations[exerciseId];
        }
        if (rawAnswer === null) {
          delete answers[exerciseId];
          delete translationGrades[exerciseId];
          continue;
        }

        let answer;
        try {
          answer = parseExerciseAnswer(rawAnswer);
        } catch {
          throw new TestServiceError('ATTEMPT_ANSWER_INVALID', 'The committed answer has an invalid shape', 400);
        }
        if (!isAnswerForExercise(answer, item.type)) {
          throw new TestServiceError('ATTEMPT_ANSWER_INVALID', `The committed answer must have type ${item.type}`, 400);
        }
        if (attempt.flowVersion === 1)
          validateSectionAnswer(item as Exercise, answer, attempt.deliveryState.resolvedExercises[exerciseId]?.items);
        answers[exerciseId] = answer;
        if (item.type === 'translation-grading') {
          translationGrades[exerciseId] = Object.fromEntries(
            Object.entries(translationGrades[exerciseId] ?? {}).filter(
              ([index, grade]) =>
                answer.type === 'translation-grading' &&
                answer.translations[Number(index)]?.trim() === grade.translation
            )
          );
        }
      }

      const updated = testAttemptDocumentSchema.parse({
        ...attempt,
        answers,
        translationGrades,
        translationGradeReservations,
        updatedAt: timestamp,
      }) as InProgressTestAttempt;
      this.assertAttemptDocumentSize(updated);
      this.assertAttemptCanBeSubmitted(updated);
      transaction.set(attemptRef, updated);
      return toStudentAttempt(updated) as StudentInProgressTestAttempt;
    });
  }

  async gradeTranslationItem(
    attemptId: string,
    input: unknown,
    studentId: string
  ): Promise<StudentInProgressTestAttempt> {
    const request = gradeTestTranslationInputSchema.parse(input);
    const attemptRef = this.attempts.doc(attemptId);
    const reservationToken = randomUUID();

    const preparation = await this.db.runTransaction(async transaction => {
      const attempt = await this.getOwnedInProgressAttempt(transaction, attemptRef, studentId);
      if (attempt.flowVersion === 1)
        throw new TestServiceError(
          'ATTEMPT_SECTION_REQUIRED',
          'Translations are graded only when confirming a section',
          409
        );
      const { exercise, item } = getTranslationExerciseItem(attempt, request);
      const existingGrade = attempt.translationGrades[request.exerciseId]?.[String(request.itemIndex)];
      if (existingGrade) {
        if (existingGrade.translation !== request.userTranslation) {
          throw new TestServiceError(
            'ATTEMPT_TRANSLATION_ALREADY_GRADED',
            'This translation item has already been graded with a different answer',
            409
          );
        }
        return {
          kind: 'existing' as const,
          attempt: toStudentAttempt(attempt) as StudentInProgressTestAttempt,
        };
      }

      const timestamp = this.now();
      const existingReservation = attempt.translationGradeReservations[request.exerciseId]?.[String(request.itemIndex)];
      if (existingReservation && translationReservationIsActive(existingReservation.expiresAt, timestamp)) {
        throw new TestServiceError(
          'ATTEMPT_TRANSLATION_GRADING_IN_PROGRESS',
          'This translation is already being graded',
          409
        );
      }

      const existingRequestWindow =
        attempt.translationGradeRequestWindows[request.exerciseId]?.[String(request.itemIndex)];
      const requestWindowActive =
        existingRequestWindow && translationRequestWindowIsActive(existingRequestWindow.windowStartedAt, timestamp);
      if (requestWindowActive && existingRequestWindow.count >= MAX_TRANSLATION_GRADING_REQUESTS_PER_WINDOW) {
        throw new TestServiceError(
          'ATTEMPT_TRANSLATION_GRADING_RATE_LIMITED',
          'Too many translation grading requests. Please try again after the grading window resets.',
          429
        );
      }

      const exerciseRequestWindows = {
        ...attempt.translationGradeRequestWindows[request.exerciseId],
        [String(request.itemIndex)]: requestWindowActive
          ? { ...existingRequestWindow, count: existingRequestWindow.count + 1 }
          : { windowStartedAt: timestamp, count: 1 },
      };
      const translationGradeRequestWindows: TestTranslationGradeRequestWindows = {
        ...attempt.translationGradeRequestWindows,
        [request.exerciseId]: exerciseRequestWindows,
      };

      const exerciseReservations = {
        ...attempt.translationGradeReservations[request.exerciseId],
        [String(request.itemIndex)]: {
          token: reservationToken,
          expiresAt: new Date(Date.parse(timestamp) + TRANSLATION_GRADING_RESERVATION_MS).toISOString(),
        },
      };
      const reservedAttempt = testAttemptDocumentSchema.parse({
        ...attempt,
        translationGradeReservations: {
          ...attempt.translationGradeReservations,
          [request.exerciseId]: exerciseReservations,
        },
        translationGradeRequestWindows,
      }) as InProgressTestAttempt;
      this.assertAttemptDocumentSize(reservedAttempt);
      transaction.set(attemptRef, reservedAttempt);

      return {
        kind: 'reserved' as const,
        gradingRequest: {
          sourceText: richTextToPlainText(item.latinText),
          userTranslation: request.userTranslation,
          direction: exercise.translationDirection ?? 'latin-to-english',
        } satisfies TranslationGradingRequest,
      };
    });

    if (preparation.kind === 'existing') return preparation.attempt;

    let gradingOutput: TestTranslationGradingOutput;
    try {
      gradingOutput = testTranslationGradingOutputSchema.parse(
        await this.gradeTestTranslation(preparation.gradingRequest)
      );
    } catch (error) {
      console.error(`Could not grade translation item for attempt ${attemptId}`, error);
      await this.releaseTranslationGradeReservation(attemptRef, studentId, request, reservationToken);
      throw new TestServiceError(
        'ATTEMPT_GRADING_UNAVAILABLE',
        'Translation grading is temporarily unavailable. Please try checking the translation again.',
        503
      );
    }

    try {
      return await this.db.runTransaction(async transaction => {
        const attempt = await this.getOwnedInProgressAttempt(transaction, attemptRef, studentId);
        const { exercise } = getTranslationExerciseItem(attempt, request);
        const reservation = attempt.translationGradeReservations[request.exerciseId]?.[String(request.itemIndex)];
        if (!reservation || reservation.token !== reservationToken) {
          throw new TestServiceError(
            'ATTEMPT_TRANSLATION_GRADING_IN_PROGRESS',
            'This translation grading request no longer owns the item reservation',
            409
          );
        }

        const existingAnswer = attempt.answers[request.exerciseId];
        const parsedExistingAnswer = existingAnswer === undefined ? null : parseExerciseAnswer(existingAnswer);
        if (parsedExistingAnswer && parsedExistingAnswer.type !== 'translation-grading') {
          throw new TestServiceError('ATTEMPT_ANSWER_INVALID', 'The saved translation answer has an invalid type', 400);
        }
        const translations = Array.from(
          { length: exercise.data.items.length },
          (_, index) => parsedExistingAnswer?.translations[index] ?? ''
        );
        translations[request.itemIndex] = request.userTranslation;
        const grade: TestTranslationItemGrade = {
          translation: request.userTranslation,
          score: gradingOutput.score,
          feedback: gradingOutput.feedback,
        };
        const updated = testAttemptDocumentSchema.parse({
          ...attempt,
          answers: {
            ...attempt.answers,
            [request.exerciseId]: { type: 'translation-grading', translations },
          },
          translationGrades: {
            ...attempt.translationGrades,
            [request.exerciseId]: {
              ...attempt.translationGrades[request.exerciseId],
              [String(request.itemIndex)]: grade,
            },
          },
          translationGradeReservations: withoutTranslationGradeReservation(
            attempt.translationGradeReservations,
            request.exerciseId,
            request.itemIndex
          ),
          updatedAt: this.now(),
        }) as InProgressTestAttempt;
        this.assertAttemptDocumentSize(updated);
        this.assertAttemptCanBeSubmitted(updated);
        transaction.set(attemptRef, updated);

        return toStudentAttempt(updated) as StudentInProgressTestAttempt;
      });
    } catch (error) {
      await this.releaseTranslationGradeReservation(attemptRef, studentId, request, reservationToken);
      throw error;
    }
  }

  async getAttempt(attemptId: string, studentId: string): Promise<StudentTestAttempt> {
    return this.db.runTransaction(async transaction => {
      const attempt = parseAttemptSnapshot(await transaction.get(this.attempts.doc(attemptId)));
      assertAttemptOwner(attempt, studentId);
      if (attempt.status === 'in-progress' && attempt.origin.kind === 'normal-test')
        await this.assertNormalTestUnlocked(transaction, studentId, attempt.origin.testId, true);
      return toStudentAttempt(attempt);
    });
  }

  async setSectionPhase(
    attemptId: string,
    pageId: string,
    input: unknown,
    studentId: string
  ): Promise<StudentInProgressTestAttempt> {
    const request = sectionPhaseInputSchema.parse(input);
    return this.db.runTransaction(async transaction => {
      const ref = this.attempts.doc(attemptId);
      const attempt = await this.getOwnedInProgressAttempt(transaction, ref, studentId);
      const { state } = assertActiveSection(attempt, pageId, request.expectedRevision);
      if (state.confirmation && translationReservationIsActive(state.confirmation.expiresAt, this.now()))
        throw new TestServiceError('ATTEMPT_SECTION_LOCKED', 'Section confirmation is still running', 409);
      const { confirmation: _confirmation, ...rest } = state;
      attempt.sections = { ...attempt.sections, [pageId]: { ...rest, phase: request.phase } };
      attempt.updatedAt = this.now();
      this.assertAttemptDocumentSize(attempt);
      transaction.set(ref, attempt);
      return toStudentAttempt(attempt) as StudentInProgressTestAttempt;
    });
  }

  async confirmSection(
    attemptId: string,
    pageId: string,
    input: unknown,
    studentId: string
  ): Promise<ConfirmSectionResult> {
    const request = confirmSectionInputSchema.parse(input);
    const ref = this.attempts.doc(attemptId);
    const token = randomUUID();
    const prepared = await this.db.runTransaction(async transaction => {
      const stored = parseAttemptSnapshot(await transaction.get(ref));
      assertAttemptOwner(stored, studentId);
      if (stored.flowVersion !== 1)
        throw new TestServiceError('ATTEMPT_SECTION_REQUIRED', 'This attempt does not use section confirmation', 409);
      if (
        stored.status === 'submitted'
          ? !stored.confirmedSections?.[pageId]
          : !stored.deliveryState.pages.some(page => page.id === pageId)
      )
        throw new TestServiceError('ATTEMPT_SECTION_LOCKED', 'This section is not part of this attempt', 409);
      if (stored.status === 'submitted')
        return { result: { attempt: toStudentAttempt(stored), pending: false, completionGranted: false } };
      const attempt = stored;
      if (attempt.origin.kind === 'normal-test')
        await this.assertNormalTestUnlocked(transaction, studentId, attempt.origin.testId, true);
      if (
        attempt.sections?.[pageId]?.phase === 'confirmed' &&
        attempt.sections[pageId].revision === request.expectedRevision
      )
        return { result: { attempt: toStudentAttempt(attempt), pending: false } };
      const { page, pageIndex, state } = assertActiveSection(attempt, pageId, request.expectedRevision);
      const timestamp = this.now();
      if (state.confirmation && translationReservationIsActive(state.confirmation.expiresAt, timestamp))
        return { result: { attempt: toStudentAttempt(attempt), pending: true, retryAfterMs: 2000 } };
      if (!request.acknowledgeIncomplete && sectionIncomplete(attempt, pageId))
        throw new TestServiceError(
          'ATTEMPT_INCOMPLETE_ACK_REQUIRED',
          'Acknowledge the unanswered parts before confirming this section',
          409
        );
      const hash = sectionFingerprint(attempt, pageId);
      if (state.confirmation && state.confirmation.fingerprint !== hash)
        throw new TestServiceError('ATTEMPT_REVISION_CONFLICT', 'The section changed during confirmation', 409);
      const work = translationsToGrade(attempt, pageId)[0];
      if (!work) {
        // Locked sections reject all writes, so their retry receipts are no
        // longer needed. Bound their lifetime to the editable section.
        const { confirmation: _confirmation, saveMutations: _saveMutations, ...rest } = state;
        attempt.sections = { ...attempt.sections, [pageId]: { ...rest, phase: 'confirmed', confirmedAt: timestamp } };
        attempt.updatedAt = timestamp;
        if (pageIndex === attempt.deliveryState.pages.length - 1)
          return { result: { ...(await this.submitInTransaction(transaction, attempt, studentId)), pending: false } };
        this.assertAttemptDocumentSize(attempt);
        transaction.set(ref, attempt);
        return { result: { attempt: toStudentAttempt(attempt), pending: false } };
      }
      const window = attempt.translationGradeRequestWindows[work.exerciseId]?.[String(work.itemIndex)];
      const windowActive = window && translationRequestWindowIsActive(window.windowStartedAt, timestamp);
      if (windowActive && window.count >= MAX_TRANSLATION_GRADING_REQUESTS_PER_WINDOW)
        throw new TestServiceError(
          'ATTEMPT_TRANSLATION_GRADING_RATE_LIMITED',
          'Translation grading is temporarily unavailable. Please retry after the grading window resets.',
          429
        );
      attempt.translationGradeRequestWindows = {
        ...attempt.translationGradeRequestWindows,
        [work.exerciseId]: {
          ...attempt.translationGradeRequestWindows[work.exerciseId],
          [String(work.itemIndex)]: windowActive
            ? { ...window, count: window.count + 1 }
            : { windowStartedAt: timestamp, count: 1 },
        },
      };
      attempt.sections = {
        ...attempt.sections,
        [page.id]: {
          ...state,
          phase: 'confirming',
          confirmation: {
            requestId: state.confirmation?.requestId ?? request.requestId,
            token,
            fingerprint: hash,
            expiresAt: new Date(Date.parse(timestamp) + TRANSLATION_GRADING_RESERVATION_MS).toISOString(),
          },
        },
      };
      this.assertAttemptDocumentSize(attempt);
      transaction.set(ref, attempt);
      return { work, hash };
    });
    if ('result' in prepared && prepared.result) return prepared.result;
    const { work, hash } = prepared;
    if (!work) throw new TestServiceError('ATTEMPT_GRADING_UNAVAILABLE', 'Section confirmation could not start', 503);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    try {
      const output = testTranslationGradingOutputSchema.parse(
        await Promise.race([
          this.gradeTestTranslation(work.request, controller.signal),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => {
              controller.abort();
              reject(new Error('Translation deadline exceeded'));
            }, 90_000);
          }),
        ])
      );
      return await this.db.runTransaction(async transaction => {
        const attempt = await this.getOwnedInProgressAttempt(transaction, ref, studentId);
        const { state } = assertActiveSection(attempt, pageId, request.expectedRevision);
        if (
          state.confirmation?.token !== token ||
          state.confirmation.fingerprint !== hash ||
          sectionFingerprint(attempt, pageId) !== hash
        )
          throw new TestServiceError(
            'ATTEMPT_REVISION_CONFLICT',
            'Section confirmation changed. Reload your attempt.',
            409
          );
        attempt.translationGrades = {
          ...attempt.translationGrades,
          [work.exerciseId]: {
            ...attempt.translationGrades[work.exerciseId],
            [String(work.itemIndex)]: { ...output, translation: work.translation },
          },
        };
        // Checkpoint each grade. The next bounded request resumes or finalizes.
        attempt.sections = {
          ...attempt.sections,
          [pageId]: { ...state, confirmation: { ...state.confirmation, expiresAt: this.now() } },
        };
        this.assertAttemptDocumentSize(attempt);
        this.assertAttemptCanBeSubmitted(attempt);
        transaction.set(ref, attempt);
        return { attempt: toStudentAttempt(attempt), pending: true, retryAfterMs: 0 };
      });
    } catch (error) {
      await this.db
        .runTransaction(async transaction => {
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists) return;
          const attempt = parseAttemptSnapshot(snapshot);
          if (
            attempt.status !== 'in-progress' ||
            attempt.studentId !== studentId ||
            attempt.sections?.[pageId]?.confirmation?.token !== token
          )
            return;
          const { confirmation: _confirmation, ...state } = attempt.sections[pageId];
          attempt.sections = { ...attempt.sections, [pageId]: { ...state, phase: 'review' } };
          transaction.set(ref, attempt);
        })
        .catch(() => undefined); // An interrupted cleanup is recovered by lease expiry.
      if (error instanceof TestServiceError) throw error;
      throw new TestServiceError(
        'ATTEMPT_GRADING_UNAVAILABLE',
        'We could not confirm this section. Your answers are saved. Please retry.',
        503
      );
    } finally {
      if (deadline) clearTimeout(deadline);
    }
  }

  async submitAttempt(attemptId: string, studentId: string): Promise<SubmitTestAttemptResult> {
    const attemptRef = this.attempts.doc(attemptId);

    return this.db.runTransaction(async transaction => {
      const attempt = parseAttemptSnapshot(await transaction.get(attemptRef));
      assertAttemptOwner(attempt, studentId);
      if (attempt.status === 'submitted') {
        return { attempt: toStudentAttempt(attempt) as StudentSubmittedTestAttempt, completionGranted: false };
      }
      if (attempt.flowVersion === 1)
        throw new TestServiceError('ATTEMPT_SECTION_REQUIRED', 'Confirm the final section to submit this attempt', 409);
      return this.submitInTransaction(transaction, attempt, studentId);
    });
  }

  private async submitInTransaction(
    transaction: Transaction,
    attempt: InProgressTestAttempt,
    studentId: string
  ): Promise<SubmitTestAttemptResult> {
    const attemptRef = this.attempts.doc(attempt.id);
    const gradingTimestamp = this.now();
    const translationGradingInProgress = Object.values(attempt.translationGradeReservations).some(reservations =>
      Object.values(reservations).some(reservation =>
        translationReservationIsActive(reservation.expiresAt, gradingTimestamp)
      )
    );
    if (translationGradingInProgress) {
      throw new TestServiceError(
        'ATTEMPT_TRANSLATION_GRADING_IN_PROGRESS',
        'Wait for translation grading to finish before submitting this test',
        409
      );
    }
    if (attempt.origin.kind === 'normal-test') {
      await this.assertNormalTestUnlocked(transaction, studentId, attempt.origin.testId, true);
    }

    let frozenScore: FrozenDeliveryScore;
    let exerciseResults: SubmittedTestAttempt['exerciseResults'];
    let review: TestResultReview;
    try {
      ({ frozenScore, exerciseResults, review } = this.buildReviewForAttempt(attempt, this.now()));
      if (!isTestResultReviewDocumentWithinSizeLimit(review, this.maxReviewDocumentBytes)) {
        throw new TestServiceError(
          'ATTEMPT_TOO_LARGE',
          'This test attempt is too large to submit safely. Please ask an administrator to review its content size.',
          422
        );
      }
    } catch (error) {
      if (error instanceof TestServiceError) throw error;
      throw configurationError(`Could not grade attempt ${attempt.id} from its frozen delivery state`, error);
    }

    const timestamp = review.submittedAt;
    const percentage = (frozenScore.awardedPoints / frozenScore.maxPoints) * 100;
    const outcome =
      attempt.passingPercentage === null
        ? 'score-only'
        : percentage + PASSING_THRESHOLD_TOLERANCE >= attempt.passingPercentage
          ? 'passed'
          : 'not-passed';

    let submitted: SubmittedTestAttempt;
    try {
      submitted = submittedTestAttemptDocumentSchema.parse({
        id: attempt.id,
        studentId: attempt.studentId,
        versionId: attempt.versionId,
        passingPercentage: attempt.passingPercentage,
        origin: attempt.origin,
        startedAt: attempt.startedAt,
        updatedAt: timestamp,
        status: 'submitted',
        ...(attempt.flowVersion === 1
          ? {
              flowVersion: 1,
              confirmedSections: Object.fromEntries(
                Object.entries(attempt.sections!).map(([id, state]) => [id, state.confirmedAt])
              ),
            }
          : {}),
        exerciseResults,
        score: frozenScore.awardedPoints,
        maxScore: frozenScore.maxPoints,
        percentage,
        outcome,
        submittedAt: timestamp,
      }) as SubmittedTestAttempt;
    } catch (error) {
      throw configurationError(`Could not freeze the result of attempt ${attempt.id}`, error);
    }
    this.assertAttemptDocumentSize(submitted);

    // All transaction reads must precede writes: read the completion record
    // before freezing the attempt, clearing the session pointer, and granting
    // sticky normal-flow completion.
    const origin = attempt.origin;
    const completionTestId = origin.kind === 'normal-test' && outcome !== 'not-passed' ? origin.testId : null;
    const completionRef = completionTestId ? this.progress.doc(`${studentId}_${completionTestId}`) : null;
    const sessionRef = this.attemptSessions.doc(getTestAttemptSessionId(studentId, origin));
    const mockResultRef =
      origin.kind === 'mock-test'
        ? this.studentMockResults.doc(getStudentMockResultId(studentId, origin.mockTestId))
        : null;
    const [sessionSnapshot, completionSnapshot, mockResultSnapshot] = await Promise.all([
      transaction.get(sessionRef),
      completionRef ? transaction.get(completionRef) : Promise.resolve(null),
      mockResultRef ? transaction.get(mockResultRef) : Promise.resolve(null),
    ]);

    let shouldClearSession = false;
    if (sessionSnapshot.exists) {
      try {
        const session = parseSessionSnapshot(sessionSnapshot);
        shouldClearSession =
          session.attemptId === attempt.id && session.studentId === studentId && sameOrigin(session.origin, origin);
      } catch (error) {
        console.error(`Attempt session ${sessionSnapshot.id} contains invalid persisted data`, error);
      }
    }

    transaction.set(attemptRef, submitted);
    transaction.set(this.reviews.doc(attempt.id), review);
    if (shouldClearSession) transaction.delete(sessionRef);

    if (mockResultRef && origin.kind === 'mock-test') {
      const existing = mockResultSnapshot?.exists
        ? studentMockResultDocumentSchema.safeParse({ ...mockResultSnapshot.data(), id: mockResultSnapshot.id })
        : null;
      if (!existing?.success || existing.data.latest.submittedAt <= timestamp) {
        transaction.set(
          mockResultRef,
          studentMockResultDocumentSchema.parse({
            id: mockResultRef.id,
            studentId,
            mockTestId: origin.mockTestId,
            latest: {
              attemptId: attempt.id,
              score: submitted.score,
              maxScore: submitted.maxScore,
              percentage: submitted.percentage,
              outcome: submitted.outcome,
              submittedAt: submitted.submittedAt,
            },
          })
        );
      }
    }

    let completionGranted = false;
    if (completionRef && completionSnapshot && completionTestId) {
      const existing = completionSnapshot.data() as Partial<TestUnitCompletionProgress> | undefined;
      if (existing?.status !== 'completed') {
        const record: TestUnitCompletionProgress = {
          userId: studentId,
          lessonId: completionTestId,
          status: 'completed',
          exerciseProgress: [],
          completedAt: typeof existing?.completedAt === 'string' ? existing.completedAt : timestamp,
          lastAccessedAt: timestamp,
          updatedAt: timestamp,
          progressSchemaVersion: 2,
        };
        transaction.set(completionRef, record);
        completionGranted = true;
      }
    }

    return { attempt: toStudentAttempt(submitted) as StudentSubmittedTestAttempt, completionGranted };
  }

  async getAttemptSummary(origin: TestAttemptOrigin, studentId: string): Promise<TestAttemptOriginSummary> {
    const submittedQuery = this.submittedAttemptsQuery(studentId, origin);
    const resultFields = ['score', 'maxScore', 'percentage', 'outcome', 'submittedAt'] as const;

    const [countSnapshot, bestSnapshot, latestSnapshot, sessionSnapshot] = await Promise.all([
      submittedQuery.count().get(),
      submittedQuery
        .orderBy('percentage', 'desc')
        .orderBy('submittedAt', 'desc')
        .select(...resultFields)
        .limit(1)
        .get(),
      submittedQuery
        .orderBy('submittedAt', 'desc')
        .select(...resultFields)
        .limit(1)
        .get(),
      this.attemptSessions.doc(getTestAttemptSessionId(studentId, origin)).get(),
    ]);

    const toResultSummary = (snapshot: DocumentSnapshot): TestAttemptResultSummary => {
      try {
        const projection = submittedAttemptResultProjectionSchema.parse(snapshot.data());
        return { attemptId: snapshot.id, ...projection };
      } catch (error) {
        throw configurationError(`Submitted attempt ${snapshot.id} contains invalid summary fields`, error);
      }
    };

    const activeAttempt = await this.activeAttemptForSession(sessionSnapshot, studentId, origin);
    return {
      origin,
      inProgressAttemptId: activeAttempt?.id ?? null,
      attemptCount: countSnapshot.data().count,
      best: bestSnapshot.docs.length ? toResultSummary(bestSnapshot.docs[0]) : null,
      latest: latestSnapshot.docs.length ? toResultSummary(latestSnapshot.docs[0]) : null,
    };
  }

  private async activeAttemptForSession(
    sessionSnapshot: DocumentSnapshot,
    studentId: string,
    origin: TestAttemptOrigin,
    transaction?: Transaction
  ): Promise<InProgressTestAttempt | null> {
    if (!sessionSnapshot.exists) return null;

    let session: TestAttemptSession;
    try {
      session = parseSessionSnapshot(sessionSnapshot);
    } catch (error) {
      console.error(`Attempt session ${sessionSnapshot.id} contains invalid persisted data`, error);
      return null;
    }
    if (session.studentId !== studentId || !sameOrigin(session.origin, origin)) {
      console.error(`Attempt session ${sessionSnapshot.id} points outside its student/origin scope`);
      return null;
    }

    let activeAttempt: TestAttempt;
    try {
      const attemptRef = this.attempts.doc(session.attemptId);
      activeAttempt = parseAttemptSnapshot(transaction ? await transaction.get(attemptRef) : await attemptRef.get());
    } catch (error) {
      console.error(`Attempt session ${sessionSnapshot.id} points at invalid persisted attempt data`, error);
      return null;
    }
    if (activeAttempt.status !== 'in-progress') return null;
    if (activeAttempt.studentId !== studentId || !sameOrigin(activeAttempt.origin, origin)) {
      console.error(`Attempt session ${sessionSnapshot.id} points at an attempt outside its student/origin scope`);
      return null;
    }
    return activeAttempt;
  }

  async getSubmittedScoreTrend(origin: TestAttemptOrigin, studentId: string, limit = 12) {
    const snapshot = await this.submittedAttemptsQuery(studentId, origin)
      .orderBy('submittedAt', 'desc')
      .limit(limit)
      .select('percentage', 'submittedAt')
      .get();
    return snapshot.docs
      .flatMap(document => {
        const parsed = submittedAttemptTrendProjectionSchema.safeParse(document.data());
        if (!parsed.success) {
          console.error(`Submitted attempt ${document.id} contains invalid trend fields; omitting point`, parsed.error);
          return [];
        }
        return [{ percentage: parsed.data.percentage, submittedAt: parsed.data.submittedAt }];
      })
      .reverse();
  }

  async getActiveAttempt(
    origin: TestAttemptOrigin,
    studentId: string,
    transaction?: Transaction
  ): Promise<StudentInProgressTestAttempt | null> {
    const sessionRef = this.attemptSessions.doc(getTestAttemptSessionId(studentId, origin));
    const sessionSnapshot = transaction ? await transaction.get(sessionRef) : await sessionRef.get();
    const attempt = await this.activeAttemptForSession(sessionSnapshot, studentId, origin, transaction);
    return attempt ? (toStudentAttempt(attempt) as StudentInProgressTestAttempt) : null;
  }

  /** Active attempts are reported as not found so answer keys cannot leak. */
  async getSubmittedResult(attemptId: string, studentId: string): Promise<StudentTestResult> {
    const attempt = parseAttemptSnapshot(await this.attempts.doc(attemptId).get());
    assertAttemptOwner(attempt, studentId);
    if (attempt.status !== 'submitted') {
      throw new TestServiceError('ATTEMPT_NOT_FOUND', 'Test result not found', 404);
    }

    let review: StudentTestResult['review'] = null;
    const reviewSnapshot = await this.reviews.doc(attemptId).get();
    if (reviewSnapshot.exists) {
      try {
        const parsed = testResultReviewDocumentSchema.parse({ ...reviewSnapshot.data(), id: reviewSnapshot.id });
        if (
          parsed.studentId !== studentId ||
          parsed.attemptId !== attempt.id ||
          parsed.versionId !== attempt.versionId ||
          !sameOrigin(parsed.origin, attempt.origin)
        ) {
          throw new Error('Review identity does not match its submitted attempt');
        }
        review = toStudentTestResultReview(parsed);
      } catch (error) {
        console.error(`Could not read the question review for submitted attempt ${attempt.id}`, error);
      }
    } else if (attempt.deliveryState && attempt.answers) {
      // Compatibility for attempts submitted before reviews moved to their own
      // document. The public attempt DTO still omits these legacy internals.
      try {
        review = toStudentTestResultReview(
          buildSubmittedReview({
            attemptId: attempt.id,
            studentId: attempt.studentId,
            versionId: attempt.versionId,
            origin: attempt.origin,
            submittedAt: attempt.submittedAt,
            deliveryState: attempt.deliveryState as FrozenTestDeliveryState,
            answers: attempt.answers,
            translationGrades: attempt.translationGrades ?? {},
            exerciseResults: attempt.exerciseResults,
          })
        );
      } catch (error) {
        console.error(`Could not build the legacy question review for submitted attempt ${attempt.id}`, error);
      }
    }

    return { attempt: toStudentAttempt(attempt) as StudentSubmittedTestAttempt, review };
  }
}

export const testAttemptService = new TestAttemptService();
