import {
  countVocabularyPoolWordAdditions,
  limitVocabularyPoolWordCandidates,
  remainingVocabularyPoolWordAdditions,
} from '@/src/lib/vocabulary-pools/limits';

describe('vocabulary pool word addition limits', () => {
  it('truncates create-mode Add All at the new-reference boundary', () => {
    const selected = Array.from({ length: 390 }, (_, index) => `selected-${index}`);
    const candidates = Array.from({ length: 25 }, (_, index) => `candidate-${index}`);

    expect(remainingVocabularyPoolWordAdditions(selected, [], 400)).toBe(10);
    expect(limitVocabularyPoolWordCandidates(candidates, selected, [], 400)).toEqual(candidates.slice(0, 10));
  });

  it('allows a large legacy pool to be edited and limits only newly added references', () => {
    const initial = Array.from({ length: 500 }, (_, index) => `legacy-${index}`);
    const selected = initial.slice(0, 499);
    const candidates = ['legacy-499', ...Array.from({ length: 405 }, (_, index) => `new-${index}`)];
    const accepted = limitVocabularyPoolWordCandidates(candidates, selected, initial, 400);

    expect(countVocabularyPoolWordAdditions(selected, initial)).toBe(0);
    expect(accepted).toHaveLength(401);
    expect(accepted[0]).toBe('legacy-499');
    expect(accepted.at(-1)).toBe('new-399');
  });
});
