'use client';

import React, { useState } from 'react';
import { TranslationGradingExercise } from '@/src/types/exercises';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { useTranslationGrading } from '@/src/hooks/useTranslationGrading';
import { ExerciseInput } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { GrammaticalBreakdownItem } from '@/shared/openai/translation-grading';

interface Props {
  exercise: TranslationGradingExercise;
  onComplete?: (score: number) => void;
}

const PASSING_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-'];

const TranslationGradingExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [passedSentences, setPassedSentences] = useState<Set<number>>(new Set());

  const { currentIndex, isLastItem, isFirstItem, nextItem, previousItem, autoAdvanceIfEnabled } =
    useExerciseProgression({
      totalItems: exercise.data.items.length,
      itemProgressionDelay: exercise.itemProgressionDelay,
      progressionRules: exercise.feedbackConfig.progressionRules,
    });

  const { isCorrect, message, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(exercise.feedbackConfig);

  const { grade, reset: resetGrading, isLoading, data, error } = useTranslationGrading();

  const currentAnswer = userAnswers[currentIndex] || '';

  const handleSubmit = async () => {
    if (isLoading || !currentAnswer.trim()) return;

    const currentItem = exercise.data.items[currentIndex];
    const result = await grade({
      latinText: currentItem.latinText,
      userTranslation: currentAnswer,
    });

    if (!result) return;

    const passed = PASSING_GRADES.includes(result.grade);

    if (passed) {
      setPassedSentences(prev => new Set([...prev, currentIndex]));
      handleCorrect(isLastItem);

      if (isLastItem) {
        const finalScore = Math.round(((passedSentences.size + 1) / exercise.data.items.length) * 100);
        onComplete?.(finalScore);
      }
    } else {
      handleIncorrect();
    }
  };

  const handleContinue = () => {
    autoAdvanceIfEnabled(() => {
      resetGrading();
      reset();
    });
  };

  const handlePrevious = () => {
    previousItem();
    resetGrading();
  };

  const handleNext = () => {
    nextItem();
    resetGrading();
  };

  const currentItem = exercise.data.items[currentIndex];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          {exercise.title && (
            <h3 className="text-lg font-serif text-roman-red mb-2">
              <SimpleRichDisplay content={exercise.title} />
            </h3>
          )}
        </div>
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
        {currentItem.instructions && currentItem.instructions.trim() !== '' && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-3">
            <SimpleRichDisplay content={currentItem.instructions} />
          </div>
        )}

        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500 mb-1">Translate:</p>
          <p className="text-lg font-serif italic">{currentItem.latinText}</p>
        </div>

        <ExerciseInput
          value={currentAnswer}
          onChange={value => {
            setUserAnswers(prev => ({
              ...prev,
              [currentIndex]: value,
            }));
          }}
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
            <CardContent className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
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

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Detailed Breakdown:</p>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-medium text-gray-700">Latin Segment</th>
                        <th className="text-left p-3 font-medium text-gray-700">Your Translation</th>
                        <th className="text-left p-3 font-medium text-gray-700">Feedback</th>
                        <th className="text-left p-3 font-medium text-gray-700 w-16">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.breakdown.map((row, i) => (
                        <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50">
                          <td className="p-3 italic font-serif">{row.latinSegment}</td>
                          <td className="p-3">{row.yourTranslation}</td>
                          <td className="p-3">{row.feedback}</td>
                          <td className="p-3 text-center">{row.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {data.grammaticalBreakdown && data.grammaticalBreakdown.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Grammatical Analysis:</p>

                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b bg-amber-50">
                          <th className="text-left p-3 font-medium text-gray-700">Latin Segment</th>
                          <th className="text-left p-3 font-medium text-gray-700">Syntactical Role</th>
                          <th className="text-left p-3 font-medium text-gray-700">Key Grammatical Features</th>
                          <th className="text-left p-3 font-medium text-gray-700">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.grammaticalBreakdown.map((item, i) => {
                          // Get color based on syntactical role
                          const role = item.syntacticalRole.toLowerCase();
                          let roleColor = 'border-gray-300 bg-gray-50 text-gray-700';
                          if (role.includes('protasis') || role.includes('condition'))
                            roleColor = 'border-blue-400 bg-blue-50 text-blue-700';
                          else if (role.includes('apodosis') || role.includes('conclusion'))
                            roleColor = 'border-purple-400 bg-purple-50 text-purple-700';
                          else if (role.includes('subject')) roleColor = 'border-green-400 bg-green-50 text-green-700';
                          else if (role.includes('subordinate') || role.includes('relative'))
                            roleColor = 'border-indigo-400 bg-indigo-50 text-indigo-700';
                          else if (role.includes('participial'))
                            roleColor = 'border-orange-400 bg-orange-50 text-orange-700';
                          else if (role.includes('object'))
                            roleColor = 'border-yellow-400 bg-yellow-50 text-yellow-700';

                          return (
                            <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50 transition-colors">
                              <td className="p-3 font-serif italic font-medium">{item.latinSegment}</td>
                              <td className="p-3">
                                <div
                                  className={`inline-flex px-2 py-0.5 border-l-2 text-[10px] uppercase tracking-wider font-bold ${roleColor}`}>
                                  {item.syntacticalRole}
                                </div>
                              </td>
                              <td className="p-3 text-gray-700">{item.keyGrammaticalFeatures}</td>
                              <td className="p-3 text-gray-500 text-xs">{item.notes}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="pt-2">
                {PASSING_GRADES.includes(data.grade) ? (
                  <Button onClick={handleContinue} className="w-full">
                    {isLastItem ? 'Finish' : 'Continue'}
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      resetGrading();
                      reset();
                    }}
                    variant="outline"
                    className="w-full">
                    Try Again
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {isCorrect !== null && message && !data && (
          <div className={`mt-4 p-3 rounded-lg ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message}
          </div>
        )}

        {exercise.feedbackConfig.progressionRules?.allowManualAdvance !== false && (
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevious}
              disabled={isFirstItem || isLoading}
              className="rounded-full">
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {currentIndex + 1} / {exercise.data.items.length}
              </span>
              {passedSentences.has(currentIndex) && <span className="text-green-600 text-sm">✓</span>}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              disabled={isLastItem || isLoading}
              className="rounded-full">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranslationGradingExerciseComponent;
