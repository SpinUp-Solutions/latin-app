import type { BaseExercise, GeneratorConfigBase } from './base';
import type { FormIdentificationStep } from './schemas/form-identification';

export interface GeneratedFormIdentificationExercise extends BaseExercise {
  type: 'generated-form-identification';
  data: {
    generatorConfig: GeneratorConfigBase;
    steps: FormIdentificationStep[];
  };
}
