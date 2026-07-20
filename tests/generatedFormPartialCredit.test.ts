import { scoreSingleFieldFormIdentificationAnswer } from '@/src/utils/exercises/generatedFormIdentificationExercise';
import type { SingleFieldFormIdentificationItem } from '@/src/types/exercises/schemas/form-identification';

const item: SingleFieldFormIdentificationItem = {
  id: 'word-one',
  wordId: 'word-one',
  word: 'amamus',
  root_word: 'amo',
  dictionary_entry: 'amo, amare',
  selected_form: 'amamus',
  hasSelectedForm: true,
  steps: ['person', 'number', 'tense'],
  correctAnswerDisplay: 'first,plural,present',
  primaryFormPaths: [{ person: 'first', number: 'plural', tense: 'present' }],
  optionalFormPaths: [],
};

describe('single-field generated form partial credit', () => {
  it('awards one unit for every correct field', () => {
    expect(scoreSingleFieldFormIdentificationAnswer('first,singular,present', item)).toEqual({
      earnedUnits: 2,
      availableUnits: 3,
    });
  });

  it('accepts aliases and ignores extra values without a penalty', () => {
    expect(scoreSingleFieldFormIdentificationAnswer('1st,pl,pres,extra', item)).toEqual({
      earnedUnits: 3,
      availableUnits: 3,
    });
  });

  it('pairs reordered syncretic paths for the highest valid field score', () => {
    const syncretic: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number'],
      correctAnswerDisplay: 'nominative,singular;accusative,plural',
      primaryFormPaths: [
        { case: 'nominative', number: 'singular' },
        { case: 'accusative', number: 'plural' },
      ],
    };
    expect(scoreSingleFieldFormIdentificationAnswer('acc,pl;nom,sing', syncretic)).toEqual({
      earnedUnits: 4,
      availableUnits: 4,
    });
  });

  it('gives missing fields zero credit', () => {
    expect(scoreSingleFieldFormIdentificationAnswer('first', item)).toEqual({
      earnedUnits: 1,
      availableUnits: 3,
    });
  });
});
