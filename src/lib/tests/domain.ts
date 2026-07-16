import type { MockTest } from '@/src/types/test';
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
}

/** Validates cross-document relationships that cannot be expressed by one Zod schema. */
export function validateTestAssignmentGraph({ tests, mocks }: TestAssignmentGraph): string[] {
  const errors: string[] = [];
  const testsById = new Map(tests.map(test => [test.id, test]));
  const activeMocksById = new Map(mocks.filter(mock => mock.status === 'active').map(mock => [mock.id, mock]));
  const testReferencesByVersion = new Map<string, { test: TestUnit; mockTestId: string | null }[]>();
  const activeMocksByVersion = new Map<string, MockTest[]>();

  for (const test of tests) {
    for (const reference of test.versions) {
      const references = testReferencesByVersion.get(reference.versionId) ?? [];
      references.push({ test, mockTestId: reference.mockTestId });
      testReferencesByVersion.set(reference.versionId, references);

      if (reference.mockTestId === null) continue;
      const mock = activeMocksById.get(reference.mockTestId);
      if (!mock) {
        errors.push(`Test ${test.id} references inactive or missing mock ${reference.mockTestId}`);
        continue;
      }
      if (mock.versionId !== reference.versionId) {
        errors.push(`Mock ${mock.id} does not reference version ${reference.versionId}`);
      }
      if (mock.parent.kind !== 'test' || mock.parent.testId !== test.id) {
        errors.push(`Mock ${mock.id} does not point back to test ${test.id}`);
      }
    }
  }

  for (const [versionId, references] of testReferencesByVersion) {
    if (references.length > 1) {
      errors.push(`Version ${versionId} is referenced by more than one test container`);
    }
  }

  for (const mock of mocks) {
    if (mock.status === 'active') {
      const versionMocks = activeMocksByVersion.get(mock.versionId) ?? [];
      versionMocks.push(mock);
      activeMocksByVersion.set(mock.versionId, versionMocks);
    }

    if (mock.parent.kind === 'standalone') {
      if (mock.status === 'active' && testReferencesByVersion.has(mock.versionId)) {
        errors.push(`Standalone mock ${mock.id} uses version ${mock.versionId}, which is assigned to a test`);
      }
      continue;
    }

    const parent = testsById.get(mock.parent.testId);
    if (!parent) {
      errors.push(`Mock ${mock.id} points to missing parent test ${mock.parent.testId}`);
      continue;
    }

    const reference = parent.versions.find(candidate => candidate.versionId === mock.versionId);
    if (!reference) {
      errors.push(`Mock ${mock.id} points to missing version ${mock.versionId} in parent test ${parent.id}`);
      continue;
    }

    if (mock.status === 'active' && reference.mockTestId !== mock.id) {
      errors.push(`Active mock ${mock.id} is not linked from its parent test reference`);
    }
    if (mock.status === 'archived' && reference.mockTestId === mock.id) {
      errors.push(`Archived mock ${mock.id} is still linked from its parent test reference`);
    }
  }

  for (const [versionId, versionMocks] of activeMocksByVersion) {
    if (versionMocks.length > 1) {
      errors.push(`Version ${versionId} is assigned to more than one active mock`);
    }

    const reference = testReferencesByVersion.get(versionId)?.[0];
    if (reference?.mockTestId === null) {
      errors.push(`Version ${versionId} is assigned to a mock while still in normal rotation`);
    }
  }

  return errors;
}
