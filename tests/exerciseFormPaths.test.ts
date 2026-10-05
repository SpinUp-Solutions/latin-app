import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';

const blank = { tense: '', voice: '', mood: '', person: '', number: '' };

describe('parseFormPathFromString', () => {
  it.each([
    [
      'indicative.active.perfect.singular.first',
      {
        verb_form: 'finite',
        tense: 'perfect',
        voice: 'active',
        mood: 'indicative',
        person: 'first',
        number: 'singular',
      },
    ],
    ['nonFinite.infinitive.present.active', { ...blank, verb_form: 'infinitive', tense: 'present', voice: 'active' }],
    ['nonFinite.infinitive.perfect.active', { ...blank, verb_form: 'infinitive', tense: 'perfect', voice: 'active' }],
    ['nonFinite.infinitive.future.passive', { ...blank, verb_form: 'infinitive', tense: 'future', voice: 'passive' }],
    [
      'nonFinite.participle.present.active.nominative.masculine.singular',
      {
        ...blank,
        verb_form: 'participle',
        tense: 'present',
        voice: 'active',
        number: 'singular',
        case: 'nominative',
        gender: 'masculine',
      },
    ],
    ['gerund.genitive', { ...blank, verb_form: 'gerund', case: 'genitive' }],
    ['supine.accusative', { ...blank, verb_form: 'supine', case: 'accusative' }],
  ])('parses the conjugation path %s', (path, expected) => {
    expect(parseFormPathFromString(path, 'conjugation')).toEqual(expected);
  });

  it('does not parse arbitrary five-part conjugation paths as finite forms', () => {
    expect(parseFormPathFromString('nonFinite.foo.bar.baz.qux', 'conjugation')).toBeNull();
  });
});
