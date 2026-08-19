import type { DiagramAnnotation, DiagramToken, SentenceDiagramFeedbackContent } from '@/src/features/sentence-diagramming/model';
import type { TableData } from '@/src/components/ui/lesson/conjugation-table';
import type { ExerciseAnswer } from './runtime-mode';
import type { StudentSubmittedTestAttempt, TestAttemptOrigin, TestTranslationGrades } from './test';
import type { VocabularyPoolStudyData } from './vocabulary';

/**
 * Student-facing, read-only representation of a submitted test attempt.
 * `review` is null only for attempts that predate detailed review snapshots
 * (or whose snapshot cannot be parsed); the frozen result summary always works.
 */
export interface StudentTestResult {
  attempt: StudentSubmittedTestAttempt;
  review: StudentTestResultReview | null;
}

/** Durable, explicitly versioned review snapshot persisted at submission time. */
export interface TestResultReview {
  id: string;
  reviewVersion: 1;
  studentId: string;
  attemptId: string;
  versionId: string;
  origin: TestAttemptOrigin;
  submittedAt: string;
  createdAt: string;
  content: TestResultReviewContent;
}

export type StudentTestResultReview = Omit<TestResultReview, 'studentId'>;

export interface TestResultReviewContent {
  pages: TestResultReviewPage[];
  vocabularyPool?: VocabularyPoolStudyData;
}

export interface TestResultReviewPage {
  id: string;
  title?: string;
  audioPath?: string | null;
  items: TestResultReviewItem[];
}

export interface ReviewSupportingItemBase {
  id: string;
  type: string;
  title?: string;
  audioPath?: string | null;
}

export type TestResultReviewSupportingItem =
  | (ReviewSupportingItemBase & { type: 'text' | 'emphasis'; content: string })
  | (ReviewSupportingItemBase & { type: 'table'; tableData: TableData })
  | (ReviewSupportingItemBase & {
      type: 'vocabulary';
      vocabularyItems: Array<{
        id: string;
        latin: string;
        english: string;
        pronunciation?: string | null;
        audioPath?: string | null;
        example?: string;
        partOfSpeech?: string;
        notes?: string;
      }>;
    })
  | (ReviewSupportingItemBase & { type: 'vocabulary-pool' })
  | (ReviewSupportingItemBase & {
      type: 'listening-passage';
      instructions?: string;
      itemProgressionDelay?: number;
      data: { latinText: string; translation: string; passageAudioPath?: string | null };
    });

export interface ReviewExerciseResult {
  awardedPoints: number;
  maxPoints: number;
}

export type ReviewPartPoints = ReviewExerciseResult;

export interface ReviewExerciseBase<Type extends string, Question, AnswerKey, ItemResults> {
  id: string;
  type: Type;
  title: string;
  instructions?: string;
  audioPath?: string | null;
  maxPoints: number;
  explanation?: string;
  question: Question;
  answerKey: AnswerKey;
  itemResults: ItemResults;
  studentAnswer: ExerciseAnswer | null;
  result: ReviewExerciseResult;
}

// ---------------------------------------------------------------------------
// Per-type question projections (identical to what the student saw while
// taking the test), answer keys, and per-part results.
// ---------------------------------------------------------------------------

export interface MatchingReviewQuestion {
  leftColumn: Array<{ id: string; value: string }>;
  rightColumn: Array<{ id: string; value: string }>;
  expectedMatchCount: number;
  requiredRepetitions?: number;
}

export interface MatchingReviewKey {
  pairs: Array<{ leftId: string; leftValue: string; rightId: string; rightValue: string }>;
}

export interface MatchingReviewResults {
  rounds: Array<Record<string, { rightId: string | null; correct: boolean; points: ReviewPartPoints }>>;
}

export interface FillReviewQuestion {
  items: Array<{ text: string }>;
}

export interface FillReviewKey {
  items: Array<{ text: string; acceptedAnswers: string[]; explanation?: string }>;
}

