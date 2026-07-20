import type { MockTest } from '@/src/types/test';
import type { TestVersion } from '@/src/types/test';
import type { TestUnit } from '@/src/types/learning-unit';
import { isExerciseType } from '@/src/lib/content/registry';

export interface TestVersionSummaryFields {
  totalPages: number;
  totalItems: number;
  totalExercises: number;
  totalPoints: number;
}

interface ScoredPageLike {
  items: readonly { type: string; maxPoints?: number }[];
}

export function getTestVersionSummaryFields(pages: readonly ScoredPageLike[]): TestVersionSummaryFields {
  return pages.reduce<TestVersionSummaryFields>(
    (summary, page) => {
      summary.totalItems += page.items.length;

      for (const item of page.items) {
        if (!isExerciseType(item.type)) continue;
        summary.totalExercises += 1;
        summary.totalPoints += typeof item.maxPoints === 'number' ? item.maxPoints : 0;
      }

      return summary;
    },
    {
      totalPages: pages.length,
      totalItems: 0,
      totalExercises: 0,
      totalPoints: 0,
    }
  );
}

export interface TestAssignmentGraph {
  tests: readonly TestUnit[];
  mocks: readonly MockTest[];
  /** The version IDs currently present in `testVersions`. */
  versions?: readonly Pick<TestVersion, 'id'>[];
  /** A lightweight alternative for callers that already projected only IDs. */
  versionIds?: readonly string[];
}

/** Validates cross-document relationships that cannot be expressed by one Zod schema. */
export function validateTestAssignmentGraph({ tests, mocks, versions, versionIds }: TestAssignmentGraph): string[] {
  const errors: string[] = [];
  const testsById = new Map(tests.map(test => [test.id, test]));
  const knownVersionIds = versions
    ? new Set(versions.map(version => version.id))
    : versionIds
      ? new Set(versionIds)
      : undefined;
  const activeMocksById = new Map<string, MockTest>();
  const rotationOwnersByVersion = new Map<string, TestUnit[]>();
  const activeMocksByVersion = new Map<string, MockTest[]>();

  for (const mock of mocks) {
    if (mock.status === 'active') {
      if (activeMocksById.has(mock.id)) {
        errors.push(`Active mock ID ${mock.id} is duplicated`);
      }
      activeMocksById.set(mock.id, mock);

      const versionMocks = activeMocksByVersion.get(mock.versionId) ?? [];
      versionMocks.push(mock);
      activeMocksByVersion.set(mock.versionId, versionMocks);

      if (knownVersionIds && !knownVersionIds.has(mock.versionId)) {
        errors.push(`Active mock ${mock.id} references missing version ${mock.versionId}`);
      }

      if (mock.parent.kind === 'test') {
        const parent = testsById.get(mock.parent.testId);
        if (!parent) {
          errors.push(`Active mock ${mock.id} points to missing parent test ${mock.parent.testId}`);
        }
      }
    }
  }

  for (const test of tests) {
    const seenVersionIds = new Set<string>();
    for (const reference of test.rotationVersions) {
      if (seenVersionIds.has(reference.versionId)) {
        errors.push(`Test ${test.id} contains duplicate rotation version ${reference.versionId}`);
      }
      seenVersionIds.add(reference.versionId);

      const owners = rotationOwnersByVersion.get(reference.versionId) ?? [];
      owners.push(test);
      rotationOwnersByVersion.set(reference.versionId, owners);

      if (knownVersionIds && !knownVersionIds.has(reference.versionId)) {
        errors.push(`Test ${test.id} references missing rotation version ${reference.versionId}`);
      }
    }
    if (test.isLive && test.rotationVersions.length === 0) {
      errors.push(`Live test ${test.id} must have at least one valid rotation version`);
    }
  }

  for (const [versionId, owners] of rotationOwnersByVersion) {
    if (owners.length > 1) {
      errors.push(`Version ${versionId} is referenced by more than one test container`);
    }
    if (activeMocksByVersion.has(versionId)) {
      errors.push(`Version ${versionId} is assigned to an active mock while still in normal rotation`);
    }
  }

  for (const [versionId, versionMocks] of activeMocksByVersion) {
    if (versionMocks.length > 1) {
      errors.push(`Version ${versionId} is assigned to more than one active mock`);
    }
  }

  return errors;
}
