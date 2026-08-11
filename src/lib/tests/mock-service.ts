import { createHash } from 'node:crypto';
import type { DocumentSnapshot, Firestore, QuerySnapshot, Transaction } from 'firebase-admin/firestore';
import {
  DEFAULT_LEARNING_PATH_ID,
  LEARNING_PATHS_COLLECTION,
  LEARNING_UNITS_COLLECTION,
  MOCK_TEST_ORDERING_COLLECTION,
  MOCK_TEST_ORDERING_DOCUMENT_ID,
  MOCK_TESTS_COLLECTION,
  TEST_VERSION_DRAFTS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
} from '@/shared/constants/firestore';
import { learningPathDocumentSchema, testUnitSchema } from '@/src/lib/learning-units/schemas';
import { adminDb } from '@/src/services/firebase-admin';
import type { TestUnit } from '@/src/types/learning-unit';
import type {
  MockTest,
  MockTestSummary,
  StudentMockTestDetail,
  StudentMockTestSummary,
  TestVersion,
  TestVersionSummary,
} from '@/src/types/test';
import { regeneratePageIds } from '@/src/utils/idUtils';
import { assertVocabularyPoolAssignmentsAllowedInTransaction } from '@/src/lib/vocabulary-pools/assignment.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { TestAttemptService } from './attempt-service';
import { TestServiceError } from './errors';
import {
  buildVersion,
  configurationError,
  getVersionSummaries,
  parseMockSnapshot,
  parseTestSnapshot,
  parseVersionSnapshot,
} from './persistence';
import {
  assignVersionToMockInputSchema,
  createStandaloneMockInputSchema,
  duplicateStandaloneMockVersionIntoTestInputSchema,
  mockTestDocumentSchema,
  moveStandaloneMockToTestInputSchema,
  reactivateStandaloneMockInputSchema,
  reorderMockTestsInputSchema,
  testVersionDocumentSchema,
  updateMockTestInputSchema,
  updateTestVersionInputSchema,
  type AssignVersionToMockInput,
  type CreateStandaloneMockInput,
  type DuplicateStandaloneMockVersionIntoTestInput,
  type MoveStandaloneMockToTestInput,
  type ReactivateStandaloneMockInput,
  type ReorderMockTestsInput,
  type TestVersionInput,
  type UpdateMockTestInput,
  type UpdateTestVersionInput,
} from './schemas';

export class MockTestService {
  private readonly attempts: Pick<
    TestAttemptService,
    'getAttemptSummary' | 'getSubmittedScoreTrend' | 'getActiveAttempt'
  >;

  constructor(
    private readonly db: Firestore = adminDb,
    private readonly now: () => string = () => new Date().toISOString(),
    attempts?: Pick<TestAttemptService, 'getAttemptSummary' | 'getSubmittedScoreTrend' | 'getActiveAttempt'>
  ) {
    this.attempts = attempts ?? new TestAttemptService(db, now);
  }

  private get versions() {
    return this.db.collection(TEST_VERSIONS_COLLECTION);
  }

  private get drafts() {
    return this.db.collection(TEST_VERSION_DRAFTS_COLLECTION);
  }

  private get units() {
    return this.db.collection(LEARNING_UNITS_COLLECTION);
  }

  private get mocks() {
    return this.db.collection(MOCK_TESTS_COLLECTION);
  }

  private get mockOrdering() {
    return this.db.collection(MOCK_TEST_ORDERING_COLLECTION).doc(MOCK_TEST_ORDERING_DOCUMENT_ID);
  }

  private getVersionSummaries(versionIds: readonly string[]): Promise<TestVersionSummary[]> {
    return getVersionSummaries(this.db, versionIds);
  }

  private buildVersion(
    input: TestVersionInput,
    actorId: string,
    created?: Pick<TestVersion, 'createdAt' | 'createdBy'>
  ): TestVersion {
    return buildVersion(this.now, input, actorId, created);
  }

