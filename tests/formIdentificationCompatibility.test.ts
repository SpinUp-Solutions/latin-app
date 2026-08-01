import type { Page } from '@/src/types/page';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises';
import {
  normalizeGeneratedFormIdentificationExercise,
  normalizeGeneratedFormIdentificationPages,
} from '@/src/utils/exercises/formIdentificationCompatibility';

const participlePath = 'nonFinite.participle.present.active.nominative.masculine.singular';

const makeExercise = (selectedCellPaths: string[]): GeneratedFormIdentificationExercise => ({
  id: 'morphology',
  type: 'generated-form-identification',
  title: 'Morphology',
  instructions: '',
  feedbackConfig: { escalationLevels: [] },
  data: {
    mode: 'step-by-step',
    generatorConfig: {
      collection: 'vocabulary_words_v5',
      wordSource: 'filters',
      count: 1,
    },
    paradigmConfigs: {
      'verb-conjugation': {
        enabled: true,
        filters: {},
        formSelection: {
          tableType: 'conjugation',
          selectedCellPaths,
        },
        steps: ['conjugation', 'tense', 'voice', 'mood'],
      },
    },
  },
});

describe('form-identification compatibility normalization', () => {
  it('upgrades non-finite legacy mood steps without mutating the source exercise', () => {
    const exercise = makeExercise([participlePath]);
    const normalized = normalizeGeneratedFormIdentificationExercise(exercise);

    expect(normalized).not.toBe(exercise);
    expect(normalized.data.paradigmConfigs['verb-conjugation']?.steps).toEqual([
      'conjugation',
      'tense',
      'voice',
      'verb_form',
    ]);
    expect(exercise.data.paradigmConfigs['verb-conjugation']?.steps).toEqual([
      'conjugation',
      'tense',
      'voice',
      'mood',
    ]);
    expect(normalizeGeneratedFormIdentificationExercise(normalized)).toBe(normalized);
  });

  it('normalizes morphology items inside pages and preserves unrelated items', () => {
    const text = { id: 'text', type: 'text' as const, title: '', content: 'Keep me' };
    const page: Page = {
      id: 'page',
      items: [text, makeExercise([participlePath])],
    };
    const pages = [page];

    const normalized = normalizeGeneratedFormIdentificationPages(pages);

    expect(normalized).not.toBe(pages);
    expect(normalized[0].items[0]).toBe(text);
    expect(
      (normalized[0].items[1] as GeneratedFormIdentificationExercise).data.paradigmConfigs['verb-conjugation']?.steps
    ).toContain('verb_form');
  });
});
