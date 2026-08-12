import { isExerciseType, isTestEligibleExerciseType } from '@/src/lib/content/registry';
import { normalizeLearningUnit } from '@/src/lib/learning-units/domain';
import { learningUnitDocumentSchema, testUnitCreateSchema } from '@/src/lib/learning-units/schemas';
import { validateTestAssignmentGraph } from '@/src/lib/tests/domain';
import { mockTestDocumentSchema, testVersionDocumentSchema, testVersionInputSchema } from '@/src/lib/tests/schemas';
import type { TestUnit } from '@/src/types/learning-unit';
import type { MockTest } from '@/src/types/test';

const versionPages = [
  {
    id: 'page-1',
    items: [
      { id: 'instructions', type: 'text', content: 'Read carefully.' },
      {
        id: 'question-1',
        type: 'multiple-choice',
        maxPoints: 3,
        data: {
          question: 'Which answer is correct?',
          options: [
            { id: 'answer-a', text: 'A', isCorrect: true },
            { id: 'answer-b', text: 'B', isCorrect: false },
          ],
          allowMultipleSelections: false,
        },
      },
    ],
  },
];

const testUnit: TestUnit = {
  id: 'test-1',
  kind: 'test',
  title: 'Chapter test',
  description: '',
  passingPercentage: 70,
  rotationVersions: [{ versionId: 'version-1' }],
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
      showWordSearch: true,
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
        showWordSearch: false,
      }).success
    ).toBe(true);

    expect(
      learningUnitDocumentSchema.safeParse({
        ...unit,
        isLive: true,
        liveOrder: 0,
      }).success
    ).toBe(false);
  });

  it('allows empty persisted rotation lists but requires one for creation and placement', () => {
    expect(learningUnitDocumentSchema.safeParse({ ...testUnit, rotationVersions: [] }).success).toBe(true);

    expect(learningUnitDocumentSchema.safeParse(testUnit).success).toBe(true);

    expect(learningUnitDocumentSchema.safeParse({ ...testUnit, isLive: true, liveOrder: 2 }).success).toBe(false);

    expect(testUnitCreateSchema.safeParse({ ...testUnit, rotationVersions: [] }).success).toBe(false);
    expect(testUnitCreateSchema.safeParse({ ...testUnit, type: 'normal' }).success).toBe(false);
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

  it('rejects duplicate stable IDs and scoring on content', () => {
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
      expect.arrayContaining([expect.stringContaining('duplicate ID'), 'Non-exercise content cannot define maxPoints'])
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
  it('enforces lifecycle and active-container ownership', () => {
    expect(mockTestDocumentSchema.safeParse(mockTest).success).toBe(true);
    expect(
      validateTestAssignmentGraph({
        tests: [{ ...testUnit, rotationVersions: [] }],
        mocks: [mockTest],
        versionIds: ['version-1'],
      })
    ).toEqual([]);

    const rotationAndMockOverlap = validateTestAssignmentGraph({
      tests: [testUnit],
      mocks: [mockTest],
      versionIds: ['version-1'],
    });
    expect(rotationAndMockOverlap.join(' ')).toContain('still in normal rotation');

    const standaloneOverlap = validateTestAssignmentGraph({
      tests: [{ ...testUnit, rotationVersions: [] }],
      mocks: [mockTest, { ...mockTest, id: 'mock-2', parent: { kind: 'standalone' } }],
      versionIds: ['version-1'],
    });
    expect(standaloneOverlap.join(' ')).toContain('more than one active mock');

    const duplicateRotation = validateTestAssignmentGraph({
      tests: [testUnit, { ...testUnit, id: 'test-2', rotationVersions: [{ versionId: 'version-1' }] }],
      mocks: [],
      versionIds: ['version-1'],
    });
    expect(duplicateRotation.join(' ')).toContain('more than one test container');

    const missingVersion = validateTestAssignmentGraph({
      tests: [testUnit],
      mocks: [mockTest],
      versionIds: [],
    });
    expect(missingVersion.join(' ')).toEqual(expect.stringContaining('missing rotation version version-1'));

    expect(mockTestDocumentSchema.safeParse({ ...mockTest, status: 'archived', isLive: true }).success).toBe(false);
  });

  it('requires active parent links and allows archived mocks to return a version to rotation', () => {
    const archivedMock: MockTest = {
      ...mockTest,
      status: 'archived',
      isLive: false,
      mockOrder: null,
    };
    const rotationTest: TestUnit = {
      ...testUnit,
      rotationVersions: [{ versionId: 'version-1' }],
    };

    expect(
      validateTestAssignmentGraph({ tests: [rotationTest], mocks: [archivedMock], versionIds: ['version-1'] })
    ).toEqual([]);
    expect(validateTestAssignmentGraph({ tests: [], mocks: [archivedMock], versionIds: ['version-1'] })).toEqual([]);

    const missingParent = validateTestAssignmentGraph({
      tests: [],
      mocks: [mockTest],
      versionIds: ['version-1'],
    });
    expect(missingParent.join(' ')).toContain('missing parent test');

    const missingStandaloneVersion = validateTestAssignmentGraph({
      tests: [],
      mocks: [{ ...mockTest, parent: { kind: 'standalone' } }],
      versionIds: [],
    });
    expect(missingStandaloneVersion.join(' ')).toContain('missing version version-1');

    const missingParentVersion = validateTestAssignmentGraph({
      tests: [testUnit],
      mocks: [mockTest],
      versionIds: [],
    });
    expect(missingParentVersion.join(' ')).toContain('missing version version-1');

    const archivedDanglingParent = validateTestAssignmentGraph({
      tests: [],
      mocks: [archivedMock],
      versionIds: [],
    });
    expect(archivedDanglingParent).toEqual([]);
  });

  it('uses the shared server-safe registry for lesson and test classification', () => {
    expect(isExerciseType('matching')).toBe(true);
    expect(isExerciseType('listening-passage')).toBe(false);
    expect(isTestEligibleExerciseType('matching')).toBe(true);
    expect(isTestEligibleExerciseType('translation-grading')).toBe(true);
  });
});
