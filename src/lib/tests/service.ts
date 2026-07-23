import { createHash } from 'node:crypto';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  MOCK_TESTS_COLLECTION,
  TEST_ATTEMPTS_COLLECTION,
  TEST_ATTEMPT_SESSIONS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
  USER_PROGRESS_COLLECTION,
} from '@/shared/constants/firestore';
import { isExerciseType, isTestEligibleExerciseType } from '@/src/lib/content/registry';
import { LearningUnitService, LearningUnitServiceError } from '@/src/lib/learning-units/service';
import { testUnitCreateSchema, testUnitSchema } from '@/src/lib/learning-units/schemas';
import { adminDb } from '@/src/services/firebase-admin';
import type { TestUnit, TestUnitCompletionProgress } from '@/src/types/learning-unit';
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
  TestUnitDetail,
  TestUnitSummary,
  TestVersion,
  TestVersionSummary,
} from '@/src/types/test';
import { isAnswerForExercise, parseExerciseAnswer } from './answer-schemas';
import {
  createFrozenTestDeliveryState,
  gradeFrozenTestDelivery,
  sanitizeTestDeliveryState,
  type FrozenDeliveryScore,
  type FrozenTestDeliveryState,
} from './delivery';
import { getTestVersionSummaryFields, selectLeastUsedTestVersion } from './domain';
import { TestServiceError } from './errors';
import { estimateFirestoreDocumentBytes } from './firestore-size';
import type { GeneratedWordLoader } from './generated-exercises';
import { createFirestoreGeneratedWordLoader } from './generated-word-loader.server';
import {
  createTestWithVersionSchema,
  mockTestDocumentSchema,
  saveTestAttemptAnswerInputSchema,
  startTestAttemptInputSchema,
  submittedAttemptResultProjectionSchema,
  submittedTestAttemptDocumentSchema,
  testAttemptDocumentSchema,
  testAttemptSessionDocumentSchema,
  testVersionDocumentSchema,
  testVersionInputSchema,
  testVersionSummaryDocumentSchema,
  updateTestUnitInputSchema,
  updateTestWithVersionInputSchema,
  updateTestVersionInputSchema,
  type CreateTestWithVersionInput,
  type SaveTestAttemptAnswerInput,
  type StartTestAttemptInput,
  type TestVersionInput,
  type UpdateTestUnitInput,
  type UpdateTestWithVersionInput,
  type UpdateTestVersionInput,
} from './schemas';

export { TestServiceError } from './errors';

export const MAX_TEST_ATTEMPT_DOCUMENT_BYTES = 900 * 1024;

/**
 * Tolerates floating-point representation error at the passing boundary while
 * remaining orders of magnitude below the smallest meaningful score gap.
 */
export const PASSING_THRESHOLD_TOLERANCE = 1e-9;

export const TEST_VERSION_SUMMARY_FIELDS = [
  'name',
  'totalPages',
  'totalItems',
  'totalExercises',
  'totalPoints',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
] as const;

const chunk = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
};

const originId = (origin: TestAttemptOrigin) => (origin.kind === 'normal-test' ? origin.testId : origin.mockTestId);

const sameOrigin = (left: TestAttemptOrigin, right: TestAttemptOrigin) =>
  left.kind === right.kind && originId(left) === originId(right);

export function getTestAttemptSessionId(studentId: string, origin: TestAttemptOrigin): string {
  return createHash('sha256')
    .update(JSON.stringify([studentId, origin.kind, originId(origin)]))
    .digest('hex');
}

function parseVersionSnapshot(snapshot: DocumentSnapshot): TestVersion {
  if (!snapshot.exists) {
    throw new TestServiceError('TEST_VERSION_NOT_FOUND', 'Test version not found', 404);
  }

  const parsed = testVersionDocumentSchema.safeParse({ ...snapshot.data(), id: snapshot.id });
  if (!parsed.success) {
    throw new TestServiceError(
      'STALE_TEST_VERSION_DATA',
      `Test version ${snapshot.id} contains invalid persisted data`,
      409
    );
  }
  return parsed.data as TestVersion;
}

