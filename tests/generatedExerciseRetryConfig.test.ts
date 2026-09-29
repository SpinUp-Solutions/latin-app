import { createNewContent } from '@/src/utils/contentFactory';
import { regenerateContentIds } from '@/src/utils/idUtils';
import { GeneratedExercisePreviewRequestSchema } from '@/src/lib/tests/generated-preview-schema';
import { validateActiveTestExerciseConfiguration } from '@/src/lib/tests/active-exercise-validation';

describe.each(['generated-translation', 'generated-form-identification'] as const)('%s retry configuration', type => {
  function exercise() {
    const content = createNewContent(type);
    if (content.type !== 'generated-translation' && content.type !== 'generated-form-identification')
      throw new Error('Wrong fixture');
    content.data.generatorConfig = { ...content.data.generatorConfig, wordSource: 'pool', poolId: 'pool' };
    if (content.type === 'generated-form-identification') {
      content.data.paradigmConfigs = {
        'verb-conjugation': {
          enabled: true,
          filters: {},
          steps: ['person'],
          formSelection: { tableType: 'conjugation', selectedCellPaths: ['indicative.active.present.singular.first'] },
        },
      };
    }
    return content;
  }

  it('creates new exercises with retries enabled', () => {
    expect(exercise().data.retryIncorrectAnswers).toBe(true);
  });

  it.each([undefined, true, false])('preserves %s through validation, serialization and duplication', value => {
    const content = exercise();
    if (value === undefined) delete content.data.retryIncorrectAnswers;
    else content.data.retryIncorrectAnswers = value;
    const saved = JSON.parse(JSON.stringify(content));
    expect(GeneratedExercisePreviewRequestSchema.parse(saved).data.retryIncorrectAnswers).toBe(value);
    expect(validateActiveTestExerciseConfiguration(saved)).toEqual([]);
    const duplicate = regenerateContentIds(saved).content;
    expect(duplicate).toMatchObject({ data: { generatorConfig: content.data.generatorConfig } });
    expect(
      'data' in duplicate && duplicate.data && 'retryIncorrectAnswers' in duplicate.data
        ? duplicate.data.retryIncorrectAnswers
        : undefined
    ).toBe(value);
    expect(duplicate.id).not.toBe(content.id);
  });

  it.each([null, 'false', 0])('rejects an invalid explicit value %s', value => {
    const content = exercise();
    const invalid = { ...content, data: { ...content.data, retryIncorrectAnswers: value } };
    expect(GeneratedExercisePreviewRequestSchema.safeParse(invalid).success).toBe(false);
    expect(validateActiveTestExerciseConfiguration(invalid)).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['data', 'retryIncorrectAnswers'] })])
    );
  });
});
