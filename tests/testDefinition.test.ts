import { calculateTestTotal, toTestSummary, validateTestDefinition } from '@/src/utils/testDefinition';
import type { TestDefinition } from '@/src/types/test';

const makeTest = (): TestDefinition => ({
  id: 'test-one',
  title: 'Test One',
  description: '',
  exercises: [
    {
      maxPoints: 3,
      exercise: {
        id: 'exercise-one',
        type: 'multiple-choice',
        title: 'Question',
        instructions: '',
        feedbackConfig: { escalationLevels: [] },
        data: { question: '', options: [], allowMultipleSelections: false },
      },
    },
  ],
  totalPoints: 999,
});

describe('test definitions', () => {
  it('recomputes totals instead of trusting a submitted total', () => {
    const validation = validateTestDefinition(makeTest());
    expect(validation.errors).toEqual([]);
    expect(validation.test?.totalPoints).toBe(3);
    expect(calculateTestTotal(validation.test!)).toBe(3);
  });

  it('rejects unsupported exercises, duplicate IDs, and invalid points', () => {
    const test = makeTest();
    test.exercises.push({
      exercise: { ...test.exercises[0].exercise, type: 'translation-grading' } as typeof test.exercises[0]['exercise'],
      maxPoints: 0,
    });
    const validation = validateTestDefinition(test);
    expect(validation.errors.join(' ')).toContain('unsupported');
    expect(validation.errors.join(' ')).toContain('unique');
    expect(validation.errors.join(' ')).toContain('positive whole number');
  });

  it('builds a lightweight summary', () => {
    expect(toTestSummary('test-one', makeTest())).toMatchObject({
      id: 'test-one',
      exerciseCount: 1,
      totalPoints: 999,
    });
  });

  it('accepts supporting content between scored exercises', () => {
    const test = makeTest();
    test.items = [
      { content: { id: 'instructions', type: 'text', title: 'Instructions', content: '<p>Read carefully.</p>' } },
      ...test.exercises,
    ];

    const validation = validateTestDefinition(test);

    expect(validation.errors).toEqual([]);
    expect(validation.test?.items).toHaveLength(2);
    expect(validation.test?.exercises).toHaveLength(1);
    expect(validation.test?.totalPoints).toBe(3);
  });

  it('rejects IDs that cannot be used as one Firestore document segment', () => {
    const test = makeTest();
    test.id = 'tests/invalid';
    expect(validateTestDefinition(test).errors.join(' ')).toContain('letters, numbers, hyphens, and underscores');
  });
});
