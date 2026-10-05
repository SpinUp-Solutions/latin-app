import {
  scoreSingleFieldFormIdentificationAnswer,
  validateSingleFieldFormIdentificationExercise,
} from '@/src/utils/exercises/generatedFormIdentificationExercise';
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

  it('rejects extra fields even when every authored field is correct', () => {
    expect(scoreSingleFieldFormIdentificationAnswer('1st,pl,pres,extra', item)).toEqual({
      earnedUnits: 0,
      availableUnits: 3,
    });
  });

  it('reduces credit for extra guesses without changing the available units', () => {
    expect(scoreSingleFieldFormIdentificationAnswer('wrong,wrong,wrong;1st,pl,pres', item)).toEqual({
      earnedUnits: 1.5,
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

  it('keeps legitimate partial credit when trailing fields are missing', () => {
    expect(scoreSingleFieldFormIdentificationAnswer('first', item)).toEqual({
      earnedUnits: 1,
      availableUnits: 3,
    });
  });

  it('preserves partial credit when the submitted answer has the correct shape', () => {
    expect(scoreSingleFieldFormIdentificationAnswer('first,,present', item)).toEqual({
      earnedUnits: 2,
      availableUnits: 3,
    });
  });

  it('awards half credit for one complete parse of a syncretic noun', () => {
    const mare: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number', 'gender'],
      primaryFormPaths: [
        { case: 'accusative', number: 'singular', gender: 'neuter' },
        { case: 'nominative', number: 'singular', gender: 'neuter' },
      ],
    };
    expect(scoreSingleFieldFormIdentificationAnswer('nom, s, n', mare)).toEqual({
      earnedUnits: 3,
      availableUnits: 6,
    });
    expect(validateSingleFieldFormIdentificationExercise('nom, s, n', mare).isCorrect).toBe(false);
  });

  it('credits the number and gender of wrong-case answers', () => {
    const animus: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number', 'gender'],
      primaryFormPaths: [
        { case: 'nominative', number: 'plural', gender: 'masculine' },
        { case: 'genitive', number: 'singular', gender: 'masculine' },
      ],
    };
    expect(scoreSingleFieldFormIdentificationAnswer('dat, s, m; abl, s, m', animus)).toEqual({
      earnedUnits: 3,
      availableUnits: 6,
    });
  });

  it('lowers the mark gradually as wrong guesses are added to a one-answer word', () => {
    const nauta: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number', 'gender'],
      primaryFormPaths: [{ case: 'accusative', number: 'plural', gender: 'masculine' }],
    };
    expect(scoreSingleFieldFormIdentificationAnswer('abl, pl, m', nauta)).toEqual({
      earnedUnits: 2,
      availableUnits: 3,
    });
    expect(scoreSingleFieldFormIdentificationAnswer('abl, pl, m; dat, pl, m', nauta)).toEqual({
      earnedUnits: 1,
      availableUnits: 3,
    });
  });

  it('credits the same slip equally whether a word expects one answer or two', () => {
    const neuter = { number: 'singular', gender: 'neuter' };
    const steps: SingleFieldFormIdentificationItem['steps'] = ['case', 'number', 'gender'];
    const one = { ...item, steps, primaryFormPaths: [{ case: 'nominative', ...neuter }] };
    const two = { ...one, primaryFormPaths: [...one.primaryFormPaths, { case: 'accusative', ...neuter }] };
    expect(scoreSingleFieldFormIdentificationAnswer('nom, p, n', one)).toEqual({
      earnedUnits: 2,
      availableUnits: 3,
    });
    expect(scoreSingleFieldFormIdentificationAnswer('nom, p, n; acc, p, n', two)).toEqual({
      earnedUnits: 4,
      availableUnits: 6,
    });
  });

  it('accepts a trailing comma in an otherwise correct reordered answer', () => {
    const poena: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number', 'gender'],
      primaryFormPaths: [
        { case: 'nominative', number: 'plural', gender: 'feminine' },
        { case: 'genitive', number: 'singular', gender: 'feminine' },
        { case: 'dative', number: 'singular', gender: 'feminine' },
      ],
    };
    const answer = 'gen, s, f; dat, s, f,; nom, pl, f';
    expect(scoreSingleFieldFormIdentificationAnswer(answer, poena)).toEqual({
      earnedUnits: 9,
      availableUnits: 9,
    });
    expect(validateSingleFieldFormIdentificationExercise(answer, poena).isCorrect).toBe(true);
  });

  it('does not count the same correct parse twice or discard a valid parse beside a malformed one', () => {
    const noun: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number'],
      primaryFormPaths: [
        { case: 'nominative', number: 'singular' },
        { case: 'accusative', number: 'plural' },
      ],
    };
    for (const answer of ['nom,s;nom,s', 'nom,s;acc,,p', 'nom,s;acc,p,extra']) {
      expect(scoreSingleFieldFormIdentificationAnswer(answer, noun)).toEqual({
        earnedUnits: 2,
        availableUnits: 4,
      });
    }
  });

  it('does not assemble a correct parse from fields in different interpretations', () => {
    const noun: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number'],
      primaryFormPaths: [
        { case: 'nominative', number: 'singular' },
        { case: 'accusative', number: 'plural' },
      ],
    };
    expect(scoreSingleFieldFormIdentificationAnswer('nom,p;acc,s', noun)).toEqual({
      earnedUnits: 2,
      availableUnits: 4,
    });
    expect(validateSingleFieldFormIdentificationExercise('nom,p;acc,s', noun).isCorrect).toBe(false);
  });

  it('pairs answers for the highest total whatever order they are typed in', () => {
    const noun: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number'],
      primaryFormPaths: [
        { case: 'nominative', number: 'singular' },
        { case: 'accusative', number: 'plural' },
      ],
    };
    for (const answer of ['nom,p;nom,s', 'nom,s;nom,p']) {
      expect(scoreSingleFieldFormIdentificationAnswer(answer, noun)).toEqual({
        earnedUnits: 3,
        availableUnits: 4,
      });
    }
  });

  it('reassigns overlapping aliases so complete-match credit is independent of order', () => {
    const noun: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['gender'],
      primaryFormPaths: [{ gender: 'masculine-feminine' }, { gender: 'masculine' }],
    };
    for (const answer of ['m;f', 'f;m']) {
      expect(scoreSingleFieldFormIdentificationAnswer(answer, noun)).toEqual({
        earnedUnits: 2,
        availableUnits: 2,
      });
      expect(validateSingleFieldFormIdentificationExercise(answer, noun).isCorrect).toBe(true);
    }
    expect(scoreSingleFieldFormIdentificationAnswer('m;m', noun)).toEqual({
      earnedUnits: 1,
      availableUnits: 2,
    });
  });

  it('accepts either or both genders for a common-gender noun', () => {
    const civis: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number', 'gender'],
      primaryFormPaths: [{ case: 'accusative', number: 'singular', gender: 'masculine-feminine' }],
    };
    for (const answer of ['acc, s, m', 'acc, s, f', 'acc, s, m/f', 'acc, s, m; acc, s, f']) {
      expect(validateSingleFieldFormIdentificationExercise(answer, civis).isCorrect).toBe(true);
    }
  });

  it('ignores stray semicolons instead of counting them as wrong guesses', () => {
    const noun: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number'],
      primaryFormPaths: [
        { case: 'nominative', number: 'singular' },
        { case: 'accusative', number: 'plural' },
      ],
    };
    expect(scoreSingleFieldFormIdentificationAnswer('nom,s;', noun)).toEqual({
      earnedUnits: 2,
      availableUnits: 4,
    });
    expect(validateSingleFieldFormIdentificationExercise(';nom,s;;acc,p;', noun).isCorrect).toBe(true);
  });

  it('does not count a correct reading the exercise left out as a wrong guess', () => {
    const noun: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number'],
      primaryFormPaths: [{ case: 'nominative', number: 'plural' }],
      optionalFormPaths: [{ case: 'vocative', number: 'plural' }],
    };
    expect(validateSingleFieldFormIdentificationExercise('nom,p;voc,p', noun).isCorrect).toBe(true);
    expect(scoreSingleFieldFormIdentificationAnswer('voc,p', noun)).toEqual({
      earnedUnits: 1,
      availableUnits: 2,
    });
    expect(scoreSingleFieldFormIdentificationAnswer('nom,p;dat,p', noun)).toEqual({
      earnedUnits: 1,
      availableUnits: 2,
    });
  });

  it.each(['', '   ', ',,;,,', ';'])('gives zero for an answer with nothing in it: %j', answer => {
    const noun: SingleFieldFormIdentificationItem = {
      ...item,
      steps: ['case', 'number', 'gender'],
      primaryFormPaths: [
        { case: 'nominative', number: 'singular', gender: 'neuter' },
        { case: 'accusative', number: 'singular', gender: 'neuter' },
      ],
    };
    expect(scoreSingleFieldFormIdentificationAnswer(answer, noun)).toEqual({
      earnedUnits: 0,
      availableUnits: 6,
    });
  });
});
