import { buildDraftVocabularyWord } from '@/src/utils/vocabulary-request-drafts';
import { VocabularyWordSchema } from '@/shared/types/vocabulary/schemas';
import type { RootWordCandidate } from '@/shared/types/vocabulary/requests';

describe('buildDraftVocabularyWord', () => {
  it('merges a root candidate with AI autocomplete data into a valid draft word', () => {
    const candidate: RootWordCandidate = {
      word: 'amō',
      part_of_speech: 'verb',
      dictionary_entry: 'amō, amāre, amāvī, amātum',
      translation_hint: 'love',
      confidence: 'high',
      reason: 'Standard first-person singular dictionary form.',
    };

    const draft = buildDraftVocabularyWord(candidate, {
      part_of_speech: 'verb',
      translation: 'love, like',
      definitions: ['to love', 'to like'],
      conjugation: '1',
      principal_parts: [
        { full_form: 'amō', shortened_form: 'amō' },
        { full_form: 'amāre', shortened_form: 'āre' },
        { full_form: 'amāvī', shortened_form: 'āvī' },
        { full_form: 'amātum', shortened_form: 'ātum' },
      ],
      is_deponent: false,
    });

    expect(draft.word).toBe('amō');
    expect(draft.sort_key).toBe('amo');
    expect(draft.translation).toBe('love, like');
    expect(VocabularyWordSchema.safeParse(draft).success).toBe(true);
  });

  it('uses candidate hints when autocomplete data omits optional display fields', () => {
    const candidate: RootWordCandidate = {
      word: 'sub',
      part_of_speech: 'preposition',
      dictionary_entry: 'sub + abl./acc.',
      translation_hint: 'under',
      confidence: 'medium',
    };

    const draft = buildDraftVocabularyWord(candidate, {
      part_of_speech: 'preposition',
      definitions: ['under, beneath'],
      case: 'ablative',
    });

    expect(draft.translation).toBe('under');
    expect(draft.dictionary_entry).toBe('sub + abl./acc.');
    expect(VocabularyWordSchema.safeParse(draft).success).toBe(true);
  });
});
