import {
  createAnnotationId,
  createSentenceDiagramFeedbackContent,
  tokenizeDiagramSentence,
} from '@/src/features/sentence-diagramming/model';
import { testVersionDraftInputSchema, testVersionInputSchema } from '@/src/lib/tests/schemas';

const diagramTokens = tokenizeDiagramSentence('amat');
const diagramSpan = { startTokenIndex: 0, endTokenIndex: 0, startCharOffset: 0, endCharOffset: 4 };
const diagramAnnotation = {
  id: createAnnotationId('verb', diagramSpan),
  kind: 'verb',
  span: diagramSpan,
};

const validItems = {
  matching: {
    id: 'matching',
    type: 'matching',
    maxPoints: 1,
    data: {
      leftColumn: [{ id: 'left', value: 'amo' }],
      rightColumn: [{ id: 'right', value: 'love' }],
      answers: { left: 'right' },
    },
  },
  'multiple-choice': {
    id: 'multiple-choice',
    type: 'multiple-choice',
    maxPoints: 1,
    data: {
      question: 'Which answer is correct?',
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
      allowMultipleSelections: false,
    },
  },
  'odd-one-out': {
    id: 'odd-one-out',
    type: 'odd-one-out',
    maxPoints: 1,
    data: {
      question: 'Which item is different?',
      items: [
        { id: 'a', text: 'A', isOddOneOut: true },
        { id: 'b', text: 'B', isOddOneOut: false },
      ],
    },
  },
  'table-fill': {
    id: 'table-fill',
    type: 'table-fill',
    maxPoints: 1,
    data: {
      columns: [{ id: 'form', header: 'Form' }],
      rows: [{ id: 'row', cells: { form: { content: '', isBlank: true, answer: 'amat' } } }],
    },
  },
  'click-on-multiple-words': {
    id: 'click-on-multiple-words',
    type: 'click-on-multiple-words',
    maxPoints: 1,
    data: { passage: '<p>amo te</p>', correctWordIndices: [0], allowOverSelection: false },
  },
  fill: {
    id: 'fill',
    type: 'fill',
    maxPoints: 1,
    data: { items: [{ text: 'Marcus ___', answer: 'amat' }] },
  },
  'text-selection': {
    id: 'text-selection',
    type: 'text-selection',
    maxPoints: 1,
    data: {
      passage: 'Marcus amat',
      questions: [{ id: 'verb', text: 'Select the verb', correctWordIndex: 1 }],
    },
  },
  'fill-embolded-text': {
    id: 'fill-embolded-text',
    type: 'fill-embolded-text',
    maxPoints: 1,
    data: { passage: 'Marcus amat', words: [{ wordIndex: 1, correctAnswer: 'loves' }] },
  },
  'sentence-diagramming': {
    id: 'sentence-diagramming',
    type: 'sentence-diagramming',
    maxPoints: 1,
    data: {
      latin: 'amat',
      translation: 'he loves',
      tokens: diagramTokens,
      solutionAnnotations: [diagramAnnotation],
      availableStudentTools: ['verb'],
      hint: createSentenceDiagramFeedbackContent(''),
      explanation: createSentenceDiagramFeedbackContent(''),
      difficulty: 'beginner',
    },
  },
  'generated-translation': {
    id: 'generated-translation',
    type: 'generated-translation',
    maxPoints: 1,
    translationDirection: 'latin-to-english',
    data: {
      generatorConfig: {
        collection: 'vocabulary_words',
        wordSource: 'filters',
        count: 5,
      },
      posConfigs: { noun: { enabled: true, filters: {} } },
    },
  },
  'generated-form-identification': {
    id: 'generated-form-identification',
    type: 'generated-form-identification',
    maxPoints: 1,
    data: {
      mode: 'step-by-step',
      generatorConfig: {
        collection: 'vocabulary_words',
        wordSource: 'filters',
        count: 5,
      },
      paradigmConfigs: {
        'noun-declension': {
          enabled: true,
          steps: ['case', 'number'],
          filters: {},
          formSelection: { tableType: 'declension', selectedCellPaths: ['singular.nominative'] },
        },
      },
    },
  },
  'translation-grading': {
    id: 'translation-grading',
    type: 'translation-grading',
    maxPoints: 1,
    translationDirection: 'latin-to-english',
    data: { items: [{ latinText: 'Puella rosam videt.' }] },
  },
} satisfies Record<string, Record<string, unknown>>;

const activeVersionResult = (item: Record<string, unknown>) =>
  testVersionInputSchema.safeParse({
    id: 'version',
    name: 'Version',
    pages: [{ id: 'page', items: [item] }],
  });

const messagesFor = (item: Record<string, unknown>) => {
  const result = activeVersionResult(item);
  return result.success ? [] : result.error.issues.map(entry => entry.message);
};

type MutableItem = Record<string, unknown> & { data: Record<string, unknown> };
const copyItem = (item: Record<string, unknown>): MutableItem => JSON.parse(JSON.stringify(item)) as MutableItem;

