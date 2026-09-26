import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GeneratedFormIdentificationExercise from '@/src/components/ui/exercises/generated-form-identification-exercise';
import type { GeneratedFormIdentificationExercise as Exercise } from '@/src/types/exercises/generated-form-identification';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

let mockWords: ExerciseWordResponse[] = [];
jest.mock('@/src/store/api/advancedVocabularyApi', () => ({
  useGetGeneratedExerciseWordsQuery: () => ({
    data: { words: mockWords },
    currentData: { words: mockWords },
    isLoading: false,
    isError: false,
  }),
}));

const PATHS = {
  amo: 'indicative.active.present.singular.first',
  amant: 'indicative.active.present.plural.third',
} as const;

// The pool engine returns the same vocabulary document once per form when a unique-word limit applies.
const occurrence = (form: keyof typeof PATHS): ExerciseWordResponse => {
  const formPath = parseFormPathFromString(PATHS[form], 'conjugation');
  return {
    id: 'amo-doc',
    root_word: 'amo',
    dictionary_entry: 'amo, amare',
    selected_form: form,
    part_of_speech: 'verb',
    form_path: formPath,
    primary_form_paths: [formPath],
  } as ExerciseWordResponse;
};

const exercise = (requireAllPrimaryAnswers: boolean): Exercise => ({
  id: 'repeated-word',
  type: 'generated-form-identification',
  title: 'Repeated word',
  instructions: '',
  itemProgressionDelay: 100,
  feedbackConfig: {
    escalationLevels: [],
    progressionRules: { autoAdvanceOnCorrect: false, pauseForExplanation: true, showProgress: true },
  },
  data: {
    mode: 'step-by-step',
    requireAllPrimaryAnswers,
    generatorConfig: {
      collection: VOCABULARY_WORDS_COLLECTION,
      wordSource: 'pool',
      poolId: 'pool-1',
      count: 2,
      uniqueWordCount: 1,
    },
    paradigmConfigs: {
      'verb-conjugation': {
        enabled: true,
        filters: {},
        steps: ['person', 'number'],
        formSelection: { tableType: 'conjugation', selectedCellPaths: Object.values(PATHS) },
      },
    },
  },
});

const answer = (value: string) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
};

describe('generated form identification with a repeated pool word', () => {
  beforeEach(() => {
    mockWords = [occurrence('amo'), occurrence('amant')];
  });
  afterEach(cleanup);

  it.each([false, true])(
    'asks and grades each form of the word separately (require all primary answers: %s)',
    requireAllPrimaryAnswers => {
      const callbacks = { onComplete: jest.fn(), onCompletionAccepted: jest.fn() };
      render(
        <GeneratedFormIdentificationExercise
          exercise={exercise(requireAllPrimaryAnswers)}
          allowGeneratedExerciseQueries
          {...callbacks}
        />
      );

      expect(screen.getByText('0 of 4 complete (0%)')).toBeInTheDocument();
      expect(screen.getByText('amo')).toBeInTheDocument();
      answer('first');
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      answer('singular');
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(screen.getByText('2 of 4 complete (50%)')).toBeInTheDocument();
      expect(screen.getByText('amant')).toBeInTheDocument();
      answer('third');
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      answer('plural');

      expect(screen.getByText('4 of 4 complete (100%)')).toBeInTheDocument();
      expect(callbacks.onCompletionAccepted).toHaveBeenCalledWith(100);
    }
  );
});
