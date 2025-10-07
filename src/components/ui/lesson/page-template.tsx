'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Page } from '@/src/types/lesson';
import ContentRenderer from './content-renderer';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { isExerciseType } from '@/src/utils/lessonUtils';

interface PageTemplateProps {
  page: Page;
  pageIndex?: number;
  onExerciseComplete?: (itemIndex: number, score: number) => void;
  onPageComplete?: () => void;
}

export const PageTemplate: React.FC<PageTemplateProps> = ({ page, pageIndex, onExerciseComplete, onPageComplete }) => {
  const [completedExercises, setCompletedExercises] = useState(new Set<number>());

  const exerciseItems = page.items.filter(item => isExerciseType(item.type));
  const totalExercises = exerciseItems.length;

  const handleItemComplete = useCallback(
    (itemIndex: number, score: number) => {
      const item = page.items[itemIndex];

      if (onExerciseComplete) {
        onExerciseComplete(itemIndex, score);
      }

      if (isExerciseType(item.type)) {
        const newCompleted = new Set(completedExercises);
        newCompleted.add(itemIndex);
        setCompletedExercises(newCompleted);

        if (newCompleted.size === totalExercises && totalExercises > 0 && onPageComplete) {
          const autoAdvance = page.autoAdvance || { enabled: true, delay: 2000 };

          if (autoAdvance.enabled) {
            setTimeout(() => {
              onPageComplete();
            }, autoAdvance.delay);
          }
        }
      }
    },
    [page, completedExercises, totalExercises, onExerciseComplete, onPageComplete]
  );
  return (
    <motion.div
      key={page.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6">
      {page.title && (
        <h2 className="text-xl font-serif text-roman-red mb-4">
          <SimpleRichDisplay content={page.title} />
        </h2>
      )}

      {page.items.map((item, index: number) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="space-y-4">
          <ContentRenderer
            content={item}
            pageIndex={pageIndex}
            itemIndex={index}
            onComplete={(score: number) => handleItemComplete(index, score)}
          />
        </motion.div>
      ))}
    </motion.div>
  );
};

export default PageTemplate;
