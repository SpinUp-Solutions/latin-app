import { RenderableContentItem } from '@/src/types/page';
import { createDefaultFeedbackConfig, DEFAULT_ITEM_PROGRESSION_DELAY } from './feedbackDefaults';

export const generateId = (prefix?: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
};

export const createNewContent = (type: string): RenderableContentItem => {
  const baseId = generateId(type);

  switch (type) {
    case 'text':
      return {
        id: baseId,
        type: 'text',
        title: 'New Text Block',
        content: 'Enter your text here...',
        audioPath: null,
      };
    case 'emphasis':
      return {
        id: baseId,
        type: 'emphasis',
        title: 'Important Note',
        content: 'Enter emphasized content here...',
        audioPath: null,
      };
    case 'table':
      return {
        id: baseId,
        type: 'table',
        title: 'New Table',
        audioPath: null,
        tableData: {
          title: 'Table Title',
          columns: [
            { id: 'col1', header: 'Column 1' },
            { id: 'col2', header: 'Column 2' },
          ],
          rows: [
            {
              id: 'row1',
              cells: { col1: 'Cell 1', col2: 'Cell 2' },
            },
          ],
        },
      };
    case 'vocabulary':
      return {
        id: baseId,
        type: 'vocabulary',
        title: 'Vocabulary List',
        vocabularyItems: [],
        studyMode: 'flashcards',
      };
    case 'vocabulary-pool':
      return {
        id: baseId,
        type: 'vocabulary-pool',
        title: 'Vocabulary Pool',
      };
    case 'matching':
      return {
        id: baseId,
        type: 'matching',
        title: 'Matching Exercise',
        instructions: 'Match the items from the left column with the right column.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          leftColumn: [
            { id: `left-${Date.now()}-1`, value: 'Item 1' },
            { id: `left-${Date.now()}-2`, value: 'Item 2' },
          ],
          rightColumn: [
            { id: `right-${Date.now()}-1`, value: 'Match A' },
            { id: `right-${Date.now()}-2`, value: 'Match B' },
          ],
          answers: {
            [`left-${Date.now()}-1`]: `right-${Date.now()}-1`,
            [`left-${Date.now()}-2`]: `right-${Date.now()}-2`,
          },
        },
      };
    case 'fill':
      return {
        id: baseId,
        type: 'fill',
        title: 'Fill in the Blanks',
        instructions: 'Complete the sentences by filling in the blanks.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          items: [
            {
              text: 'Sample sentence',
              answer: 'answer',
            },
          ],
        },
      };
    case 'text-selection':
      return {
        id: baseId,
        type: 'text-selection',
        title: 'Text Selection Exercise',
        instructions: 'Select the correct words in the passage.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          passage: 'Sample passage with selectable words.',
          questions: [
            {
              id: 'q1',
              text: 'Select the correct word',
              correctWordIndex: 0,
              explanation: 'This is the correct selection.',
            },
          ],
        },
      };
    case 'fill-embolded-text':
      return {
        id: baseId,
        type: 'fill-embolded-text',
        title: 'Fill In Embolded Text Exercise',
        instructions: 'Click on the embolded words and provide the correct answer.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          passage: 'Passage with embolded text to analyze.',
          words: [],
        },
      };
    case 'sentence-diagramming':
      return {
        id: baseId,
        type: 'sentence-diagramming',
        title: 'Sentence Diagramming Exercise',
        instructions: 'Diagram the Latin sentence ',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          sentence: {
            latin: 'Marcus puellam videt',
            translation: 'Marcus sees the girl',
            words: [
              {
                id: 'word-1',
                text: 'Marcus',
                index: 0,
                startPosition: 0,
                endPosition: 6,
              },
              {
                id: 'word-2',
                text: 'puellam',
                index: 1,
                startPosition: 7,
                endPosition: 14,
              },
              {
                id: 'word-3',
                text: 'videt',
                index: 2,
                startPosition: 15,
                endPosition: 20,
              },
            ],
          },
          solution: {
            annotations: {},
          },
          hints: [
            'Start by identifying the verb in the sentence.',
            'Look for the subject - who is doing the action?',
            'Find the direct object - what is being acted upon?',
          ],
          difficulty: 'beginner',
        },
      };
    case 'multiple-choice':
      return {
        id: baseId,
        type: 'multiple-choice',
        title: 'Multiple Choice Question',
        instructions: 'Select the correct answer from the choices below.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          question: 'What is the correct answer?',
          options: [
            {
              id: `option-${Date.now()}-1`,
              text: 'Option A',
              isCorrect: true,
            },
            {
              id: `option-${Date.now()}-2`,
              text: 'Option B',
              isCorrect: false,
            },
            {
              id: `option-${Date.now()}-3`,
              text: 'Option C',
              isCorrect: false,
            },
            {
              id: `option-${Date.now()}-4`,
              text: 'Option D',
              isCorrect: false,
            },
          ],
          explanation: 'This explains why the correct answer is right.',
        },
      };
    case 'odd-one-out':
      return {
        id: baseId,
        type: 'odd-one-out',
        title: 'Odd One Out Exercise',
        instructions: "Select the item that doesn't belong with the others.",
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          question: "Which of these items doesn't belong?",
          items: [
            {
              id: `item-${Date.now()}-1`,
              text: 'Item A',
              isOddOneOut: false,
            },
            {
              id: `item-${Date.now()}-2`,
              text: 'Item B',
              isOddOneOut: false,
            },
            {
              id: `item-${Date.now()}-3`,
              text: 'Item C',
              isOddOneOut: false,
            },
            {
              id: `item-${Date.now()}-4`,
              text: 'Item D',
              isOddOneOut: true,
            },
          ],
          explanation: 'This item is different because...',
          requireExplanation: false,
        },
      };
    case 'table-fill':
      return {
        id: baseId,
        type: 'table-fill',
        title: 'Table Fill Exercise',
        instructions: 'Fill in the blank cells in the table below.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          title: 'Exercise Table',
          columns: [
            { id: 'col1', header: 'Column 1' },
            { id: 'col2', header: 'Column 2' },
          ],
          rows: [
            {
              id: 'row1',
              cells: {
                col1: { content: 'Sample content', isBlank: false },
                col2: { content: '', isBlank: true, answer: 'answer' },
              },
            },
          ],
        },
      };
    case 'click-on-multiple-words':
      return {
        id: baseId,
        type: 'click-on-multiple-words',
        title: 'Click On Multiple Words',
        instructions: 'Click on all the words that match the criteria.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          title: 'Word Selection Exercise',
          passage:
            'Click on the <em>adjectives</em> in this sample passage with multiple <strong>descriptive</strong> words.',
          correctWordIndices: [3, 8, 10],
          instructions: '',
          hint: 'Look for words that describe or modify nouns.',
          explanation: 'Adjectives are words that modify nouns and add descriptive information.',
          allowOverSelection: false,
          minimumCorrect: undefined,
        },
      };
    case 'generated-translation':
      return {
        id: baseId,
        type: 'generated-translation',
        title: 'Generated Translation Exercise',
        instructions: 'Translate between Latin and English based on the prompt.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        translationDirection: 'latin-to-english',
        data: {
          generatorConfig: {
            collection: 'vocabulary_words_v4',
            filters: {
              partOfSpeech: 'all',
              search: '',
              verbConjugation: 'all',
              isDeponent: 'both',
              nounDeclension: 'all',
              adjectiveDeclension: 'all',
            },
            formSelection: undefined,
            count: 5,
          },
        },
      };
    case 'generated-form-identification':
      return {
        id: baseId,
        type: 'generated-form-identification',
        title: 'Generated Form Identification Exercise',
        instructions: 'Identify the grammatical features of each Latin word.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          generatorConfig: {
            collection: 'vocabulary_words_v4',
            filters: {
              partOfSpeech: 'all',
              search: '',
              verbConjugation: 'all',
              isDeponent: 'both',
              nounDeclension: 'all',
              adjectiveDeclension: 'all',
            },
            formSelection: undefined,
            count: 5,
          },
          steps: [],
        },
      };
    default:
      throw new Error(`Unknown content type: ${type}`);
  }
};
