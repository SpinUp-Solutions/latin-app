'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { IntroductionPage, ExercisePage, ContentItem } from '@/src/types/lesson';
import ContentRenderer from './content-renderer';

interface PageTemplateProps {
  page: IntroductionPage | ExercisePage;
  onPageComplete?: () => void; // Optional since navigation is handled by buttons
}

const isInteractiveContent = (item: ContentItem): boolean => {
  return ['matching', 'fill', 'text-selection', 'verb-analysis', 'verb-conjugation'].includes(item.type);
};

export const PageTemplate: React.FC<PageTemplateProps> = ({ page }) => {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());

  const handleItemComplete = (itemId: string) => {
    const newCompletedItems = new Set(completedItems);
    newCompletedItems.add(itemId);
    setCompletedItems(newCompletedItems);
    // Note: This is just for tracking completion state, not for navigation
  };

  return (
    <motion.div
      key={page.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6" // Predetermined spacing between content items
    >
      {page.title && <h2 className="text-xl font-serif text-roman-red mb-4">{page.title}</h2>}

      {/* Show all items immediately */}
      {page.items.map((item: ContentItem, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="space-y-4" // Additional spacing within each content item
        >
          <ContentRenderer
            content={item}
            onComplete={isInteractiveContent(item) ? () => handleItemComplete(item.id) : undefined}
            isCompleted={completedItems.has(item.id)}
          />
        </motion.div>
      ))}
    </motion.div>
  );
};

export default PageTemplate;
