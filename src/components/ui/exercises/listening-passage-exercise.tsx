'use client';

import React from 'react';
import { ListeningPassageExercise as ListeningPassageExerciseType } from '@/src/types/exercises/listening-passage';
import { AudioPlayer } from '@/src/components/ui/core/AudioPlayer';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import type { ExerciseCompletionHandler } from '@/src/types/runtime-mode';

interface ListeningPassageViewProps {
  title?: string;
  instructions?: string;
  latinText: string;
  translation: string;
  passageAudioPath?: string | null;
}

export function ListeningPassageView({
  title,
  instructions,
  latinText,
  translation,
  passageAudioPath,
}: ListeningPassageViewProps) {
  return (
    <div className="space-y-6">
      {title && (
        <h3 className="text-xl font-serif text-gray-900">
          <SimpleRichDisplay content={title} />
        </h3>
      )}

      {instructions && (
        <div className="text-roman-stone">
          <SimpleRichDisplay content={instructions} />
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-roman-terracotta/20 bg-gradient-to-br from-roman-parchment/50 to-white p-6">
        <div className="font-serif text-lg leading-relaxed text-gray-900">
          <SimpleRichDisplay content={latinText} />
        </div>

        <div className="text-base italic text-roman-stone">
          <SimpleRichDisplay content={translation} />
        </div>
      </div>

      {passageAudioPath && <AudioPlayer audioPath={passageAudioPath} />}
    </div>
  );
}

interface ListeningPassageExerciseProps {
  exercise: ListeningPassageExerciseType;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
}

const ListeningPassageExercise: React.FC<ListeningPassageExerciseProps> = ({ exercise }) => {
  return (
    <ListeningPassageView
      title={exercise.title}
      instructions={exercise.instructions}
      latinText={exercise.data.latinText}
      translation={exercise.data.translation}
      passageAudioPath={exercise.data.passageAudioPath}
    />
  );
};

export default ListeningPassageExercise;
