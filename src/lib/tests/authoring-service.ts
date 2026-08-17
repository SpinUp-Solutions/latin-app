import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  DEFAULT_LEARNING_PATH_ID,
  LEARNING_PATHS_COLLECTION,
  LEARNING_UNITS_COLLECTION,
  MOCK_TESTS_COLLECTION,
  TEST_VERSION_DRAFTS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
} from '@/shared/constants/firestore';
import { learningPathDocumentSchema, testUnitCreateSchema, testUnitSchema } from '@/src/lib/learning-units/schemas';
import { adminDb } from '@/src/services/firebase-admin';
import type { TestUnit } from '@/src/types/learning-unit';
import type {
  TestUnitDetail,
  TestUnitSummary,
  TestVersion,
  TestVersionDraft,
  TestVersionSummary,
} from '@/src/types/test';
import { regeneratePageIds } from '@/src/utils/idUtils';
import { assertVocabularyPoolAssignmentsAllowedInTransaction } from '@/src/lib/vocabulary-pools/assignment.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { toTestUnitSummary } from './domain';
import { TestServiceError } from './errors';
import {
  buildVersionDraft,
  buildVersion,
  getVersionSummaries,
  isStoredVersionReadyForStudentVisibility,
  parseMockSnapshot,
  parseTestSnapshot,
  parseVersionDraftSnapshot,
  parseVersionSnapshot,
} from './persistence';
import {
  createTestWithVersionSchema,
  duplicateTestVersionInputSchema,
  testVersionDraftInputSchema,
  testVersionInputSchema,
  updateTestVersionDraftInputSchema,
  updateTestUnitInputSchema,
  updateTestWithVersionInputSchema,
  type CreateTestWithVersionInput,
  type DuplicateTestVersionInput,
  type TestVersionDraftInput,
  type UpdateTestUnitInput,
  type UpdateTestVersionDraftInput,
  type UpdateTestWithVersionInput,
  type TestVersionInput,
} from './schemas';

