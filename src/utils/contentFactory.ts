import { RenderableContentItem } from '@/src/types/page';

export const createNewContent = (type: string): RenderableContentItem => {
  const baseId = `${type}-${Date.now()}`;

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
        data: {
          leftColumn: ['Item 1', 'Item 2'],
          rightColumn: ['Match A', 'Match B'],
          answers: {
            'Item 1': 'Match A',
            'Item 2': 'Match B',
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
