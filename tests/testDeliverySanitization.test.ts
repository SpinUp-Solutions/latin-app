import { sanitizeTestDeliveryState, type FrozenTestDeliveryState } from '@/src/lib/tests/delivery';

/**
 * Fail-closed delivery contracts: the student projection is built by copying
 * known-safe fields only, so private grading inputs and newly authored fields
 * are omitted by default. Every fixture carries a `futurePrivate`-style field
 * to prove unknown fields never cross the boundary.
 */

const base = {
  id: 'exercise',
  title: 'Exercise',
  instructions: 'Do the thing',
  maxPoints: 4,
  feedbackConfig: { escalationLevels: [{ message: 'secret-feedback' }] },
  futureGradingPolicy: 'secret-future',
};

const stateWith = (items: unknown[], resolvedExercises: FrozenTestDeliveryState['resolvedExercises'] = {}) =>
  ({
    versionId: 'version',
    pages: [{ id: 'page', title: 'Page', futurePageField: 'secret-page', items }],
    resolvedExercises,
  }) as unknown as FrozenTestDeliveryState;

const sanitizeSingle = (exercise: unknown) => {
  const serialized = JSON.stringify(sanitizeTestDeliveryState(stateWith([exercise])));
  expect(serialized).not.toContain('secret-');
  expect(serialized).not.toContain('futureGradingPolicy');
  expect(serialized).not.toContain('futurePrivate');
  expect(serialized).not.toContain('futurePageField');
  expect(serialized).not.toContain('feedbackConfig');
  const delivery = sanitizeTestDeliveryState(stateWith([exercise]));
  return (delivery.pages[0] as { items: Array<Record<string, unknown>> }).items[0];
};

describe('fail-closed content delivery projections', () => {
  it('projects every test-eligible non-exercise content shape without unknown or feedback fields', () => {
    const items = [
      {
        id: 'text',
        type: 'text',
        title: 'Text',
        audioPath: '/text.mp3',
        content: 'Read this',
        futurePrivate: 'secret-text',
      },
      {
        id: 'emphasis',
        type: 'emphasis',
        content: 'Remember this',
        futurePrivate: 'secret-emphasis',
      },
      {
        id: 'table',
        type: 'table',
        tableData: {
          title: 'Forms',
          caption: 'Caption',
          columns: [{ id: 'form', header: 'Form', className: 'wide', futurePrivate: 'secret-column' }],
          rows: [
            {
              id: 'row',
              cells: { form: 'amo', futurePrivate: 'secret-cell' },
              rowHeader: 'Present',
              futurePrivate: 'secret-row',
            },
          ],
          footnotes: ['Note'],
          futurePrivate: 'secret-table-data',
        },
        futurePrivate: 'secret-table',
      },
      {
        id: 'vocabulary',
        type: 'vocabulary',
        title: 'Words',
        vocabularyItems: [
          {
            id: 'amo',
            latin: 'amo',
            english: 'love',
            pronunciation: 'ah-mo',
            audioPath: '/amo.mp3',
            example: 'Amo Romam.',
            partOfSpeech: 'verb',
            notes: 'First conjugation',
            futurePrivate: 'secret-word',
          },
        ],
        futurePrivate: 'secret-vocabulary',
      },
      {
        id: 'pool',
        type: 'vocabulary-pool',
        title: 'Pool',
        futurePrivate: 'secret-pool',
      },
      {
        id: 'listening',
        type: 'listening-passage',
        title: 'Listen',
        instructions: 'Listen carefully',
        itemProgressionDelay: 250,
        feedbackConfig: { escalationLevels: [{ message: 'secret-feedback' }] },
        data: {
          latinText: 'Puella canit.',
          translation: 'The girl sings.',
          passageAudioPath: '/passage.mp3',
          futurePrivate: 'secret-listening-data',
        },
        futurePrivate: 'secret-listening',
      },
    ];

    const delivery = sanitizeTestDeliveryState(stateWith(items));
    const projected = (delivery.pages[0] as { items: unknown[] }).items;
    expect(JSON.stringify(delivery)).not.toContain('secret-');
    expect(JSON.stringify(delivery)).not.toContain('futurePrivate');
    expect(JSON.stringify(delivery)).not.toContain('feedbackConfig');
    expect(projected).toEqual([
      { id: 'text', type: 'text', title: 'Text', audioPath: '/text.mp3', content: 'Read this' },
      { id: 'emphasis', type: 'emphasis', content: 'Remember this' },
      {
        id: 'table',
        type: 'table',
        tableData: {
          title: 'Forms',
          caption: 'Caption',
          columns: [{ id: 'form', header: 'Form', className: 'wide' }],
          rows: [{ id: 'row', cells: { form: 'amo' }, rowHeader: 'Present' }],
          footnotes: ['Note'],
        },
      },
      {
        id: 'vocabulary',
        type: 'vocabulary',
        title: 'Words',
        vocabularyItems: [
          {
            id: 'amo',
            latin: 'amo',
            english: 'love',
            pronunciation: 'ah-mo',
            audioPath: '/amo.mp3',
            example: 'Amo Romam.',
            partOfSpeech: 'verb',
            notes: 'First conjugation',
          },
        ],
      },
      { id: 'pool', type: 'vocabulary-pool', title: 'Pool' },
      {
        id: 'listening',
        type: 'listening-passage',
        title: 'Listen',
        instructions: 'Listen carefully',
        itemProgressionDelay: 250,
        data: {
          latinText: 'Puella canit.',
          translation: 'The girl sings.',
          passageAudioPath: '/passage.mp3',
        },
      },
    ]);
  });
});

