import type { Exercise } from '@/src/types/exercises';
import type {
  FormIdentificationItem,
  MultiAnswerFormIdentificationItem,
  SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import type { ListeningPassageExercise } from '@/src/types/exercises/listening-passage';
import type { EmphasisContent, TableContent, TextContent } from '@/src/types/content';
import type { Page, RenderableContentItem } from '@/src/types/page';
import type {
  StudentTestDelivery,
  TestAttemptDeliveryState,
  TestTranslationGrades,
  TestVersion,
} from '@/src/types/test';
import type { VocabularyContent, VocabularyPoolContent } from '@/src/types/vocabulary';
import type { TableData } from '@/src/components/ui/lesson/conjugation-table';
import {
  isExerciseType,
  isTestEligibleContentType,
  isTestEligibleExerciseType,
  type TestEligibleExerciseType,
} from '@/src/lib/content/registry';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { GeneratedWordLoader } from './generated-exercises';
import { resolveGeneratedExerciseItems } from './generated-exercises';
import type { GeneratedTranslationItem } from '@/src/utils/exercises/generatedTranslationExercise';
import {
  gradeExercise,
  gradeTranslationAssessment,
  maxPointsFor,
  type ExerciseScore,
  type ResolvedGeneratedItem,
} from './grading';
import { parseExerciseAnswer } from './answer-schemas';
import type { VocabularyPoolLoader } from './vocabulary-pool-loader.server';

export interface FrozenTestDeliveryState extends TestAttemptDeliveryState {
  resolvedExercises: Record<string, { items: ResolvedGeneratedItem[] }>;
}

export interface GradedExerciseResult extends ExerciseScore {
  exerciseId: string;
  title: string;
}

export interface FrozenDeliveryScore {
  awardedPoints: number;
  maxPoints: number;
  exerciseResults: GradedExerciseResult[];
}

const cloneSerializable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function createFrozenTestDeliveryState(
  version: TestVersion,
  loadGeneratedWords: GeneratedWordLoader,
  loadVocabularyPool?: VocabularyPoolLoader
): Promise<FrozenTestDeliveryState> {
  const pages = cloneSerializable(version.pages);
  const resolvedExercises: FrozenTestDeliveryState['resolvedExercises'] = {};
  const usesVocabularyPoolContent = pages.some(page =>
    page.items.some(item => item.type === 'vocabulary-pool')
  );
  const vocabularyPool = version.vocabularyPoolId && usesVocabularyPoolContent
    ? cloneSerializable(
        await (loadVocabularyPool
          ? loadVocabularyPool(version.vocabularyPoolId)
          : Promise.reject(new Error(`No vocabulary pool loader was provided for ${version.vocabularyPoolId}`)))
      )
    : undefined;

  for (const page of pages) {
    for (const item of page.items) {
      if (item.type !== 'generated-translation' && item.type !== 'generated-form-identification') continue;
      const items = await resolveGeneratedExerciseItems(item, loadGeneratedWords);
      if (items.length === 0) throw new Error(`Generated exercise ${item.id} did not resolve any items`);
      resolvedExercises[item.id] = { items: cloneSerializable(items as ResolvedGeneratedItem[]) };
    }
  }

  return {
    versionId: version.id,
    pages,
    resolvedExercises,
    ...(vocabularyPool ? { vocabularyPool } : {}),
  };
}

/**
 * Student delivery projections are copy-known-safe: every field must be
 * explicitly classified as student-safe to cross the boundary, so newly
 * authored content fields are private by default. Grading inputs
 * (accepted answers, correct options, solutions, hints, feedback config,
 * generator configuration, resolved form paths) must never appear here.
 */
const compact = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));

type ExerciseOfType<T extends TestEligibleExerciseType> = Extract<Exercise, { type: T }>;

const projectExerciseBase = (exercise: Exercise): Record<string, unknown> => ({
  id: exercise.id,
  type: exercise.type,
  title: exercise.title,
  audioPath: exercise.audioPath,
  instructions: exercise.instructions,
  maxPoints: exercise.maxPoints,
  itemProgressionDelay: exercise.itemProgressionDelay,
});

const projectContentBase = (item: RenderableContentItem): Record<string, unknown> => ({
  id: item.id,
  type: item.type,
  title: item.title,
  audioPath: item.audioPath,
});

