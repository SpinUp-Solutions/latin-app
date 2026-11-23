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
  it('returns true when at least two filled cells share the exact same spelling', () => {
    expect(
      isUniformTable({
        nominative: { singular: ['fās'], plural: null },
        accusative: { singular: [' fās '], plural: ['—'] },
        genitive: { singular: null, plural: null },
      })
    ).toBe(true);
    expect(isUniformTable({ nominative: { singular: 'quattuor' }, accusative: { singular: 'quattuor' } })).toBe(true);
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