describe('fail-closed exercise delivery projections', () => {
  it('matching exposes columns and the public match count only', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'matching',
      data: {
        leftColumn: [{ id: 'l1', value: 'Alpha' }],
        rightColumn: [{ id: 'r1', value: 'One' }],
        answers: { orphaned: 'r1', l1: 'r1' },
        hint: 'secret-hint',
        requiredRepetitions: 2,
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toEqual({
      id: 'exercise',
      type: 'matching',
      title: 'Exercise',
      instructions: 'Do the thing',
      maxPoints: 4,
      data: {
        leftColumn: [{ id: 'l1', value: 'Alpha' }],
        rightColumn: [{ id: 'r1', value: 'One' }],
        expectedMatchCount: 1,
        requiredRepetitions: 2,
      },
    });
  });

  it('fill exposes only the prompt text of each item', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'fill',
      data: {
        items: [
          { text: 'Amo means?', answer: 'secret-answer', hint: 'secret-hint', explanation: 'secret-explanation' },
        ],
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toMatchObject({ data: { items: [{ text: 'Amo means?' }] } });
    expect(JSON.stringify(projected)).not.toContain('"answer"');
  });

  it('multiple-choice strips option flags and feedback fields', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'multiple-choice',
      data: {
        question: 'Pick one',
        allowMultipleSelections: false,
        options: [
          { id: 'a', text: 'Alpha', isCorrect: true },
          { id: 'b', text: 'Beta', isCorrect: false },
        ],
        hint: 'secret-hint',
        explanation: 'secret-explanation',
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toEqual({
      id: 'exercise',
      type: 'multiple-choice',
      title: 'Exercise',
      instructions: 'Do the thing',
      maxPoints: 4,
      data: {
        question: 'Pick one',
        allowMultipleSelections: false,
        options: [
          { id: 'a', text: 'Alpha' },
          { id: 'b', text: 'Beta' },
        ],
      },
    });
  });

  it('multiple-choice keeps multi-select interaction without revealing which options are correct', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'multiple-choice',
      data: {
        question: 'Pick two',
        allowMultipleSelections: false,
        options: [
          { id: 'a', text: 'Alpha', isCorrect: true },
          { id: 'b', text: 'Beta', isCorrect: true },
          { id: 'c', text: 'Gamma', isCorrect: false },
        ],
      },
    });

    expect(projected).toMatchObject({ data: { allowMultipleSelections: true } });
    expect(JSON.stringify(projected)).not.toContain('isCorrect');
  });

  it('odd-one-out strips oddity flags and keeps display policy', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'odd-one-out',
      data: {
        question: 'Which is odd?',
        items: [
          { id: 'a', text: 'Alpha', isOddOneOut: false },
          { id: 'b', text: 'Beta', isOddOneOut: true },
        ],
        requireExplanation: true,
        hint: 'secret-hint',
        explanation: 'secret-explanation',
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toMatchObject({
      data: {
        question: 'Which is odd?',
        items: [
          { id: 'a', text: 'Alpha' },
          { id: 'b', text: 'Beta' },
        ],
        requireExplanation: true,
      },
    });
    expect(JSON.stringify(projected)).not.toContain('isOddOneOut');
  });

  it('text-selection strips correct indices and per-question feedback', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'text-selection',
      data: {
        passage: 'Puella canit.',
        questions: [
          { id: 'q1', text: 'Who sings?', correctWordIndex: 0, hint: 'secret-hint', explanation: 'secret-explanation' },
        ],
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toMatchObject({
      data: { passage: 'Puella canit.', questions: [{ id: 'q1', text: 'Who sings?' }] },
    });
    expect(JSON.stringify(projected)).not.toContain('correctWordIndex');
  });

  it('fill-embolded-text strips answers and keeps prompts', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'fill-embolded-text',
      data: {
        passage: 'Puella canit.',
        words: [
          {
            wordIndex: 1,
            correctAnswer: 'secret-answer',
            question: 'Verb?',
            hint: 'secret-hint',
            explanation: 'secret-explanation',
          },
        ],
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toMatchObject({
      data: { passage: 'Puella canit.', words: [{ wordIndex: 1, question: 'Verb?' }] },
    });
    expect(JSON.stringify(projected)).not.toContain('correctAnswer');
  });

  it('sentence-diagramming strips the solution and nested feedback annotations', () => {
    const span = { startTokenIndex: 0, endTokenIndex: 0, startCharOffset: 0, endCharOffset: 4 };
    const projected = sanitizeSingle({
      ...base,
      type: 'sentence-diagramming',
      data: {
        latin: 'amat',
        translation: 'he loves',
        tokens: [{ id: 't0', text: 'amat', index: 0 }],
        solutionAnnotations: [{ id: 'secret-annotation', kind: 'verb', span }],
        availableStudentTools: ['verb'],
        difficulty: 'beginner',
        hint: { text: 'secret-hint', tokens: [], annotations: [{ id: 'secret-hint-annotation', kind: 'verb', span }] },
        explanation: { text: 'secret-explanation', tokens: [], annotations: [] },
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toEqual({
      id: 'exercise',
      type: 'sentence-diagramming',
      title: 'Exercise',
      instructions: 'Do the thing',
      maxPoints: 4,
      data: {
        latin: 'amat',
        translation: 'he loves',
        tokens: [{ id: 't0', text: 'amat', index: 0 }],
        availableStudentTools: ['verb'],
        difficulty: 'beginner',
      },
    });
  });

  it('table-fill strips cell answers and keeps layout', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'table-fill',
      data: {
        title: 'Decline rosa',
        columns: [{ id: 'c1', header: 'Case', className: 'wide' }],
        rows: [{ id: 'r1', cells: { c1: { content: 'rosa', isBlank: true, answer: 'secret-answer' } } }],
        footnotes: ['Note'],
        hint: 'secret-hint',
        explanation: 'secret-explanation',
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toMatchObject({
      data: {
        title: 'Decline rosa',
        columns: [{ id: 'c1', header: 'Case', className: 'wide' }],
        rows: [{ id: 'r1', cells: { c1: { content: 'rosa', isBlank: true } } }],
        footnotes: ['Note'],
      },
    });
    expect(JSON.stringify(projected)).not.toContain('"answer"');
  });

  it('click-on-multiple-words strips targets and grading-policy remnants', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'click-on-multiple-words',
      data: {
        title: 'Find verbs',
        passage: 'Puella canit.',
        instructions: 'Click the verbs',
        correctWordIndices: [1],
        minimumCorrect: 1,
        allowOverSelection: false,
        hint: 'secret-hint',
        explanation: 'secret-explanation',
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toEqual({
      id: 'exercise',
      type: 'click-on-multiple-words',
      title: 'Exercise',
      instructions: 'Do the thing',
      maxPoints: 4,
      data: { title: 'Find verbs', passage: 'Puella canit.', instructions: 'Click the verbs' },
    });
  });

  it('generated-translation strips generator configuration', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'generated-translation',
      translationDirection: 'english-to-latin',
      data: {
        generatorConfig: { collection: 'words', wordSource: 'filters', count: 3, filters: { search: 'secret-config' } },
        posConfigs: { verb: { enabled: true, filters: {} } },
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toEqual({
      id: 'exercise',
      type: 'generated-translation',
      title: 'Exercise',
      instructions: 'Do the thing',
      maxPoints: 4,
      translationDirection: 'english-to-latin',
      data: {},
    });
  });

  it('generated-form-identification keeps only display policy', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'generated-form-identification',
      data: {
        mode: 'single-field',
        requireAllPrimaryAnswers: true,
        showDictionaryEntry: true,
        generatorConfig: { collection: 'words', wordSource: 'pool', poolId: 'secret-pool', count: 3 },
        paradigmConfigs: { 'noun-declension': { enabled: true, steps: ['case'], filters: {} } },
        futurePrivate: 'secret-future',
      },
    });

    expect(projected).toEqual({
      id: 'exercise',
      type: 'generated-form-identification',
      title: 'Exercise',
      instructions: 'Do the thing',
      maxPoints: 4,
      data: { mode: 'single-field', requireAllPrimaryAnswers: true, showDictionaryEntry: true },
    });
  });

  it('translation grading exposes prompts but no feedback policy or unknown fields', () => {
    const projected = sanitizeSingle({
      ...base,
      type: 'translation-grading',
      translationDirection: 'english-to-latin',
      data: {
        items: [{ latinText: 'The girl sings.', instructions: 'Use the present tense', futurePrivate: 'secret-item' }],
        futurePrivate: 'secret-data',
      },
    });

    expect(projected).toEqual({
      id: 'exercise',
      type: 'translation-grading',
      title: 'Exercise',
      instructions: 'Do the thing',
      maxPoints: 4,
      translationDirection: 'english-to-latin',
      data: { items: [{ latinText: 'The girl sings.', instructions: 'Use the present tense' }] },
    });
  });
});

