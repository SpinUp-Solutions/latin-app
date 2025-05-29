'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';

interface ExerciseTemplateProps {
  title?: string;
  instructions?: string;
  progress: number;
  children: React.ReactNode;
  transitionKey?: number | string;

  currentIndex: number;
  totalItems: number;

  isCorrect: boolean | null;
  showFeedback: boolean;
  feedbackMessage?: string;

  isTransitioning: boolean;

  onComplete?: () => void;
  onTransitionEnd?: () => void;
}

const ExerciseTemplate: React.FC<ExerciseTemplateProps> = ({
  title,
  instructions,
  progress,
  children,
  transitionKey,
  currentIndex,
  totalItems,
  isCorrect,
  showFeedback,
  feedbackMessage,
  isTransitioning,
  onComplete,
  onTransitionEnd,
}) => {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {title && <h3 className="text-lg font-serif text-roman-red">{title}</h3>}
        {instructions && (
          <div className="p-4 bg-roman-parchment rounded-lg">
            <p>{instructions}</p>
          </div>
        )}
      </div>

      <div className="relative h-2 bg-roman-marble rounded-full overflow-hidden">
        <motion.div
          className="absolute left-0 top-0 h-full bg-roman-green"
          initial={{ width: '0%' }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={transitionKey}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
          onAnimationComplete={onTransitionEnd}
          className="relative">
          {children}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showFeedback && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="fixed inset-0 flex items-center justify-center bg-black/20 z-50">
            <div
              className={`p-6 rounded-lg shadow-lg ${
                isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
              <div className="flex items-center gap-3">
                {isCorrect ? <Check className="h-6 w-6 text-green-600" /> : <X className="h-6 w-6 text-red-600" />}
                <p className={`text-lg font-serif ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                  {feedbackMessage}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {currentIndex === totalItems && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            onAnimationComplete={onComplete}
            className="fixed inset-0 flex items-center justify-center bg-black/20 z-50">
            <div className="bg-roman-parchment p-8 rounded-lg shadow-xl border border-roman-gold">
              <div className="text-center space-y-4">
                <div className="text-4xl">🎉</div>
                <h3 className="text-2xl font-serif text-roman-red">Exercise Complete!</h3>
                <p className="text-roman-stone">Well done! You've completed all the questions.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ExerciseTemplate;