function projectTextContent(item: TextContent | EmphasisContent) {
  return compact({ ...projectContentBase(item), content: item.content });
}

function projectTableContent(item: TableContent) {
  const tableData = item.tableData as TableData;
  return compact({
    ...projectContentBase(item),
    tableData: {
      title: tableData.title,
      caption: tableData.caption,
      columns: tableData.columns.map(column => ({
        id: column.id,
        header: column.header,
        className: column.className,
      })),
      rows: tableData.rows.map(row => ({
        id: row.id,
        cells: Object.fromEntries(tableData.columns.map(column => [column.id, row.cells[column.id] ?? ''])),
        rowHeader: row.rowHeader,
      })),
      footnotes: tableData.footnotes,
    },
  });
}

function projectVocabularyContent(item: VocabularyContent) {
  return compact({
    ...projectContentBase(item),
    vocabularyItems: item.vocabularyItems.map(word =>
      compact({
        id: word.id,
        latin: word.latin,
        english: word.english,
        pronunciation: word.pronunciation,
        audioPath: word.audioPath,
        example: word.example,
        partOfSpeech: word.partOfSpeech,
        notes: word.notes,
      })
    ),
  });
}

function projectVocabularyPoolContent(item: VocabularyPoolContent) {
  return compact(projectContentBase(item));
}

function projectListeningPassageContent(item: ListeningPassageExercise) {
  return compact({
    ...projectContentBase(item),
    instructions: item.instructions,
    itemProgressionDelay: item.itemProgressionDelay,
    data: {
      latinText: item.data.latinText,
      translation: item.data.translation,
      passageAudioPath: item.data.passageAudioPath,
    },
  });
}

function projectMatchingExercise(exercise: ExerciseOfType<'matching'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: {
      leftColumn: exercise.data.leftColumn.map(item => ({ id: item.id, value: item.value })),
      rightColumn: exercise.data.rightColumn.map(item => ({ id: item.id, value: item.value })),
      expectedMatchCount: Object.keys(exercise.data.answers).length,
      requiredRepetitions: exercise.data.requiredRepetitions,
    },
  });
}

function projectFillExercise(exercise: ExerciseOfType<'fill'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: { items: exercise.data.items.map(item => ({ text: item.text })) },
  });
}

function projectMultipleChoiceExercise(exercise: ExerciseOfType<'multiple-choice'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: {
      question: exercise.data.question,
      options: exercise.data.options.map(option => ({ id: option.id, text: option.text })),
      allowMultipleSelections:
        exercise.data.allowMultipleSelections || exercise.data.options.filter(option => option.isCorrect).length > 1,
    },
  });
}

function projectOddOneOutExercise(exercise: ExerciseOfType<'odd-one-out'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: {
      question: exercise.data.question,
      items: exercise.data.items.map(item => ({ id: item.id, text: item.text })),
      requireExplanation: exercise.data.requireExplanation,
    },
  });
}

function projectTextSelectionExercise(exercise: ExerciseOfType<'text-selection'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: {
      passage: exercise.data.passage,
      questions: exercise.data.questions.map(question => ({ id: question.id, text: question.text })),
    },
  });
}

function projectFillEmboldedTextExercise(exercise: ExerciseOfType<'fill-embolded-text'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: {
      passage: exercise.data.passage,
      words: exercise.data.words.map(word => ({ wordIndex: word.wordIndex, question: word.question })),
    },
  });
}

function projectSentenceDiagrammingExercise(exercise: ExerciseOfType<'sentence-diagramming'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: {
      latin: exercise.data.latin,
      translation: exercise.data.translation,
      tokens: exercise.data.tokens.map(token => ({ id: token.id, text: token.text, index: token.index })),
      availableStudentTools: exercise.data.availableStudentTools,
      difficulty: exercise.data.difficulty,
    },
  });
}

function projectTableFillExercise(exercise: ExerciseOfType<'table-fill'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: {
      title: exercise.data.title,
      columns: exercise.data.columns.map(column => ({
        id: column.id,
        header: column.header,
        className: column.className,
      })),
      rows: exercise.data.rows.map(row => ({
        id: row.id,
        cells: Object.fromEntries(
          Object.entries(row.cells).map(([key, cell]) => [key, { content: cell.content, isBlank: cell.isBlank }])
        ),
      })),
      footnotes: exercise.data.footnotes,
    },
  });
}

