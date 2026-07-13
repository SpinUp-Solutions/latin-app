import type { Exercise } from '@/src/types/exercises';
import type { RenderableContentItem } from '@/src/types/page';
import type { Page } from '@/src/types/page';
import type { ScoredTestExercise, TestDefinition, TestItem, TestSummary } from '@/src/types/test';

export const SUPPORTED_TEST_EXERCISE_TYPES = new Set([
  'matching',
  'fill',
  'multiple-choice',
  'odd-one-out',
  'text-selection',
  'fill-embolded-text',
  'sentence-diagramming',
  'table-fill',
  'click-on-multiple-words',
  'generated-translation',
  'generated-form-identification',
]);

export const isScoredTestExercise = (item: TestItem): item is ScoredTestExercise => 'exercise' in item;

export const getTestItems = (test: Pick<TestDefinition, 'items' | 'exercises'> | Partial<TestDefinition>): TestItem[] =>
  test.items?.length ? test.items : test.exercises || [];

export const getTestExercises = (test: Pick<TestDefinition, 'items' | 'exercises'> | Partial<TestDefinition>): ScoredTestExercise[] =>
  getTestItems(test).filter(isScoredTestExercise);

export const getTestPages = (test: Partial<TestDefinition>): Page[] => {
  if (test.pages?.length) return test.pages;
  return [{ id: `test-page-${test.id || 'new'}`, title: 'Test', items: getTestItems(test).map(item =>
    isScoredTestExercise(item) ? item.exercise : item.content
  ) }];
};

export const calculateTestTotal = (value: TestItem[] | Pick<TestDefinition, 'items' | 'exercises'>): number => {
  const items = Array.isArray(value) ? value : getTestItems(value);
  return items.filter(isScoredTestExercise).reduce((total, item) => total + item.maxPoints, 0);
};

export const validateTestDefinition = (value: unknown): { test?: TestDefinition; errors: string[] } => {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { errors: ['Test data is required'] };

  const candidate = value as Partial<TestDefinition>;
  if (!candidate.id?.trim()) errors.push('Test ID is required');
  else if (!/^[a-zA-Z0-9_-]+$/.test(candidate.id.trim())) {
    errors.push('Test ID may only contain letters, numbers, hyphens, and underscores');
  }
  if (!candidate.title?.trim()) errors.push('Test title is required');
  const items = Array.isArray(candidate.items) ? candidate.items : candidate.exercises || [];
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('At least one content item is required');
  }

  const ids = new Set<string>();
  let exerciseCount = 0;
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object') {
      errors.push(`Content item ${index + 1} is invalid`);
      continue;
    }
    if ('exercise' in item) {
      exerciseCount += 1;
      const exercise = item.exercise as Exercise | undefined;
      if (!exercise?.id || !exercise.type) {
        errors.push(`Exercise ${index + 1} is invalid`);
        continue;
      }
      if (!SUPPORTED_TEST_EXERCISE_TYPES.has(exercise.type)) {
        errors.push(`Exercise ${index + 1} uses unsupported type "${exercise.type}"`);
      }
      if (ids.has(exercise.id)) errors.push(`Content item IDs must be unique (${exercise.id})`);
      ids.add(exercise.id);
      if (!Number.isInteger(item.maxPoints) || item.maxPoints <= 0) {
        errors.push(`Exercise ${index + 1} points must be a positive whole number`);
      }
    } else {
      const content = item.content as RenderableContentItem | undefined;
      if (!content?.id || !content.type) errors.push(`Content item ${index + 1} is invalid`);
      else {
        if (ids.has(content.id)) errors.push(`Content item IDs must be unique (${content.id})`);
        ids.add(content.id);
      }
    }
  }
  if (items.length > 0 && exerciseCount === 0) errors.push('At least one scored exercise is required');

  if (errors.length > 0) return { errors };

  const test = {
    ...(candidate as TestDefinition),
    pages: candidate.pages,
    items: items as TestItem[],
    exercises: (items as TestItem[]).filter(isScoredTestExercise),
    id: candidate.id!.trim(),
    title: candidate.title!.trim(),
    description: candidate.description?.trim() || '',
    totalPoints: calculateTestTotal(items as TestItem[]),
  };
  return { test, errors };
};

export const toTestSummary = (id: string, value: Partial<TestDefinition>): TestSummary => ({
  id,
  title: value.title || 'Untitled Test',
  description: value.description || '',
  totalPoints: value.totalPoints ?? calculateTestTotal(getTestItems(value)),
  exerciseCount: getTestExercises(value).length,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
  version: value.version,
});
