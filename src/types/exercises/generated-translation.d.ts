import type { BaseExercise, GeneratorConfigBase, PosConfigs } from './base';

export type TranslationDirection = 'latin-to-english' | 'english-to-latin';

export interface GeneratedTranslationExercise extends BaseExercise {
  type: 'generated-translation';
  translationDirection?: TranslationDirection;
  data: {
    /** Practice only; missing means enabled for existing exercises. */
    retryIncorrectAnswers?: boolean;
    generatorConfig: GeneratorConfigBase;
    posConfigs: PosConfigs;
  };
}
