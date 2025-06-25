import { RenderableContentItem } from '@/src/types/page';

const generateId = (prefix?: string): string => {
  const timestamp = Date.now().toString(36);
  const randomNum = Math.random().toString(36).substr(2, 5);
  return prefix ? `${prefix}-${timestamp}-${randomNum}` : `${timestamp}-${randomNum}`;
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
    case 'matching':
      return {
        id: baseId,
        type: 'matching',
        title: 'Matching Exercise',
        instructions: 'Match the items from the left column with the right column.',
        audioPath: null,
        feedbackConfig: {
          escalationLevels: [],
          progressionRules: {},
          successMessage: {
            showExplanation: true,
          },
          timingConfig: {},
        },
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
        feedbackConfig: {
          escalationLevels: [],
          progressionRules: {},
          successMessage: {
            showExplanation: true,
          },
          timingConfig: {},
        },
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
        feedbackConfig: {
          escalationLevels: [],
          progressionRules: {},
          successMessage: {
            showExplanation: true,
          },
          timingConfig: {},
        },
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
    case 'verb-analysis':
      return {
        id: baseId,
        type: 'verb-analysis',
        title: 'Verb Analysis Exercise',
        instructions: 'Analyze the verbs in the passage.',
        audioPath: null,
        feedbackConfig: {
          escalationLevels: [],
          progressionRules: {},
          successMessage: {
            showExplanation: true,
          },
          timingConfig: {},
        },
        data: {
          passage: 'Passage with verbs to analyze.',
          verbs: [
            {
              wordIndex: 0,
              correctPronoun: 'he/she/it',
              explanation: 'This verb is third person singular.',
            },
          ],
        },
      };
    case 'verb-conjugation':
      return {
        id: baseId,
        type: 'verb-conjugation',
        title: 'Verb Conjugation Exercise',
        instructions: 'Practice verb conjugations.',
        audioPath: null,
        feedbackConfig: {
          escalationLevels: [],
          progressionRules: {},
          successMessage: {
            showExplanation: true,
          },
          timingConfig: {},
        },
        data: {
          passage: {
            latin: 'Latin passage',
            translation: 'English translation',
            specialVocab: {},
          },
          conjugationTask: {
            instructions: 'Conjugate the verb',
            answer: 'correct conjugation',
          },
          livingLatinPractice: {
            examples: [
              {
                latin: 'Latin example',
                translation: 'English example',
              },
            ],
            exercises: [
              {
                english: 'English phrase',
                answer: 'Latin answer',
              },
            ],
          },
        },
      };
    default:
      throw new Error(`Unknown content type: ${type}`);
  }
};
