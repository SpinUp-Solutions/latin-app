export const CONTENT_TYPE_METADATA = [
  { type: 'text', label: 'Text Block', kind: 'content', testEligible: true },
  { type: 'emphasis', label: 'Emphasis', kind: 'content', testEligible: true },
  { type: 'table', label: 'Table', kind: 'content', testEligible: true },
  { type: 'vocabulary', label: 'Vocabulary', kind: 'content', testEligible: true },
  { type: 'vocabulary-pool', label: 'Vocabulary Pool', kind: 'content', testEligible: true },
  { type: 'matching', label: 'Matching', kind: 'exercise', testEligible: true },
  { type: 'fill', label: 'Fill-in-Blank', kind: 'exercise', testEligible: true },
  { type: 'multiple-choice', label: 'Multiple Choice', kind: 'exercise', testEligible: true },
  { type: 'odd-one-out', label: 'Odd One Out', kind: 'exercise', testEligible: true },
  { type: 'text-selection', label: 'Text Selection', kind: 'exercise', testEligible: true },
  { type: 'fill-embolded-text', label: 'Fill In Embolded Text', kind: 'exercise', testEligible: true },
  { type: 'sentence-diagramming', label: 'Sentence Diagramming', kind: 'exercise', testEligible: true },
  { type: 'table-fill', label: 'Table Fill Exercise', kind: 'exercise', testEligible: true },
  {
    type: 'click-on-multiple-words',
    label: 'Click On Multiple Words',
    kind: 'exercise',
    testEligible: true,
  },
  {
    type: 'generated-translation',
    label: 'Generated Translation Exercise',
    kind: 'exercise',
    testEligible: true,
  },
  {
    type: 'generated-form-identification',
    label: 'Generated Form Identification Exercise',
    kind: 'exercise',
    testEligible: true,
  },
  {
    type: 'translation-grading',
    label: '[WIP] Translation Grading',
    kind: 'exercise',
    testEligible: false,
  },
  { type: 'listening-passage', label: 'Listening Passage', kind: 'content', testEligible: true },
] as const;

export type ContentType = (typeof CONTENT_TYPE_METADATA)[number]['type'];
export type ExerciseType = Extract<(typeof CONTENT_TYPE_METADATA)[number], { kind: 'exercise' }>['type'];
export type TestEligibleExerciseType = Extract<
  (typeof CONTENT_TYPE_METADATA)[number],
  { kind: 'exercise'; testEligible: true }
>['type'];

const contentMetadataByType = new Map<string, (typeof CONTENT_TYPE_METADATA)[number]>(
  CONTENT_TYPE_METADATA.map(metadata => [metadata.type, metadata])
);

export const EXERCISE_TYPE_METADATA = CONTENT_TYPE_METADATA.filter(metadata => metadata.kind === 'exercise');
export const TEST_ELIGIBLE_CONTENT_TYPE_METADATA = CONTENT_TYPE_METADATA.filter(metadata => metadata.testEligible);
export const TEST_ELIGIBLE_EXERCISE_TYPES = EXERCISE_TYPE_METADATA.filter(metadata => metadata.testEligible).map(
  metadata => metadata.type
) as TestEligibleExerciseType[];

export function getContentTypeMetadata(type: string) {
  return contentMetadataByType.get(type);
}

export function isKnownContentType(type: string): type is ContentType {
  return contentMetadataByType.has(type);
}

export function isExerciseType(type: string): type is ExerciseType {
  return getContentTypeMetadata(type)?.kind === 'exercise';
}

export function isTestEligibleContentType(type: string): type is ContentType {
  return getContentTypeMetadata(type)?.testEligible === true;
}

export function isTestEligibleExerciseType(type: string): type is TestEligibleExerciseType {
  const metadata = getContentTypeMetadata(type);
  return metadata?.kind === 'exercise' && metadata.testEligible;
}
