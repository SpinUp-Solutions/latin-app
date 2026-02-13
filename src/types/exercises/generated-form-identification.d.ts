import type { BaseExercise, GeneratorConfigBase } from './base';
import type { ParadigmConfigs } from './paradigm';

export interface GeneratedFormIdentificationExercise extends BaseExercise {
  type: 'generated-form-identification';
  data: {
    mode: 'step-by-step' | 'single-field';
    requireAllPrimaryAnswers?: boolean;
    showDictionaryEntry?: boolean;
    generatorConfig: GeneratorConfigBase;
    paradigmConfigs: ParadigmConfigs;
  };
}