export interface FillReviewResults {
  answers: Array<{ value: string; correct: boolean; points: ReviewPartPoints }>;
}

export interface MultipleChoiceReviewQuestion {
  question: string;
  options: Array<{ id: string; text: string }>;
  allowMultipleSelections: boolean;
}

export interface MultipleChoiceReviewKey {
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
}

export interface MultipleChoiceReviewResults {
  selectedOptionIds: string[];
  correct: boolean;
  points: ReviewPartPoints;
}

export interface OddOneOutReviewQuestion {
  question: string;
  items: Array<{ id: string; text: string }>;
  requireExplanation?: boolean;
}

export interface OddOneOutReviewKey {
  items: Array<{ id: string; text: string; isOddOneOut: boolean }>;
}

export interface OddOneOutReviewResults {
  selectedItemId: string;
  explanation: string;
  correct: boolean;
  points: ReviewPartPoints;
}

export interface TextSelectionReviewQuestion {
  passage: string;
  questions: Array<{ id: string; text: string }>;
}

export interface TextSelectionReviewKey {
  questions: Array<{ id: string; text: string; correctWordIndex: number; explanation?: string }>;
}

export interface TextSelectionReviewResults {
  selections: Array<{ questionId: string; wordIndex: number; correct: boolean; points: ReviewPartPoints }>;
}

export interface FillEmboldedTextReviewQuestion {
  passage: string;
  words: Array<{ wordIndex: number; question?: string }>;
}

export interface FillEmboldedTextReviewKey {
  words: Array<{ wordIndex: number; correctAnswer: string; question?: string; explanation?: string }>;
}

export interface FillEmboldedTextReviewResults {
  answers: Array<{ value: string; correct: boolean; points: ReviewPartPoints }>;
}

export interface SentenceDiagrammingReviewQuestion {
  latin: string;
  translation: string;
  tokens: Array<{ id: string; text: string; index: number }>;
  availableStudentTools: string[];
  difficulty: string;
}

export interface SentenceDiagrammingReviewKey {
  latin: string;
  translation: string;
  tokens: DiagramToken[];
  solutionAnnotations: DiagramAnnotation[];
  explanation?: SentenceDiagramFeedbackContent;
}

export interface SentenceDiagrammingReviewResults {
  annotations: DiagramAnnotation[];
  accuracy: number;
  correct: boolean;
  points: ReviewPartPoints;
}

export interface TableFillReviewQuestion {
  title?: string;
  columns: Array<{ id: string; header: string; className?: string }>;
  rows: Array<{
    id: string;
    cells: Record<string, { content: string; isBlank: boolean }>;
  }>;
  footnotes?: string[];
}

export interface TableFillReviewKey {
  rows: Array<{
    id: string;
    cells: Record<string, { content: string; isBlank: boolean; answer?: string }>;
  }>;
}

export interface TableFillReviewResults {
  cells: Array<{
    rowId: string;
    columnId: string;
    value: string;
    correct: boolean;
    points: ReviewPartPoints;
  }>;
}

export interface ClickOnMultipleWordsReviewQuestion {
  title?: string;
  passage: string;
  instructions?: string;
}

export interface ClickOnMultipleWordsReviewKey {
  correctWordIndices: number[];
}

export interface ClickOnMultipleWordsReviewResults {
  selectedWordIndices: number[];
  correct: boolean;
  points: ReviewPartPoints;
}

export type GeneratedTranslationReviewQuestion = Record<string, never>;

export interface GeneratedTranslationReviewKey {
  items: Array<{ text: string; acceptedAnswers: string[] }>;
}

export interface GeneratedTranslationReviewResults {
  answers: Array<{ value: string; correct: boolean; points: ReviewPartPoints }>;
}

export type GeneratedFormIdentificationReviewKeyItem =
  | {
      id: string;
      word: string;
      selected_form: string;
      step: string;
      correctAnswer: string;
      acceptedAnswers: string[];
    }
  | {
      id: string;
      word: string;
      selected_form: string;
      steps: string[];
      correctAnswerDisplay: string;
    }
  | {
      id: string;
      word: string;
      selected_form: string;
      step: string;
      steps: string[];
      stepIndex: number;
      totalSteps: number;
      expectedAnswerCount: number;
      correctAnswerDisplay: string;
    };

