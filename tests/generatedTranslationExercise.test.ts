import {
  splitTranslationAnswers,
  validateGeneratedTranslationExercise,
} from '@/src/utils/exercises/generatedTranslationExercise';

// Translations as stored on the production vocabulary words that were marked wrong.
const itemFor = (translation: string) => ({
  text: 'word',
  acceptedAnswers: splitTranslationAnswers(translation),
  stripInfinitive: true,
});

const isCorrect = (answer: string, translation: string) =>
  validateGeneratedTranslationExercise(answer, itemFor(translation)).isCorrect;

describe('validateGeneratedTranslationExercise', () => {
  const isEaId = 'he, she, it; this, that (weak demonstrative)';

  it('still accepts any single meaning', () => {
    expect(isCorrect('he', isEaId)).toBe(true);
    expect(isCorrect('he ', isEaId)).toBe(true);
    expect(isCorrect('that', isEaId)).toBe(true);
  });

  it('accepts a list of meanings when every listed meaning is accepted', () => {
    expect(isCorrect('he, she, it', isEaId)).toBe(true);
    expect(isCorrect('He, She, It', isEaId)).toBe(true);
    expect(isCorrect('he; she; it', isEaId)).toBe(true);
    expect(isCorrect('he/she/it', isEaId)).toBe(true);
    expect(isCorrect('he or she or it', isEaId)).toBe(true);
    expect(isCorrect('this, that', isEaId)).toBe(true);
    expect(isCorrect('to beg, to ask', 'to ask, ask for, beg, request; to question, inquire')).toBe(true);
    expect(isCorrect('small, little', 'small, little')).toBe(true);
    expect(isCorrect('I,me', 'I, me')).toBe(true);
    expect(isCorrect('by/from', 'by, from, away from')).toBe(true);
    expect(isCorrect('out of/from', 'out of, from; according to; because of')).toBe(true);
  });

  it('rejects a list that contains any meaning that is not accepted', () => {
    expect(isCorrect('he, she, dog', isEaId)).toBe(false);
    expect(isCorrect('he or dog', isEaId)).toBe(false);
    expect(isCorrect('to', isEaId)).toBe(false);
    expect(isCorrect('he or', isEaId)).toBe(false);
  });

  it('does not split an answer that already matches as a whole', () => {
    const latinEntry = { text: 'he, she, it', acceptedAnswers: ['is, ea, id'], stripInfinitive: true };

    expect(validateGeneratedTranslationExercise('is, ea, id', latinEntry).isCorrect).toBe(true);
    expect(validateGeneratedTranslationExercise('is, ea', latinEntry).isCorrect).toBe(false);
  });

  describe('dictionary entries typed for English-to-Latin items', () => {
    const latinItem = (dictionaryEntry: string) => ({
      text: 'greedy',
      acceptedAnswers: [dictionaryEntry],
      stripInfinitive: false,
      stripMacrons: true,
    });
    const isLatinCorrect = (answer: string, dictionaryEntry: string) =>
      validateGeneratedTranslationExercise(answer, latinItem(dictionaryEntry)).isCorrect;

    it('accepts endings written without their hyphens', () => {
      expect(isLatinCorrect('avidus, a, um', 'avidus, -a, -um')).toBe(true);
      expect(isLatinCorrect('avidus a um', 'avidus, -a, -um')).toBe(true);
      expect(isLatinCorrect('avidus,-a,-um', 'avidus, -a, -um')).toBe(true);
      expect(isLatinCorrect('laudo, are, avi, atum', 'laudō, -āre, -āvī, -ātum')).toBe(true);
      expect(isLatinCorrect('avidus, -a, -um', 'avidus, –a, –um')).toBe(true);
    });

    it('still accepts the entry exactly as written', () => {
      expect(isLatinCorrect('avidus, -a, -um', 'avidus, -a, -um')).toBe(true);
      expect(isLatinCorrect('avidus -a -um', 'avidus, -a, -um')).toBe(true);
    });

    it('still rejects wrong or missing endings', () => {
      expect(isLatinCorrect('avidus, a', 'avidus, -a, -um')).toBe(false);
      expect(isLatinCorrect('avidus, -ae, -um', 'avidus, -a, -um')).toBe(false);
      expect(isLatinCorrect('avidus', 'avidus, -a, -um')).toBe(false);
    });
  });
});
