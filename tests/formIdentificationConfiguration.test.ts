import {
  getGeneratedFormIdentificationConfigurationIssues,
  getGeneratedFormIdentificationConfigurationMessages,
} from '@/src/utils/exercises/formIdentificationConfiguration';
import { lessonAuthoringInputSchema } from '@/src/lib/learning-units/schemas';
import { testVersionDraftInputSchema } from '@/src/lib/tests/schemas';

const finitePath = 'subjunctive.active.present.singular.first';
const infinitivePath = 'nonFinite.infinitive.present.active';
const participlePath = 'nonFinite.participle.present.active.nominative.masculine.singular';

const makeExercise = (selectedCellPaths: string[], steps: string[]) => ({
  id: 'morphology',
  type: 'generated-form-identification',
  title: 'Morphology',
  data: {
    mode: 'step-by-step',
    generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count: 1 },
    paradigmConfigs: {
      'verb-conjugation': {
        enabled: true,
        filters: {},
        formSelection: { tableType: 'conjugation', selectedCellPaths },
        steps,
      },
    },
  },
});

describe('generated form-identification configuration validation', () => {
  it('keeps selected questions unchanged and only flags forms with no applicable question', () => {
    const exercise = makeExercise([finitePath, participlePath], ['mood', 'tense']);

    expect(getGeneratedFormIdentificationConfigurationMessages(exercise)).toEqual([]);
    expect(exercise.data.paradigmConfigs['verb-conjugation'].steps).toEqual(['mood', 'tense']);
  });

  it('flags an infinitive that has only Mood selected', () => {
    const exercise = makeExercise([infinitivePath], ['mood']);

    expect(getGeneratedFormIdentificationConfigurationMessages(exercise)).toEqual([
      'Infinitive forms have no applicable selected questions.',
    ]);
  });

  it('reports the affected page and item when validating a document', () => {
    const issues = getGeneratedFormIdentificationConfigurationIssues([
      { id: 'page-1', items: [{ id: 'intro', type: 'text' }, makeExercise([participlePath], ['mood'])] },
    ]);

    expect(issues).toEqual([
      {
        pageIndex: 0,
        itemIndex: 1,
        message: 'Participle forms have no applicable selected questions.',
      },
    ]);
  });

  it('prevents test draft saves with an unanswerable selected form', () => {
    const result = testVersionDraftInputSchema.safeParse({
      id: 'version-1',
      name: 'Version A',
      pages: [{ id: 'page-1', items: [makeExercise([infinitivePath], ['mood'])] }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.message)).toContain(
      'Morphology exercise 1 on page 1: Infinitive forms have no applicable selected questions.'
    );
  });

  it('prevents lesson saves with an unanswerable selected form', () => {
    const result = lessonAuthoringInputSchema.safeParse({
      id: 'lesson-1',
      title: 'Lesson A',
      description: '',
      type: 'normal',
      pages: [{ id: 'page-1', items: [makeExercise([participlePath], ['mood'])] }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map(issue => issue.message)).toContain(
      'Morphology exercise 1 on page 1: Participle forms have no applicable selected questions.'
    );
  });
});