export interface GeneratedFormIdentificationReviewQuestion {
  mode: 'step-by-step' | 'single-field';
  requireAllPrimaryAnswers?: boolean;
  showDictionaryEntry?: boolean;
}

export interface GeneratedFormIdentificationReviewKey {
  items: GeneratedFormIdentificationReviewKeyItem[];
}

export interface GeneratedFormIdentificationReviewResults {
  answers: Array<{ id: string; value: string; correct: boolean; points: ReviewPartPoints }>;
}

export interface TranslationGradingReviewQuestion {
  items: Array<{ latinText: string; instructions?: string }>;
}

export interface TranslationGradingReviewKey {
  items: Array<{ latinText: string; instructions?: string }>;
}

export interface TranslationGradingReviewResults {
  items: Array<{
    translation: string;
    score: number | null;
    feedback: string | null;
    points: ReviewPartPoints;
  }>;
}

export type TestResultReviewExerciseItem =
  | ReviewExerciseBase<'matching', MatchingReviewQuestion, MatchingReviewKey, MatchingReviewResults>
  | ReviewExerciseBase<'fill', FillReviewQuestion, FillReviewKey, FillReviewResults>
  | ReviewExerciseBase<
      'multiple-choice',
      MultipleChoiceReviewQuestion,
      MultipleChoiceReviewKey,
      MultipleChoiceReviewResults
    >
  | ReviewExerciseBase<'odd-one-out', OddOneOutReviewQuestion, OddOneOutReviewKey, OddOneOutReviewResults>
  | ReviewExerciseBase<
      'text-selection',
      TextSelectionReviewQuestion,
      TextSelectionReviewKey,
      TextSelectionReviewResults
    >
  | ReviewExerciseBase<
      'fill-embolded-text',
      FillEmboldedTextReviewQuestion,
      FillEmboldedTextReviewKey,
      FillEmboldedTextReviewResults
    >
  | ReviewExerciseBase<
      'sentence-diagramming',
      SentenceDiagrammingReviewQuestion,
      SentenceDiagrammingReviewKey,
      SentenceDiagrammingReviewResults
    >
  | ReviewExerciseBase<'table-fill', TableFillReviewQuestion, TableFillReviewKey, TableFillReviewResults>
  | ReviewExerciseBase<
      'click-on-multiple-words',
      ClickOnMultipleWordsReviewQuestion,
      ClickOnMultipleWordsReviewKey,
      ClickOnMultipleWordsReviewResults
    >
  | ReviewExerciseBase<
      'generated-translation',
      GeneratedTranslationReviewQuestion,
      GeneratedTranslationReviewKey,
      GeneratedTranslationReviewResults
    >
  | ReviewExerciseBase<
      'generated-form-identification',
      GeneratedFormIdentificationReviewQuestion,
      GeneratedFormIdentificationReviewKey,
      GeneratedFormIdentificationReviewResults
    >
  | ReviewExerciseBase<
      'translation-grading',
      TranslationGradingReviewQuestion,
      TranslationGradingReviewKey,
      TranslationGradingReviewResults
    >;

export type TestResultReviewItem = TestResultReviewSupportingItem | TestResultReviewExerciseItem;

/** Compact latest-result card for hidden or archived mocks the student submitted. */
export interface StudentPastMockResult {
  id: string;
  title: string;
  description: string;
  passingPercentage: number | null;
  latest: {
    attemptId: string;
    score: number;
    maxScore: number;
    percentage: number;
    outcome: 'score-only' | 'passed' | 'not-passed';
    submittedAt: string;
  };
}

/** Server-side grading inputs reused to build per-part review results. */
export interface ReviewAnswerContext {
  answers: Record<string, ExerciseAnswer | unknown>;
  translationGrades: TestTranslationGrades;
}
