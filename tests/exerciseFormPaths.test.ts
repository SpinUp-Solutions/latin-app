import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';

describe('parseFormPathFromString', () => {
  it('parses finite conjugation paths', () => {
    expect(parseFormPathFromString('indicative.active.perfect.singular.first', 'conjugation')).toEqual({
      tense: 'perfect',
      voice: 'active',
      mood: 'indicative',
      person: 'first',
      number: 'singular',
    });
  });

  it('parses present active infinitive paths', () => {
    expect(parseFormPathFromString('nonFinite.infinitive.present.active', 'conjugation')).toEqual({
      tense: 'present',
      voice: 'active',
      mood: 'infinitive',
      person: '',
      number: '',
    });
  });

  it('parses perfect active infinitive paths', () => {
    expect(parseFormPathFromString('nonFinite.infinitive.perfect.active', 'conjugation')).toEqual({
      tense: 'perfect',
      voice: 'active',
      mood: 'infinitive',
      person: '',
      number: '',
    });
  });

  it('parses future passive infinitive paths', () => {
    expect(parseFormPathFromString('nonFinite.infinitive.future.passive', 'conjugation')).toEqual({
      tense: 'future',
      voice: 'passive',
      mood: 'infinitive',
      person: '',
      number: '',
    });
  });
});
