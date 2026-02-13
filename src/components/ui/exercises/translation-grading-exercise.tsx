'use client';

import React, { useState } from 'react';
import { TranslationGradingExercise } from '@/src/types/exercises';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { useTranslationGrading } from '@/src/hooks/useTranslationGrading';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Loader2, ChevronLeft, ChevronRight, Check, Lightbulb } from 'lucide-react';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableRow,
  RomanTableHead,
  RomanTableCell,
} from '../core/roman-table';

interface Props {
  exercise: TranslationGradingExercise;
  onComplete?: (score: number) => void;
}

const PASSING_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-'];

const getRoleColor = (role: string) => {
  const r = role.toLowerCase();
  if (r.includes('protasis') || r.includes('condition')) return 'border-blue-400 bg-blue-50 text-blue-700';
  if (r.includes('apodosis') || r.includes('conclusion')) return 'border-purple-400 bg-purple-50 text-purple-700';
  if (r.includes('subject')) return 'border-green-400 bg-green-50 text-green-700';
  if (r.includes('subordinate') || r.includes('relative')) return 'border-indigo-400 bg-indigo-50 text-indigo-700';
  if (r.includes('participial')) return 'border-orange-400 bg-orange-50 text-orange-700';
  if (r.includes('object')) return 'border-yellow-400 bg-yellow-50 text-yellow-700';
  return 'border-gray-300 bg-gray-50 text-gray-700';
};

const TranslationGradingExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [passedSentences, setPassedSentences] = useState<Set<number>>(new Set());
  const translationDirection = exercise.translationDirection || 'latin-to-english';
  const isLatinToEnglish = translationDirection === 'latin-to-english';
  const sourceLanguage = isLatinToEnglish ? 'Latin' : 'English';
  const targetLanguage = isLatinToEnglish ? 'English' : 'Latin';
  const direction = translationDirection;

  const { currentIndex, isLastItem, isFirstItem, nextItem, previousItem } = useExerciseProgression({
    totalItems: exercise.data.items.length,
    itemProgressionDelay: exercise.itemProgressionDelay,
    progressionRules: exercise.feedbackConfig.progressionRules,
  });

  const { grade, reset: resetGrading, isLoading, data, error } = useTranslationGrading();

  const currentAnswer = userAnswers[currentIndex] || '';

  const handleSubmit = async () => {
    if (isLoading || !currentAnswer.trim()) return;

    const currentItem = exercise.data.items[currentIndex];
    const sourceText = currentItem.latinText;
    const result = await grade({
      sourceText,
      userTranslation: currentAnswer,
      direction,
    });

    if (!result) return;

    const passed = PASSING_GRADES.includes(result.grade);

    if (passed) {
      setPassedSentences(prev => new Set([...prev, currentIndex]));
    }
  };

  const handleContinue = () => {
    if (isLastItem) {
      const finalScore = Math.round((passedSentences.size / exercise.data.items.length) * 100);
      onComplete?.(finalScore);
    }
    nextItem();
    resetGrading();
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
  const sourceText = currentItem.latinText;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        {exercise.title && (
          <h3 className="text-md font-serif text-roman-red">
            <SimpleRichDisplay content={exercise.title} />
          </h3>
        )}
        {exercise.audioPath && (
          <AudioPlayButton
            audioPath={exercise.audioPath}
            variant="default"
            size="sm"
            className="rounded-full border-roman-terracotta/10 hover:border-roman-terracotta hover:bg-roman-parchment h-8 w-8"
          />
        )}
      </div>

      {exercise.instructions && exercise.instructions.replace(/<[^>]*>/g, '').trim() !== '' && (
        <div className="p-3 bg-roman-parchment/50 rounded-lg mb-4 text-xs text-roman-stone border border-roman-terracotta/5">
          <SimpleRichDisplay content={exercise.instructions} />
        </div>
      )}

      <ExerciseProgress
        current={currentIndex}
        total={exercise.data.items.length}
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

      <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
        {currentItem.instructions && currentItem.instructions.trim() !== '' && (
          <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg mb-4 text-sm text-blue-800">
            <SimpleRichDisplay content={currentItem.instructions} />
          </div>
        )}

        <div className="mb-6">
          <div className="mb-4 p-5 bg-roman-parchment/5 rounded-xl border border-roman-red/10 shadow-[inset_0_1px_2px_rgba(139,38,53,0.05)]">
            <p className="text-[10px] uppercase tracking-widest text-roman-red/70 font-bold mb-2">
              {sourceLanguage} Prompt
            </p>
            <p className="text-xl font-serif italic text-roman-red leading-relaxed">{sourceText}</p>
          </div>

          <div className="flex gap-4">
            <Textarea
              value={currentAnswer}
              onChange={e => {
                setUserAnswers(prev => ({
                  ...prev,
                  [currentIndex]: e.target.value,
                }));
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Type your ${targetLanguage} translation...`}
              className="min-h-[140px] text-base resize-y border-roman-red/10 focus-visible:ring-roman-red/20 flex-1"
            />
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !currentAnswer.trim()}
              variant="outline"
              className="border-roman-red text-roman-red hover:bg-roman-red/5 hover:text-roman-red shadow-sm transition-all hover:translate-y-[-1px] h-auto min-h-[140px] px-4 self-stretch flex flex-col items-center justify-center gap-2"
              title="Check Translation">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6 stroke-[3]" />}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            {error}
          </div>
        )}

        {data && (
          <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Grade & Overall Feedback - Compact */}
            <div className="p-5 bg-roman-parchment/20 rounded-xl border border-roman-red/10 space-y-4 shadow-sm">
              <div className="flex items-center gap-4 border-b border-roman-red/10 pb-4">
                <div className="flex flex-col items-center justify-center p-3 bg-white rounded-lg border border-roman-red/20 shadow-sm min-w-[80px]">
                  <span className="text-4xl font-serif font-bold text-roman-red leading-none">{data.grade}</span>
                  <span className="text-[9px] uppercase tracking-widest text-roman-red font-bold mt-1">Grade</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-roman-red/80 mb-1.5 flex items-center gap-2">
                    <span className="w-2 h-px bg-roman-red/30" />
                    Overall Feedback
                  </h4>
                  <p className="text-sm text-gray-700 leading-relaxed italic">&ldquo;{data.notes}&rdquo;</p>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-roman-red/80 mb-2 flex items-center gap-2">
                  <span className="w-2 h-px bg-roman-red/30" />
                  Suggested Translation
                </h4>
                <div className="p-3 bg-white/50 rounded-lg border border-roman-red/10">
                  <p className="text-md font-serif italic text-gray-800 leading-relaxed">{data.suggestedText}</p>
                </div>
              </div>
            </div>

            {/* Tables Container */}
            <div className="grid grid-cols-1 gap-8">
              {/* Detailed Breakdown Table */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-roman-red/80 mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-roman-red/20" />
                  Detailed Segment Breakdown
                </h4>
                <RomanTable>
                  <RomanTableHeader>
                    <RomanTableRow className="border-roman-red/10">
                      <RomanTableHead className="w-1/3 py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                        {sourceLanguage} Segment
                      </RomanTableHead>
                      <RomanTableHead className="w-1/3 py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                        Your {targetLanguage}
                      </RomanTableHead>
                      <RomanTableHead className="py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                        Feedback
                      </RomanTableHead>
                    </RomanTableRow>
                  </RomanTableHeader>
                  <RomanTableBody>
                    {data.breakdown.map((row, i) => (
                      <RomanTableRow key={i} className="border-roman-red/5">
                        <RomanTableCell className="py-2.5 italic text-gray-900 font-serif leading-relaxed">
                          {row.latinSegment}
                        </RomanTableCell>
                        <RomanTableCell className="py-2.5 text-gray-600 font-sans text-xs">
                          {row.yourTranslation}
                        </RomanTableCell>
                        <RomanTableCell className="py-2.5">
                          <div className="flex items-start gap-2 font-sans text-xs">
                            <span className="shrink-0 mt-0.5">
                              {row.type === '✓' ? (
                                <Check className="h-3.5 w-3.5 text-green-600 stroke-[3]" />
                              ) : (
                                <Lightbulb className="h-3.5 w-3.5 text-roman-red stroke-[2.5]" />
                              )}
                            </span>
                            <span className="text-gray-700 leading-relaxed">{row.feedback}</span>
                          </div>
                        </RomanTableCell>
                      </RomanTableRow>
                    ))}
                  </RomanTableBody>
                </RomanTable>
              </div>

              {/* Grammatical Analysis Table */}
              {data.grammaticalBreakdown && data.grammaticalBreakdown.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-roman-red/80 mb-3 flex items-center gap-2">
                    <span className="w-4 h-px bg-roman-red/20" />
                    Grammatical & Syntactic Analysis
                  </h4>
                  <RomanTable>
                    <RomanTableHeader>
                      <RomanTableRow className="border-roman-red/10">
                        <RomanTableHead className="w-1/3 py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                          Latin Segment
                        </RomanTableHead>
                        <RomanTableHead className="w-1/6 py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                          Syntactic Role
                        </RomanTableHead>
                        <RomanTableHead className="py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                          Grammatical Analysis
                        </RomanTableHead>
                      </RomanTableRow>
                    </RomanTableHeader>
                    <RomanTableBody>
                      {data.grammaticalBreakdown.map((item, i) => (
                        <RomanTableRow key={i} className="border-roman-red/5">
                          <RomanTableCell className="py-2.5 italic text-gray-900 font-serif leading-relaxed">
                            {item.latinSegment}
                          </RomanTableCell>
                          <RomanTableCell className="py-2.5">
                            <div
                              className={`inline-flex px-1.5 py-0.5 border-l-2 text-[9px] uppercase tracking-wider font-bold font-sans ${getRoleColor(
                                item.syntacticalRole
                              )}`}>
                              {item.syntacticalRole}
                            </div>
                          </RomanTableCell>
                          <RomanTableCell className="py-2.5 font-sans text-xs">
                            <div className="space-y-1">
                              <p className="text-gray-700 leading-relaxed">{item.keyGrammaticalFeatures}</p>
                              {item.notes && (
                                <p className="text-[10px] text-roman-red/60 italic leading-snug">Note: {item.notes}</p>
                              )}
                            </div>
                          </RomanTableCell>
                        </RomanTableRow>
                      ))}
                    </RomanTableBody>
                  </RomanTable>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-6 border-t border-roman-red/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                disabled={isFirstItem || isLoading}
                className="text-roman-stone/50 hover:text-roman-red transition-colors font-serif italic text-xs">
                <ChevronLeft className="h-3 w-3 mr-1" />
                Previous
              </Button>

              <div className="flex items-center gap-6">
                <Button
                  onClick={() => {
                    resetGrading();
                  }}
                  variant="ghost"
                  className="text-roman-red/60 hover:text-roman-red hover:bg-roman-red/5 font-serif uppercase tracking-widest text-[10px] h-9 px-4">
                  Try Again
                </Button>

                {PASSING_GRADES.includes(data.grade) && (
                  <Button
                    onClick={handleContinue}
                    className="bg-roman-red hover:bg-roman-red/90 text-white font-serif uppercase tracking-widest text-[10px] h-9 px-8 shadow-md transition-all hover:translate-y-[-1px]">
                    {isLastItem ? 'Finish Exercise' : 'Next Sentence'}
                    <ChevronRight className="ml-2 h-3 w-3 opacity-70" />
                  </Button>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleNext}
                disabled={isLastItem || isLoading}
                className="text-roman-stone/50 hover:text-roman-red transition-colors font-serif italic text-xs">
                Next
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {!data && (
          <div className="flex justify-between items-center mt-8 pt-4 border-t border-gray-100">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrevious}
              disabled={isFirstItem || isLoading}
              className="text-gray-400 hover:text-roman-stone">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              {passedSentences.has(currentIndex) && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                  <span className="text-xs">✓</span> Passed
                </span>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              disabled={isLastItem || isLoading}
              className="text-gray-400 hover:text-roman-stone">
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranslationGradingExerciseComponent;
