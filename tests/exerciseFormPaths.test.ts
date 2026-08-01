import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';

describe('parseFormPathFromString', () => {
  it('parses finite conjugation paths', () => {
    expect(parseFormPathFromString('indicative.active.perfect.singular.first', 'conjugation')).toEqual({
      verb_form: 'finite',
      tense: 'perfect',
      voice: 'active',
      mood: 'indicative',
      person: 'first',
      number: 'singular',
    });
  });

  it('does not parse arbitrary five-part conjugation paths as finite forms', () => {
    expect(parseFormPathFromString('nonFinite.foo.bar.baz.qux', 'conjugation')).toBeNull();
  });

  it('parses present active infinitive paths', () => {
    expect(parseFormPathFromString('nonFinite.infinitive.present.active', 'conjugation')).toEqual({
      verb_form: 'infinitive',
      tense: 'present',
      voice: 'active',
      mood: '',
      person: '',
      number: '',
    });
  });

  it('parses perfect active infinitive paths', () => {
    expect(parseFormPathFromString('nonFinite.infinitive.perfect.active', 'conjugation')).toEqual({
      verb_form: 'infinitive',
      tense: 'perfect',
      voice: 'active',
      mood: '',
      person: '',
      number: '',
    });
  });

  it('parses future passive infinitive paths', () => {
    expect(parseFormPathFromString('nonFinite.infinitive.future.passive', 'conjugation')).toEqual({
      verb_form: 'infinitive',
      tense: 'future',
      voice: 'passive',
      mood: '',
      person: '',
      number: '',
    });
  });

  it('parses participle paths', () => {
    expect(parseFormPathFromString('nonFinite.participle.present.active.nominative.masculine.singular', 'conjugation')).toEqual({
      verb_form: 'participle',
      tense: 'present',
      voice: 'active',
      mood: '',
      person: '',
      number: 'singular',
      case: 'nominative',
      gender: 'masculine',
    });
  });

  it('parses gerund paths', () => {
    expect(parseFormPathFromString('gerund.genitive', 'conjugation')).toEqual({
      verb_form: 'gerund',
      tense: '',
      voice: '',
      mood: '',
      person: '',
      number: '',
      case: 'genitive',
    });
  });

  it('parses supine paths', () => {
    expect(parseFormPathFromString('supine.accusative', 'conjugation')).toEqual({
      verb_form: 'supine',
      tense: '',
      voice: '',
      mood: '',
      person: '',
      number: '',
      case: 'accusative',
    });
  });
});
