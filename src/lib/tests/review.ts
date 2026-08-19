import { z } from 'zod';
import { firestoreDocumentIdSchema, nonEmptyIdSchema } from '@/src/lib/learning-units/schemas';
import type { Exercise } from '@/src/types/exercises';
import type { TestEligibleExerciseType } from '@/src/lib/content/registry';
import { isExerciseType } from '@/src/lib/content/registry';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { RenderableContentItem } from '@/src/types/page';
import type { TestAttemptExerciseResult, TestAttemptOrigin, TestTranslationGrades } from '@/src/types/test';
import { compareDiagramAnnotationSets } from '@/src/features/sentence-diagramming/model';
import { normalizeSentenceDiagramFeedbackContent } from '@/src/features/sentence-diagramming/model';
import type { GeneratedTranslationItem } from '@/src/utils/exercises/generatedTranslationExercise';
import { validateGeneratedTranslationExercise } from '@/src/utils/exercises/generatedTranslationExercise';
import {
  normalize,
  scoreSingleFieldFormIdentificationAnswer,
  validateGeneratedFormIdentificationExercise,
  validateMultiAnswerStep,
  validatePartialMultiAnswerPaths,
} from '@/src/utils/exercises/generatedFormIdentificationExercise';
import { getAcceptedAnswersForStep } from '@/src/utils/exercises/formIdentificationHelpers';
import { validateClickOnMultipleWords } from '@/src/utils/exercises/clickOnMultipleWords';
import { validateFillEmboldedTextExercise } from '@/src/utils/exercises/fillEmboldedTextExercise';
import { validateFillExercise } from '@/src/utils/exercises/fillExercise';
import { validateMatchingExercise } from '@/src/utils/exercises/matchingExercise';
import { validateMultipleChoiceExercise } from '@/src/utils/exercises/multipleChoiceExercise';
import { validateOddOneOutExercise } from '@/src/utils/exercises/oddOneOutExercise';
import { validateTableFillExercise } from '@/src/utils/exercises/tableFillExercise';
import { validateTextSelectionExercise } from '@/src/utils/exercises/textSelectionExercise';
import { maxPointsFor } from './grading';
import type { FrozenTestDeliveryState } from './delivery';
import {
  projectClickOnMultipleWordsExercise,
  projectFillEmboldedTextExercise,
  projectFillExercise,
  projectGeneratedFormIdentificationExercise,
  projectGeneratedTranslationExercise,
  projectListeningPassageContent,
  projectMatchingExercise,
  projectMultipleChoiceExercise,
  projectOddOneOutExercise,
  projectSentenceDiagrammingExercise,
  projectTableContent,
  projectTableFillExercise,
  projectTextContent,
  projectTextSelectionExercise,
  projectTranslationGradingExercise,
  projectVocabularyContent,
  projectVocabularyPoolContent,
} from './delivery';
import type {
  FormIdentificationItem,
  MultiAnswerFormIdentificationItem,
  SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import { estimateFirestoreDocumentBytes } from './firestore-size';
import { testAttemptOriginSchema } from './schemas';
import { EXERCISE_ANSWER_SCHEMAS } from './answer-schemas';
import { ANNOTATION_SPECS, type AnnotationKind } from '@/src/features/sentence-diagramming/annotation-spec';

export const TEST_RESULT_REVIEW_VERSION = 1;
export const MAX_TEST_RESULT_REVIEW_DOCUMENT_BYTES = 900 * 1024;

const isoTimestampSchema = z
  .string()
  .refine(
    value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
    'Expected a canonical ISO-8601 timestamp'
  );

const reviewPointsSchema = z
  .object({
    awardedPoints: z.number().finite().nonnegative(),
    maxPoints: z.number().finite().positive(),
  })
  .strict()
  .superRefine((points, context) => {
    if (points.awardedPoints > points.maxPoints) {
      context.addIssue({ code: 'custom', message: 'Awarded points cannot exceed maximum points' });
    }
  });

const reviewAudioPathSchema = z.string().nullable().optional();
const reviewColumnSchema = z
  .object({ id: nonEmptyIdSchema, header: z.string(), className: z.string().optional() })
  .strict();
const vocabularyItemSchema = z
  .object({
    id: nonEmptyIdSchema,
    latin: z.string(),
    english: z.string(),
    pronunciation: z.string().nullable().optional(),
    audioPath: reviewAudioPathSchema,
    example: z.string().optional(),
    partOfSpeech: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
const supportingBaseShape = {
  id: nonEmptyIdSchema,
  title: z.string().optional(),
  audioPath: reviewAudioPathSchema,
};
const reviewSupportingItemSchema = z.discriminatedUnion('type', [
  z.object({ ...supportingBaseShape, type: z.literal('text'), content: z.string() }).strict(),
  z.object({ ...supportingBaseShape, type: z.literal('emphasis'), content: z.string() }).strict(),
  z
    .object({
      ...supportingBaseShape,
      type: z.literal('table'),
      tableData: z
        .object({
          title: z.string().optional(),
          caption: z.string().optional(),
          columns: z.array(reviewColumnSchema),
          rows: z.array(
            z
              .object({
                id: nonEmptyIdSchema,
                cells: z.record(z.string(), z.string()),
                rowHeader: z.string().optional(),
              })
              .strict()
          ),
          footnotes: z.array(z.string()).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...supportingBaseShape,
      type: z.literal('vocabulary'),
      vocabularyItems: z.array(vocabularyItemSchema),
    })
    .strict(),
  z.object({ ...supportingBaseShape, type: z.literal('vocabulary-pool') }).strict(),
  z
    .object({
      ...supportingBaseShape,
      type: z.literal('listening-passage'),
      instructions: z.string().optional(),
      itemProgressionDelay: z.number().finite().optional(),
      data: z
        .object({
          latinText: z.string(),
          translation: z.string(),
          passageAudioPath: reviewAudioPathSchema,
        })
        .strict(),
    })
    .strict(),
]);

const diagramSpanSchema = z
  .object({
    startTokenIndex: z.number().int().nonnegative(),
    endTokenIndex: z.number().int().nonnegative(),
    startCharOffset: z.number().int().nonnegative(),
    endCharOffset: z.number().int().nonnegative(),
  })
  .strict();
const diagramAnnotationSchema = z
  .object({
    id: nonEmptyIdSchema,
    kind: z.custom<AnnotationKind>(
      value => typeof value === 'string' && value in ANNOTATION_SPECS,
      'Invalid sentence-diagram annotation kind'
    ),
    span: diagramSpanSchema,
  })
  .strict();
const diagramTokenSchema = z
  .object({ id: nonEmptyIdSchema, text: z.string(), index: z.number().int().nonnegative() })
  .strict();
const diagramFeedbackSchema = z
  .object({ text: z.string(), tokens: z.array(diagramTokenSchema), annotations: z.array(diagramAnnotationSchema) })
  .strict();

const reviewExerciseSchema = <
  Type extends ExerciseAnswer['type'],
  Question extends z.ZodType,
  AnswerKey extends z.ZodType,
  ItemResults extends z.ZodType,
>(
  type: Type,
  question: Question,
  answerKey: AnswerKey,
  itemResults: ItemResults
) =>
  z
    .object({
      id: nonEmptyIdSchema,
      type: z.literal(type),
      title: z.string(),
      instructions: z.string().optional(),
      audioPath: reviewAudioPathSchema,
      maxPoints: z.number().finite().positive(),
      explanation: z.string().optional(),
      question,
      answerKey,
      itemResults,
      studentAnswer: EXERCISE_ANSWER_SCHEMAS[type].nullable(),
      result: reviewPointsSchema,
    })
    .strict();

const matchingReviewSchema = reviewExerciseSchema(
  'matching',
  z
    .object({
      leftColumn: z.array(z.object({ id: nonEmptyIdSchema, value: z.string() }).strict()),
      rightColumn: z.array(z.object({ id: nonEmptyIdSchema, value: z.string() }).strict()),
      expectedMatchCount: z.number().int().nonnegative(),
      requiredRepetitions: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      pairs: z.array(
        z
          .object({
            leftId: nonEmptyIdSchema,
            leftValue: z.string(),
            rightId: nonEmptyIdSchema,
            rightValue: z.string(),
          })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      rounds: z.array(
        z.record(
          z.string(),
          z
            .object({
              rightId: z.string().nullable(),
              correct: z.boolean(),
              points: reviewPointsSchema,
            })
            .strict()
        )
      ),
    })
    .strict()
);

const fillReviewSchema = reviewExerciseSchema(
  'fill',
  z.object({ items: z.array(z.object({ text: z.string() }).strict()) }).strict(),
  z
    .object({
      items: z.array(
        z
          .object({
            text: z.string(),
            acceptedAnswers: z.array(z.string()).min(1),
            explanation: z.string().optional(),
          })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      answers: z.array(z.object({ value: z.string(), correct: z.boolean(), points: reviewPointsSchema }).strict()),
    })
    .strict()
);

const multipleChoiceReviewSchema = reviewExerciseSchema(
  'multiple-choice',
  z
    .object({
      question: z.string(),
      options: z.array(z.object({ id: nonEmptyIdSchema, text: z.string() }).strict()),
      allowMultipleSelections: z.boolean(),
    })
    .strict(),
  z
    .object({
      options: z.array(z.object({ id: nonEmptyIdSchema, text: z.string(), isCorrect: z.boolean() }).strict()),
    })
    .strict(),
  z.object({ selectedOptionIds: z.array(z.string()), correct: z.boolean(), points: reviewPointsSchema }).strict()
);

const oddOneOutReviewSchema = reviewExerciseSchema(
  'odd-one-out',
  z
    .object({
      question: z.string(),
      items: z.array(z.object({ id: nonEmptyIdSchema, text: z.string() }).strict()),
      requireExplanation: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      items: z.array(z.object({ id: nonEmptyIdSchema, text: z.string(), isOddOneOut: z.boolean() }).strict()),
    })
    .strict(),
  z
    .object({
      selectedItemId: z.string(),
      explanation: z.string(),
      correct: z.boolean(),
      points: reviewPointsSchema,
    })
    .strict()
);

const textSelectionReviewSchema = reviewExerciseSchema(
  'text-selection',
  z
    .object({
      passage: z.string(),
      questions: z.array(z.object({ id: nonEmptyIdSchema, text: z.string() }).strict()),
    })
    .strict(),
  z
    .object({
      questions: z.array(
        z
          .object({
            id: nonEmptyIdSchema,
            text: z.string(),
            correctWordIndex: z.number().int().nonnegative(),
            explanation: z.string().optional(),
          })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      selections: z.array(
        z
          .object({
            questionId: nonEmptyIdSchema,
            wordIndex: z.number().int(),
            correct: z.boolean(),
            points: reviewPointsSchema,
          })
          .strict()
      ),
    })
    .strict()
);

const fillEmboldedTextReviewSchema = reviewExerciseSchema(
  'fill-embolded-text',
  z
    .object({
      passage: z.string(),
      words: z.array(z.object({ wordIndex: z.number().int().nonnegative(), question: z.string().optional() }).strict()),
    })
    .strict(),
  z
    .object({
      words: z.array(
        z
          .object({
            wordIndex: z.number().int().nonnegative(),
            correctAnswer: z.string(),
            question: z.string().optional(),
            explanation: z.string().optional(),
          })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      answers: z.array(z.object({ value: z.string(), correct: z.boolean(), points: reviewPointsSchema }).strict()),
    })
    .strict()
);

const sentenceDiagrammingReviewSchema = reviewExerciseSchema(
  'sentence-diagramming',
  z
    .object({
      latin: z.string(),
      translation: z.string(),
      tokens: z.array(diagramTokenSchema),
      availableStudentTools: z.array(z.string()).optional(),
      difficulty: z.string().optional(),
    })
    .strict(),
  z
    .object({
      latin: z.string(),
      translation: z.string(),
      tokens: z.array(diagramTokenSchema),
      solutionAnnotations: z.array(diagramAnnotationSchema),
      explanation: diagramFeedbackSchema.optional(),
    })
    .strict(),
  z
    .object({
      annotations: z.array(diagramAnnotationSchema),
      accuracy: z.number().finite().min(0).max(100),
      correct: z.boolean(),
      points: reviewPointsSchema,
    })
    .strict()
);

const tableFillReviewSchema = reviewExerciseSchema(
  'table-fill',
  z
    .object({
      title: z.string().optional(),
      columns: z.array(reviewColumnSchema),
      rows: z.array(
        z
          .object({
            id: nonEmptyIdSchema,
            cells: z.record(z.string(), z.object({ content: z.string(), isBlank: z.boolean() }).strict()),
          })
          .strict()
      ),
      footnotes: z.array(z.string()).optional(),
    })
    .strict(),
  z
    .object({
      rows: z.array(
        z
          .object({
            id: nonEmptyIdSchema,
            cells: z.record(
              z.string(),
              z.object({ content: z.string(), isBlank: z.boolean(), answer: z.string().optional() }).strict()
            ),
          })
          .strict()
      ),
    })
    .strict(),
  z
    .object({
      cells: z.array(
        z
          .object({
            rowId: nonEmptyIdSchema,
            columnId: nonEmptyIdSchema,
            value: z.string(),
            correct: z.boolean(),
            points: reviewPointsSchema,
          })
          .strict()
      ),
    })
    .strict()
);

const clickOnMultipleWordsReviewSchema = reviewExerciseSchema(
  'click-on-multiple-words',
  z.object({ title: z.string().optional(), passage: z.string(), instructions: z.string().optional() }).strict(),
  z.object({ correctWordIndices: z.array(z.number().int().nonnegative()) }).strict(),
  z
    .object({
      selectedWordIndices: z.array(z.number().int().nonnegative()),
      correct: z.boolean(),
      points: reviewPointsSchema,
    })
    .strict()
);

const generatedTranslationReviewSchema = reviewExerciseSchema(
  'generated-translation',
  z.object({}).strict(),
  z
    .object({
      items: z.array(z.object({ text: z.string(), acceptedAnswers: z.array(z.string()).min(1) }).strict()),
    })
    .strict(),
  z
    .object({
      answers: z.array(z.object({ value: z.string(), correct: z.boolean(), points: reviewPointsSchema }).strict()),
    })
    .strict()
);

const generatedFormKeyItemSchema = z.union([
  z
    .object({
      id: nonEmptyIdSchema,
      word: z.string(),
      selected_form: z.string(),
      step: z.string(),
      correctAnswer: z.string(),
      acceptedAnswers: z.array(z.string()).min(1),
    })
    .strict(),
  z
    .object({
      id: nonEmptyIdSchema,
      word: z.string(),
      selected_form: z.string(),
      steps: z.array(z.string()).min(1),
      correctAnswerDisplay: z.string(),
    })
    .strict(),
  z
    .object({
      id: nonEmptyIdSchema,
      word: z.string(),
      selected_form: z.string(),
      step: z.string(),
      steps: z.array(z.string()).min(1),
      stepIndex: z.number().int().nonnegative(),
      totalSteps: z.number().int().positive(),
      expectedAnswerCount: z.number().int().positive(),
      correctAnswerDisplay: z.string(),
    })
    .strict(),
]);
const generatedFormIdentificationReviewSchema = reviewExerciseSchema(
  'generated-form-identification',
  z
    .object({
      mode: z.enum(['step-by-step', 'single-field']),
      requireAllPrimaryAnswers: z.boolean().optional(),
      showDictionaryEntry: z.boolean().optional(),
    })
    .strict(),
  z.object({ items: z.array(generatedFormKeyItemSchema) }).strict(),
  z
    .object({
      answers: z.array(
        z
          .object({
            id: nonEmptyIdSchema,
            value: z.string(),
            correct: z.boolean(),
            points: reviewPointsSchema,
          })
          .strict()
      ),
    })
    .strict()
);

const translationGradingReviewSchema = reviewExerciseSchema(
  'translation-grading',
  z
    .object({
      items: z.array(z.object({ latinText: z.string(), instructions: z.string().optional() }).strict()),
    })
    .strict(),
  z
    .object({
      items: z.array(z.object({ latinText: z.string(), instructions: z.string().optional() }).strict()),
    })
    .strict(),
  z
    .object({
      items: z.array(
        z
          .object({
            translation: z.string(),
            score: z.number().finite().min(0).max(10).nullable(),
            feedback: z.string().nullable(),
            points: reviewPointsSchema,
          })
          .strict()
      ),
    })
    .strict()
);

const reviewExerciseItemSchema = z.discriminatedUnion('type', [
  matchingReviewSchema,
  fillReviewSchema,
  multipleChoiceReviewSchema,
  oddOneOutReviewSchema,
  textSelectionReviewSchema,
  fillEmboldedTextReviewSchema,
  sentenceDiagrammingReviewSchema,
  tableFillReviewSchema,
  clickOnMultipleWordsReviewSchema,
  generatedTranslationReviewSchema,
  generatedFormIdentificationReviewSchema,
  translationGradingReviewSchema,
]);

/** Durable persisted review contract. Unknown fields and malformed variants fail closed. */
export const testResultReviewDocumentSchema = z
  .object({
    id: firestoreDocumentIdSchema,
    reviewVersion: z.literal(TEST_RESULT_REVIEW_VERSION),
    studentId: z.string().min(1),
    attemptId: firestoreDocumentIdSchema,
    versionId: firestoreDocumentIdSchema,
    origin: testAttemptOriginSchema,
    submittedAt: isoTimestampSchema,
    content: z
      .object({
        pages: z
          .array(
            z
              .object({
                id: nonEmptyIdSchema,
                title: z.string().optional(),
                audioPath: reviewAudioPathSchema,
                items: z.array(z.union([reviewSupportingItemSchema, reviewExerciseItemSchema])),
              })
              .strict()
          )
          .min(1),
        vocabularyPool: z
          .object({
            id: firestoreDocumentIdSchema,
            name: z.string().trim().min(1),
            items: z.array(vocabularyItemSchema),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((review, context) => {
    if (review.id !== review.attemptId) {
      context.addIssue({ code: 'custom', path: ['attemptId'], message: 'Review ID must match attemptId' });
    }
  });

export type ReviewPartPoints = z.infer<typeof reviewPointsSchema>;
export type TestResultReviewSupportingItem = z.infer<typeof reviewSupportingItemSchema>;
export type TestResultReviewExerciseItem = z.infer<typeof reviewExerciseItemSchema>;
export type TestResultReviewItem = TestResultReviewSupportingItem | TestResultReviewExerciseItem;
export type TestResultReview = z.infer<typeof testResultReviewDocumentSchema>;
export type TestResultReviewContent = TestResultReview['content'];
export type TestResultReviewPage = TestResultReviewContent['pages'][number];
export type StudentTestResultReview = Omit<TestResultReview, 'studentId'>;
type MatchingReviewResults = Extract<TestResultReviewExerciseItem, { type: 'matching' }>['itemResults'];
type FillReviewResults = Extract<TestResultReviewExerciseItem, { type: 'fill' }>['itemResults'];

export function toStudentTestResultReview(review: TestResultReview): StudentTestResultReview {
  const { studentId: _studentId, ...studentReview } = review;
  return studentReview;
}

export function isTestResultReviewDocumentWithinSizeLimit(
  review: TestResultReview,
  maxBytes = MAX_TEST_RESULT_REVIEW_DOCUMENT_BYTES
) {
  const estimatedBytes = estimateFirestoreDocumentBytes({ ...review });
  if (estimatedBytes > maxBytes) {
    console.error(
      `Review for attempt ${review.attemptId} is approximately ${estimatedBytes} bytes, above the ${maxBytes}-byte safety limit`
    );
    return false;
  }
  return true;
}

type ExerciseOfType<T extends TestEligibleExerciseType> = Extract<Exercise, { type: T }>;
type AnswerOfType<T extends ExerciseAnswer['type']> = Extract<ExerciseAnswer, { type: T }>;

const savedAnswer = <T extends ExerciseAnswer['type']>(
  exerciseType: T,
  answer: ExerciseAnswer | unknown | undefined
): AnswerOfType<T> | null => {
  if (!answer || typeof answer !== 'object') return null;
  if ((answer as { type?: unknown }).type === exerciseType) return answer as AnswerOfType<T>;
  return null;
};

const pointsForPart = (
  earnedUnits: number,
  partAvailableUnits: number,
  totalAvailableUnits: number,
  maxPoints: number
) => ({
  awardedPoints: totalAvailableUnits > 0 ? (maxPoints * earnedUnits) / totalAvailableUnits : 0,
  maxPoints: totalAvailableUnits > 0 ? (maxPoints * partAvailableUnits) / totalAvailableUnits : maxPoints,
});

const projectedQuestion = <Question>(projection: unknown): Question => (projection as { data: Question }).data;

export interface BuildSubmittedReviewInput {
  attemptId: string;
  studentId: string;
  versionId: string;
  origin: TestAttemptOrigin;
  submittedAt: string;
  deliveryState: FrozenTestDeliveryState;
  answers: Record<string, ExerciseAnswer | unknown>;
  translationGrades: TestTranslationGrades;
  exerciseResults: Record<string, TestAttemptExerciseResult>;
}

function buildMatchingReview(exercise: ExerciseOfType<'matching'>, answer: ExerciseAnswer | unknown) {
  const student = savedAnswer('matching', answer);
  const answerEntries = Object.entries(exercise.data.answers);
  const pairs = answerEntries.map(([leftId, rightId]) => {
    const left = exercise.data.leftColumn.find(item => item.id === leftId);
    const right = exercise.data.rightColumn.find(item => item.id === rightId);
    return { leftId, leftValue: left?.value ?? '', rightId, rightValue: right?.value ?? '' };
  });
  const requiredRounds = exercise.data.requiredRepetitions ?? 1;
  const totalParts = answerEntries.length * requiredRounds;
  const rounds: MatchingReviewResults['rounds'] = Array.from({ length: requiredRounds }, (_, roundIndex) => {
    const round = student?.rounds[roundIndex] ?? {};
    const byLeftId: MatchingReviewResults['rounds'][number] = {};
    for (const [leftId] of answerEntries) {
      const rightId = round[leftId] ?? null;
      const left = exercise.data.leftColumn.find(item => item.id === leftId);
      const right = rightId ? exercise.data.rightColumn.find(item => item.id === rightId) : undefined;
      const correct = Boolean(left && right && validateMatchingExercise(left, right, exercise).isCorrect);
      byLeftId[leftId] = {
        rightId,
        correct,
        points: pointsForPart(correct ? 1 : 0, 1, totalParts, maxPointsFor(exercise)),
      };
    }
    return byLeftId;
  });
  return {
    question: projectedQuestion(projectMatchingExercise(exercise)),
    answerKey: { pairs },
    itemResults: { rounds },
  };
}

function buildFillReview(exercise: ExerciseOfType<'fill'>, answer: ExerciseAnswer | unknown) {
  const student = savedAnswer('fill', answer);
  const totalParts = exercise.data.items.length;
  return {
    question: projectedQuestion(projectFillExercise(exercise)),
    answerKey: {
      items: exercise.data.items.map(item => ({
        text: item.text,
        acceptedAnswers: [item.answer],
        ...(item.explanation ? { explanation: item.explanation } : {}),
      })),
    },
    itemResults: {
      answers: exercise.data.items.map((_, index) => {
        const value = student?.answers[index] ?? '';
        const correct = student ? validateFillExercise(value, exercise, index).isCorrect : false;
        return {
          value,
          correct,
          points: pointsForPart(correct ? 1 : 0, 1, totalParts, maxPointsFor(exercise)),
        };
      }),
    } satisfies FillReviewResults,
  };
}

function buildMultipleChoiceReview(exercise: ExerciseOfType<'multiple-choice'>, answer: ExerciseAnswer | unknown) {
  const student = savedAnswer('multiple-choice', answer);
  const correct = student ? validateMultipleChoiceExercise(student.selectedOptionIds, exercise).isCorrect : false;
  return {
    question: projectedQuestion(projectMultipleChoiceExercise(exercise)),
    answerKey: {
      options: exercise.data.options.map(option => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    },
    itemResults: {
      selectedOptionIds: student?.selectedOptionIds ?? [],
      correct,
      points: pointsForPart(correct ? 1 : 0, 1, 1, maxPointsFor(exercise)),
    },
    ...(exercise.data.explanation ? { explanation: exercise.data.explanation } : {}),
  };
}

function buildOddOneOutReview(exercise: ExerciseOfType<'odd-one-out'>, answer: ExerciseAnswer | unknown) {
  const student = savedAnswer('odd-one-out', answer);
  const correct = student
    ? validateOddOneOutExercise(student.selectedItemId, student.explanation, exercise).isCorrect
    : false;
  return {
    question: projectedQuestion(projectOddOneOutExercise(exercise)),
    answerKey: {
      items: exercise.data.items.map(item => ({ id: item.id, text: item.text, isOddOneOut: item.isOddOneOut })),
    },
    itemResults: {
      selectedItemId: student?.selectedItemId ?? '',
      explanation: student?.explanation ?? '',
      correct,
      points: pointsForPart(correct ? 1 : 0, 1, 1, maxPointsFor(exercise)),
    },
    ...(exercise.data.explanation ? { explanation: exercise.data.explanation } : {}),
  };
}

function buildTextSelectionReview(exercise: ExerciseOfType<'text-selection'>, answer: ExerciseAnswer | unknown) {
  const student = savedAnswer('text-selection', answer);
  const totalParts = exercise.data.questions.length;
  return {
    question: projectedQuestion(projectTextSelectionExercise(exercise)),
    answerKey: {
      questions: exercise.data.questions.map(question => ({
        id: question.id,
        text: question.text,
        correctWordIndex: question.correctWordIndex,
        ...(question.explanation ? { explanation: question.explanation } : {}),
      })),
    },
    itemResults: {
      selections: exercise.data.questions.map((question, index) => {
        const wordIndex = student?.selectedWordIndices[index] ?? -1;
        const correct = student ? validateTextSelectionExercise(wordIndex, exercise, index).isCorrect : false;
        return {
          questionId: question.id,
          wordIndex,
          correct,
          points: pointsForPart(correct ? 1 : 0, 1, totalParts, maxPointsFor(exercise)),
        };
      }),
    },
  };
}

function buildFillEmboldedTextReview(exercise: ExerciseOfType<'fill-embolded-text'>, answer: ExerciseAnswer | unknown) {
  const student = savedAnswer('fill-embolded-text', answer);
  const totalParts = exercise.data.words.length;
  return {
    question: projectedQuestion(projectFillEmboldedTextExercise(exercise)),
    answerKey: {
      words: exercise.data.words.map(word => ({
        wordIndex: word.wordIndex,
        correctAnswer: word.correctAnswer,
        ...(word.question ? { question: word.question } : {}),
        ...(word.explanation ? { explanation: word.explanation } : {}),
      })),
    },
    itemResults: {
      answers: exercise.data.words.map((_, index) => {
        const value = student?.answers[index] ?? '';
        const correct = student ? validateFillEmboldedTextExercise(value, exercise, index).isCorrect : false;
        return {
          value,
          correct,
          points: pointsForPart(correct ? 1 : 0, 1, totalParts, maxPointsFor(exercise)),
        };
      }),
    },
  };
}

function buildSentenceDiagrammingReview(
  exercise: ExerciseOfType<'sentence-diagramming'>,
  answer: ExerciseAnswer | unknown
) {
  const student = savedAnswer('sentence-diagramming', answer);
  const annotations = student?.annotations ?? [];
  const solution = exercise.data.solutionAnnotations ?? [];
  const comparison = compareDiagramAnnotationSets(annotations, solution, exercise.data.tokens);
  return {
    question: projectedQuestion(projectSentenceDiagrammingExercise(exercise)),
    answerKey: {
      latin: exercise.data.latin,
      translation: exercise.data.translation,
      tokens: exercise.data.tokens,
      solutionAnnotations: solution,
      ...(exercise.data.explanation?.text?.trim() || exercise.data.explanation?.annotations?.length
        ? { explanation: normalizeSentenceDiagramFeedbackContent(exercise.data.explanation) }
        : {}),
    },
    itemResults: {
      annotations,
      accuracy: comparison.accuracy,
      correct: comparison.accuracy === 100,
      points: pointsForPart(comparison.accuracy, 100, 100, maxPointsFor(exercise)),
    },
  };
}

function buildTableFillReview(exercise: ExerciseOfType<'table-fill'>, answer: ExerciseAnswer | unknown) {
  const student = savedAnswer('table-fill', answer);
  const validation = student ? validateTableFillExercise(student.answers, exercise) : null;
  const blankCells = exercise.data.rows.flatMap(row =>
    exercise.data.columns
      .filter(column => row.cells[column.id]?.isBlank && row.cells[column.id]?.answer)
      .map(column => ({ rowId: row.id, columnId: column.id }))
  );
  return {
    question: projectedQuestion(projectTableFillExercise(exercise)),
    answerKey: {
      rows: exercise.data.rows.map(row => ({
        id: row.id,
        cells: Object.fromEntries(
          Object.entries(row.cells).map(([columnId, cell]) => [
            columnId,
            {
              content: cell.content,
              isBlank: cell.isBlank,
              ...(cell.answer ? { answer: cell.answer } : {}),
            },
          ])
        ),
      })),
    },
    itemResults: {
      cells: blankCells.map(({ rowId, columnId }) => {
        const correct = validation?.cellResults[`${rowId}-${columnId}`] ?? false;
        return {
          rowId,
          columnId,
          value: student?.answers[`${rowId}-${columnId}`] ?? '',
          correct,
          points: pointsForPart(correct ? 1 : 0, 1, blankCells.length, maxPointsFor(exercise)),
        };
      }),
    },
    ...(exercise.data.explanation ? { explanation: exercise.data.explanation } : {}),
  };
}

function buildClickOnMultipleWordsReview(
  exercise: ExerciseOfType<'click-on-multiple-words'>,
  answer: ExerciseAnswer | unknown
) {
  const student = savedAnswer('click-on-multiple-words', answer);
  const validation = student ? validateClickOnMultipleWords(new Set(student.selectedWordIndices), exercise) : null;
  return {
    question: projectedQuestion(projectClickOnMultipleWordsExercise(exercise)),
    answerKey: { correctWordIndices: exercise.data.correctWordIndices },
    itemResults: {
      selectedWordIndices: student?.selectedWordIndices ?? [],
      correct: validation?.isCorrect ?? false,
      points: pointsForPart(validation?.score ?? 0, 100, 100, maxPointsFor(exercise)),
    },
    ...(exercise.data.explanation ? { explanation: exercise.data.explanation } : {}),
  };
}

function buildGeneratedTranslationReview(
  exercise: ExerciseOfType<'generated-translation'>,
  answer: ExerciseAnswer | unknown,
  resolvedItems: GeneratedTranslationItem[]
) {
  const student = savedAnswer('generated-translation', answer);
  return {
    question: projectedQuestion(projectGeneratedTranslationExercise(exercise)),
    answerKey: {
      items: resolvedItems.map(item => ({ text: item.text, acceptedAnswers: item.acceptedAnswers })),
    },
    itemResults: {
      answers: resolvedItems.map((item, index) => {
        const value = student?.answers[index] ?? '';
        const correct = student ? validateGeneratedTranslationExercise(value, item).isCorrect : false;
        return {
          value,
          correct,
          points: pointsForPart(correct ? 1 : 0, 1, resolvedItems.length, maxPointsFor(exercise)),
        };
      }),
    },
  };
}

const isMultiAnswerItem = (item: unknown): item is MultiAnswerFormIdentificationItem =>
  Boolean(item) && 'stepIndex' in (item as object) && 'expectedAnswerCount' in (item as object);
const isStepItem = (item: unknown): item is FormIdentificationItem =>
  Boolean(item) && 'step' in (item as object) && 'acceptedAnswers' in (item as object);

type FormItemUnitScore = { earnedUnits: number; availableUnits: number };

function scoreGeneratedFormReviewItems(
  exercise: ExerciseOfType<'generated-form-identification'>,
  answers: Record<string, string>,
  resolvedItems: Array<FormIdentificationItem | SingleFieldFormIdentificationItem | MultiAnswerFormIdentificationItem>
) {
  const scores = new Map<string, FormItemUnitScore>();

  if (exercise.data.mode === 'single-field') {
    for (const item of resolvedItems) {
      if (isMultiAnswerItem(item) || isStepItem(item)) continue;
      scores.set(item.id, scoreSingleFieldFormIdentificationAnswer(answers[item.id] ?? '', item));
    }
    return scores;
  }

  if (exercise.data.requireAllPrimaryAnswers) {
    const groups = new Map<string, MultiAnswerFormIdentificationItem[]>();
    for (const item of resolvedItems) {
      if (!isMultiAnswerItem(item)) continue;
      groups.set(item.wordId, [...(groups.get(item.wordId) ?? []), item]);
    }
    for (const group of groups.values()) {
      const ordered = [...group].sort((left, right) => left.stepIndex - right.stepIndex);
      const slots: string[][] = [];
      for (const item of ordered) {
        const step = validateMultiAnswerStep(answers[item.id] ?? '', item);
        let earnedUnits = 0;
        if (step.isCorrect) {
          slots[item.stepIndex] = step.answerSlots;
          const completedItems = ordered.slice(0, item.stepIndex + 1);
          if (completedItems.every(entry => slots[entry.stepIndex])) {
            const completedSlots = completedItems.map(entry => slots[entry.stepIndex]!);
            const completedSteps = completedItems.map(entry => entry.step);
            if (validatePartialMultiAnswerPaths(completedSlots, completedSteps, item.primaryFormPaths).isCorrect) {
              earnedUnits = 1;
            }
          }
        }
        scores.set(item.id, { earnedUnits, availableUnits: 1 });
      }
    }
    return scores;
  }

  const groups = new Map<string, FormIdentificationItem[]>();
  for (const item of resolvedItems) {
    if (!isStepItem(item)) continue;
    groups.set(item.wordId, [...(groups.get(item.wordId) ?? []), item]);
  }
  for (const group of groups.values()) {
    const firstItem = group[0];
    let compatiblePaths = [...firstItem.primaryFormPaths, ...firstItem.optionalFormPaths];
    for (const item of group) {
      const submitted = normalize(answers[item.id] ?? '');
      const pathsForStep = compatiblePaths.filter(path => Boolean(path[item.step]));
      let earnedUnits = 0;
      if (pathsForStep.length === 0) {
        earnedUnits = validateGeneratedFormIdentificationExercise(answers[item.id] ?? '', item).isCorrect ? 1 : 0;
      } else {
        const matchingPaths = pathsForStep.filter(path => {
          const expected = path[item.step];
          return expected ? getAcceptedAnswersForStep(expected).map(normalize).includes(submitted) : false;
        });
        if (matchingPaths.length > 0) {
          earnedUnits = 1;
          compatiblePaths = matchingPaths;
        }
      }
      scores.set(item.id, { earnedUnits, availableUnits: 1 });
    }
  }
  return scores;
}

function buildGeneratedFormIdentificationReview(
  exercise: ExerciseOfType<'generated-form-identification'>,
  answer: ExerciseAnswer | unknown,
  resolvedItems: Array<FormIdentificationItem | SingleFieldFormIdentificationItem | MultiAnswerFormIdentificationItem>
) {
  const student = savedAnswer('generated-form-identification', answer);
  const scores = scoreGeneratedFormReviewItems(exercise, student?.answers ?? {}, resolvedItems);
  const totalAvailableUnits = [...scores.values()].reduce((total, score) => total + score.availableUnits, 0);
  const items = resolvedItems.map(item => {
    if (isMultiAnswerItem(item)) {
      return {
        id: item.id,
        word: item.word,
        selected_form: item.selected_form,
        step: item.step,
        steps: item.steps,
        stepIndex: item.stepIndex,
        totalSteps: item.totalSteps,
        expectedAnswerCount: item.expectedAnswerCount,
        correctAnswerDisplay: item.correctAnswerDisplay,
      };
    }
    if (isStepItem(item)) {
      return {
        id: item.id,
        word: item.word,
        selected_form: item.selected_form,
        step: item.step,
        correctAnswer: item.correctAnswer,
        acceptedAnswers: item.acceptedAnswers,
      };
    }
    return {
      id: item.id,
      word: item.word,
      selected_form: item.selected_form,
      steps: item.steps,
      correctAnswerDisplay: item.correctAnswerDisplay,
    };
  });
  const answers = resolvedItems.map(item => {
    const value = student?.answers[item.id] ?? '';
    const score = scores.get(item.id) ?? { earnedUnits: 0, availableUnits: 1 };
    return {
      id: item.id,
      value,
      correct: score.availableUnits > 0 && score.earnedUnits === score.availableUnits,
      points: pointsForPart(score.earnedUnits, score.availableUnits, totalAvailableUnits, maxPointsFor(exercise)),
    };
  });
  return {
    question: projectedQuestion(projectGeneratedFormIdentificationExercise(exercise)),
    answerKey: { items },
    itemResults: { answers },
  };
}

function buildTranslationGradingReview(
  exercise: ExerciseOfType<'translation-grading'>,
  answer: ExerciseAnswer | unknown,
  translationGrades: TestTranslationGrades[string] | undefined
) {
  const student = savedAnswer('translation-grading', answer);
  return {
    question: projectedQuestion(projectTranslationGradingExercise(exercise)),
    answerKey: {
      items: exercise.data.items.map(item => ({
        latinText: item.latinText,
        ...(item.instructions ? { instructions: item.instructions } : {}),
      })),
    },
    itemResults: {
      items: exercise.data.items.map((_, index) => {
        const userTranslation = student?.translations[index]?.trim() ?? '';
        const grade = translationGrades?.[String(index)];
        const savedGrade = grade && grade.translation === userTranslation ? grade : null;
        return {
          translation: userTranslation,
          score: savedGrade?.score ?? null,
          feedback: savedGrade?.feedback ?? null,
          points: pointsForPart(savedGrade?.score ?? 0, 10, exercise.data.items.length * 10, maxPointsFor(exercise)),
        };
      }),
    },
  };
}

function buildReviewSupportingItem(item: RenderableContentItem): TestResultReviewSupportingItem {
  switch (item.type) {
    case 'text':
    case 'emphasis':
      return reviewSupportingItemSchema.parse(projectTextContent(item));
    case 'table':
      return reviewSupportingItemSchema.parse(projectTableContent(item));
    case 'vocabulary':
      return reviewSupportingItemSchema.parse(projectVocabularyContent(item));
    case 'vocabulary-pool':
      return reviewSupportingItemSchema.parse(projectVocabularyPoolContent(item));
    case 'listening-passage':
      return reviewSupportingItemSchema.parse(projectListeningPassageContent(item));
    default:
      throw new Error(`Content type ${item.type} is not eligible for test review`);
  }
}

function buildReviewExerciseItem(
  exercise: Exercise,
  input: Pick<BuildSubmittedReviewInput, 'answers' | 'translationGrades' | 'exerciseResults'>,
  resolvedItems: unknown[]
): TestResultReviewItem {
  const answer = input.answers[exercise.id];
  const result = input.exerciseResults[exercise.id];
  if (!result) throw new Error(`Submitted result for exercise ${exercise.id} is missing`);
  if (Math.abs(result.maxPoints - maxPointsFor(exercise)) > 1e-9) {
    throw new Error(`Submitted result for exercise ${exercise.id} does not match its frozen maximum points`);
  }
  const base = {
    id: exercise.id,
    title: exercise.title || exercise.type,
    instructions: exercise.instructions,
    audioPath: exercise.audioPath,
    maxPoints: maxPointsFor(exercise),
    studentAnswer: savedAnswer(exercise.type as ExerciseAnswer['type'], answer) as ExerciseAnswer | null,
    result: {
      awardedPoints: result.awardedPoints,
      maxPoints: result.maxPoints,
    },
  };

  switch (exercise.type) {
    case 'matching':
      return matchingReviewSchema.parse({
        ...base,
        type: 'matching',
        ...buildMatchingReview(exercise as ExerciseOfType<'matching'>, answer),
      });
    case 'fill':
      return fillReviewSchema.parse({
        ...base,
        type: 'fill',
        ...buildFillReview(exercise as ExerciseOfType<'fill'>, answer),
      });
    case 'multiple-choice':
      return multipleChoiceReviewSchema.parse({
        ...base,
        type: 'multiple-choice',
        ...buildMultipleChoiceReview(exercise as ExerciseOfType<'multiple-choice'>, answer),
      });
    case 'odd-one-out':
      return oddOneOutReviewSchema.parse({
        ...base,
        type: 'odd-one-out',
        ...buildOddOneOutReview(exercise as ExerciseOfType<'odd-one-out'>, answer),
      });
    case 'text-selection':
      return textSelectionReviewSchema.parse({
        ...base,
        type: 'text-selection',
        ...buildTextSelectionReview(exercise as ExerciseOfType<'text-selection'>, answer),
      });
    case 'fill-embolded-text':
      return fillEmboldedTextReviewSchema.parse({
        ...base,
        type: 'fill-embolded-text',
        ...buildFillEmboldedTextReview(exercise as ExerciseOfType<'fill-embolded-text'>, answer),
      });
    case 'sentence-diagramming':
      return sentenceDiagrammingReviewSchema.parse({
        ...base,
        type: 'sentence-diagramming',
        ...buildSentenceDiagrammingReview(exercise as ExerciseOfType<'sentence-diagramming'>, answer),
      });
    case 'table-fill':
      return tableFillReviewSchema.parse({
        ...base,
        type: 'table-fill',
        ...buildTableFillReview(exercise as ExerciseOfType<'table-fill'>, answer),
      });
    case 'click-on-multiple-words':
      return clickOnMultipleWordsReviewSchema.parse({
        ...base,
        type: 'click-on-multiple-words',
        ...buildClickOnMultipleWordsReview(exercise as ExerciseOfType<'click-on-multiple-words'>, answer),
      });
    case 'generated-translation':
      return generatedTranslationReviewSchema.parse({
        ...base,
        type: 'generated-translation',
        ...buildGeneratedTranslationReview(
          exercise as ExerciseOfType<'generated-translation'>,
          answer,
          resolvedItems as GeneratedTranslationItem[]
        ),
      });
    case 'generated-form-identification':
      return generatedFormIdentificationReviewSchema.parse({
        ...base,
        type: 'generated-form-identification',
        ...buildGeneratedFormIdentificationReview(
          exercise as ExerciseOfType<'generated-form-identification'>,
          answer,
          resolvedItems as Array<
            FormIdentificationItem | SingleFieldFormIdentificationItem | MultiAnswerFormIdentificationItem
          >
        ),
      });
    case 'translation-grading':
      return translationGradingReviewSchema.parse({
        ...base,
        type: 'translation-grading',
        ...buildTranslationGradingReview(
          exercise as ExerciseOfType<'translation-grading'>,
          answer,
          input.translationGrades[exercise.id]
        ),
      });
    default:
      throw new Error(`Exercise type ${(exercise as Exercise).type} is not eligible for test review`);
  }
}

function buildReviewPage(
  page: FrozenTestDeliveryState['pages'][number],
  input: Pick<BuildSubmittedReviewInput, 'answers' | 'translationGrades' | 'exerciseResults'>,
  resolvedExercises: FrozenTestDeliveryState['resolvedExercises']
): TestResultReviewPage {
  const items = page.items.map(item => {
    if (!isExerciseType(item.type)) return buildReviewSupportingItem(item);
    const exercise = item as Exercise;
    return buildReviewExerciseItem(exercise, input, resolvedExercises[exercise.id]?.items ?? []);
  });
  return {
    id: page.id,
    ...(page.title ? { title: page.title } : {}),
    ...(page.audioPath ? { audioPath: page.audioPath } : {}),
    items,
  };
}

/**
 * Copies only review-safe submitted content into a durable, versioned review
 * snapshot. Answer keys are included because this document is written only
 * when the attempt transitions to `submitted` and is never returned for
 * active or unsubmitted attempts.
 */
export function buildSubmittedReview(input: BuildSubmittedReviewInput): TestResultReview {
  const pages = input.deliveryState.pages.map(page =>
    buildReviewPage(page, input, input.deliveryState.resolvedExercises)
  );

  const content: TestResultReviewContent = {
    pages,
    ...(input.deliveryState.vocabularyPool
      ? {
          vocabularyPool: {
            id: input.deliveryState.vocabularyPool.id,
            name: input.deliveryState.vocabularyPool.name,
            items: input.deliveryState.vocabularyPool.items.map(item => ({
              id: item.id,
              latin: item.latin,
              english: item.english,
              pronunciation: item.pronunciation,
              audioPath: item.audioPath,
              example: item.example,
              partOfSpeech: item.partOfSpeech,
              notes: item.notes,
            })),
          },
        }
      : {}),
  };

  // Firestore documents cannot carry `undefined` fields; JSON round-tripping
  // drops them exactly like the frozen delivery builder does.
  const document = testResultReviewDocumentSchema.parse(
    JSON.parse(
      JSON.stringify({
        id: input.attemptId,
        reviewVersion: TEST_RESULT_REVIEW_VERSION,
        studentId: input.studentId,
        attemptId: input.attemptId,
        versionId: input.versionId,
        origin: input.origin,
        submittedAt: input.submittedAt,
        content,
      })
    )
  );
  return document;
}
