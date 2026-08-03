import { createHash } from 'node:crypto';
import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  DEFAULT_LEARNING_PATH_ID,
  LEARNING_PATHS_COLLECTION,
  LEARNING_UNITS_COLLECTION,
  MOCK_TESTS_COLLECTION,
  TEST_ATTEMPTS_COLLECTION,
  TEST_ATTEMPT_SESSIONS_COLLECTION,
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
  GradeTestTranslationResult,
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
  TestVersion,
} from '@/src/types/test';
import { isAnswerForExercise, parseExerciseAnswer } from './answer-schemas';
import {
  createFrozenTestDeliveryState,
  gradeFrozenTestDelivery,
  scoreFrozenTranslationExercises,
  sanitizeTestDeliveryState,
  type FrozenDeliveryScore,
  type FrozenTestDeliveryState,
} from './delivery';
import {
  gradeTestTranslation,
  testTranslationGradingOutputSchema,
  type TestTranslationGradingOutput,
} from '@/shared/openai/translation-grading';
import type { TranslationGradingRequest } from '@/shared/openai/types';
import { richTextToPlainText } from '@/src/utils/exercises/helpers';
import { TEST_VERSION_SUMMARY_FIELDS, selectLeastUsedTestVersion, validateTestAssignmentGraph } from './domain';
import { TestServiceError } from './errors';
import { estimateFirestoreDocumentBytes } from './firestore-size';
import type { GeneratedWordLoader } from './generated-exercises';
import { createFirestoreGeneratedWordLoader } from './generated-word-loader.server';
import {
  createFirestoreVocabularyPoolLoader,
  type VocabularyPoolLoader,
} from './vocabulary-pool-loader.server';
import {
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
  submittedTestAttemptDocumentSchema,
  testAttemptDocumentSchema,
  testAttemptSessionDocumentSchema,
  type SaveTestAttemptAnswersInput,
  type GradeTestTranslationInput,
  type StartTestAttemptInput,
} from './schemas';

export const MAX_TEST_ATTEMPT_DOCUMENT_BYTES = 900 * 1024;

/**
 * Tolerates floating-point representation error at the passing boundary while
 * remaining orders of magnitude below the smallest meaningful score gap.
 */
export const PASSING_THRESHOLD_TOLERANCE = 1e-9;

type TestTranslationGrader = (request: TranslationGradingRequest) => Promise<TestTranslationGradingOutput>;

const originId = (origin: TestAttemptOrigin) => (origin.kind === 'normal-test' ? origin.testId : origin.mockTestId);

const sameOrigin = (left: TestAttemptOrigin, right: TestAttemptOrigin) =>
  left.kind === right.kind && originId(left) === originId(right);

export function getTestAttemptSessionId(studentId: string, origin: TestAttemptOrigin): string {
  return createHash('sha256')
    .update(JSON.stringify([studentId, origin.kind, originId(origin)]))
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
    const { studentId: _studentId, ...studentAttempt } = attempt;
    return studentAttempt;
  }

  const { studentId: _studentId, deliveryState, ...studentAttempt } = attempt;
  return {
    ...studentAttempt,
    delivery: sanitizeTestDeliveryState(deliveryState as FrozenTestDeliveryState),
  };
}

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
  gradeTestTranslation?: TestTranslationGrader;
}