export class TestAuthoringService {
  constructor(
    private readonly db: Firestore = adminDb,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

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

  private buildVersionDraft(
    testId: string,
    input: TestVersionDraftInput,
    actorId: string,
    created?: Pick<TestVersionDraft, 'createdAt' | 'createdBy'>
  ): TestVersionDraft {
    return buildVersionDraft(this.now, testId, input, actorId, created);
  }

  async listTests(): Promise<TestUnitSummary[]> {
    const snapshot = await this.units.where('kind', '==', 'test').orderBy('updatedAt', 'desc').get();
    const tests = snapshot.docs.map(parseTestSnapshot);
    const summaries = await this.getVersionSummaries(
      tests.flatMap(test => test.rotationVersions.map(reference => reference.versionId))
    );
    const summariesById = new Map(summaries.map(version => [version.id, version]));

    return tests.map(test =>
      toTestUnitSummary(
        test,
        test.rotationVersions.map(reference => summariesById.get(reference.versionId)!)
      )
    );
  }

  async getTest(testId: string): Promise<TestUnitDetail> {
    const test = parseTestSnapshot(await this.units.doc(testId).get());
    const [versions, draftSnapshots, snapshots] = await Promise.all([
      this.getVersionSummaries(test.rotationVersions.map(reference => reference.versionId)),
      this.drafts.where('testId', '==', testId).get(),
      this.mocks.where('parent.testId', '==', testId).where('status', '==', 'active').get(),
    ]);
    const drafts = draftSnapshots.docs
      .map(document => {
        const { pages: _pages, ...summary } = parseVersionDraftSnapshot(document);
        return summary;
      })
      .sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
    const joinedMocks = await Promise.all(
      snapshots.docs.map(async document => {
        try {
          const mock = parseMockSnapshot(document);
          const version = (await this.getVersionSummaries([mock.versionId]))[0];
          return { ...mock, version };
        } catch (error) {
          console.error(`Parent-linked mock ${document.id} could not be projected safely; omitting it`, error);
          return null;
        }
      })
    );
    return {
      test,
      versions,
      drafts,
      mocks: joinedMocks.filter((mock): mock is NonNullable<typeof mock> => mock !== null),
    };
  }

  async createTestWithVersion(input: CreateTestWithVersionInput, actorId: string) {
    const parsed = createTestWithVersionSchema.parse(input);
    const testRef = this.units.doc(parsed.test.id);
    const versionRef = this.versions.doc(parsed.version.id);
    const draftRef = this.drafts.doc(parsed.version.id);

    return runVocabularyContentMutation(this.db, async transaction => {
      const [existingTest, existingVersion, existingDraft] = await Promise.all([
        transaction.get(testRef),
        transaction.get(versionRef),
        transaction.get(draftRef),
      ]);
      if (existingTest.exists) {
        const existingData = existingTest.data();
        const sameTestVersionPair =
          existingData?.kind === 'test' &&
          existingVersion.exists &&
          !existingDraft.exists &&
          Array.isArray(existingData.rotationVersions) &&
          existingData.rotationVersions.some(
            (reference: unknown) =>
              Boolean(reference) &&
              typeof reference === 'object' &&
              (reference as { versionId?: unknown }).versionId === parsed.version.id
          );
        if (sameTestVersionPair) {
          throw new TestServiceError(
            'TEST_CREATE_RETRY',
            'This test was already created. Reopen it to continue editing.',
            409
          );
        }
        throw new TestServiceError('TEST_ALREADY_EXISTS', 'A test with this ID already exists', 409);
      }
      if (existingVersion.exists || existingDraft.exists) {
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'A test version with this ID already exists', 409);
      }

      const timestamp = this.now();
      const version = this.buildVersion(parsed.version, actorId);
      const test = testUnitCreateSchema.parse({
        ...parsed.test,
        kind: 'test',
        rotationVersions: [{ versionId: version.id }],
        createdAt: timestamp,
        createdBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      }) as TestUnit;

      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        this.db,
        undefined,
        version
      );
      applyVocabularyPoolAssignmentRevisions();
      transaction.create(versionRef, version);
      transaction.create(testRef, test);
      return { test, version };
    });
  }

  async updateTest(testId: string, input: UpdateTestUnitInput, actorId: string): Promise<TestUnit> {
    const changes = updateTestUnitInputSchema.parse(input);
    const ref = this.units.doc(testId);

    return runVocabularyContentMutation(this.db, async transaction => {
      const current = parseTestSnapshot(await transaction.get(ref));
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
    const testRef = this.units.doc(testId);
    const versionRef = this.versions.doc(changes.versionId);

    return runVocabularyContentMutation(this.db, async transaction => {
      const [testSnapshot, versionSnapshot] = await Promise.all([
        transaction.get(testRef),
        transaction.get(versionRef),
      ]);
      const currentTest = parseTestSnapshot(testSnapshot);
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
      const version = this.buildVersion(
        {
          id: changes.versionId,
          ...changes.version,
          vocabularyPoolId:
            changes.version.vocabularyPoolId === undefined
              ? currentVersion.vocabularyPoolId
              : changes.version.vocabularyPoolId,
        },
        actorId,
        {
          createdAt: currentVersion.createdAt,
          createdBy: currentVersion.createdBy,
        }
      );

      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        this.db,
        currentVersion,
        version
      );
      applyVocabularyPoolAssignmentRevisions();
      transaction.set(testRef, test);
      transaction.set(versionRef, version);
      return { test, version };
    });
  }

  async addTestVersion(testId: string, input: TestVersionDraftInput, actorId: string) {
    const parsed = testVersionDraftInputSchema.parse(input);
    const testRef = this.units.doc(testId);
    const versionRef = this.versions.doc(parsed.id);
    const draftRef = this.drafts.doc(parsed.id);

    return runVocabularyContentMutation(this.db, async transaction => {
      const [testSnapshot, existingVersion, existingDraft] = await Promise.all([
        transaction.get(testRef),
        transaction.get(versionRef),
        transaction.get(draftRef),
      ]);
      const currentTest = parseTestSnapshot(testSnapshot);
      if (existingVersion.exists) {
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'A different test version already uses this ID', 409);
      }
      if (existingDraft.exists) {
        const draft = parseVersionDraftSnapshot(existingDraft);
        const samePayload =
          draft.testId === testId &&
          draft.name === parsed.name &&
          (draft.vocabularyPoolId ?? null) === (parsed.vocabularyPoolId ?? null) &&
          JSON.stringify(draft.pages) === JSON.stringify(parsed.pages);
        if (samePayload) return { test: currentTest, version: draft };
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'A different test version already uses this ID', 409);
      }

      const version = this.buildVersionDraft(testId, parsed, actorId);
      const test = testUnitSchema.parse({
        ...currentTest,
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
      transaction.create(draftRef, version);
      transaction.set(testRef, test);
      return { test, version };
    });
  }

  async updateTestVersionDraft(testId: string, versionId: string, input: UpdateTestVersionDraftInput, actorId: string) {
    const changes = updateTestVersionDraftInputSchema.parse(input);
    const testRef = this.units.doc(testId);
    const draftRef = this.drafts.doc(versionId);

    return runVocabularyContentMutation(this.db, async transaction => {
      const [testSnapshot, draftSnapshot] = await Promise.all([transaction.get(testRef), transaction.get(draftRef)]);
      const currentTest = parseTestSnapshot(testSnapshot);
      const currentDraft = parseVersionDraftSnapshot(draftSnapshot);
      if (currentDraft.testId !== testId) {
        throw new TestServiceError('TEST_VERSION_NOT_IN_TEST', 'Inactive version belongs to another test', 409);
      }
      const version = this.buildVersionDraft(
        testId,
        {
          id: versionId,
          ...changes,
          vocabularyPoolId:
            changes.vocabularyPoolId === undefined ? currentDraft.vocabularyPoolId : changes.vocabularyPoolId,
        },
        actorId,
        { createdAt: currentDraft.createdAt, createdBy: currentDraft.createdBy }
      );
      const test = testUnitSchema.parse({
        ...currentTest,
        updatedAt: this.now(),
        updatedBy: actorId,
      }) as TestUnit;
      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        this.db,
        currentDraft,
        version
      );
      applyVocabularyPoolAssignmentRevisions();
      transaction.set(draftRef, version);
      transaction.set(testRef, test);
      return { test, version };
    });
  }

  async duplicateTestVersion(
    testId: string,
    sourceVersionId: string,
    input: DuplicateTestVersionInput,
    actorId: string
  ) {
    const parsed = duplicateTestVersionInputSchema.parse(input);
    const targetVersionId = `duplicate-${createHash('sha256')
      .update(JSON.stringify([testId, sourceVersionId, parsed.requestId]))
      .digest('hex')
      .slice(0, 48)}`;
    const testRef = this.units.doc(testId);
    const sourceRef = this.versions.doc(sourceVersionId);
    const targetVersionRef = this.versions.doc(targetVersionId);
    const targetDraftRef = this.drafts.doc(targetVersionId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const [testSnapshot, sourceSnapshot, targetVersionSnapshot, targetDraftSnapshot] = await Promise.all([
        transaction.get(testRef),
        transaction.get(sourceRef),
        transaction.get(targetVersionRef),
        transaction.get(targetDraftRef),
      ]);
      const test = parseTestSnapshot(testSnapshot);
      if (!test.rotationVersions.some(reference => reference.versionId === sourceVersionId)) {
        throw new TestServiceError(
          'TEST_VERSION_NOT_IN_TEST',
          'The source version is no longer in this test rotation',
          409
        );
      }
      if (targetVersionSnapshot.exists) {
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'The duplicate operation ID is already in use', 409);
      }
      if (targetDraftSnapshot.exists) {
        const version = parseVersionDraftSnapshot(targetDraftSnapshot);
        if (version.testId === testId) return { test, version };
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'The duplicate operation ID is already in use', 409);
      }
      const source = parseVersionSnapshot(sourceSnapshot);
      const pages = source.pages.map(page => {
        const regenerated = regeneratePageIds(page, {}).page;
        return { ...regenerated, title: page.title };
      });
      const version = this.buildVersionDraft(
        testId,
        {
          id: targetVersionId,
          name: parsed.name ?? `${source.name} (Copy)`,
          pages,
          vocabularyPoolId: source.vocabularyPoolId,
        },
        actorId
      );
      const updatedTest = testUnitSchema.parse({
        ...test,
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
      transaction.create(targetDraftRef, version);
      transaction.set(testRef, updatedTest);
      return { test: updatedTest, version };
    });
  }

  async activateTestVersion(testId: string, versionId: string, actorId: string) {
    const testRef = this.units.doc(testId);
    const draftRef = this.drafts.doc(versionId);
    const versionRef = this.versions.doc(versionId);

    return runVocabularyContentMutation(this.db, async transaction => {
      const [testSnapshot, draftSnapshot, versionSnapshot] = await Promise.all([
        transaction.get(testRef),
        transaction.get(draftRef),
        transaction.get(versionRef),
      ]);
      const test = parseTestSnapshot(testSnapshot);
      if (!draftSnapshot.exists) {
        const version = parseVersionSnapshot(versionSnapshot);
        if (test.rotationVersions.some(reference => reference.versionId === versionId)) return { test, version };
        throw new TestServiceError('TEST_VERSION_NOT_IN_TEST', 'Test version is not assigned to this test', 409);
      }
      if (versionSnapshot.exists) {
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'An active version already uses this ID', 409);
      }
      const draft = parseVersionDraftSnapshot(draftSnapshot);
      if (draft.testId !== testId) {
        throw new TestServiceError('TEST_VERSION_NOT_IN_TEST', 'Inactive version belongs to another test', 409);
      }
      const activeInput = testVersionInputSchema.parse({
        id: draft.id,
        name: draft.name,
        pages: draft.pages,
        vocabularyPoolId: draft.vocabularyPoolId,
      });
      const version = this.buildVersion(activeInput, actorId, {
        createdAt: draft.createdAt,
        createdBy: draft.createdBy,
      });
      const updatedTest = testUnitSchema.parse({
        ...test,
        rotationVersions: [...test.rotationVersions, { versionId }],
        updatedAt: this.now(),
        updatedBy: actorId,
      }) as TestUnit;
      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        this.db,
        draft,
        version
      );
      applyVocabularyPoolAssignmentRevisions();
      transaction.create(versionRef, version);
      transaction.set(testRef, updatedTest);
      transaction.delete(draftRef);
      return { test: updatedTest, version };
    });
  }

  async deactivateTestVersion(testId: string, versionId: string, actorId: string) {
    const testRef = this.units.doc(testId);
    const draftRef = this.drafts.doc(versionId);
    const versionRef = this.versions.doc(versionId);
    const pathRef = this.db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID);

    return runVocabularyContentMutation(this.db, async transaction => {
      const [testSnapshot, draftSnapshot, versionSnapshot, pathSnapshot] = await Promise.all([
        transaction.get(testRef),
        transaction.get(draftRef),
        transaction.get(versionRef),
        transaction.get(pathRef),
      ]);
      const test = parseTestSnapshot(testSnapshot);
      const inRotation = test.rotationVersions.some(reference => reference.versionId === versionId);
      if (!inRotation) {
        const version = parseVersionDraftSnapshot(draftSnapshot);
        if (version.testId === testId) return { test, version };
        throw new TestServiceError('TEST_VERSION_NOT_IN_TEST', 'Test version is not assigned to this test', 409);
      }
      if (draftSnapshot.exists) {
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'An inactive version already uses this ID', 409);
      }
      const version = parseVersionSnapshot(versionSnapshot);
      let placed = false;
      if (pathSnapshot.exists) {
        const parsedPath = learningPathDocumentSchema.safeParse({
          ...pathSnapshot.data(),
          id: pathSnapshot.id,
        });
        if (!parsedPath.success) {
          throw new TestServiceError(
            'TEST_CONFIGURATION_ERROR',
            'The Learning Path configuration is invalid; the version was not deactivated.',
            409
          );
        }
        placed = parsedPath.data.unitIds.includes(testId);
      }
      if (placed && test.rotationVersions.length === 1) {
        throw new TestServiceError(
          'PLACED_TEST_REQUIRES_ROTATION_VERSION',
          'A test in the Learning Path must keep at least one active rotation version.',
          409
        );
      }
      const remainingRotationVersions = test.rotationVersions.filter(reference => reference.versionId !== versionId);
      if (placed) {
        const remainingSnapshots = await Promise.all(
          remainingRotationVersions.map(reference => transaction.get(this.versions.doc(reference.versionId)))
        );
        const invalid = remainingSnapshots.find(snapshot => !isStoredVersionReadyForStudentVisibility(snapshot));
        if (invalid) {
          throw new TestServiceError(
            'PLACED_TEST_REQUIRES_ROTATION_VERSION',
            `A test in the Learning Path cannot retain missing or invalid rotation version ${invalid.id}.`,
            409
          );
        }
      }
      const draft = this.buildVersionDraft(
        testId,
        testVersionDraftInputSchema.parse({
          id: version.id,
          name: version.name,
          pages: version.pages,
          vocabularyPoolId: version.vocabularyPoolId,
        }),
        actorId,
        { createdAt: version.createdAt, createdBy: version.createdBy }
      );
      const updatedTest = testUnitSchema.parse({
        ...test,
        rotationVersions: remainingRotationVersions,
        updatedAt: this.now(),
        updatedBy: actorId,
      }) as TestUnit;
      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        this.db,
        version,
        draft
      );
      applyVocabularyPoolAssignmentRevisions();
      transaction.create(draftRef, draft);
      transaction.set(testRef, updatedTest);
      transaction.delete(versionRef);
      return { test: updatedTest, version: draft };
    });
  }

  async getTestVersion(versionId: string): Promise<TestVersion> {
    const [versionSnapshot, draftSnapshot] = await Promise.all([
      this.versions.doc(versionId).get(),
      this.drafts.doc(versionId).get(),
    ]);
    if (versionSnapshot.exists && draftSnapshot.exists) {
      throw new TestServiceError(
        'TEST_CONFIGURATION_ERROR',
        'This version exists in both active and inactive storage.',
        409
      );
    }
    if (versionSnapshot.exists) return parseVersionSnapshot(versionSnapshot);
    return parseVersionDraftSnapshot(draftSnapshot);
  }
}

export const testAuthoringService = new TestAuthoringService();
