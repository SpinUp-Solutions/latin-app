import { z } from 'zod';
import { PARADIGM_AVAILABLE_STEPS } from '@/src/config/paradigmDefinitions';
import { validateSentenceDiagramDocument } from '@/src/features/sentence-diagramming/validation';
import type { SentenceDiagramDocument } from '@/src/features/sentence-diagramming/model';
import type { GeneratorConfigBase } from '@/src/types/exercises/base';
import {
  FormIdentificationStepSchema,
  type FormIdentificationStep,
} from '@/src/types/exercises/schemas/form-identification';
import { richTextToPlainText } from '@/src/utils/exercises/helpers';
import { buildLegacyParadigmConfigs, buildLegacyPosConfigs } from '@/src/utils/exercises/legacyExerciseCompat';

export interface ActiveExerciseConfigurationIssue {
  message: string;
  path: (string | number)[];
}

const nonBlankIdSchema = z.string().trim().min(1, 'ID cannot be blank');
const nonBlankPlainTextSchema = z.string().trim().min(1, 'Answer cannot be blank');
const visibleRichTextSchema = z.string().refine(value => richTextToPlainText(value).length > 0, 'Text cannot be blank');
const looseObjectSchema = z.object({}).passthrough();

const matchingDataSchema = z
  .object({
    leftColumn: z
      .array(z.object({ id: nonBlankIdSchema, value: visibleRichTextSchema }).passthrough())
      .min(1, 'Add at least one left-column item'),
    rightColumn: z
      .array(z.object({ id: nonBlankIdSchema, value: visibleRichTextSchema }).passthrough())
      .min(1, 'Add at least one right-column item'),
    answers: z.record(z.string(), nonBlankIdSchema),
    requiredRepetitions: z.number().int().min(1).max(10).optional(),
  })
  .passthrough();

const multipleChoiceDataSchema = z
  .object({
    question: visibleRichTextSchema,
    options: z
      .array(z.object({ id: nonBlankIdSchema, text: visibleRichTextSchema, isCorrect: z.boolean() }).passthrough())
      .min(2, 'Add at least two answer options'),
    allowMultipleSelections: z.boolean(),
  })
  .passthrough();

const oddOneOutDataSchema = z
  .object({
    question: visibleRichTextSchema,
    items: z
      .array(z.object({ id: nonBlankIdSchema, text: visibleRichTextSchema, isOddOneOut: z.boolean() }).passthrough())
      .min(2, 'Add at least two items'),
  })
  .passthrough();

const tableFillCellSchema = z
  .object({
    content: z.string(),
    isBlank: z.boolean(),
    answer: z.string().optional(),
  })
  .passthrough();
const tableFillDataSchema = z
  .object({
    columns: z
      .array(z.object({ id: nonBlankIdSchema, header: z.string() }).passthrough())
      .min(1, 'Add at least one table column'),
    rows: z
      .array(
        z
          .object({
            id: nonBlankIdSchema,
            cells: z.record(z.string(), tableFillCellSchema),
          })
          .passthrough()
      )
      .min(1, 'Add at least one table row'),
  })
  .passthrough();

const clickDataSchema = z
  .object({
    passage: visibleRichTextSchema,
    correctWordIndices: z.array(z.number().int().nonnegative()).min(1, 'Select at least one target word'),
    allowOverSelection: z.boolean().optional(),
    minimumCorrect: z.number().int().positive().optional(),
  })
  .passthrough();

const fillDataSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            text: visibleRichTextSchema,
            answer: nonBlankPlainTextSchema,
          })
          .passthrough()
      )
      .min(1, 'Add at least one fill-in item'),
  })
  .passthrough();

const textSelectionDataSchema = z
  .object({
    passage: visibleRichTextSchema,
    questions: z
      .array(
        z
          .object({
            id: nonBlankIdSchema,
            text: visibleRichTextSchema,
            correctWordIndex: z.number().int().nonnegative(),
          })
          .passthrough()
      )
      .min(1, 'Add at least one selection question'),
  })
  .passthrough();

const fillEmboldedDataSchema = z
  .object({
    passage: visibleRichTextSchema,
    words: z
      .array(
        z
          .object({
            wordIndex: z.number().int().nonnegative(),
            correctAnswer: nonBlankPlainTextSchema,
          })
          .passthrough()
      )
      .min(1, 'Add at least one emboldened-word answer'),
  })
  .passthrough();

