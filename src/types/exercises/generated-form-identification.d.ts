import type { BaseExercise, GeneratorConfigBase, FormIdentificationPosConfigs } from './base';

export interface GeneratedFormIdentificationExercise extends BaseExercise {
  type: 'generated-form-identification';
  data: {
    generatorConfig: GeneratorConfigBase;
    posConfigs: FormIdentificationPosConfigs;
  };
}
