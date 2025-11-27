import type { BaseExercise, GeneratorConfigBase, FormIdentificationPosConfigs } from './base';

export interface GeneratedFormIdentificationExercise extends BaseExercise {
  type: 'generated-form-identification';
  data: {
    mode: 'step-by-step' | 'single-field';
    generatorConfig: GeneratorConfigBase;
    posConfigs: FormIdentificationPosConfigs;
  };
}
