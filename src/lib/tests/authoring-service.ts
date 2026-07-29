import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  LEARNING_UNITS_COLLECTION,
  MOCK_TESTS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
} from '@/shared/constants/firestore';
import { testUnitCreateSchema, testUnitSchema } from '@/src/lib/learning-units/schemas';
import { adminDb } from '@/src/services/firebase-admin';
import type { TestUnit } from '@/src/types/learning-unit';
import type { TestUnitDetail, TestUnitSummary, TestVersion, TestVersionSummary } from '@/src/types/test';
import { regeneratePageIds } from '@/src/utils/idUtils';
import { toTestUnitSummary } from './domain';
import { TestServiceError } from './errors';
import {
  buildVersion,
  getVersionSummaries,
  parseMockSnapshot,
  parseTestSnapshot,
  parseVersionSnapshot,
} from './persistence';
import {
  createTestWithVersionSchema,
  duplicateTestVersionInputSchema,
  testVersionInputSchema,
  updateTestUnitInputSchema,
  updateTestWithVersionInputSchema,
  type CreateTestWithVersionInput,
  type DuplicateTestVersionInput,
  type TestVersionInput,
  type UpdateTestUnitInput,
  type UpdateTestWithVersionInput,
} from './schemas';

export class TestAuthoringService {
  constructor(
    private readonly db: Firestore = adminDb,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  private get versions() {
    return this.db.collection(TEST_VERSIONS_COLLECTION);
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
    const versions = await this.getVersionSummaries(test.rotationVersions.map(reference => reference.versionId));
    const snapshots = await this.mocks.where('parent.testId', '==', testId).where('status', '==', 'active').get();
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
    return { test, versions, mocks: joinedMocks.filter((mock): mock is NonNullable<typeof mock> => mock !== null) };
  }

  async createTestWithVersion(input: CreateTestWithVersionInput, actorId: string) {
    const parsed = createTestWithVersionSchema.parse(input);
    const testRef = this.units.doc(parsed.test.id);
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
    const ref = this.units.doc(testId);

    return this.db.runTransaction(async transaction => {
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

    return this.db.runTransaction(async transaction => {
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

      transaction.set(testRef, test);
      transaction.set(versionRef, version);
      return { test, version };
    });
  }

  async addTestVersion(testId: string, input: TestVersionInput, actorId: string) {
    const parsed = testVersionInputSchema.parse(input);
    const testRef = this.units.doc(testId);
    const versionRef = this.versions.doc(parsed.id);

    return this.db.runTransaction(async transaction => {
      const [testSnapshot, existingVersion] = await Promise.all([
        transaction.get(testRef),
        transaction.get(versionRef),
      ]);
      const currentTest = parseTestSnapshot(testSnapshot);
      if (existingVersion.exists) {
        const version = parseVersionSnapshot(existingVersion);
        const attached = currentTest.rotationVersions.some(reference => reference.versionId === version.id);
        const samePayload =
          version.name === parsed.name &&
          (version.vocabularyPoolId ?? null) === (parsed.vocabularyPoolId ?? null) &&
          JSON.stringify(version.pages) === JSON.stringify(parsed.pages);
        if (attached && samePayload) return { test: currentTest, version };
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'A different test version already uses this ID', 409);
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
    const targetRef = this.versions.doc(targetVersionId);
    return this.db.runTransaction(async transaction => {
      const [testSnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
        transaction.get(testRef),
        transaction.get(sourceRef),
        transaction.get(targetRef),
      ]);
      const test = parseTestSnapshot(testSnapshot);
      if (!test.rotationVersions.some(reference => reference.versionId === sourceVersionId)) {
        throw new TestServiceError(
          'TEST_VERSION_NOT_IN_TEST',
          'The source version is no longer in this test rotation',
          409
        );
      }
      if (targetSnapshot.exists) {
        const version = parseVersionSnapshot(targetSnapshot);
        if (test.rotationVersions.some(reference => reference.versionId === targetVersionId)) return { test, version };
        throw new TestServiceError('TEST_VERSION_ALREADY_EXISTS', 'The duplicate operation ID is already in use', 409);
      }
      const source = parseVersionSnapshot(sourceSnapshot);
      const pages = source.pages.map(page => {
        const regenerated = regeneratePageIds(page, {}).page;
        return { ...regenerated, title: page.title };
      });
      const version = this.buildVersion(
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
        rotationVersions: [...test.rotationVersions, { versionId: targetVersionId }],
        updatedAt: this.now(),
        updatedBy: actorId,
      }) as TestUnit;
      transaction.create(targetRef, version);
      transaction.set(testRef, updatedTest);
      return { test: updatedTest, version };
    });
  }

  async getTestVersion(versionId: string): Promise<TestVersion> {
    return parseVersionSnapshot(await this.versions.doc(versionId).get());
  }
}

export const testAuthoringService = new TestAuthoringService();
