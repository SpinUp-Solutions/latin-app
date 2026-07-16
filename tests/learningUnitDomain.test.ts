import { isExerciseType, isTestEligibleExerciseType } from '@/src/lib/content/registry';
import { normalizeLearningUnit } from '@/src/lib/learning-units/domain';
import { learningUnitDocumentSchema } from '@/src/lib/learning-units/schemas';
import { validateTestAssignmentGraph } from '@/src/lib/tests/domain';
import { mockTestDocumentSchema, testVersionDocumentSchema, testVersionInputSchema } from '@/src/lib/tests/schemas';
import type { TestUnit } from '@/src/types/learning-unit';
import type { MockTest } from '@/src/types/test';

const versionPages = [
  {
    id: 'page-1',
    items: [
      { id: 'instructions', type: 'text', content: 'Read carefully.' },
      { id: 'question-1', type: 'multiple-choice', maxPoints: 3 },
    ],
  },
];

const testUnit: TestUnit = {
  id: 'test-1',
  kind: 'test',
  type: 'normal',
  title: 'Chapter test',
  description: '',
  isLive: false,
  liveOrder: null,
  publishedAt: null,
  publishedBy: null,
  passingPercentage: 70,
  versions: [{ versionId: 'version-1', label: 'Version A', mockTestId: 'mock-1' }],
};

const mockTest: MockTest = {
  id: 'mock-1',
  versionId: 'version-1',
  parent: { kind: 'test', testId: 'test-1' },
  title: 'Chapter test mock',
  description: '',
  passingPercentage: null,
  status: 'active',
  isLive: true,
  mockOrder: 0,
};

describe('learning-unit domain compatibility', () => {
  it('normalizes a legacy vocabulary lesson without changing its lesson behavior', () => {
    const unit = normalizeLearningUnit(
      {
        title: 'Vocabulary',
        type: 'vocab',
        vocabulary_pool: 'pool-1',
        pages: [{ id: 'page-1', items: [] }],
        isLive: false,
      },
      'lesson-1'
    );

    expect(unit).toMatchObject({
      id: 'lesson-1',
      kind: 'lesson',
      type: 'vocab',
      description: '',
      vocabulary_pool: 'pool-1',
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
    });
  });

  it('keeps empty unpublished legacy lessons normalizable', () => {
    const unit = normalizeLearningUnit(
      {
        title: 'Unpublished draft',
        type: 'normal',
        pages: [],
        isLive: false,
      },
      'lesson-draft'
    );

    expect(unit).toMatchObject({ id: 'lesson-draft', kind: 'lesson', pages: [], isLive: false });

    expect(
      learningUnitDocumentSchema.safeParse({
        ...unit,
        isLive: true,
        liveOrder: 0,
      }).success
    ).toBe(false);
  });

  it('rejects live test containers with no rotation-eligible version', () => {
    expect(learningUnitDocumentSchema.safeParse(testUnit).success).toBe(true);

    const result = learningUnitDocumentSchema.safeParse({ ...testUnit, isLive: true, liveOrder: 2 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.message)).toContain(
      'A live test must have at least one version in normal rotation'
    );
  });
});

describe('test-version boundaries', () => {
  it('requires inline exercise points and verifies all derived summary fields', () => {
    expect(testVersionInputSchema.safeParse({ id: 'version-1', name: 'Version A', pages: versionPages }).success).toBe(
      true
    );

    expect(
      testVersionDocumentSchema.safeParse({
        id: 'version-1',
        name: 'Version A',
        pages: versionPages,
        totalPages: 1,
        totalItems: 2,
        totalExercises: 1,
        totalPoints: 3,
      }).success
    ).toBe(true);

    const staleSummary = testVersionDocumentSchema.safeParse({
      id: 'version-1',
      name: 'Version A',
      pages: versionPages,
      totalPages: 1,
      totalItems: 2,
      totalExercises: 1,
      totalPoints: 99,
    });
    expect(staleSummary.success).toBe(false);
    expect(staleSummary.error?.issues.map(issue => issue.message)).toContain('totalPoints must be derived from pages');
  });

  it('rejects duplicate stable IDs, scoring on content, and unsupported exercises', () => {
    const result = testVersionInputSchema.safeParse({
      id: 'version-1',
      name: 'Broken version',
      pages: [
        {
          id: 'page-1',
          items: [{ id: 'duplicate', type: 'text', maxPoints: 1 }],
        },
        {
          id: 'page-2',
          items: [{ id: 'duplicate', type: 'translation-grading', maxPoints: 1 }],
        },
      ],
    });

    const messages = result.error?.issues.map(issue => issue.message) ?? [];
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate ID'),
        'Non-exercise content cannot define maxPoints',
        'Exercise type "translation-grading" is not eligible for tests',
      ])
    );
  });

  it('rejects collection document IDs containing path separators', () => {
    expect(
      testVersionInputSchema.safeParse({ id: 'nested/version', name: 'Version A', pages: versionPages }).success
    ).toBe(false);
    expect(learningUnitDocumentSchema.safeParse({ ...testUnit, id: 'nested/test' }).success).toBe(false);
    expect(mockTestDocumentSchema.safeParse({ ...mockTest, id: 'nested/mock' }).success).toBe(false);
  });
});

describe('mock assignment boundaries', () => {
  it('enforces lifecycle and bidirectional parent links', () => {
    expect(mockTestDocumentSchema.safeParse(mockTest).success).toBe(true);
    expect(validateTestAssignmentGraph({ tests: [testUnit], mocks: [mockTest] })).toEqual([]);

    const unlinkedTest: TestUnit = {
      ...testUnit,
      isLive: false,
      versions: [{ ...testUnit.versions[0], mockTestId: null }],
    };
    expect(validateTestAssignmentGraph({ tests: [unlinkedTest], mocks: [mockTest] }).join(' ')).toContain(
      'not linked from its parent'
    );

    expect(mockTestDocumentSchema.safeParse({ ...mockTest, status: 'archived', isLive: true }).success).toBe(false);
  });

  it('requires archived parent-linked mocks to retain their parent version', () => {
    const archivedMock: MockTest = {
      ...mockTest,
      status: 'archived',
      isLive: false,
      mockOrder: null,
    };
    const rotationTest: TestUnit = {
      ...testUnit,
      versions: [{ ...testUnit.versions[0], mockTestId: null }],
    };

    expect(validateTestAssignmentGraph({ tests: [rotationTest], mocks: [archivedMock] })).toEqual([]);
    expect(validateTestAssignmentGraph({ tests: [], mocks: [archivedMock] }).join(' ')).toContain(
      'missing parent test'
    );

    const parentWithoutVersion: TestUnit = {
      ...rotationTest,
      versions: [{ versionId: 'version-2', label: 'Version B', mockTestId: null }],
    };
    expect(validateTestAssignmentGraph({ tests: [parentWithoutVersion], mocks: [archivedMock] }).join(' ')).toContain(
      'missing version version-1'
    );
  });

  it('uses the shared server-safe registry for lesson and test classification', () => {
    expect(isExerciseType('matching')).toBe(true);
    expect(isExerciseType('listening-passage')).toBe(false);
    expect(isTestEligibleExerciseType('matching')).toBe(true);
    expect(isTestEligibleExerciseType('translation-grading')).toBe(false);
  });
});