describe('active test exercise validation', () => {
  it('accepts complete scoring configurations for every eligible exercise type', () => {
    const result = testVersionInputSchema.safeParse({
      id: 'version',
      name: 'Version',
      pages: [{ id: 'page', items: Object.values(validItems) }],
    });

    expect(result.success).toBe(true);
  });

  it('keeps partially authored exercises saveable as drafts but rejects activation', () => {
    const incomplete = { id: 'question', type: 'multiple-choice', maxPoints: 1 };
    const input = { id: 'version', name: 'Draft', pages: [{ id: 'page', items: [incomplete] }] };

    expect(testVersionDraftInputSchema.safeParse(input).success).toBe(true);
    expect(testVersionInputSchema.safeParse(input).success).toBe(false);
  });

  it('requires valid and complete matching IDs and mappings', () => {
    const item = copyItem(validItems.matching);
    item.data.answers = { left: 'missing-right', unknownLeft: 'right' };

    expect(messagesFor(item)).toEqual(
      expect.arrayContaining([
        'Matching answers must reference an existing right-column ID',
        'Matching answers cannot reference an unknown left-column ID',
      ])
    );
  });

  it('bounds matching repetitions to a small positive whole number', () => {
    const fractional = copyItem(validItems.matching);
    fractional.data.requiredRepetitions = 1.5;
    const excessive = copyItem(validItems.matching);
    excessive.data.requiredRepetitions = 11;

    expect(activeVersionResult(fractional).success).toBe(false);
    expect(activeVersionResult(excessive).success).toBe(false);
  });

  it('enforces answer-key cardinality for choice exercises', () => {
    const multipleChoice = copyItem(validItems['multiple-choice']);
    (multipleChoice.data.options as Array<{ isCorrect: boolean }>)[1].isCorrect = true;
    const oddOneOut = copyItem(validItems['odd-one-out']);
    (oddOneOut.data.items as Array<{ isOddOneOut: boolean }>)[0].isOddOneOut = false;

    expect(messagesFor(multipleChoice)).toContain('Single-selection questions require exactly one correct option');
    expect(messagesFor(oddOneOut)).toContain('Odd-one-out exercises require exactly one odd item');
  });

  it('requires a complete table grid, at least one blank, and an answer for every blank', () => {
    const unansweredBlank = copyItem(validItems['table-fill']);
    (unansweredBlank.data.rows as Array<{ cells: Record<string, { answer?: string }> }>)[0].cells.form.answer = '   ';
    const missingCell = copyItem(validItems['table-fill']);
    (missingCell.data.rows as Array<{ cells: Record<string, unknown> }>)[0].cells = {};

    expect(messagesFor(unansweredBlank)).toContain('Every blank table cell requires a nonblank answer');
    expect(messagesFor(missingCell)).toEqual(
      expect.arrayContaining([
        'Every row must contain a cell for every column',
        'Table-fill exercises require at least one blank cell',
      ])
    );
  });

  it('rejects empty, duplicate, and out-of-passage click targets', () => {
    const empty = copyItem(validItems['click-on-multiple-words']);
    empty.data.correctWordIndices = [];
    const invalid = copyItem(validItems['click-on-multiple-words']);
    invalid.data.correctWordIndices = [0, 0, 8];

    expect(messagesFor(empty)).toContain('Select at least one target word');
    expect(messagesFor(invalid)).toEqual(
      expect.arrayContaining(['Target word indices must be unique', 'Target word index is outside the passage'])
    );
  });

  it('uses the sentence-diagram validator to reject empty or malformed solutions', () => {
    const empty = copyItem(validItems['sentence-diagramming']);
    empty.data.solutionAnnotations = [];
    const malformed = copyItem(validItems['sentence-diagramming']);
    (malformed.data.solutionAnnotations as Array<{ span: { endCharOffset: number } }>)[0].span.endCharOffset = 99;

    expect(messagesFor(empty)).toContain('Add at least one solution annotation.');
    expect(messagesFor(malformed)).toContain('Finite Verb has an invalid token or character span.');
  });

  it('rejects generated exercises that cannot resolve any scorable items', () => {
    const translation = copyItem(validItems['generated-translation']);
    translation.data.posConfigs = {};
    const morphology = copyItem(validItems['generated-form-identification']);
    const paradigms = morphology.data.paradigmConfigs as Record<
      string,
      { formSelection: { selectedCellPaths: string[] } }
    >;
    paradigms['noun-declension'].formSelection.selectedCellPaths = [];

    expect(messagesFor(translation)).toContain(
      'Filter-backed generated translations require at least one enabled part of speech'
    );
    expect(messagesFor(morphology)).toContain('Enabled morphology paradigms require at least one selected form');
  });

  it('rejects generated word counts above the shared authoring ceiling', () => {
    const translation = copyItem(validItems['generated-translation']);
    (translation.data.generatorConfig as { count: number }).count = 201;

    expect(activeVersionResult(translation).success).toBe(false);
  });

  it('accepts legacy generated configurations when they still resolve scorable items', () => {
    const translation = copyItem(validItems['generated-translation']);
    delete translation.data.posConfigs;
    const translationGenerator = translation.data.generatorConfig as Record<string, unknown>;
    delete translationGenerator.wordSource;
    translationGenerator.filters = { partOfSpeech: 'noun' };

    const morphology = copyItem(validItems['generated-form-identification']);
    delete morphology.data.paradigmConfigs;
    const morphologyGenerator = morphology.data.generatorConfig as Record<string, unknown>;
    delete morphologyGenerator.wordSource;
    morphologyGenerator.filters = { partOfSpeech: 'noun' };
    morphologyGenerator.formSelection = {
      tableType: 'declension',
      selectedCellPaths: ['singular.nominative'],
    };

    expect(activeVersionResult(translation).success).toBe(true);
    expect(activeVersionResult(morphology).success).toBe(true);
  });

  it('rejects empty static and AI-graded item collections', () => {
    const fill = copyItem(validItems.fill);
    fill.data.items = [];
    const translation = copyItem(validItems['translation-grading']);
    translation.data.items = [];

    expect(messagesFor(fill)).toContain('Add at least one fill-in item');
    expect(messagesFor(translation)).toContain('Add at least one translation prompt');
  });
});
