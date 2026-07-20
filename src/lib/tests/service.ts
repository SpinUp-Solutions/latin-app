import { createHash } from 'node:crypto';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  MOCK_TESTS_COLLECTION,
  TEST_ATTEMPTS_COLLECTION,
  TEST_ATTEMPT_SESSIONS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
} from '@/shared/constants/firestore';
import { isExerciseType, isTestEligibleExerciseType } from '@/src/lib/content/registry';
import { LearningUnitService, LearningUnitServiceError } from '@/src/lib/learning-units/service';
import { testUnitCreateSchema, testUnitSchema } from '@/src/lib/learning-units/schemas';
import { adminDb } from '@/src/services/firebase-admin';
import type { TestUnit } from '@/src/types/learning-unit';
import type {
  InProgressTestAttempt,
  MockTest,
  StartTestAttemptResult,
  StudentInProgressTestAttempt,
  StudentTestAttempt,
  TestAttempt,
  TestAttemptOrigin,
  TestAttemptSession,
  TestUnitDetail,
  TestUnitSummary,
  TestVersion,
  TestVersionSummary,
} from '@/src/types/test';
import { isAnswerForExercise, parseExerciseAnswer } from './answer-schemas';
import { createFrozenTestDeliveryState, sanitizeTestDeliveryState, type FrozenTestDeliveryState } from './delivery';
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

  private submittedHistoryQuery(studentId: string, origin: Extract<TestAttemptOrigin, { kind: 'normal-test' }>) {
    return this.attempts
      .where('studentId', '==', studentId)
      .where('origin.kind', '==', origin.kind)
      .where('origin.testId', '==', origin.testId)
      .where('status', '==', 'submitted')
      .select('versionId', 'submittedAt');
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
        'This test is too large to start safely. Please ask an administrator to reduce its content size.',
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

    const rotationVersions = await Promise.all(
      test.rotationVersions.map(async reference =>
        this.parseAttemptVersion(await transaction.get(this.versions.doc(reference.versionId)), origin)
      )
    );
    const versionsById = new Map(rotationVersions.map(version => [version.id, version]));

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

    const version = versionsById.get(versionId);
    if (!version) {
      throw this.configurationError(`Normal test ${origin.testId} selected an unvalidated rotation version ${versionId}`);
    }
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
}

export const testService = new TestService();
