'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { IntroductionPage, ExercisePage } from '@/src/types/lesson';
import ContentRenderer from './content-renderer';

interface PageTemplateProps {
  page: IntroductionPage | ExercisePage;
}

export const PageTemplate: React.FC<PageTemplateProps> = ({ page }) => {
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

      {page.items.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="space-y-4" // Additional spacing within each content item
        >
          <ContentRenderer content={item} />
        </motion.div>
      ))}
    </motion.div>
  );
};

export default PageTemplate;
