import {
  getGeneratedFormIdentificationConfigurationIssues,
  getGeneratedFormIdentificationConfigurationMessages,
  getGeneratedFormIdentificationConfigurationWarnings,
  formatFormIdentificationConfigurationWarning,
} from '@/src/utils/exercises/formIdentificationConfiguration';
import { lessonAuthoringInputSchema } from '@/src/lib/learning-units/schemas';
import { testVersionDraftInputSchema } from '@/src/lib/tests/schemas';
import {
  getFormIdentificationCompatibilitySummary,
  getFormPathStepSupport,
} from '@/src/utils/exercises/formIdentificationCompatibility';

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

  it('keeps mixed selections saveable and reports only the skipped family', () => {
    const exercise = makeExercise(
      [finitePath, infinitivePath, participlePath, 'gerund.genitive'],
      ['person', 'number', 'mood']
    );

    expect(getGeneratedFormIdentificationConfigurationMessages(exercise)).toEqual([]);
    expect(getGeneratedFormIdentificationConfigurationWarnings(exercise)).toEqual([
      expect.objectContaining({
        label: 'Infinitive forms',
        skippedCount: 1,
        answerableCount: 2,
      }),
      expect.objectContaining({
        label: 'Gerund forms',
        skippedCount: 1,
        answerableCount: 2,
      }),
    ]);

    const lessonResult = lessonAuthoringInputSchema.safeParse({
      id: 'lesson-mixed',
      title: 'Mixed morphology',
      description: '',
      type: 'normal',
      pages: [{ id: 'page-1', items: [exercise] }],
    });
    expect(lessonResult.success).toBe(true);
  });

  it('removes the editor warning as soon as a compatible question is added', () => {
    const exercise = makeExercise(['gerund.genitive'], ['mood']);
    expect(getGeneratedFormIdentificationConfigurationMessages(exercise)).toEqual([
      'Gerund forms have no applicable selected questions.',
    ]);

    exercise.data.paradigmConfigs['verb-conjugation'].steps.push('case');

    expect(getGeneratedFormIdentificationConfigurationMessages(exercise)).toEqual([]);
    expect(getGeneratedFormIdentificationConfigurationWarnings(exercise)).toEqual([]);
  });

  it('does not block an exercise when another enabled paradigm remains answerable', () => {
    const exercise = makeExercise(['gerund.genitive'], ['mood']);
    (exercise.data.paradigmConfigs as Record<string, unknown>)['noun-declension'] = {
      enabled: true,
      filters: {},
      formSelection: { tableType: 'declension', selectedCellPaths: ['nominative.singular'] },
      steps: ['case'],
    };

    expect(getGeneratedFormIdentificationConfigurationMessages(exercise)).toEqual([]);
    expect(getGeneratedFormIdentificationConfigurationWarnings(exercise)).toEqual([
      expect.objectContaining({ label: 'Gerund forms', skippedCount: 1 }),
    ]);
  });

  it('treats unrecognized saved paths like skipped selections when another form is answerable', () => {
    const exercise = makeExercise([finitePath, 'legacy.saved.path'], ['mood']);

    expect(getGeneratedFormIdentificationConfigurationMessages(exercise)).toEqual([]);
    const warnings = getGeneratedFormIdentificationConfigurationWarnings(exercise);
    expect(warnings).toEqual([
      expect.objectContaining({
        label: 'Unrecognized saved forms',
        skippedCount: 1,
        kind: 'unrecognized',
        answerableCount: 1,
      }),
    ]);
    expect(formatFormIdentificationConfigurationWarning(warnings[0])).toBe(
      '1 unrecognized saved form will be skipped. Select a valid form or remove the selection.'
    );
  });

  it('keeps an all-unrecognized saved selection blocked', () => {
    const exercise = makeExercise(['legacy.saved.path'], ['mood']);

    expect(getGeneratedFormIdentificationConfigurationMessages(exercise)).toEqual([
      'Saved form selections are unrecognized. Select valid forms before saving.',
    ]);
    expect(getGeneratedFormIdentificationConfigurationWarnings(exercise)).toEqual([]);
  });

  it('uses humanized step labels and plural wording for grouped warnings', () => {
    const exercise = makeExercise([finitePath, 'gerund.genitive', 'gerund.accusative'], ['mood']);
    const warning = getGeneratedFormIdentificationConfigurationWarnings(exercise).find(
      entry => entry.kind === 'incompatible'
    );

    expect(warning).toBeDefined();
    expect(formatFormIdentificationConfigurationWarning(warning!)).toBe(
      '2 gerund forms will not appear because none of the selected questions apply. Add Conjugation, Verb form, or Case to include them.'
    );
  });

  it.each([
    ['declension', ['nominative.singular'], ['tense'], 'Noun forms'],
    ['adjective-declension', ['positive.nominative.masculine.singular'], ['degree'], 'Adjective forms'],
    ['pronoun-declension', ['nominative.singular'], ['gender'], 'Personal pronoun forms'],
    ['pronoun-adjective-declension', ['nominative.masculine.singular'], ['gender'], 'Gendered pronoun forms'],
  ] as const)('applies compatibility to %s selections', (tableType, paths, steps, label) => {
    const summary = getFormIdentificationCompatibilitySummary(tableType, paths, steps);
    expect(summary.answerableCount).toBe(label === 'Noun forms' || label === 'Personal pronoun forms' ? 0 : 1);
    expect(getFormPathStepSupport(paths[0], tableType)?.label).toBe(label);
  });
});
