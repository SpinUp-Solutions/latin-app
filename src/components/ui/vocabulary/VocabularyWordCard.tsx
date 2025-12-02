'use client';

import React from 'react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import type { Word } from '@/src/types/admin-vocabulary';
import { cn } from '@/src/lib/utils';

interface VocabularyWordCardProps {
  word: Word;
  variant?: 'default' | 'compact' | 'lesson';
  showSection?: boolean;
  className?: string;
}

export const VocabularyWordCard: React.FC<VocabularyWordCardProps> = ({ word, variant = 'default', className }) => {
  const isCompact = variant === 'compact';

  return (
    <RomanCard className={cn(className)}>
      <RomanCardContent className={isCompact ? 'p-3' : 'p-4'}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className={cn('font-serif text-roman-red', isCompact ? 'text-lg' : 'text-xl')}>
              <SimpleRichDisplay content={word.word} />
            </h3>
          </div>

          <p className={cn('text-gray-800', isCompact ? 'text-base' : 'text-lg')}>
            <SimpleRichDisplay content={word.translation} />
          </p>
        </div>
      </RomanCardContent>
    </RomanCard>
  );
};