describe('fail-closed resolved generated-item projections', () => {
  const sanitizeResolved = (items: unknown[]) => {
    const state = stateWith(
      [
        {
          ...base,
          type: 'generated-form-identification',
          data: { mode: 'step-by-step', generatorConfig: {}, paradigmConfigs: {} },
        },
      ],
      { exercise: { items: items as FrozenTestDeliveryState['resolvedExercises'][string]['items'] } }
    );
    const serialized = JSON.stringify(sanitizeTestDeliveryState(state));
    expect(serialized).not.toContain('secret-');
    expect(serialized).not.toContain('acceptedAnswers');
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('FormPaths');
    return sanitizeTestDeliveryState(state).resolvedExercises.exercise.items as Array<Record<string, unknown>>;
  };

  it('step-by-step items expose exactly one expected answer and no keys', () => {
    const [projected] = sanitizeResolved([
      {
        id: 'word-person',
        wordId: 'word',
        word: 'amamus',
        root_word: 'amo',
        dictionary_entry: null,
        selected_form: 'amamus',
        hasSelectedForm: true,
        step: 'person',
        correctAnswer: 'secret-answer',
        acceptedAnswers: ['secret-answer'],
        hint: 'secret-hint',
        primaryFormPaths: [{ person: 'first' }],
        optionalFormPaths: [],
        futurePrivate: 'secret-future',
      },
    ]);

    expect(Object.keys(projected).sort()).toEqual(
      [
        'dictionary_entry',
        'expectedAnswerCount',
        'hasSelectedForm',
        'id',
        'root_word',
        'selected_form',
        'step',
        'word',
        'wordId',
      ].sort()
    );
    expect(projected).toMatchObject({ dictionary_entry: null, expectedAnswerCount: 1, step: 'person' });
  });

  it('single-field items expose steps and the expected path count only', () => {
    const [projected] = sanitizeResolved([
      {
        id: 'word',
        wordId: 'word',
        word: 'amamus',
        root_word: 'amo',
        dictionary_entry: 'amo, amare',
        selected_form: 'amamus',
        hasSelectedForm: true,
        steps: ['person', 'number'],
        correctAnswerDisplay: 'secret-display',
        hint: 'secret-hint',
        primaryFormPaths: [
          { person: 'first', number: 'plural' },
          { person: 'first', number: 'plural' },
        ],
        optionalFormPaths: [],
        futurePrivate: 'secret-future',
      },
    ]);

    expect(Object.keys(projected).sort()).toEqual(
      [
        'dictionary_entry',
        'expectedAnswerCount',
        'hasSelectedForm',
        'id',
        'root_word',
        'selected_form',
        'steps',
        'word',
        'wordId',
      ].sort()
    );
    expect(projected).toMatchObject({ expectedAnswerCount: 2, steps: ['person', 'number'] });
  });

  it('multi-answer items expose step position and authored answer count only', () => {
    const [projected] = sanitizeResolved([
      {
        id: 'word-number',
        wordId: 'word',
        word: 'amamus',
        root_word: 'amo',
        dictionary_entry: null,
        selected_form: 'amamus',
        hasSelectedForm: true,
        step: 'number',
        steps: ['person', 'number'],
        stepIndex: 1,
        totalSteps: 2,
        expectedAnswerCount: 3,
        correctAnswerDisplay: 'secret-display',
        hint: 'secret-hint',
        primaryFormPaths: [{ person: 'first', number: 'plural' }],
        optionalFormPaths: [],
        futurePrivate: 'secret-future',
      },
    ]);

    expect(Object.keys(projected).sort()).toEqual(
      [
        'dictionary_entry',
        'expectedAnswerCount',
        'hasSelectedForm',
        'id',
        'root_word',
        'selected_form',
        'step',
        'stepIndex',
        'steps',
        'totalSteps',
        'word',
        'wordId',
      ].sort()
    );
    expect(projected).toMatchObject({ expectedAnswerCount: 3, stepIndex: 1, totalSteps: 2 });
  });

  it('translation items expose only the prompt and normalization policy', () => {
    const state = stateWith(
      [{ ...base, type: 'generated-translation', data: { generatorConfig: {}, posConfigs: {} } }],
      {
        exercise: {
          items: [
            {
              text: 'love',
              acceptedAnswers: ['secret-answer'],
              hint: 'secret-hint',
              stripInfinitive: true,
              stripMacrons: true,
              futurePrivate: 'secret-future',
            },
          ] as unknown as FrozenTestDeliveryState['resolvedExercises'][string]['items'],
        },
      }
    );

    const delivery = sanitizeTestDeliveryState(state);
    expect(JSON.stringify(delivery)).not.toContain('secret-');
    expect(delivery.resolvedExercises.exercise.items).toEqual([
      { text: 'love', stripInfinitive: true, stripMacrons: true },
    ]);
  });
});
