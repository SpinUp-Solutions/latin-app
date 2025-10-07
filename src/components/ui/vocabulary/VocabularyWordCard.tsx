'use client';

import React from 'react';
import { Badge } from '@/src/components/ui/badge';
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

export const VocabularyWordCard: React.FC<VocabularyWordCardProps> = ({
  word,
  variant = 'default',
  showSection = true,
  className,
}) => {
  const isCompact = variant === 'compact';
  const isLesson = variant === 'lesson';

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

          <div className="flex items-center gap-2 flex-wrap">
            {word.wordType && <Badge variant="secondary">{word.wordType}</Badge>}
            {word.grammaticalInfo && (
              <Badge variant="outline" className="text-xs">
                {word.grammaticalInfo}
              </Badge>
            )}
            {word.gender && (
              <Badge variant="outline" className="text-xs">
                {word.gender}
              </Badge>
            )}
            {word.declensionClass && (
              <Badge variant="outline" className="text-xs">
                Dec. {word.declensionClass}
              </Badge>
            )}
            {word.conjugationClass && (
              <Badge variant="outline" className="text-xs">
                Conj. {word.conjugationClass}
              </Badge>
            )}
          </div>

          {showSection && word.section && <div className="text-xs text-gray-500">Section: {word.section}</div>}

          {!isLesson && word.pronunciation && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Pronunciation:</span> {word.pronunciation}
            </div>
          )}

          {!isLesson && word.principalParts && word.principalParts.length > 0 && (
            <div className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Principal Parts:</span>
              <div className="flex flex-wrap gap-1">
                {word.principalParts.map((part, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {part}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </RomanCardContent>
    </RomanCard>
  );
};
