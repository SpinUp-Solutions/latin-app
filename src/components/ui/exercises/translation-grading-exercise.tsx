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
import { AIProvider } from '@/shared/openai/types';
import { GrammaticalBreakdownItem } from '@/shared/openai/translation-grading';

interface Props {
  exercise: TranslationGradingExercise;
  onComplete?: (score: number) => void;
}

const PASSING_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-'];

const TranslationGradingExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [passedSentences, setPassedSentences] = useState<Set<number>>(new Set());
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [grammarExpanded, setGrammarExpanded] = useState(false);

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
      provider,
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
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">AI:</span>
            <button
              onClick={() => setProvider(provider === 'openai' ? 'gemini' : 'openai')}
              disabled={isLoading}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                provider === 'openai'
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              } disabled:opacity-50`}>
              {provider === 'openai' ? 'OpenAI' : 'Gemini'}
            </button>
          </div>
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
                  <button
                    onClick={() => setGrammarExpanded(!grammarExpanded)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 mb-2">
                    {grammarExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    Grammatical Analysis
                  </button>

                  {grammarExpanded && (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b bg-amber-50">
                            <th className="text-left p-3 font-medium text-gray-700">Latin</th>
                            <th className="text-left p-3 font-medium text-gray-700">Translation</th>
                            <th className="text-left p-3 font-medium text-gray-700">Lemma</th>
                            <th className="text-left p-3 font-medium text-gray-700">Part of Speech</th>
                            <th className="text-left p-3 font-medium text-gray-700">Parsing</th>
                            <th className="text-left p-3 font-medium text-gray-700">Function</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.grammaticalBreakdown.map((item, i) => {
                            // Build parsing string
                            const parts: string[] = [];
                            if (['verb', 'participle'].includes(item.partOfSpeech)) {
                              if (item.person) parts.push(item.person);
                              if (item.number) parts.push(item.number);
                              if (item.tense) parts.push(item.tense.replace('_', ' '));
                              if (item.mood) parts.push(item.mood);
                              if (item.voice) parts.push(item.voice);
                              if (item.partOfSpeech === 'participle') {
                                if (item.case) parts.push(item.case);
                                if (item.gender) parts.push(item.gender);
                              }
                            } else if (['noun', 'adjective', 'pronoun', 'gerund', 'gerundive'].includes(item.partOfSpeech)) {
                              if (item.case) parts.push(item.case);
                              if (item.number) parts.push(item.number);
                              if (item.gender) parts.push(item.gender);
                            } else if (item.partOfSpeech === 'infinitive') {
                              if (item.tense) parts.push(item.tense.replace('_', ' '));
                              if (item.voice) parts.push(item.voice);
                            }
                            const parsing = parts.length > 0 ? parts.join(', ') : '-';

                            // Get color for syntactic function
                            const fn = item.syntacticFunction;
                            let fnColor = 'bg-gray-100 text-gray-800';
                            if (fn === 'subject') fnColor = 'bg-blue-100 text-blue-800';
                            else if (fn === 'direct_object') fnColor = 'bg-green-100 text-green-800';
                            else if (fn === 'indirect_object') fnColor = 'bg-yellow-100 text-yellow-800';
                            else if (fn === 'main_verb') fnColor = 'bg-purple-100 text-purple-800';
                            else if (fn.startsWith('ablative_')) fnColor = 'bg-orange-100 text-orange-800';
                            else if (fn.startsWith('genitive_')) fnColor = 'bg-pink-100 text-pink-800';
                            else if (fn.startsWith('dative_')) fnColor = 'bg-teal-100 text-teal-800';
                            else if (fn.includes('clause')) fnColor = 'bg-indigo-100 text-indigo-800';

                            return (
                              <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50">
                                <td className="p-3 font-serif italic font-medium">{item.latinPhrase}</td>
                                <td className="p-3">{item.translation}</td>
                                <td className="p-3 font-serif text-gray-600">{item.lemma}</td>
                                <td className="p-3 capitalize">{item.partOfSpeech}</td>
                                <td className="p-3 text-gray-600 capitalize">{parsing}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${fnColor}`}>
                                    {fn.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                  </span>
                                  {item.notes && <p className="text-xs text-gray-500 mt-1">{item.notes}</p>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
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
