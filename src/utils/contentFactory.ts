import { RenderableContentItem } from '@/src/types/page';
import { createDefaultFeedbackConfig, DEFAULT_ITEM_PROGRESSION_DELAY } from './feedbackDefaults';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import {
  createEmptySentenceDiagramDocument,
  createSentenceDiagramFeedbackContent,
  DEFAULT_STUDENT_TOOLS,
} from '@/src/features/sentence-diagramming';
import { isExerciseType } from '@/src/lib/content/registry';
import type { PageDocumentEditorKind } from '@/src/lib/page-document-draft';

export const generateId = (prefix?: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
};

export const createNewContent = (
  type: string,
  editorKind: PageDocumentEditorKind = 'lesson'
): RenderableContentItem => {
  const baseId = generateId(type);

  const withScoring = <T extends RenderableContentItem>(content: T): T => {
    if (editorKind !== 'test-version' || !isExerciseType(content.type)) return content;
    return { ...content, maxPoints: 1 };
  };

  switch (type) {
    case 'text':
      return withScoring({
        id: baseId,
        type: 'text',
        title: 'New Text Block',
        content: 'Enter your text here...',
        audioPath: null,
      });
    case 'emphasis':
      return withScoring({
        id: baseId,
        type: 'emphasis',
        title: 'Important Note',
        content: 'Enter emphasized content here...',
        audioPath: null,
      });
    case 'table':
      return withScoring({
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
      });
    case 'vocabulary':
      return withScoring({
        id: baseId,
        type: 'vocabulary',
        title: 'Special Vocabulary',
        vocabularyItems: [],
      });
    case 'vocabulary-pool':
      return withScoring({
        id: baseId,
        type: 'vocabulary-pool',
        title: 'Vocabulary Pool',
      });
    case 'matching': {
      const leftColumn = [
        { id: generateId('left'), value: 'Item 1' },
        { id: generateId('left'), value: 'Item 2' },
      ];
      const rightColumn = [
        { id: generateId('right'), value: 'Match A' },
        { id: generateId('right'), value: 'Match B' },
      ];

      return withScoring({
        id: baseId,
        type: 'matching',
        title: 'Matching Exercise',
        instructions: 'Match the items from the left column with the right column.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          leftColumn,
          rightColumn,
          answers: {
            [leftColumn[0].id]: rightColumn[0].id,
            [leftColumn[1].id]: rightColumn[1].id,
          },
        },
      });
    }
    case 'fill':
      return withScoring({
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
      });
    case 'text-selection':
      return withScoring({
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
      });
    case 'fill-embolded-text':
      return withScoring({
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
      });
    case 'sentence-diagramming': {
      return withScoring({
        id: baseId,
        type: 'sentence-diagramming',
        title: 'Sentence Diagramming Exercise',
        instructions: 'Diagram the Latin sentence.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: createEmptySentenceDiagramDocument('Marcus puellam videt', 'Marcus sees the girl', {
          availableStudentTools: DEFAULT_STUDENT_TOOLS,
          hint: createSentenceDiagramFeedbackContent(
            'Start by identifying the verb, then work outward to the subject and direct object.'
          ),
          explanation: createSentenceDiagramFeedbackContent(
            'In this sentence, videt is the verb, Marcus is the subject, and puellam is the direct object.'
          ),
          difficulty: 'beginner',
        }),
      });
    }
    case 'multiple-choice':
      return withScoring({
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
          allowMultipleSelections: false,
        },
      });
    case 'odd-one-out':
      return withScoring({
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
      });
    case 'table-fill':
      return withScoring({
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
      });
    case 'click-on-multiple-words':
      return withScoring({
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
          correctWordIndices: [],
          instructions: '',
          hint: 'Look for words that describe or modify nouns.',
          explanation: 'Adjectives are words that modify nouns and add descriptive information.',
          allowOverSelection: false,
          minimumCorrect: undefined,
        },
      });
    case 'generated-translation':
      return withScoring({
        id: baseId,
        type: 'generated-translation',
        title: 'Definitions and Dictionary Entries',
        instructions: 'Translate between Latin and English based on the prompt.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        translationDirection: 'latin-to-english',
        data: {
          generatorConfig: {
            collection: VOCABULARY_WORDS_COLLECTION,
            wordSource: 'filters',
            poolId: null,
            poolWordLimit: null,
            count: 5,
          },
          posConfigs: {},
        },
      });
    case 'generated-form-identification':
      return withScoring({
        id: baseId,
        type: 'generated-form-identification',
        title: 'Morphology',
        instructions: 'Identify the grammatical features of each Latin word.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          mode: 'step-by-step',
          generatorConfig: {
            collection: VOCABULARY_WORDS_COLLECTION,
            wordSource: 'filters',
            poolId: null,
            poolWordLimit: null,
            count: 5,
          },
          paradigmConfigs: {},
        },
      });
    case 'translation-grading':
      return withScoring({
        id: baseId,
        type: 'translation-grading',
        title: 'Grade Translation',
        instructions: 'Translate the Latin sentence into English.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        translationDirection: 'latin-to-english',
        data: {
          items: [{ latinText: 'Puella rosam videt.' }],
        },
      });
    case 'listening-passage':
      return withScoring({
        id: baseId,
        type: 'listening-passage',
        title: 'Listening Passage',
        instructions: 'Listen to the audio and follow along with the Latin text.',
        audioPath: null,
        itemProgressionDelay: DEFAULT_ITEM_PROGRESSION_DELAY,
        feedbackConfig: createDefaultFeedbackConfig(),
        data: {
          latinText: 'Marcus in foro ambulat.',
          translation: 'Marcus walks in the forum.',
          passageAudioPath: null,
        },
      });
    default:
      throw new Error(`Unknown content type: ${type}`);
  }
};
