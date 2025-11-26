import type { BaseExercise, GeneratorConfigBase, PosConfigs } from './base';

export type TranslationDirection = 'latin-to-english' | 'english-to-latin';

export interface GeneratedTranslationExercise extends BaseExercise {
  type: 'generated-translation';
  translationDirection?: TranslationDirection;
  data: {
    generatorConfig: GeneratorConfigBase;
    posConfigs: PosConfigs;
  };
}