  async updateActiveMockVersion(mockId: string, input: UpdateTestVersionInput, actorId: string): Promise<TestVersion> {
    const changes = updateTestVersionInputSchema.parse(input);
    const mockRef = this.mocks.doc(mockId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const mock = parseMockSnapshot(await transaction.get(mockRef));
      if (mock.status !== 'active')
        throw new TestServiceError(
          'MOCK_TEST_INVALID_OPERATION',
          'Only an active mock can edit its owned version',
          409
        );
      const versionRef = this.versions.doc(mock.versionId);
      const current = parseVersionSnapshot(await transaction.get(versionRef));
      const version = this.buildVersion(
        {
          id: current.id,
          ...changes,
          vocabularyPoolId:
            changes.vocabularyPoolId === undefined ? current.vocabularyPoolId : changes.vocabularyPoolId,
        },
        actorId,
        {
          createdAt: current.createdAt,
          createdBy: current.createdBy,
        }
      );
      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        this.db,
        current,
        version
      );
      applyVocabularyPoolAssignmentRevisions();
      transaction.set(versionRef, version);
      transaction.set(mockRef, this.buildMock({ ...mock }, actorId, mock));
      return version;
    });
  }

  static parentMockId(testId: string, versionId: string): string {
    return `parent-${createHash('sha256')
      .update(JSON.stringify([testId, versionId]))
      .digest('hex')
      .slice(0, 48)}`;
  }

  private async assertRotationAllowed(transaction: Transaction, test: TestUnit, rotationVersionIds: string[]) {
    const path = await transaction.get(this.db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID));
    if (!path.exists) return;
    const parsed = learningPathDocumentSchema.safeParse({ ...path.data(), id: path.id });
    if (!parsed.success) throw configurationError('Learning Path contains invalid data', parsed.error.flatten());
    if (parsed.data.unitIds.includes(test.id) && rotationVersionIds.length === 0) {
      throw new TestServiceError(
        'PLACED_TEST_REQUIRES_ROTATION_VERSION',
        'Add another version first or remove this test from the Learning Path before making its last rotation version mock-only.',
        409
      );
    }
    if (parsed.data.unitIds.includes(test.id)) {
      const snapshots = await transaction.getAll(...rotationVersionIds.map(versionId => this.versions.doc(versionId)));
      const invalid = snapshots.find(
        snapshot =>
          !snapshot.exists || !testVersionDocumentSchema.safeParse({ ...snapshot.data(), id: snapshot.id }).success
      );
      if (invalid) {
        throw new TestServiceError(
          'PLACED_TEST_REQUIRES_ROTATION_VERSION',
          `Placed test ${test.id} has an invalid remaining rotation version ${invalid.id}`,
          409
        );
      }
    }
  }

  private async nextMockOrder(transaction: Transaction): Promise<number> {
    const snapshot = await transaction.get(this.mocks.where('status', '==', 'active').where('isLive', '==', true));
    return (
      snapshot.docs.reduce(
        (maximum, doc) => Math.max(maximum, typeof doc.data().mockOrder === 'number' ? doc.data().mockOrder : -1),
        -1
      ) + 1
    );
  }

  private touchMockOrdering(transaction: Transaction, actorId: string, snapshot?: DocumentSnapshot) {
    const data = snapshot?.data();
    const revision =
      typeof data?.revision === 'number' && Number.isSafeInteger(data.revision) && data.revision >= 0
        ? data.revision + 1
        : 1;
    transaction.set(this.mockOrdering, {
      id: MOCK_TEST_ORDERING_DOCUMENT_ID,
      revision,
      updatedAt: this.now(),
      updatedBy: actorId,
    });
  }

  private readLiveMockOrderScope(transaction: Transaction): Promise<QuerySnapshot> {
    return transaction.get(this.mocks.where('status', '==', 'active').where('isLive', '==', true));
  }

  private compactLiveMockOrders(
    transaction: Transaction,
    actorId: string,
    ordering: DocumentSnapshot,
    scope: QuerySnapshot,
    excludedIds: readonly string[] = []
  ) {
    const excluded = new Set(excludedIds);
    const live = scope.docs
      .map(parseMockSnapshot)
      .filter(mock => !excluded.has(mock.id))
      .sort(
        (left, right) =>
          (left.mockOrder ?? Number.MAX_SAFE_INTEGER) - (right.mockOrder ?? Number.MAX_SAFE_INTEGER) ||
          left.id.localeCompare(right.id)
      );
    live.forEach((mock, mockOrder) => {
      if (mock.mockOrder !== mockOrder)
        transaction.set(this.mocks.doc(mock.id), this.buildMock({ ...mock, mockOrder }, actorId, mock));
    });
    this.touchMockOrdering(transaction, actorId, ordering);
  }

  private async assertVersionClaim(
    transaction: Transaction,
    versionId: string,
    targetTestId?: string,
    allowedMockId?: string
  ) {
    const [versionSnapshot, testSnapshots, mockSnapshots] = await Promise.all([
      transaction.get(this.versions.doc(versionId)),
      transaction.get(this.db.collection('lessons').where('kind', '==', 'test')),
      transaction.get(this.mocks.where('status', '==', 'active')),
    ]);
    parseVersionSnapshot(versionSnapshot);
    for (const snapshot of testSnapshots.docs) {
      const test = parseTestSnapshot(snapshot);
      if (test.rotationVersions.some(reference => reference.versionId === versionId) && test.id !== targetTestId) {
        throw new TestServiceError(
          'VERSION_ALREADY_ASSIGNED',
          'Version is already assigned to another normal test rotation',
          409
        );
      }
    }
    for (const snapshot of mockSnapshots.docs) {
      const mock = parseMockSnapshot(snapshot);
      if (mock.parent.kind === 'test') parseTestSnapshot(await transaction.get(this.units.doc(mock.parent.testId)));
      if (mock.versionId === versionId && mock.id !== allowedMockId) {
        throw new TestServiceError(
          'VERSION_ALREADY_ASSIGNED',
          'Version is already assigned to another active mock',
          409
        );
      }
    }
  }

  private buildMock(
    value: Omit<MockTest, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'mockOrder'> & {
      mockOrder?: number | null;
    },
    actorId: string,
    created?: Pick<MockTest, 'createdAt' | 'createdBy'>
  ): MockTest {
    const timestamp = this.now();
    return mockTestDocumentSchema.parse({
      ...value,
      mockOrder: value.isLive ? value.mockOrder : null,
      createdAt: created?.createdAt ?? timestamp,
      createdBy: created?.createdBy ?? actorId,
      updatedAt: timestamp,
      updatedBy: actorId,
    }) as MockTest;
  }

  async listMocks(includeArchived = true): Promise<MockTestSummary[]> {
    const snapshot = await this.mocks.orderBy('updatedAt', 'desc').get();
    const mocks = snapshot.docs.map(parseMockSnapshot).filter(mock => includeArchived || mock.status === 'active');
    const versions = await this.getVersionSummaries(mocks.map(mock => mock.versionId));
    const totals = new Map(versions.map(version => [version.id, version.totalPoints]));
    return mocks.map(mock => ({ ...mock, totalPoints: totals.get(mock.versionId)! }));
  }

  async listStudentLiveMocks(studentId: string): Promise<StudentMockTestSummary[]> {
    const snapshot = await this.mocks
      .where('status', '==', 'active')
      .where('isLive', '==', true)
      .orderBy('mockOrder', 'asc')
      .get();
    const cards = await Promise.all(
      snapshot.docs.map(async document => {
        try {
          const mock = parseMockSnapshot(document);
          const version = (await this.getVersionSummaries([mock.versionId]))[0];
          const origin = { kind: 'mock-test' as const, mockTestId: mock.id };
          const [attemptSummary, scoreTrend] = await Promise.all([
            this.attempts.getAttemptSummary(origin, studentId),
            this.attempts.getSubmittedScoreTrend(origin, studentId),
          ]);
          return {
            id: mock.id,
            title: mock.title,
            description: mock.description,
            passingPercentage: mock.passingPercentage,
            totalPoints: version.totalPoints,
            attemptSummary,
            scoreTrend,
          };
        } catch (error) {
          console.error(`Live mock ${document.id} could not be projected safely; skipping card`, error);
          return null;
        }
      })
    );
    return cards.filter((card): card is StudentMockTestSummary => card !== null);
  }

  async getStudentMockDetail(mockId: string, studentId: string): Promise<StudentMockTestDetail> {
    return runVocabularyContentMutation(this.db, async transaction => {
      const mock = parseMockSnapshot(await transaction.get(this.mocks.doc(mockId)));
      const activeAttempt = await this.attempts.getActiveAttempt(
        { kind: 'mock-test', mockTestId: mockId },
        studentId,
        transaction
      );
      const attempt = activeAttempt
        ? (({ answers: _answers, translationGrades: _translationGrades, ...sanitizedAttempt }) => sanitizedAttempt)(
            activeAttempt
          )
        : null;
      if ((!mock.isLive || mock.status !== 'active') && !attempt) {
        throw new TestServiceError('MOCK_TEST_NOT_AVAILABLE', 'Mock test is not available', 404);
      }
      return {
        mock: {
          id: mock.id,
          title: mock.title,
          description: mock.description,
          passingPercentage: mock.passingPercentage,
          status: mock.status,
          isLive: mock.isLive,
        },
        attempt,
      };
    });
  }

  async getRelatedLiveMocks(testId: string): Promise<Array<Pick<MockTest, 'id' | 'title' | 'passingPercentage'>>> {
    const snapshots = await this.mocks
      .where('parent.testId', '==', testId)
      .where('status', '==', 'active')
      .where('isLive', '==', true)
      .orderBy('mockOrder', 'asc')
      .get();
    const cards = await Promise.all(
      snapshots.docs.map(async document => {
        try {
          const mock = parseMockSnapshot(document);
          await this.getVersionSummaries([mock.versionId]);
          return { id: mock.id, title: mock.title, passingPercentage: mock.passingPercentage };
        } catch (error) {
          console.error(`Related live mock ${document.id} is unavailable; omitting nudge`, error);
          return null;
        }
      })
    );
    return cards.filter((card): card is Pick<MockTest, 'id' | 'title' | 'passingPercentage'> => card !== null);
  }

  async getMock(mockId: string): Promise<MockTest> {
    return parseMockSnapshot(await this.mocks.doc(mockId).get());
  }

  async createStandaloneMock(input: CreateStandaloneMockInput, actorId: string) {
    const parsed = createStandaloneMockInputSchema.parse(input);
    const mockRef = this.mocks.doc(parsed.mock.id);
    const versionRef = this.versions.doc(parsed.version.id);
    const draftRef = this.drafts.doc(parsed.version.id);
    return runVocabularyContentMutation(this.db, async transaction => {
      const ordering = await transaction.get(this.mockOrdering);
      const [existingMock, existingVersion, existingDraft] = await Promise.all([
        transaction.get(mockRef),
        transaction.get(versionRef),
        transaction.get(draftRef),
      ]);
      if (existingMock.exists)
        throw new TestServiceError('MOCK_TEST_ALREADY_EXISTS', 'A mock with this ID already exists', 409);
      if (existingVersion.exists || existingDraft.exists)
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'A test version with this ID already exists', 409);
      const version = this.buildVersion(parsed.version, actorId);
      const mock = this.buildMock(
        {
          ...parsed.mock,
          versionId: version.id,
          parent: { kind: 'standalone' },
          status: 'active',
          mockOrder: parsed.mock.isLive ? await this.nextMockOrder(transaction) : null,
        },
        actorId
      );
      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        this.db,
        undefined,
        version
      );
      applyVocabularyPoolAssignmentRevisions();
      transaction.create(versionRef, version);
      transaction.create(mockRef, mock);
      this.touchMockOrdering(transaction, actorId, ordering);
      return { mock, version };
    });
  }

  async assignVersionToMock(input: AssignVersionToMockInput, actorId: string): Promise<MockTest> {
    const parsed = assignVersionToMockInputSchema.parse(input);
    const testRef = this.units.doc(parsed.testId);
    const mockRef = this.mocks.doc(MockTestService.parentMockId(parsed.testId, parsed.versionId));
    const versionRef = this.versions.doc(parsed.versionId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const ordering = await transaction.get(this.mockOrdering);
      const [testSnapshot, versionSnapshot, priorMock] = await Promise.all([
        transaction.get(testRef),
        transaction.get(versionRef),
        transaction.get(mockRef),
      ]);
      const test = parseTestSnapshot(testSnapshot);
      parseVersionSnapshot(versionSnapshot);
      const existing = priorMock.exists ? parseMockSnapshot(priorMock) : undefined;
      if (
        existing &&
        (existing.parent.kind !== 'test' ||
          existing.parent.testId !== parsed.testId ||
          existing.versionId !== parsed.versionId)
      ) {
        throw configurationError(`Deterministic mock ID collision for ${parsed.testId}/${parsed.versionId}`);
      }
      const inRotation = test.rotationVersions.some(reference => reference.versionId === parsed.versionId);
      if (!inRotation && !existing)
        throw new TestServiceError('TEST_VERSION_NOT_IN_TEST', 'Test version is not assigned to this test', 409);
      await this.assertVersionClaim(transaction, parsed.versionId, parsed.testId, mockRef.id);
      const remainingRotationIds = test.rotationVersions
        .filter(reference => reference.versionId !== parsed.versionId)
        .map(reference => reference.versionId);
      await this.assertRotationAllowed(transaction, test, remainingRotationIds);
      // If this deterministic assignment already owns a live card and is being
      // hidden, read the survivor scope before queuing either ownership write.
      const liveScope = existing?.isLive && !parsed.isLive ? await this.readLiveMockOrderScope(transaction) : undefined;
      const mock = this.buildMock(
        {
          id: mockRef.id,
          versionId: parsed.versionId,
          parent: { kind: 'test', testId: parsed.testId },
          title: parsed.title,
          description: parsed.description,
          passingPercentage: parsed.passingPercentage,
          status: 'active',
          isLive: parsed.isLive,
          mockOrder: parsed.isLive
            ? existing?.isLive
              ? existing.mockOrder
              : await this.nextMockOrder(transaction)
            : null,
        },
        actorId,
        existing
      );
      const updatedTest = testUnitSchema.parse({
        ...test,
        rotationVersions: test.rotationVersions.filter(reference => reference.versionId !== parsed.versionId),
        updatedAt: this.now(),
        updatedBy: actorId,
      }) as TestUnit;
      transaction.set(testRef, updatedTest);
      transaction.set(mockRef, mock);
      if (liveScope) {
        this.compactLiveMockOrders(transaction, actorId, ordering, liveScope, [mock.id]);
      } else {
        this.touchMockOrdering(transaction, actorId, ordering);
      }
      return mock;
    });
  }

  async archiveMock(mockId: string, actorId: string): Promise<MockTest> {
    const mockRef = this.mocks.doc(mockId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const ordering = await transaction.get(this.mockOrdering);
      const mock = parseMockSnapshot(await transaction.get(mockRef));
      if (mock.status === 'archived') return mock;
      let parent: TestUnit | undefined;
      if (mock.parent.kind === 'test')
        parent = parseTestSnapshot(await transaction.get(this.units.doc(mock.parent.testId)));
      await this.assertVersionClaim(transaction, mock.versionId, parent?.id, mock.id);
      const archived = this.buildMock({ ...mock, status: 'archived', isLive: false, mockOrder: null }, actorId, mock);
      const liveScope = await this.readLiveMockOrderScope(transaction);
      transaction.set(mockRef, archived);
      if (parent)
        transaction.set(
          this.units.doc(parent.id),
          testUnitSchema.parse({
            ...parent,
            rotationVersions: [...parent.rotationVersions, { versionId: mock.versionId }],
            updatedAt: this.now(),
            updatedBy: actorId,
          })
        );
      this.compactLiveMockOrders(transaction, actorId, ordering, liveScope, mock.isLive ? [mock.id] : []);
      return archived;
    });
  }

  async reactivateStandaloneMock(
    mockId: string,
    input: ReactivateStandaloneMockInput,
    actorId: string
  ): Promise<MockTest> {
    const { isLive } = reactivateStandaloneMockInputSchema.parse(input);
    const mockRef = this.mocks.doc(mockId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const ordering = await transaction.get(this.mockOrdering);
      const mock = parseMockSnapshot(await transaction.get(mockRef));
      if (mock.parent.kind !== 'standalone') {
        throw new TestServiceError(
          'MOCK_TEST_INVALID_OPERATION',
          'Parent-linked mocks must be reactivated from their parent test version.',
          409
        );
      }
      if (mock.status === 'active') return mock;
      await this.assertVersionClaim(transaction, mock.versionId, undefined, mock.id);
      const reactivated = this.buildMock(
        {
          ...mock,
          status: 'active',
          isLive,
          mockOrder: isLive ? await this.nextMockOrder(transaction) : null,
        },
        actorId,
        mock
      );
      transaction.set(mockRef, reactivated);
      this.touchMockOrdering(transaction, actorId, ordering);
      return reactivated;
    });
  }

  async moveStandaloneMockToTest(mockId: string, input: MoveStandaloneMockToTestInput, actorId: string) {
    const { testId } = moveStandaloneMockToTestInputSchema.parse(input);
    const mockRef = this.mocks.doc(mockId);
    const testRef = this.units.doc(testId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const ordering = await transaction.get(this.mockOrdering);
      const [mockSnapshot, testSnapshot] = await Promise.all([transaction.get(mockRef), transaction.get(testRef)]);
      const mock = parseMockSnapshot(mockSnapshot);
      const test = parseTestSnapshot(testSnapshot);
      if (mock.parent.kind !== 'standalone' || mock.status !== 'active')
        throw new TestServiceError(
          'MOCK_TEST_INVALID_OPERATION',
          'Only an active standalone mock can be moved to normal rotation',
          409
        );
      await this.assertVersionClaim(transaction, mock.versionId, test.id, mock.id);
      if (test.rotationVersions.some(reference => reference.versionId === mock.versionId))
        throw new TestServiceError('VERSION_ALREADY_ASSIGNED', 'Version is already in this test rotation', 409);
      const archived = this.buildMock({ ...mock, status: 'archived', isLive: false, mockOrder: null }, actorId, mock);
      const updatedTest = testUnitSchema.parse({
        ...test,
        rotationVersions: [...test.rotationVersions, { versionId: mock.versionId }],
        updatedAt: this.now(),
        updatedBy: actorId,
      }) as TestUnit;
      const liveScope = await this.readLiveMockOrderScope(transaction);
      transaction.set(mockRef, archived);
      transaction.set(testRef, updatedTest);
      this.compactLiveMockOrders(transaction, actorId, ordering, liveScope, mock.isLive ? [mock.id] : []);
      return { mock: archived, test: updatedTest };
    });
  }

  async duplicateStandaloneMockVersionIntoTest(
    mockId: string,
    input: DuplicateStandaloneMockVersionIntoTestInput,
    actorId: string
  ) {
    const { testId, requestId } = duplicateStandaloneMockVersionIntoTestInputSchema.parse(input);
    const versionId = `copy-${createHash('sha256')
      .update(JSON.stringify([mockId, testId, requestId]))
      .digest('hex')
      .slice(0, 48)}`;
    const mockRef = this.mocks.doc(mockId);
    const targetVersionRef = this.versions.doc(versionId);
    const targetDraftRef = this.drafts.doc(versionId);
    return runVocabularyContentMutation(this.db, async transaction => {
      await transaction.get(this.mockOrdering);
      const mockSnapshot = await transaction.get(mockRef);
      const mock = parseMockSnapshot(mockSnapshot);
      const [targetSnapshot, targetDraftSnapshot, sourceSnapshot] = await Promise.all([
        transaction.get(targetVersionRef),
        transaction.get(targetDraftRef),
        transaction.get(this.versions.doc(mock.versionId)),
      ]);
      const test = parseTestSnapshot(await transaction.get(this.units.doc(testId)));
      if (mock.parent.kind !== 'standalone' || mock.status !== 'active')
        throw new TestServiceError(
          'MOCK_TEST_INVALID_OPERATION',
          'Only an active standalone mock can be duplicated into normal rotation',
          409
        );
      if (targetSnapshot.exists) {
        const existing = parseVersionSnapshot(targetSnapshot);
        if (!test.rotationVersions.some(reference => reference.versionId === versionId)) {
          throw configurationError(
            `Duplicate request ${requestId} has a version without its target rotation ownership`
          );
        }
        return { version: existing, test, mock };
      }
      if (targetDraftSnapshot.exists) {
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'The duplicate operation ID is already in use', 409);
      }
      const source = parseVersionSnapshot(sourceSnapshot);
      const pages = source.pages.map(page => {
        const regenerated = regeneratePageIds(page, {}).page;
        return { ...regenerated, title: page.title };
      });
      const version = this.buildVersion(
        {
          id: versionId,
          name: `${source.name} (Copy)`,
          pages,
          vocabularyPoolId: source.vocabularyPoolId,
        },
        actorId
      );
      const updatedTest = testUnitSchema.parse({
        ...test,
        rotationVersions: [...test.rotationVersions, { versionId }],
        updatedAt: this.now(),
        updatedBy: actorId,
      }) as TestUnit;
      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        this.db,
        undefined,
        version
      );
      applyVocabularyPoolAssignmentRevisions();
      transaction.create(targetVersionRef, version);
      transaction.set(this.units.doc(testId), updatedTest);
      return { version, test: updatedTest, mock };
    });
  }

  async updateMock(mockId: string, input: UpdateMockTestInput, actorId: string): Promise<MockTest> {
    const changes = updateMockTestInputSchema.parse(input);
    const ref = this.mocks.doc(mockId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const ordering = await transaction.get(this.mockOrdering);
      const current = parseMockSnapshot(await transaction.get(ref));
      if (current.status !== 'active' && changes.isLive)
        throw new TestServiceError(
          'MOCK_TEST_INVALID_OPERATION',
          'Archived mocks cannot be made live; reactivate the assignment instead',
          409
        );
      const isLive = changes.isLive ?? current.isLive;
      await this.assertVersionClaim(transaction, current.versionId, undefined, current.id);
      const updated = this.buildMock(
        {
          ...current,
          ...changes,
          isLive,
          mockOrder: isLive ? (current.isLive ? current.mockOrder : await this.nextMockOrder(transaction)) : null,
        },
        actorId,
        current
      );
      if (current.isLive && !isLive) {
        const liveScope = await this.readLiveMockOrderScope(transaction);
        transaction.set(ref, updated);
        this.compactLiveMockOrders(transaction, actorId, ordering, liveScope, [current.id]);
      } else {
        transaction.set(ref, updated);
        this.touchMockOrdering(transaction, actorId, ordering);
      }
      return updated;
    });
  }

  async reorderMocks(input: ReorderMockTestsInput, actorId: string): Promise<MockTest[]> {
    const { mockIds } = reorderMockTestsInputSchema.parse(input);
    return runVocabularyContentMutation(this.db, async transaction => {
      const ordering = await transaction.get(this.mockOrdering);
      const scope = await transaction.get(this.mocks.where('status', '==', 'active').where('isLive', '==', true));
      const mocks = scope.docs.map(parseMockSnapshot);
      if (mocks.length !== mockIds.length || !mockIds.every(id => mocks.some(mock => mock.id === id)))
        throw new TestServiceError(
          'MOCK_TEST_INVALID_OPERATION',
          'Reordering requires the complete current live mock scope',
          409
        );
      const byId = new Map(mocks.map(mock => [mock.id, mock]));
      const updated = mockIds.map((id, mockOrder) =>
        this.buildMock({ ...byId.get(id)!, mockOrder }, actorId, byId.get(id)!)
      );
      updated.forEach(mock => transaction.set(this.mocks.doc(mock.id), mock));
      this.touchMockOrdering(transaction, actorId, ordering);
      return updated;
    });
  }
}

export const mockTestService = new MockTestService();
