import { buildVocabularyPoolDeleteConfirmation } from '@/src/lib/vocabulary-pools/delete-confirmation';

const usage = (label: string) => ({ id: label, poolId: 'pool-1', kind: 'lesson' as const, label });

describe('vocabulary pool deletion confirmation', () => {
  it('warns about saved assignments and shows a compact list of their names', () => {
    expect(
      buildVocabularyPoolDeleteConfirmation(
        'Chapter 1 words',
        [usage('Lesson: One'), usage('Lesson: Two'), usage('Lesson: Three'), usage('Lesson: Four')],
        'available'
      )
    ).toBe(
      'Are you sure you want to delete "Chapter 1 words"?\n\nThis pool is assigned to 4 saved assignments:\n• Lesson: One\n• Lesson: Two\n• Lesson: Three\n• +1 more\n\nDeleting it may break that saved content. This action cannot be undone.'
    );
  });

  it('warns when assignments could not be checked', () => {
    expect(buildVocabularyPoolDeleteConfirmation('Chapter 1 words', [], 'unavailable')).toContain(
      'Assignments could not be checked. Deleting this pool may break lessons or exercises that use it.'
    );
  });

  it('uses the normal irreversible-delete confirmation for an unused pool', () => {
    expect(buildVocabularyPoolDeleteConfirmation('Chapter 1 words', [], 'available')).toBe(
      'Are you sure you want to delete "Chapter 1 words"? This action cannot be undone.'
    );
  });
});
