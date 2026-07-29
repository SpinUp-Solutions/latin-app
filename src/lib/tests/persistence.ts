import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { TEST_VERSIONS_COLLECTION } from '@/shared/constants/firestore';
import { normalizeLearningUnit } from '@/src/lib/learning-units/domain';
import type { TestUnit } from '@/src/types/learning-unit';
import type { MockTest, TestVersion, TestVersionSummary } from '@/src/types/test';
import { TEST_VERSION_SUMMARY_FIELDS, getTestVersionSummaryFields } from './domain';
import { TestServiceError } from './errors';
import {
  mockTestDocumentSchema,
  testVersionDocumentSchema,
  testVersionSummaryDocumentSchema,
  type TestVersionInput,
} from './schemas';

const chunk = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
};

export function parseVersionSnapshot(snapshot: DocumentSnapshot): TestVersion {
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

export function parseVersionSummarySnapshot(snapshot: DocumentSnapshot): TestVersionSummary {
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

export function parseTestSnapshot(snapshot: DocumentSnapshot): TestUnit {
  if (!snapshot.exists) {
    throw new TestServiceError('TEST_NOT_FOUND', 'Test not found', 404);
  }

  try {
    const unit = normalizeLearningUnit(snapshot.data(), snapshot.id);
    if (unit.kind !== 'test') {
      throw new TestServiceError('TEST_NOT_FOUND', 'Test not found', 404);
    }
    return unit;
  } catch (error) {
    if (error instanceof TestServiceError) throw error;
    throw new TestServiceError('STALE_TEST_DATA', `Test ${snapshot.id} contains invalid persisted data`, 409);
  }
}

export function parseMockSnapshot(snapshot: DocumentSnapshot): MockTest {
  if (!snapshot.exists) {
    throw new TestServiceError('MOCK_TEST_NOT_FOUND', 'Mock test not found', 404);
  }

  const parsed = mockTestDocumentSchema.safeParse({ ...snapshot.data(), id: snapshot.id });
  if (!parsed.success) {
    console.error(`Mock test ${snapshot.id} contains invalid persisted data`, parsed.error.flatten());
    throw configurationError(`Mock test ${snapshot.id} contains invalid persisted data`, parsed.error.flatten());
  }
  return parsed.data as MockTest;
}

export function configurationError(message: string, error?: unknown): TestServiceError {
  console.error(message, error ?? '');
  return new TestServiceError(
    'TEST_CONFIGURATION_ERROR',
    'This test is temporarily unavailable. Please ask an administrator to review its configuration.',
    409
  );
}

export async function getVersionSummaries(db: Firestore, versionIds: readonly string[]): Promise<TestVersionSummary[]> {
  if (versionIds.length === 0) return [];

  const versions = db.collection(TEST_VERSIONS_COLLECTION);
  const snapshots = await Promise.all(
    chunk([...new Set(versionIds)], 100).map(ids =>
      db.getAll(...ids.map(id => versions.doc(id)), { fieldMask: [...TEST_VERSION_SUMMARY_FIELDS] })
    )
  );
  const byId = new Map(
    snapshots.flatMap(documents => documents.map(document => [document.id, parseVersionSummarySnapshot(document)]))
  );

  return versionIds.map(versionId => {
    const version = byId.get(versionId);
    if (!version) {
      throw new TestServiceError('STALE_TEST_VERSION_DATA', `Test references missing version ${versionId}`, 409);
    }
    return version;
  });
}

export function buildVersion(
  now: () => string,
  input: TestVersionInput,
  actorId: string,
  created?: Pick<TestVersion, 'createdAt' | 'createdBy'>
): TestVersion {
  const timestamp = now();
  return testVersionDocumentSchema.parse({
    ...input,
    ...getTestVersionSummaryFields(input.pages),
    createdAt: created?.createdAt ?? timestamp,
    createdBy: created?.createdBy ?? actorId,
    updatedAt: timestamp,
    updatedBy: actorId,
  }) as TestVersion;
}