function parseVersionSummarySnapshot(snapshot: DocumentSnapshot): TestVersionSummary {
  const parsed = testVersionSummaryDocumentSchema.safeParse({ ...snapshot.data(), id: snapshot.id });
  if (!parsed.success) {
    throw new TestServiceError(
      'STALE_TEST_VERSION_DATA',
      `Test version ${snapshot.id} contains invalid persisted summary data`,
      409
    );
  }
  return parsed.data;
}

function parseMockSnapshot(snapshot: DocumentSnapshot): MockTest {
  if (!snapshot.exists) {
    throw new TestServiceError('MOCK_TEST_NOT_FOUND', 'Mock test not found', 404);
  }

  const parsed = mockTestDocumentSchema.safeParse({ ...snapshot.data(), id: snapshot.id });
  if (!parsed.success) {
    console.error(`Mock test ${snapshot.id} contains invalid persisted data`, parsed.error.flatten());
    throw new TestServiceError(
      'TEST_CONFIGURATION_ERROR',
      'This test is temporarily unavailable. Please ask an administrator to review its configuration.',
      409
    );
  }
  return parsed.data as MockTest;
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

function toTestSummary(test: TestUnit, versions: TestVersionSummary[]): TestUnitSummary {
  const totals = versions.map(version => version.totalPoints);
  const { rotationVersions: _rotationVersions, ...metadata } = test;
  return {
    ...metadata,
    rotationVersionCount: versions.length,
    minTotalPoints: totals.length ? Math.min(...totals) : 0,
    maxTotalPoints: totals.length ? Math.max(...totals) : 0,
  };
}

export interface TestServiceOptions {
  random?: () => number;
  loadGeneratedWords?: GeneratedWordLoader;
  maxAttemptDocumentBytes?: number;
}

export class TestService {
  private readonly learningUnits: LearningUnitService;
  private readonly random: () => number;
  private readonly loadGeneratedWords: GeneratedWordLoader;
  private readonly maxAttemptDocumentBytes: number;

  constructor(
    private readonly db: Firestore = adminDb,
    private readonly now: () => string = () => new Date().toISOString(),
    options: TestServiceOptions = {}
  ) {
    this.learningUnits = new LearningUnitService(db);
    this.random = options.random ?? Math.random;
    this.loadGeneratedWords = options.loadGeneratedWords ?? createFirestoreGeneratedWordLoader(db);
    this.maxAttemptDocumentBytes = options.maxAttemptDocumentBytes ?? MAX_TEST_ATTEMPT_DOCUMENT_BYTES;
  }

  private get versions() {
    return this.db.collection(TEST_VERSIONS_COLLECTION);
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

  private async getVersionSummaries(versionIds: string[]): Promise<TestVersionSummary[]> {
    if (versionIds.length === 0) return [];

    const snapshots = await Promise.all(
      chunk([...new Set(versionIds)], 100).map(ids =>
        this.db.getAll(...ids.map(id => this.versions.doc(id)), { fieldMask: [...TEST_VERSION_SUMMARY_FIELDS] })
      )
    );
    const byId = new Map(
      snapshots.flatMap(documents => documents.map(doc => [doc.id, parseVersionSummarySnapshot(doc)] as const))
    );

    return versionIds.map(versionId => {
      const version = byId.get(versionId);
      if (!version) {
        throw new TestServiceError('STALE_TEST_VERSION_DATA', `Test references missing version ${versionId}`, 409);
      }
      return version;
    });
  }

  private buildVersion(
    input: TestVersionInput,
    actorId: string,
    created?: Pick<TestVersion, 'createdAt' | 'createdBy'>
  ) {
    const timestamp = this.now();
    return testVersionDocumentSchema.parse({
      ...input,
      ...getTestVersionSummaryFields(input.pages),
      createdAt: created?.createdAt ?? timestamp,
      createdBy: created?.createdBy ?? actorId,
      updatedAt: timestamp,
      updatedBy: actorId,
    }) as TestVersion;
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

  private configurationError(message: string, error?: unknown): TestServiceError {
    console.error(message, error ?? '');
    return new TestServiceError(
      'TEST_CONFIGURATION_ERROR',
      'This test is temporarily unavailable. Please ask an administrator to review its configuration.',
      409
    );
  }

  private parseAttemptVersion(snapshot: DocumentSnapshot, origin: TestAttemptOrigin): TestVersion {
    try {
      return parseVersionSnapshot(snapshot);
    } catch (error) {
      throw this.configurationError(
        `Attempt origin ${origin.kind}:${originId(origin)} references an unavailable version ${snapshot.id}`,
        error
      );
    }
  }

  private assertAttemptDocumentSize(attempt: InProgressTestAttempt) {
    let estimatedBytes: number;
    try {
      estimatedBytes = estimateFirestoreDocumentBytes(attempt as unknown as Record<string, unknown>);
    } catch (error) {
      throw this.configurationError(`Could not serialize attempt ${attempt.id}`, error);
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
      transaction.get(this.learningUnits.testRef(origin.testId)),
      transaction.get(historyQuery),
    ]);

    let test: TestUnit;
    try {
      test = this.learningUnits.parseTestSnapshot(testSnapshot);
    } catch (error) {
      if (error instanceof LearningUnitServiceError && error.code === 'TEST_NOT_FOUND') {
        throw new TestServiceError('TEST_NOT_AVAILABLE', 'Test is not available', 404);
      }
      throw this.configurationError(`Normal test ${origin.testId} contains invalid persisted data`, error);
    }

    if (!test.isLive) {
      throw new TestServiceError('TEST_NOT_AVAILABLE', 'Test is not available', 404);
    }

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
        throw this.configurationError(
          `Normal test ${origin.testId} references an unavailable rotation version ${summarySnapshot.id}`,
          error
        );
      }
    }

    const history = historySnapshot.docs.map(snapshot => {
      const data = snapshot.data();
      if (typeof data.versionId !== 'string' || typeof data.submittedAt !== 'string') {
        throw this.configurationError(
          `Submitted attempt ${snapshot.id} contains invalid version-selection history fields`
        );
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
      throw this.configurationError(`Normal test ${origin.testId} has no valid rotation selection`, error);
    }

    const version = this.parseAttemptVersion(await transaction.get(this.versions.doc(versionId)), origin);
    return { version, passingPercentage: test.passingPercentage };
  }

  async listTests(): Promise<TestUnitSummary[]> {
    const tests = await this.learningUnits.listTests();
    const summaries = await this.getVersionSummaries(
      tests.flatMap(test => test.rotationVersions.map(reference => reference.versionId))
    );
    const summariesById = new Map(summaries.map(version => [version.id, version]));

    return tests.map(test =>
      toTestSummary(
        test,
        test.rotationVersions.map(reference => summariesById.get(reference.versionId)!)
      )
    );
  }

  async getTest(testId: string): Promise<TestUnitDetail> {
    const test = await this.learningUnits.getTest(testId);
    const versions = await this.getVersionSummaries(test.rotationVersions.map(reference => reference.versionId));
    return { test, versions };
  }

  async createTestWithVersion(input: CreateTestWithVersionInput, actorId: string) {
    const parsed = createTestWithVersionSchema.parse(input);
    const testRef = this.learningUnits.testRef(parsed.test.id);
    const versionRef = this.versions.doc(parsed.version.id);

    return this.db.runTransaction(async transaction => {
      const [existingTest, existingVersion] = await Promise.all([
        transaction.get(testRef),
        transaction.get(versionRef),
      ]);
      if (existingTest.exists) {
        throw new TestServiceError('TEST_ALREADY_EXISTS', 'A test with this ID already exists', 409);
      }
      if (existingVersion.exists) {
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'A test version with this ID already exists', 409);
      }

      const timestamp = this.now();
      const version = this.buildVersion(parsed.version, actorId);
      const test = testUnitCreateSchema.parse({
        ...parsed.test,
        kind: 'test',
        rotationVersions: [{ versionId: version.id }],
        isLive: false,
        liveOrder: null,
        publishedAt: null,
        publishedBy: null,
        createdAt: timestamp,
        createdBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      }) as TestUnit;

      transaction.create(versionRef, version);
      transaction.create(testRef, test);
      return { test, version };
    });
  }

  async updateTest(testId: string, input: UpdateTestUnitInput, actorId: string): Promise<TestUnit> {
    const changes = updateTestUnitInputSchema.parse(input);
    const ref = this.learningUnits.testRef(testId);

    return this.db.runTransaction(async transaction => {
      const current = this.learningUnits.parseTestSnapshot(await transaction.get(ref));
      const updated = testUnitSchema.parse({
        ...current,
        ...changes,
        updatedAt: this.now(),
        updatedBy: actorId,
      }) as TestUnit;
      transaction.set(ref, updated);
      return updated;
    });
  }

  async updateTestWithVersion(testId: string, input: UpdateTestWithVersionInput, actorId: string) {
    const changes = updateTestWithVersionInputSchema.parse(input);
    const testRef = this.learningUnits.testRef(testId);
    const versionRef = this.versions.doc(changes.versionId);

    return this.db.runTransaction(async transaction => {
      const [testSnapshot, versionSnapshot] = await Promise.all([
        transaction.get(testRef),
        transaction.get(versionRef),
      ]);
      const currentTest = this.learningUnits.parseTestSnapshot(testSnapshot);
      if (!currentTest.rotationVersions.some(reference => reference.versionId === changes.versionId)) {
        throw new TestServiceError('TEST_VERSION_NOT_IN_TEST', 'Test version is not assigned to this test', 409);
      }
      const currentVersion = parseVersionSnapshot(versionSnapshot);
      const timestamp = this.now();
      const test = testUnitSchema.parse({
        ...currentTest,
        ...changes.test,
        updatedAt: timestamp,
        updatedBy: actorId,
      }) as TestUnit;
      const version = this.buildVersion({ id: changes.versionId, ...changes.version }, actorId, {
        createdAt: currentVersion.createdAt,
        createdBy: currentVersion.createdBy,
      });

      transaction.set(testRef, test);
      transaction.set(versionRef, version);
      return { test, version };
    });
  }

  async listTestVersions(testId: string): Promise<TestVersionSummary[]> {
    return (await this.getTest(testId)).versions;
  }

  async addTestVersion(testId: string, input: TestVersionInput, actorId: string) {
    const parsed = testVersionInputSchema.parse(input);
    const testRef = this.learningUnits.testRef(testId);
    const versionRef = this.versions.doc(parsed.id);

    return this.db.runTransaction(async transaction => {
      const [testSnapshot, existingVersion] = await Promise.all([
        transaction.get(testRef),
        transaction.get(versionRef),
      ]);
      const currentTest = this.learningUnits.parseTestSnapshot(testSnapshot);
      if (existingVersion.exists) {
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'A test version with this ID already exists', 409);
      }

      const version = this.buildVersion(parsed, actorId);
      const test = testUnitSchema.parse({
        ...currentTest,
        rotationVersions: [...currentTest.rotationVersions, { versionId: version.id }],
        updatedAt: this.now(),
        updatedBy: actorId,
      }) as TestUnit;

      transaction.create(versionRef, version);
      transaction.set(testRef, test);
      return { test, version };
    });
  }

  async getTestVersion(versionId: string): Promise<TestVersion> {
    return parseVersionSnapshot(await this.versions.doc(versionId).get());
  }

  async updateTestVersion(versionId: string, input: UpdateTestVersionInput, actorId: string): Promise<TestVersion> {
    const changes = updateTestVersionInputSchema.parse(input);
    const ref = this.versions.doc(versionId);

    return this.db.runTransaction(async transaction => {
      const current = parseVersionSnapshot(await transaction.get(ref));
      const version = this.buildVersion({ id: versionId, ...changes }, actorId, {
        createdAt: current.createdAt,
        createdBy: current.createdBy,
      });
      transaction.set(ref, version);
      return version;
    });
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
          throw this.configurationError(`Attempt session scope collision for ${sessionId}`);
        }

        const activeAttemptSnapshot = await transaction.get(this.attempts.doc(session.attemptId));
        if (activeAttemptSnapshot.exists) {
          const activeAttempt = parseAttemptSnapshot(activeAttemptSnapshot);
          if (activeAttempt.studentId !== studentId || !sameOrigin(activeAttempt.origin, origin)) {
            throw this.configurationError(`Attempt session ${sessionId} points outside its student/origin scope`);
          }
          if (activeAttempt.status === 'in-progress') {
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
        deliveryState = await createFrozenTestDeliveryState(version, this.loadGeneratedWords);
      } catch (error) {
        throw this.configurationError(
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
          deliveryState,
          startedAt: timestamp,
          updatedAt: timestamp,
        }) as InProgressTestAttempt;
      } catch (error) {
        throw this.configurationError(`Could not build attempt for version ${version.id}`, error);
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

  async getAttempt(attemptId: string, studentId: string): Promise<StudentTestAttempt> {
    const attempt = parseAttemptSnapshot(await this.attempts.doc(attemptId).get());
    assertAttemptOwner(attempt, studentId);
    return toStudentAttempt(attempt);
  }

  async saveAttemptAnswer(
    attemptId: string,
    input: SaveTestAttemptAnswerInput,
    studentId: string
  ): Promise<StudentInProgressTestAttempt> {
    const changes = saveTestAttemptAnswerInputSchema.parse(input);
    const attemptRef = this.attempts.doc(attemptId);

    return this.db.runTransaction(async transaction => {
      const attempt = parseAttemptSnapshot(await transaction.get(attemptRef));
      assertAttemptOwner(attempt, studentId);
      if (attempt.status !== 'in-progress') {
        throw new TestServiceError('ATTEMPT_NOT_IN_PROGRESS', 'This test attempt has already been submitted', 409);
      }

      const item = attempt.deliveryState.pages
        .flatMap(page => page.items)
        .find(candidate => candidate.id === changes.exerciseId);
      if (!item || !isExerciseType(item.type) || !isTestEligibleExerciseType(item.type)) {
        throw new TestServiceError(
          'ATTEMPT_ANSWER_INVALID',
          'The answer does not belong to an exercise in this attempt',
          400
        );
      }

      const answers = { ...attempt.answers };
      if (changes.answer === null) {
        delete answers[changes.exerciseId];
      } else {
        let answer;
        try {
          answer = parseExerciseAnswer(changes.answer);
        } catch {
          throw new TestServiceError('ATTEMPT_ANSWER_INVALID', 'The committed answer has an invalid shape', 400);
        }
        if (!isAnswerForExercise(answer, item.type)) {
          throw new TestServiceError('ATTEMPT_ANSWER_INVALID', `The committed answer must have type ${item.type}`, 400);
        }
        answers[changes.exerciseId] = answer;
      }

      const updated = testAttemptDocumentSchema.parse({
        ...attempt,
        answers,
        updatedAt: this.now(),
      }) as InProgressTestAttempt;
      this.assertAttemptDocumentSize(updated);
      transaction.set(attemptRef, updated);
      return toStudentAttempt(updated) as StudentInProgressTestAttempt;
    });
  }

  async submitAttempt(attemptId: string, studentId: string): Promise<SubmitTestAttemptResult> {
    const attemptRef = this.attempts.doc(attemptId);

    return this.db.runTransaction(async transaction => {
      const attempt = parseAttemptSnapshot(await transaction.get(attemptRef));
      assertAttemptOwner(attempt, studentId);
      if (attempt.status === 'submitted') {
        // Idempotent resubmission: return the frozen result without regrading.
        return { attempt: toStudentAttempt(attempt) as StudentSubmittedTestAttempt, completionGranted: false };
      }

      let frozenScore: FrozenDeliveryScore;
      try {
        frozenScore = gradeFrozenTestDelivery(attempt.deliveryState as FrozenTestDeliveryState, attempt.answers);
      } catch (error) {
        throw this.configurationError(`Could not grade attempt ${attempt.id} from its frozen delivery state`, error);
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
        throw this.configurationError(`Could not freeze the result of attempt ${attempt.id}`, error);
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
        throw this.configurationError(`Submitted attempt ${snapshot.id} contains invalid summary fields`, error);
      }
    };

    return {
      origin,
      inProgressAttemptId: await this.activeAttemptIdForSession(sessionSnapshot, studentId, origin),
      attemptCount: countSnapshot.data().count,
      best: bestSnapshot.docs.length ? toResultSummary(bestSnapshot.docs[0]) : null,
      latest: latestSnapshot.docs.length ? toResultSummary(latestSnapshot.docs[0]) : null,
    };
  }

  private async activeAttemptIdForSession(
    sessionSnapshot: DocumentSnapshot,
    studentId: string,
    origin: TestAttemptOrigin
  ): Promise<string | null> {
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
      activeAttempt = parseAttemptSnapshot(await this.attempts.doc(session.attemptId).get());
    } catch (error) {
      console.error(`Attempt session ${sessionSnapshot.id} points at invalid persisted attempt data`, error);
      return null;
    }
    if (activeAttempt.status !== 'in-progress') return null;
    if (activeAttempt.studentId !== studentId || !sameOrigin(activeAttempt.origin, origin)) {
      console.error(`Attempt session ${sessionSnapshot.id} points at an attempt outside its student/origin scope`);
      return null;
    }
    return activeAttempt.id;
  }

  /**
   * Authorized repair for a trapped session scope. A valid resumable attempt is
   * never abandoned (the exit from an unwanted attempt is submitting it), but a
   * pointer that is corrupt, out of scope, or aimed at a missing, corrupt, or
   * already submitted attempt is cleared so the student can start again. The
   * pointed-at attempt document is always preserved for diagnosis.
   */
  async recoverAttemptSession(input: StartTestAttemptInput, studentId: string): Promise<{ recovered: boolean }> {
    const { origin } = startTestAttemptInputSchema.parse(input) as { origin: TestAttemptOrigin };
    const sessionId = getTestAttemptSessionId(studentId, origin);
    const sessionRef = this.attemptSessions.doc(sessionId);

    return this.db.runTransaction(async transaction => {
      const sessionSnapshot = await transaction.get(sessionRef);
      if (!sessionSnapshot.exists) return { recovered: false };

      let session: TestAttemptSession;
      try {
        session = parseSessionSnapshot(sessionSnapshot);
      } catch (error) {
        console.error(`Clearing corrupt attempt session ${sessionId}`, error);
        transaction.delete(sessionRef);
        return { recovered: true };
      }

      if (session.studentId !== studentId || !sameOrigin(session.origin, origin)) {
        console.error(`Clearing attempt session ${sessionId} outside its student/origin scope`);
        transaction.delete(sessionRef);
        return { recovered: true };
      }

      const attemptSnapshot = await transaction.get(this.attempts.doc(session.attemptId));
      if (attemptSnapshot.exists) {
        let attempt: TestAttempt;
        try {
          attempt = parseAttemptSnapshot(attemptSnapshot);
        } catch (error) {
          console.error(
            `Clearing attempt session ${sessionId} pointing at corrupt attempt ${session.attemptId}`,
            error
          );
          transaction.delete(sessionRef);
          return { recovered: true };
        }

        if (attempt.status === 'in-progress' && attempt.studentId === studentId && sameOrigin(attempt.origin, origin)) {
          try {
            // An attempt whose frozen delivery can no longer be graded can never
            // be submitted, so it is treated as recoverable corruption.
            gradeFrozenTestDelivery(attempt.deliveryState as FrozenTestDeliveryState, attempt.answers);
            return { recovered: false };
          } catch (error) {
            console.error(`Clearing attempt session ${sessionId} pointing at ungradable attempt ${attempt.id}`, error);
            transaction.delete(sessionRef);
            return { recovered: true };
          }
        }

        console.error(
          `Clearing stale attempt session ${sessionId} pointing at ${attempt.status} attempt ${attempt.id}`
        );
        transaction.delete(sessionRef);
        return { recovered: true };
      }

      console.error(`Clearing attempt session ${sessionId} pointing at missing attempt ${session.attemptId}`);
      transaction.delete(sessionRef);
      return { recovered: true };
    });
  }
}

export const testService = new TestService();
