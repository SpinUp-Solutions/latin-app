import { isSelectableMorphologyForm, isUniformTable } from '@/src/utils/morphologyForms';

describe('morphology form selection', () => {
  it.each([
    [null, false],
    [undefined, false],
    ['', false],
    ['   ', false],
    ['—', false],
    [' — ', false],
    ['-', true],
    ['–', true],
    ['amat', true],
  ])('classifies %p as selectable: %p', (value, expected) => {
    expect(isSelectableMorphologyForm(value)).toBe(expected);
  });
});

describe('isUniformTable', () => {
  it('returns true when at least two cases are filled and every form has the exact same spelling', () => {
    expect(
      isUniformTable({
        nominative: { singular: ['fās'], plural: null },
        accusative: { singular: [' fās '], plural: ['—'] },
        genitive: { singular: null, plural: null },
      })
    ).toBe(true);
    expect(isUniformTable({ nominative: { singular: 'quattuor' }, accusative: { singular: 'quattuor' } })).toBe(true);
    expect(
      isUniformTable({
        nominative: { singular: ['fās'] },
        vocative: { singular: ['fās'] },
        accusative: { singular: ['fās'] },
      })
    ).toBe(true);
  });

  it('does not count syncretism within one case, or a vocative that repeats the nominative, as indeclinable', () => {
    // A 1st-declension noun half filled in: the vocative always repeats the nominative.
    expect(isUniformTable({ nominative: { singular: ['puella'] }, vocative: { singular: ['puella'] } })).toBe(false);
    // A one-termination adjective: one form for all three genders in the nominative singular.
    expect(
      isUniformTable({
        nominative: {
          masculine: { singular: ['fēlīx'] },
          feminine: { singular: ['fēlīx'] },
          neuter: { singular: ['fēlīx'] },
        },
      })
    ).toBe(false);
    // A vocative that differs still shows that the word declines.
    expect(
      isUniformTable({
        nominative: { singular: ['servus'] },
        accusative: { singular: ['servus'] },
        vocative: { singular: ['serve'] },
      })
    ).toBe(false);
  });

  it('returns false for empty, single-cell, placeholder-only, or declining tables', () => {
    expect(isUniformTable(null)).toBe(false);
    expect(isUniformTable(undefined)).toBe(false);
    expect(isUniformTable({})).toBe(false);
    expect(isUniformTable({ nominative: { singular: ['māne'], plural: null } })).toBe(false);
    expect(isUniformTable({ nominative: { singular: ['māne'], plural: ['—', '   '] } })).toBe(false);
    expect(isUniformTable({ nominative: { singular: ['fās', 'fās'], plural: null } })).toBe(false);
    expect(isUniformTable({ nominative: { singular: ['nihil', 'nīl'] }, accusative: { singular: ['nihil'] } })).toBe(
      false
    );
    expect(isUniformTable({ nominative: { singular: ['puella'] }, accusative: { singular: ['puellam'] } })).toBe(false);
  });
});