const formSelectionSchema = z
  .object({
    tableType: z.string().trim().min(1),
    selectedCellPaths: z.array(z.string().trim().min(1)),
  })
  .passthrough();

const generatorConfigSchema = z
  .object({
    collection: z.string(),
    wordSource: z.enum(['filters', 'pool']).default('filters'),
    poolId: z.string().trim().min(1).nullable().optional(),
    poolWordLimit: z.number().int().positive().nullable().optional(),
    count: z.union([z.literal('all'), z.number().int().positive()]),
    filters: looseObjectSchema.optional(),
    formSelection: formSelectionSchema.optional(),
  })
  .passthrough();

const generatedPosConfigSchema = z
  .object({
    enabled: z.boolean(),
    filters: looseObjectSchema,
    formSelection: formSelectionSchema.optional(),
  })
  .passthrough();

const generatedTranslationDataSchema = z
  .object({
    generatorConfig: generatorConfigSchema,
    posConfigs: z.record(z.string(), generatedPosConfigSchema).default({}),
  })
  .passthrough();

const paradigmConfigSchema = z
  .object({
    enabled: z.boolean(),
    steps: z.array(FormIdentificationStepSchema),
    filters: looseObjectSchema,
    formSelection: formSelectionSchema.optional(),
  })
  .passthrough();

const generatedFormDataSchema = z
  .object({
    mode: z.enum(['step-by-step', 'single-field']),
    generatorConfig: generatorConfigSchema,
    paradigmConfigs: z.record(z.string(), paradigmConfigSchema).default({}),
  })
  .passthrough();

const translationGradingDataSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            latinText: visibleRichTextSchema,
            instructions: z.string().optional(),
          })
          .passthrough()
      )
      .min(1, 'Add at least one translation prompt'),
  })
  .passthrough();

const diagramSpanSchema = z
  .object({
    startTokenIndex: z.number(),
    endTokenIndex: z.number(),
    startCharOffset: z.number(),
    endCharOffset: z.number(),
  })
  .passthrough();
const diagramAnnotationSchema = z.object({ id: z.string(), kind: z.string(), span: diagramSpanSchema }).passthrough();
const diagramTokenSchema = z.object({ id: z.string(), text: z.string(), index: z.number() }).passthrough();
const diagramFeedbackSchema = z
  .object({
    text: z.string(),
    tokens: z.array(diagramTokenSchema),
    annotations: z.array(diagramAnnotationSchema),
  })
  .passthrough();
const sentenceDiagramDataSchema = z
  .object({
    latin: visibleRichTextSchema,
    translation: z.string(),
    tokens: z.array(diagramTokenSchema),
    solutionAnnotations: z.array(diagramAnnotationSchema),
    availableStudentTools: z.array(z.string()).optional(),
    hint: diagramFeedbackSchema.optional(),
    explanation: diagramFeedbackSchema.optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  })
  .passthrough();

const uniqueValues = (values: readonly string[]) => new Set(values).size === values.length;
const visibleWordCount = (value: string) => {
  const plainText = richTextToPlainText(value);
  return plainText ? plainText.split(/\s+/).length : 0;
};
const rawWhitespaceWordCount = (value: string) => (value.trim() ? value.trim().split(/\s+/).length : 0);

const zodIssues = (error: z.ZodError): ActiveExerciseConfigurationIssue[] =>
  error.issues.map(issue => ({
    message: issue.message,
    path: issue.path.map(segment => (typeof segment === 'symbol' ? String(segment) : segment)),
  }));

const issue = (message: string, path: (string | number)[]): ActiveExerciseConfigurationIssue => ({ message, path });

const parseDiagramIssuePath = (value: string): (string | number)[] =>
  value
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map(segment => (/^\d+$/.test(segment) ? Number(segment) : segment));