export class TestAttemptService {
  private readonly random: () => number;
  private readonly loadGeneratedWords: GeneratedWordLoader;
  private readonly loadVocabularyPool: VocabularyPoolLoader;
  private readonly maxAttemptDocumentBytes: number;
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
    this.gradeTestTranslation =
      options.gradeTestTranslation ??
      (async request => {
        const result = await gradeTestTranslation(request);
        if (!result.success || !result.data) throw new Error('The translation grader returned no usable score');
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

  private assertAttemptDocumentSize(attempt: InProgressTestAttempt) {
    let estimatedBytes: number;
    try {
      estimatedBytes = estimateFirestoreDocumentBytes(attempt as unknown as Record<string, unknown>);
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
      let deliveryState: FrozenTestDeliveryState;
      try {
        deliveryState = await createFrozenTestDeliveryState(
          version,
          this.loadGeneratedWords,
          this.loadVocabularyPool
        );
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
          deliveryState,
          startedAt: timestamp,
          updatedAt: timestamp,
        }) as InProgressTestAttempt;
      } catch (error) {
        throw configurationError(`Could not build attempt for version ${version.id}`, error);
      }
      this.assertAttemptDocumentSize(attempt);

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
      const itemsById = new Map(
        attempt.deliveryState.pages.flatMap(page => page.items).map(item => [item.id, item] as const)
      );

      for (const [exerciseId, rawAnswer] of Object.entries(changes.answers)) {
        const item = itemsById.get(exerciseId);
        if (!item || !isExerciseType(item.type) || !isTestEligibleExerciseType(item.type)) {
          throw new TestServiceError(
            'ATTEMPT_ANSWER_INVALID',
            'An answer does not belong to an exercise in this attempt',
            400
          );
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
        updatedAt: this.now(),
      }) as InProgressTestAttempt;
      this.assertAttemptDocumentSize(updated);
      transaction.set(attemptRef, updated);
      return toStudentAttempt(updated) as StudentInProgressTestAttempt;
    });
  }

  async gradeTranslationItem(
    attemptId: string,
    input: GradeTestTranslationInput,
    studentId: string
  ): Promise<GradeTestTranslationResult> {
    const request = gradeTestTranslationInputSchema.parse(input);
    const attemptRef = this.attempts.doc(attemptId);

    const gradingRequest = await this.db.runTransaction(async transaction => {
      const attempt = await this.getOwnedInProgressAttempt(transaction, attemptRef, studentId);
      const { exercise, item } = getTranslationExerciseItem(attempt, request);

      return {
        sourceText: richTextToPlainText(item.latinText),
        userTranslation: request.userTranslation,
        direction: exercise.translationDirection ?? 'latin-to-english',
      } satisfies TranslationGradingRequest;
    });

    let gradingOutput: TestTranslationGradingOutput;
    try {
      gradingOutput = testTranslationGradingOutputSchema.parse(await this.gradeTestTranslation(gradingRequest));
    } catch (error) {
      console.error(`Could not grade translation item for attempt ${attemptId}`, error);
      throw new TestServiceError(
        'ATTEMPT_GRADING_UNAVAILABLE',
        'Translation grading is temporarily unavailable. Please try checking the translation again.',
        503
      );
    }

    return this.db.runTransaction(async transaction => {
      const attempt = await this.getOwnedInProgressAttempt(transaction, attemptRef, studentId);
      const { exercise } = getTranslationExerciseItem(attempt, request);

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
        updatedAt: this.now(),
      }) as InProgressTestAttempt;
      this.assertAttemptDocumentSize(updated);
      transaction.set(attemptRef, updated);

      return {
        attempt: toStudentAttempt(updated) as StudentInProgressTestAttempt,
        grade,
      };
    });
  }

  async submitAttempt(attemptId: string, studentId: string): Promise<SubmitTestAttemptResult> {
    const attemptRef = this.attempts.doc(attemptId);

    return this.db.runTransaction(async transaction => {
      const attempt = parseAttemptSnapshot(await transaction.get(attemptRef));
      assertAttemptOwner(attempt, studentId);
      if (attempt.status === 'submitted') {
        return { attempt: toStudentAttempt(attempt) as StudentSubmittedTestAttempt, completionGranted: false };
      }
      if (attempt.origin.kind === 'normal-test') {
        await this.assertNormalTestUnlocked(transaction, studentId, attempt.origin.testId, true);
      }

      const translationScoreOverrides = scoreFrozenTranslationExercises(
        attempt.deliveryState as FrozenTestDeliveryState,
        attempt.answers,
        attempt.translationGrades
      );
      let frozenScore: FrozenDeliveryScore;
      try {
        frozenScore = gradeFrozenTestDelivery(
          attempt.deliveryState as FrozenTestDeliveryState,
          attempt.answers,
          translationScoreOverrides
        );
      } catch (error) {
        throw configurationError(`Could not grade attempt ${attempt.id} from its frozen delivery state`, error);
      }

      const timestamp = this.now();
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
          exerciseResults: Object.fromEntries(
            frozenScore.exerciseResults.map(result => [
              result.exerciseId,
              { title: result.title, awardedPoints: result.awardedPoints, maxPoints: result.maxPoints },
            ])
          ),
          score: frozenScore.awardedPoints,
          maxScore: frozenScore.maxPoints,
          percentage,
          outcome,
          submittedAt: timestamp,
        }) as SubmittedTestAttempt;
      } catch (error) {
        throw configurationError(`Could not freeze the result of attempt ${attempt.id}`, error);
      }

      // All transaction reads must precede writes: read the completion record
      // before freezing the attempt, clearing the session pointer, and granting
      // sticky normal-flow completion.
      const origin = attempt.origin;
      const completionTestId = origin.kind === 'normal-test' && outcome !== 'not-passed' ? origin.testId : null;
      const completionRef = completionTestId ? this.progress.doc(`${studentId}_${completionTestId}`) : null;
      const sessionRef = this.attemptSessions.doc(getTestAttemptSessionId(studentId, origin));
      const [sessionSnapshot, completionSnapshot] = await Promise.all([
        transaction.get(sessionRef),
        completionRef ? transaction.get(completionRef) : Promise.resolve(null),
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
      if (shouldClearSession) transaction.delete(sessionRef);

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
}

export const testAttemptService = new TestAttemptService();
