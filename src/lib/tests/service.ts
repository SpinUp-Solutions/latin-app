import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { TEST_VERSIONS_COLLECTION } from '@/shared/constants/firestore';
import { LearningUnitService } from '@/src/lib/learning-units/service';
import { testUnitCreateSchema, testUnitSchema } from '@/src/lib/learning-units/schemas';
import { adminDb } from '@/src/services/firebase-admin';
import type { TestUnit } from '@/src/types/learning-unit';
import type { TestUnitDetail, TestUnitSummary, TestVersion, TestVersionSummary } from '@/src/types/test';
import { getTestVersionSummaryFields } from './domain';
import { TestServiceError } from './errors';
import {
  createTestWithVersionSchema,
  testVersionDocumentSchema,
  testVersionInputSchema,
  testVersionSummaryDocumentSchema,
  updateTestUnitInputSchema,
  updateTestWithVersionInputSchema,
  updateTestVersionInputSchema,
  type CreateTestWithVersionInput,
  type TestVersionInput,
  type UpdateTestUnitInput,
  type UpdateTestWithVersionInput,
  type UpdateTestVersionInput,
} from './schemas';

export { TestServiceError } from './errors';

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

export class TestService {
  private readonly learningUnits: LearningUnitService;

  constructor(
    private readonly db: Firestore = adminDb,
    private readonly now: () => string = () => new Date().toISOString()
  ) {
    this.learningUnits = new LearningUnitService(db);
  }

  private get versions() {
    return this.db.collection(TEST_VERSIONS_COLLECTION);
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
}

export const testService = new TestService();
