'use client';

import React, { useState } from 'react';
import { TranslationGradingExercise } from '@/src/types/exercises';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { Card, CardContent } from '@/src/components/ui/card';
import { Loader2 } from 'lucide-react';

interface Props {
  exercise: TranslationGradingExercise;
  onComplete?: (score: number) => void;
}

interface SimulatedGradingResult {
  grade: string;
  notes: string;
  suggestedText: string;
}

const PASSING_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-'];

const SIMULATED_RESPONSES: SimulatedGradingResult[] = [
  {
    grade: 'A',
    notes: 'Excellent work! Your translation captures the meaning accurately with natural English phrasing.',
    suggestedText: 'The girl sees the rose.',
  },
  {
    grade: 'B+',
    notes: 'Good translation! Minor article choice could be refined, but the meaning is clear and grammar is solid.',
    suggestedText: 'The girl sees a rose.',
  },
  {
    grade: 'C+',
    notes: 'You understood the sentence structure well. Review vocabulary for "rosam" which means "rose".',
    suggestedText: 'The girl sees the rose.',
  },
];

const TranslationGradingExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<SimulatedGradingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { currentIndex, isLastItem, autoAdvanceIfEnabled } = useExerciseProgression({
    totalItems: exercise.data.items.length,
    itemProgressionDelay: exercise.itemProgressionDelay,
    progressionRules: exercise.feedbackConfig.progressionRules,
  });

  const { isCorrect, message, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(exercise.feedbackConfig);

  const simulateGrading = (): Promise<SimulatedGradingResult> => {
    return new Promise(resolve => {
      setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * SIMULATED_RESPONSES.length);
        resolve(SIMULATED_RESPONSES[randomIndex]);
      }, 1500);
    });
  };

  const handleSubmit = async () => {
    if (isLoading || !userAnswer.trim()) return;

    setIsLoading(true);
    setData(null);
    setError(null);

    try {
      const result = await simulateGrading();
      setData(result);

      const passed = PASSING_GRADES.includes(result.grade);

      if (passed) {
        const newCorrectAnswers = correctAnswers + 1;
        setCorrectAnswers(newCorrectAnswers);
        handleCorrect(isLastItem);

        if (isLastItem) {
          const finalScore = Math.round((newCorrectAnswers / exercise.data.items.length) * 100);
          onComplete?.(finalScore);
        }

        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          setData(null);
          reset();
        });
      } else {
        handleIncorrect();
      }
    } catch {
      setError('Failed to grade translation. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentItem = exercise.data.items[currentIndex];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        {exercise.title && (
          <h3 className="text-lg font-serif text-roman-red mb-2">
            <SimpleRichDisplay content={exercise.title} />
          </h3>
        )}
        {exercise.audioPath && (
          <AudioPlayButton
            audioPath={exercise.audioPath}
            variant="default"
            size="sm"
            className="ml-2 rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
          />
        )}
      </div>

      {exercise.instructions && exercise.instructions.replace(/<[^>]*>/g, '').trim() !== '' && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} />
        </div>
      )}

      <ExerciseProgress
        current={currentIndex}
        total={exercise.data.items.length}
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500 mb-1">Translate:</p>
          <p className="text-lg font-serif italic">{currentItem.latinText}</p>
        </div>

        <ExerciseInput
          value={userAnswer}
          onChange={setUserAnswer}
          onSubmit={handleSubmit}
          placeholder="Type your English translation..."
        />

        {isLoading && (
          <div className="flex items-center gap-2 mt-4 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Grading your translation...</span>
          </div>
        )}

        {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        {data && (
          <Card className="mt-4">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span
                  className={`text-2xl font-bold ${
                    PASSING_GRADES.includes(data.grade) ? 'text-green-600' : 'text-amber-600'
                  }`}>
                  {data.grade}
                </span>
                <span className="text-sm text-gray-500">
                  {PASSING_GRADES.includes(data.grade) ? 'Good job!' : 'Keep practicing!'}
                </span>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Feedback:</p>
                <p className="text-sm text-gray-600">{data.notes}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Suggested translation:</p>
                <p className="text-sm text-gray-600 italic">{data.suggestedText}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {isCorrect !== null && message && !data && (
          <div className={`mt-4 p-3 rounded-lg ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default TranslationGradingExerciseComponent;
