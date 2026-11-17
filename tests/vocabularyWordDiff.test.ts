import {
  changedTableCells,
  changedWordFields,
  sameWordValue,
  summarizeWordChanges,
} from '@/src/utils/vocabulary/word-diff';

describe('vocabulary word diff', () => {
  it('detects review-only changes independently of Latin fields', () => {
    const current = { word: 'et' };
    const proposed = {
      ...current,
      ai_review: { uncertainties: [], guidance: [{ id: 'sense', instruction: 'Use and.' }] },
    };
    expect(changedWordFields(current, proposed)).toEqual(['ai_review']);
    expect(summarizeWordChanges(current, proposed)).toEqual({ fields: ['ai_review'], tableCells: 0 });
  });

  it('treats the values the editor shows as "—" as the same', () => {
    expect(sameWordValue(null, '')).toBe(true);
    expect(sameWordValue(undefined, [])).toBe(true);
    expect(sameWordValue({ full_form: '', shortened_form: null }, null)).toBe(true);
    expect(sameWordValue(['amō'], ['amo'])).toBe(false);
  });

  it('lists changed authored fields and ignores the ones the server keeps', () => {
    const current = { word: 'amo', translation: 'love', sort_key: 'amo', random_index: 0.1, _poolReferenceRevision: 1 };
    const proposed = { word: 'amō', translation: 'love', sort_key: 'amo', random_index: 0.9 };

    expect(changedWordFields(current, proposed)).toEqual(['word']);
  });

  it('finds the table cells that differ, including a branch only one side has', () => {
    const current = { present: { singular: { first: ['amo'], second: ['amās'] } } };
    const proposed = {
      present: { singular: { first: ['amō'], second: ['amās'] } },
      future: { singular: { first: ['amābō'], second: null } },
    };

    expect(changedTableCells(current, proposed)).toEqual(['present.singular.first', 'future.singular.first']);
  });

  it('summarizes changed fields apart from the inflection table', () => {
    const current = { word: 'amo', conjugation_table: { present: { first: ['amo'], second: ['amas'] } } };
    const proposed = { word: 'amō', conjugation_table: { present: { first: ['amō'], second: ['amās'] } } };

    expect(summarizeWordChanges(current, proposed)).toEqual({ fields: ['word'], tableCells: 2 });
  });
});
