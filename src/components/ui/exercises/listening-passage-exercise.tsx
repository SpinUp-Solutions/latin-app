'use client';

import React, { useState, useCallback } from 'react';
import { ListeningPassageExercise as ListeningPassageExerciseType } from '@/src/types/exercises/listening-passage';
import { AudioPlayer } from '@/src/components/ui/core/AudioPlayer';
import { Button } from '@/src/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';

interface ListeningPassageExerciseProps {
  exercise: ListeningPassageExerciseType;
  onComplete?: (score: number) => void;
}

const ListeningPassageExercise: React.FC<ListeningPassageExerciseProps> = ({ exercise, onComplete }) => {
  const [completed, setCompleted] = useState(false);

  const handleEnded = useCallback(() => {
    if (!completed) {
      setCompleted(true);
      onComplete?.(100);
    }
  }, [completed, onComplete]);

  const handleManualComplete = () => {
    if (!completed) {
      setCompleted(true);
      onComplete?.(100);
    }
  };

  return (
    <div className="space-y-6">
      {exercise.title && (
        <h3 className="text-xl font-serif text-gray-900">
          <SimpleRichDisplay content={exercise.title} />
        </h3>
      )}

      {exercise.instructions && (
        <p className="text-roman-stone">
          <SimpleRichDisplay content={exercise.instructions} />
        </p>
      )}

      <div className="rounded-2xl border border-roman-terracotta/20 bg-gradient-to-br from-roman-parchment/50 to-white p-6 space-y-4">
        <div className="font-serif text-lg leading-relaxed text-gray-900">
          <SimpleRichDisplay content={exercise.data.latinText} />
        </div>

        <div className="text-base text-roman-stone italic">
          <SimpleRichDisplay content={exercise.data.translation} />
        </div>
      </div>

      {exercise.data.passageAudioPath && (
        <AudioPlayer audioPath={exercise.data.passageAudioPath} onEnded={handleEnded} />
      )}

      {!completed && (
        <div className="flex justify-center">
          <Button
            onClick={handleManualComplete}
            variant="outline"
            className="text-roman-green border-roman-green/30 hover:bg-roman-green/10">
            <CheckCircle className="h-4 w-4 mr-2" />
            Mark as Complete
          </Button>
        </div>
      )}

      {completed && (
        <div className="text-center text-roman-green font-medium flex items-center justify-center gap-2">
          <CheckCircle className="h-5 w-5" />
          Completed
        </div>
      )}
    </div>
  );
};

export default ListeningPassageExercise;