function validateMatching(data: unknown): ActiveExerciseConfigurationIssue[] {
  const parsed = matchingDataSchema.safeParse(data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));

  const issues: ActiveExerciseConfigurationIssue[] = [];
  const leftIds = parsed.data.leftColumn.map(entry => entry.id);
  const rightIds = parsed.data.rightColumn.map(entry => entry.id);
  if (!uniqueValues(leftIds)) issues.push(issue('Left-column IDs must be unique', ['data', 'leftColumn']));
  if (!uniqueValues(rightIds)) issues.push(issue('Right-column IDs must be unique', ['data', 'rightColumn']));

  const leftIdSet = new Set(leftIds);
  const rightIdSet = new Set(rightIds);
  leftIds.forEach((leftId, index) => {
    const rightId = parsed.data.answers[leftId];
    if (!rightId) {
      issues.push(issue('Every left-column item must have an answer', ['data', 'answers', leftId || index]));
    } else if (!rightIdSet.has(rightId)) {
      issues.push(issue('Matching answers must reference an existing right-column ID', ['data', 'answers', leftId]));
    }
  });
  Object.keys(parsed.data.answers).forEach(leftId => {
    if (!leftIdSet.has(leftId)) {
      issues.push(issue('Matching answers cannot reference an unknown left-column ID', ['data', 'answers', leftId]));
    }
  });
  return issues;
}

