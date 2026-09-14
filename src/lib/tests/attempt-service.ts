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
import { createOpenAISafetyIdentifier } from '@/shared/openai/safety';
import { AIRequestThrottleError, consumeAIGlobalRequestQuota } from '@/src/lib/openai/request-throttle';
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
  safetyIdentifier?: string
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
      ...studentAttempt
    } = attempt;
    return studentAttempt;
  }

  const {
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
  consumeGlobalAIQuota?: (requestUnits: number) => Promise<void>;
}

export class TestAttemptService {
  private readonly random: () => number;
  private readonly loadGeneratedWords: GeneratedWordLoader;
  private readonly loadVocabularyPool: VocabularyPoolLoader;
  private readonly maxAttemptDocumentBytes: number;
  private readonly maxReviewDocumentBytes?: number;
  private readonly gradeTestTranslation: TestTranslationGrader;
  private readonly consumeGlobalAIQuota: (requestUnits: number) => Promise<void>;

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
    this.consumeGlobalAIQuota =
      options.consumeGlobalAIQuota ??
      (options.gradeTestTranslation
        ? async () => undefined
        : requestUnits => consumeAIGlobalRequestQuota('test-grading', requestUnits, this.db));
    this.gradeTestTranslation =
      options.gradeTestTranslation ??
      (async (request, safetyIdentifier) => {
        const result = await translationGrader.grade('test', request, undefined, { safetyIdentifier });
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
        if (item.type === 'translation-grading') {
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
        answers[exerciseId] = answer;
        if (item.type === 'translation-grading') delete translationGrades[exerciseId];
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

    try {
      await this.consumeGlobalAIQuota(1);
    } catch (error) {
      await this.releaseTranslationGradeReservation(attemptRef, studentId, request, reservationToken);
      if (error instanceof AIRequestThrottleError) {
        throw new TestServiceError(
          'ATTEMPT_TRANSLATION_GRADING_RATE_LIMITED',
          'Translation grading is at capacity. Please try again after the grading window resets.',
          429
        );
      }
      throw error;
    }

    let gradingOutput: TestTranslationGradingOutput;
    try {
      gradingOutput = testTranslationGradingOutputSchema.parse(
        await this.gradeTestTranslation(preparation.gradingRequest, createOpenAISafetyIdentifier(studentId))
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

  async submitAttempt(attemptId: string, studentId: string): Promise<SubmitTestAttemptResult> {
    const attemptRef = this.attempts.doc(attemptId);

    return this.db.runTransaction(async transaction => {
      const attempt = parseAttemptSnapshot(await transaction.get(attemptRef));
      assertAttemptOwner(attempt, studentId);
      if (attempt.status === 'submitted') {
        return { attempt: toStudentAttempt(attempt) as StudentSubmittedTestAttempt, completionGranted: false };
      }
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
    });
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
