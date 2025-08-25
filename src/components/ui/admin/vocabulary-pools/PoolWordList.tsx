import React from 'react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { X } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import type { Word } from '@/src/types/admin-vocabulary';

interface PoolWordListProps {
  words: Word[];
  poolId: string;
  compact?: boolean;
  showRemove?: boolean;
  onRemoveWord?: (wordId: string) => void;
}

export const PoolWordList: React.FC<PoolWordListProps> = ({ 
  words, 
  poolId, 
  compact = false, 
  showRemove = false,
  onRemoveWord 
}) => {
  if (words.length === 0) {
    return (
      <RomanCard>
        <RomanCardContent className="p-6 text-center">
          <p className="text-gray-500">No words in this pool yet.</p>
        </RomanCardContent>
      </RomanCard>
    );
  }

  return (
    <RomanCard>
      <RomanCardContent className="p-4">
        <div className={`grid gap-3 ${
          compact 
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
            : 'grid-cols-1 md:grid-cols-2'
        }`}>
          {words.map(word => (
            <WordCard 
              key={word.id} 
              word={word} 
              compact={compact}
              showRemove={showRemove}
              onRemove={() => onRemoveWord?.(word.id)}
            />
          ))}
        </div>
      </RomanCardContent>
    </RomanCard>
  );
};

interface WordCardProps {
  word: Word;
  compact: boolean;
  showRemove: boolean;
  onRemove?: () => void;
}

const WordCard: React.FC<WordCardProps> = ({ word, compact, showRemove, onRemove }) => {
  return (
    <Card className="hover:bg-gray-50 transition-colors">
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h4 className={`font-medium truncate ${compact ? 'text-sm' : ''}`}>
                {word.word}
              </h4>
              <p className={`text-gray-600 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                {word.translation}
              </p>
            </div>
            
            {showRemove && onRemove && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onRemove}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {word.wordType}
            </Badge>
            {!compact && word.grammaticalInfo && (
              <Badge variant="secondary" className="text-xs">
                {word.grammaticalInfo}
              </Badge>
            )}
          </div>
          
          {!compact && word.section && (
            <div className="text-xs text-gray-500">
              Section: {word.section}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};