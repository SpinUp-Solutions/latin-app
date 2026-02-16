import { BaseExercise } from './base';

export interface ListeningPassageExercise extends BaseExercise {
  type: 'listening-passage';
  data: {
    latinText: string;
    translation: string;
    passageAudioPath: string | null;
  };
}
