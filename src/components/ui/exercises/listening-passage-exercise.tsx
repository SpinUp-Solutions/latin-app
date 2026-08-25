'use client';

import React from 'react';
import { ListeningPassageExercise as ListeningPassageExerciseType } from '@/src/types/exercises/listening-passage';
import { AudioPlayer } from '@/src/components/ui/core/AudioPlayer';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import type { ExerciseCompletionHandler } from '@/src/types/runtime-mode';

interface ListeningPassageExerciseProps {
  exercise: ListeningPassageExerciseType;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
}

const ListeningPassageExercise: React.FC<ListeningPassageExerciseProps> = ({ exercise }) => {
  return (
    <div className="space-y-6">
      {exercise.title && (
        <h3 className="text-xl font-serif text-gray-900">
          <SimpleRichDisplay content={exercise.title} />
        </h3>
      )}

      {exercise.instructions && (
        <div className="text-roman-stone">
          <SimpleRichDisplay content={exercise.instructions} />
        </div>
      )}

      <div className="rounded-2xl border border-roman-terracotta/20 bg-gradient-to-br from-roman-parchment/50 to-white p-6 space-y-4">
        <div className="font-serif text-lg leading-relaxed text-gray-900">
          <SimpleRichDisplay content={exercise.data.latinText} />
        </div>

        <div className="text-base text-roman-stone italic">
          <SimpleRichDisplay content={exercise.data.translation} />
        </div>
      </div>

      {exercise.data.passageAudioPath && <AudioPlayer audioPath={exercise.data.passageAudioPath} />}
    </div>
  );
};

export default ListeningPassageExercise;