function projectClickOnMultipleWordsExercise(exercise: ExerciseOfType<'click-on-multiple-words'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: {
      title: exercise.data.title,
      passage: exercise.data.passage,
      instructions: exercise.data.instructions,
    },
  });
}

function projectGeneratedTranslationExercise(exercise: ExerciseOfType<'generated-translation'>) {
  return compact({
    ...projectExerciseBase(exercise),
    translationDirection: exercise.translationDirection,
    data: {},
  });
}

function projectGeneratedFormIdentificationExercise(exercise: ExerciseOfType<'generated-form-identification'>) {
  return compact({
    ...projectExerciseBase(exercise),
    data: {
      mode: exercise.data.mode,
      requireAllPrimaryAnswers: exercise.data.requireAllPrimaryAnswers,
      showDictionaryEntry: exercise.data.showDictionaryEntry,
    },
  });
}

function projectTranslationGradingExercise(exercise: ExerciseOfType<'translation-grading'>) {
  return compact({
    ...projectExerciseBase(exercise),
    translationDirection: exercise.translationDirection,
    data: {
      items: exercise.data.items.map(item => ({
        latinText: item.latinText,
        instructions: item.instructions,
      })),
    },
  });
}

function sanitizeExercise(exercise: Exercise): Record<string, unknown> {
  switch (exercise.type) {
    case 'matching':
      return projectMatchingExercise(exercise);
    case 'fill':
      return projectFillExercise(exercise);
    case 'multiple-choice':
      return projectMultipleChoiceExercise(exercise);
    case 'odd-one-out':
      return projectOddOneOutExercise(exercise);
    case 'text-selection':
      return projectTextSelectionExercise(exercise);
    case 'fill-embolded-text':
      return projectFillEmboldedTextExercise(exercise);
    case 'sentence-diagramming':
      return projectSentenceDiagrammingExercise(exercise);
    case 'table-fill':
      return projectTableFillExercise(exercise);
    case 'click-on-multiple-words':
      return projectClickOnMultipleWordsExercise(exercise);
    case 'generated-translation':
      return projectGeneratedTranslationExercise(exercise);
    case 'generated-form-identification':
      return projectGeneratedFormIdentificationExercise(exercise);
    case 'translation-grading':
      return projectTranslationGradingExercise(exercise);
    default:
      throw new Error(`Exercise type ${exercise.type} is not eligible for test delivery`);
  }
}

function sanitizeContentItem(item: RenderableContentItem): unknown {
  if (!isTestEligibleContentType(item.type)) {
    throw new Error(`Content type ${item.type} is not eligible for test delivery`);
  }
  if (isExerciseType(item.type)) {
    if (!isTestEligibleExerciseType(item.type)) {
      throw new Error(`Exercise type ${item.type} is not eligible for test delivery`);
    }
    return sanitizeExercise(item as Exercise);
  }

  switch (item.type) {
    case 'text':
    case 'emphasis':
      return projectTextContent(item);
    case 'table':
      return projectTableContent(item);
    case 'vocabulary':
      return projectVocabularyContent(item);
    case 'vocabulary-pool':
      return projectVocabularyPoolContent(item);
    case 'listening-passage':
      return projectListeningPassageContent(item);
    default:
      throw new Error(`Content type ${item.type} is not eligible for test delivery`);
  }
}

function projectFormIdentificationStepItem(item: FormIdentificationItem) {
  return compact({
    id: item.id,
    wordId: item.wordId,
    word: item.word,
    root_word: item.root_word,
    dictionary_entry: item.dictionary_entry,
    selected_form: item.selected_form,
    hasSelectedForm: item.hasSelectedForm,
    step: item.step,
    expectedAnswerCount: 1,
  });
}

function projectSingleFieldFormIdentificationItem(item: SingleFieldFormIdentificationItem) {
  return compact({
    id: item.id,
    wordId: item.wordId,
    word: item.word,
    root_word: item.root_word,
    dictionary_entry: item.dictionary_entry,
    selected_form: item.selected_form,
    hasSelectedForm: item.hasSelectedForm,
    steps: item.steps,
    expectedAnswerCount: item.primaryFormPaths.length,
  });
}

