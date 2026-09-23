import { isSelectableMorphologyForm } from '@/src/utils/morphologyForms';

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