function validateMultipleChoice(data: unknown): ActiveExerciseConfigurationIssue[] {
  const parsed = multipleChoiceDataSchema.safeParse(data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
  const issues: ActiveExerciseConfigurationIssue[] = [];
  if (!uniqueValues(parsed.data.options.map(option => option.id))) {
    issues.push(issue('Multiple-choice option IDs must be unique', ['data', 'options']));
  }
  const correctCount = parsed.data.options.filter(option => option.isCorrect).length;
  if (parsed.data.allowMultipleSelections ? correctCount === 0 : correctCount !== 1) {
    issues.push(
      issue(
        parsed.data.allowMultipleSelections
          ? 'Multiple-selection questions require at least one correct option'
          : 'Single-selection questions require exactly one correct option',
        ['data', 'options']
      )
    );
  }
  return issues;
}

function validateOddOneOut(data: unknown): ActiveExerciseConfigurationIssue[] {
  const parsed = oddOneOutDataSchema.safeParse(data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
  const issues: ActiveExerciseConfigurationIssue[] = [];
  if (!uniqueValues(parsed.data.items.map(item => item.id))) {
    issues.push(issue('Odd-one-out item IDs must be unique', ['data', 'items']));
  }
  if (parsed.data.items.filter(item => item.isOddOneOut).length !== 1) {
    issues.push(issue('Odd-one-out exercises require exactly one odd item', ['data', 'items']));
  }
  return issues;
}

function validateTableFill(data: unknown): ActiveExerciseConfigurationIssue[] {
  const parsed = tableFillDataSchema.safeParse(data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
  const issues: ActiveExerciseConfigurationIssue[] = [];
  const columnIds = parsed.data.columns.map(column => column.id);
  const columnIdSet = new Set(columnIds);
  if (!uniqueValues(columnIds)) issues.push(issue('Table column IDs must be unique', ['data', 'columns']));
  if (!uniqueValues(parsed.data.rows.map(row => row.id))) {
    issues.push(issue('Table row IDs must be unique', ['data', 'rows']));
  }

  let blankCount = 0;
  parsed.data.rows.forEach((row, rowIndex) => {
    columnIds.forEach(columnId => {
      const cell = row.cells[columnId];
      if (!cell) {
        issues.push(
          issue('Every row must contain a cell for every column', ['data', 'rows', rowIndex, 'cells', columnId])
        );
        return;
      }
      if (cell.isBlank) {
        blankCount += 1;
        if (!cell.answer?.trim()) {
          issues.push(
            issue('Every blank table cell requires a nonblank answer', [
              'data',
              'rows',
              rowIndex,
              'cells',
              columnId,
              'answer',
            ])
          );
        }
      }
    });
    Object.keys(row.cells).forEach(columnId => {
      if (!columnIdSet.has(columnId)) {
        issues.push(
          issue('Table rows cannot contain cells for unknown columns', ['data', 'rows', rowIndex, 'cells', columnId])
        );
      }
    });
  });
  if (blankCount === 0) issues.push(issue('Table-fill exercises require at least one blank cell', ['data', 'rows']));
  return issues;
}

function validateClick(data: unknown): ActiveExerciseConfigurationIssue[] {
  const parsed = clickDataSchema.safeParse(data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
  const issues: ActiveExerciseConfigurationIssue[] = [];
  const indices = parsed.data.correctWordIndices;
  if (!uniqueValues(indices.map(String))) {
    issues.push(issue('Target word indices must be unique', ['data', 'correctWordIndices']));
  }
  const wordCount = visibleWordCount(parsed.data.passage);
  indices.forEach((wordIndex, index) => {
    if (wordIndex >= wordCount) {
      issues.push(issue('Target word index is outside the passage', ['data', 'correctWordIndices', index]));
    }
  });
  if (parsed.data.minimumCorrect !== undefined && parsed.data.minimumCorrect > new Set(indices).size) {
    issues.push(issue('minimumCorrect cannot exceed the number of target words', ['data', 'minimumCorrect']));
  }
  return issues;
}

function validateTextSelection(data: unknown): ActiveExerciseConfigurationIssue[] {
  const parsed = textSelectionDataSchema.safeParse(data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
  const issues: ActiveExerciseConfigurationIssue[] = [];
  if (!uniqueValues(parsed.data.questions.map(question => question.id))) {
    issues.push(issue('Text-selection question IDs must be unique', ['data', 'questions']));
  }
  const wordCount = visibleWordCount(parsed.data.passage);
  parsed.data.questions.forEach((question, index) => {
    if (question.correctWordIndex >= wordCount) {
      issues.push(issue('Correct word index is outside the passage', ['data', 'questions', index, 'correctWordIndex']));
    }
  });
  return issues;
}

function validateFillEmbolded(data: unknown): ActiveExerciseConfigurationIssue[] {
  const parsed = fillEmboldedDataSchema.safeParse(data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
  const issues: ActiveExerciseConfigurationIssue[] = [];
  const wordIndices = parsed.data.words.map(word => word.wordIndex);
  if (!uniqueValues(wordIndices.map(String))) {
    issues.push(issue('Emboldened word indices must be unique', ['data', 'words']));
  }
  const wordCount = rawWhitespaceWordCount(parsed.data.passage);
  parsed.data.words.forEach((word, index) => {
    if (word.wordIndex >= wordCount) {
      issues.push(issue('Emboldened word index is outside the passage', ['data', 'words', index, 'wordIndex']));
    }
  });
  return issues;
}

function validateGeneratorConfig(config: z.infer<typeof generatorConfigSchema>): ActiveExerciseConfigurationIssue[] {
  if (config.wordSource === 'pool' && !config.poolId) {
    return [issue('Pool-backed generated exercises require a vocabulary pool', ['data', 'generatorConfig', 'poolId'])];
  }
  return [];
}

function validateGeneratedTranslation(item: Record<string, unknown>): ActiveExerciseConfigurationIssue[] {
  const parsed = generatedTranslationDataSchema.safeParse(item.data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
  const issues = validateGeneratorConfig(parsed.data.generatorConfig);
  if (
    item.translationDirection !== undefined &&
    !['latin-to-english', 'english-to-latin'].includes(String(item.translationDirection))
  ) {
    issues.push(issue('Unknown translation direction', ['translationDirection']));
  }
  const effectivePosConfigs = Object.keys(parsed.data.posConfigs).length
    ? parsed.data.posConfigs
    : buildLegacyPosConfigs(parsed.data.generatorConfig as GeneratorConfigBase);
  const activePosConfigs = Object.entries(effectivePosConfigs).filter(([, config]) => config?.enabled);
  const validPartOfSpeech = new Set([
    'noun',
    'verb',
    'pronoun',
    'adjective',
    'adverb',
    'preposition',
    'conjunction',
    'interjection',
  ]);
  activePosConfigs.forEach(([partOfSpeech]) => {
    if (!validPartOfSpeech.has(partOfSpeech)) {
      issues.push(issue('Unknown generated-translation part of speech', ['data', 'posConfigs', partOfSpeech]));
    }
  });
  if (parsed.data.generatorConfig.wordSource === 'filters' && activePosConfigs.length === 0) {
    issues.push(
      issue('Filter-backed generated translations require at least one enabled part of speech', ['data', 'posConfigs'])
    );
  }
  return issues;
}

function validateGeneratedForm(data: unknown): ActiveExerciseConfigurationIssue[] {
  const parsed = generatedFormDataSchema.safeParse(data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
  const issues = validateGeneratorConfig(parsed.data.generatorConfig);
  const paradigmConfigs = Object.keys(parsed.data.paradigmConfigs).length
    ? parsed.data.paradigmConfigs
    : buildLegacyParadigmConfigs(parsed.data.generatorConfig as GeneratorConfigBase);
  const validParadigms = new Set(Object.keys(PARADIGM_AVAILABLE_STEPS));
  const activeParadigms = Object.entries(paradigmConfigs).filter(([, config]) => config?.enabled);

  Object.entries(paradigmConfigs).forEach(([paradigm, config]) => {
    if (!config) return;
    if (!validParadigms.has(paradigm)) {
      issues.push(issue('Unknown morphology paradigm', ['data', 'paradigmConfigs', paradigm]));
      return;
    }
    if (!config.enabled) return;
    if (config.steps.length === 0) {
      issues.push(
        issue('Enabled morphology paradigms require at least one scoring step', [
          'data',
          'paradigmConfigs',
          paradigm,
          'steps',
        ])
      );
    } else if (!uniqueValues(config.steps)) {
      issues.push(issue('Morphology scoring steps must be unique', ['data', 'paradigmConfigs', paradigm, 'steps']));
    }
    const availableSteps = PARADIGM_AVAILABLE_STEPS[paradigm as keyof typeof PARADIGM_AVAILABLE_STEPS];
    config.steps.forEach((step: FormIdentificationStep, index: number) => {
      if (!availableSteps.includes(step)) {
        issues.push(
          issue('Scoring step is not supported by this morphology paradigm', [
            'data',
            'paradigmConfigs',
            paradigm,
            'steps',
            index,
          ])
        );
      }
    });
    if (!config.formSelection?.selectedCellPaths.length) {
      issues.push(
        issue('Enabled morphology paradigms require at least one selected form', [
          'data',
          'paradigmConfigs',
          paradigm,
          'formSelection',
          'selectedCellPaths',
        ])
      );
    }
  });

  if (activeParadigms.length === 0) {
    issues.push(issue('Morphology exercises require at least one enabled paradigm', ['data', 'paradigmConfigs']));
  }
  return issues;
}

function validateSentenceDiagram(data: unknown): ActiveExerciseConfigurationIssue[] {
  const parsed = sentenceDiagramDataSchema.safeParse(data);
  if (!parsed.success) return zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
  return validateSentenceDiagramDocument(parsed.data as SentenceDiagramDocument).map(entry => ({
    message: entry.message,
    path: parseDiagramIssuePath(entry.path),
  }));
}

/**
 * Validates answer-key and denominator invariants before an exercise can be
 * persisted in an active test version. Drafts deliberately do not call this
 * validator so partially authored exercises remain saveable.
 */
export function validateActiveTestExerciseConfiguration(
  item: Record<string, unknown>
): ActiveExerciseConfigurationIssue[] {
  switch (item.type) {
    case 'matching':
      return validateMatching(item.data);
    case 'multiple-choice':
      return validateMultipleChoice(item.data);
    case 'odd-one-out':
      return validateOddOneOut(item.data);
    case 'table-fill':
      return validateTableFill(item.data);
    case 'click-on-multiple-words':
      return validateClick(item.data);
    case 'fill': {
      const parsed = fillDataSchema.safeParse(item.data);
      return parsed.success ? [] : zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
    }
    case 'text-selection':
      return validateTextSelection(item.data);
    case 'fill-embolded-text':
      return validateFillEmbolded(item.data);
    case 'sentence-diagramming':
      return validateSentenceDiagram(item.data);
    case 'generated-translation':
      return validateGeneratedTranslation(item);
    case 'generated-form-identification':
      return validateGeneratedForm(item.data);
    case 'translation-grading': {
      const parsed = translationGradingDataSchema.safeParse(item.data);
      const issues = parsed.success
        ? []
        : zodIssues(parsed.error).map(entry => ({ ...entry, path: ['data', ...entry.path] }));
      if (
        item.translationDirection !== undefined &&
        !['latin-to-english', 'english-to-latin'].includes(String(item.translationDirection))
      ) {
        issues.push(issue('Unknown translation direction', ['translationDirection']));
      }
      return issues;
    }
    default:
      return [];
  }
}