function projectMultiAnswerFormIdentificationItem(item: MultiAnswerFormIdentificationItem) {
  return compact({
    id: item.id,
    wordId: item.wordId,
    word: item.word,
    root_word: item.root_word,
    dictionary_entry: item.dictionary_entry,
    selected_form: item.selected_form,
    hasSelectedForm: item.hasSelectedForm,
    step: item.step,
    steps: item.steps,
    stepIndex: item.stepIndex,
    totalSteps: item.totalSteps,
    expectedAnswerCount: item.expectedAnswerCount,
  });
}

function projectGeneratedTranslationItem(item: GeneratedTranslationItem) {
  return compact({
    text: item.text,
    stripInfinitive: item.stripInfinitive,
    stripMacrons: item.stripMacrons,
  });
}

function sanitizeResolvedItem(item: ResolvedGeneratedItem): unknown {
  if ('wordId' in item && 'acceptedAnswers' in item) return projectFormIdentificationStepItem(item);
  if ('wordId' in item && 'correctAnswerDisplay' in item) {
    return 'stepIndex' in item
      ? projectMultiAnswerFormIdentificationItem(item)
      : projectSingleFieldFormIdentificationItem(item);
  }
  return projectGeneratedTranslationItem(item as GeneratedTranslationItem);
}

function sanitizePage(page: Page): Page {
  return compact({
    id: page.id,
    title: page.title,
    audioPath: page.audioPath,
    autoAdvance: page.autoAdvance,
    items: page.items.map(sanitizeContentItem),
  }) as unknown as Page;
}

export function sanitizeTestDeliveryState(state: FrozenTestDeliveryState): StudentTestDelivery {
  return {
    versionId: state.versionId,
    pages: state.pages.map(sanitizePage),
    resolvedExercises: Object.fromEntries(
      Object.entries(state.resolvedExercises).map(([exerciseId, resolved]) => [
        exerciseId,
        { items: resolved.items.map(sanitizeResolvedItem) },
      ])
    ),
    ...(state.vocabularyPool
      ? {
          vocabularyPool: {
            id: state.vocabularyPool.id,
            name: state.vocabularyPool.name,
            items: state.vocabularyPool.items.map(item => ({
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
}

export function gradeFrozenTestDelivery(
  state: FrozenTestDeliveryState,
  answers: Record<string, ExerciseAnswer | unknown>,
  translationGrades: TestTranslationGrades = {}
): FrozenDeliveryScore {
  const exerciseResults: GradedExerciseResult[] = [];

  for (const page of state.pages) {
    for (const item of page.items) {
      if (!isExerciseType(item.type)) continue;
      if (!isTestEligibleExerciseType(item.type))
        throw new Error(`Exercise type ${item.type} is not eligible for tests`);

      const exercise = item as Exercise;
      const rawAnswer = answers[exercise.id];
      const score =
        rawAnswer === undefined
          ? { awardedPoints: 0, maxPoints: maxPointsFor(exercise) }
          : exercise.type === 'translation-grading'
            ? gradeSavedTranslationExercise(exercise, rawAnswer, translationGrades[exercise.id] ?? {})
            : gradeExercise({ exercise, resolvedItems: state.resolvedExercises[exercise.id]?.items }, rawAnswer);

      exerciseResults.push({ exerciseId: exercise.id, title: exercise.title || exercise.type, ...score });
    }
  }

  return {
    awardedPoints: exerciseResults.reduce((total, result) => total + result.awardedPoints, 0),
    maxPoints: exerciseResults.reduce((total, result) => total + result.maxPoints, 0),
    exerciseResults,
  };
}

function gradeSavedTranslationExercise(
  exercise: ExerciseOfType<'translation-grading'>,
  rawAnswer: unknown,
  grades: TestTranslationGrades[string]
): ExerciseScore {
  const answer = parseExerciseAnswer(rawAnswer);
  if (answer.type !== exercise.type) {
    throw new Error(`Answer type ${answer.type} does not match exercise type ${exercise.type}`);
  }

  const scores = exercise.data.items.map((_, index) => {
    const userTranslation = answer.translations[index]?.trim() ?? '';
    const savedGrade = grades[String(index)];
    return userTranslation && savedGrade?.translation === userTranslation ? savedGrade.score : 0;
  });
  return gradeTranslationAssessment(exercise, scores);
}
