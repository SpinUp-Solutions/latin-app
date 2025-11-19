import type { BaseExercise, GeneratorConfigBase } from './base';

export interface GeneratedTranslationExercise extends BaseExercise {
  type: 'generated-translation';
  data: {
    generatorConfig: GeneratorConfigBase;
  };
}
