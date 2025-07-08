import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Edit, ChevronDown, ChevronRight } from 'lucide-react';
import { Word } from '@/src/types/admin-vocabulary';
import { DeclensionTable, AdjectiveDeclensionTable, ConjugationTable } from './VocabularyTables';
import { getWordTypeColor } from '@/src/utils/vocabUtils';

interface WordCardProps {
  word: Word;
  onEdit: (word: Word) => void;
  isLast?: boolean;
}

export const WordCard: React.FC<WordCardProps> = ({ word, onEdit, isLast = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggleTableExpansion = (tableType: string) => {
    const key = `${word.id}-${tableType}`;
    setExpandedTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const isTableExpanded = (tableType: string) => {
    return expandedTables.has(`${word.id}-${tableType}`);
  };

  return (
    <div className={`bg-white hover:bg-gray-50 transition-colors ${!isLast ? 'border-b border-gray-200' : ''}`}>
      {/* Compact header row */}
      <div className="flex items-center px-4 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 hover:text-roman-red transition-colors shrink-0">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-serif font-semibold text-roman-red">{word.word}</span>
          </button>

          <Badge className={getWordTypeColor(word.wordType)} shrink-0>
            {word.wordType}
          </Badge>

          {word.declensionClass && (
            <Badge variant="outline" shrink-0>
              {word.declensionClass}
            </Badge>
          )}

          <span className="text-gray-700 truncate flex-1 min-w-0 max-w-[300px]">{word.translation}</span>
        </div>

        <div className="flex-shrink-0 ml-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(word)} className="whitespace-nowrap">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100">
          <div className="flex flex-col gap-4 mt-3">
            {word.grammaticalInfo && <div className="text-sm text-muted-foreground -mt-1">{word.grammaticalInfo}</div>}

            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {word.gender && (
                <div>
                  <span className="font-medium">Gender:</span> {word.gender}
                </div>
              )}
              {word.declensionClass && (
                <div>
                  <span className="font-medium">Declension:</span> {word.declensionClass}
                </div>
              )}
              {word.conjugationClass && (
                <div>
                  <span className="font-medium">Conjugation:</span> {word.conjugationClass}
                </div>
              )}
              {word.pronunciation && (
                <div>
                  <span className="font-medium">Pronunciation:</span> {word.pronunciation}
                </div>
              )}
            </div>

            {word.principalParts && word.principalParts.length > 0 && (
              <div>
                <span className="font-medium text-sm">Principal Parts:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {word.principalParts.map((part, idx) => (
                    <Badge key={idx} variant="secondary">
                      {part}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {word.definitions && word.definitions.length > 0 && (
              <div>
                <span className="font-medium text-sm">Definitions:</span>
                <ul className="list-disc list-inside text-sm text-gray-600 mt-1 ml-4">
                  {word.definitions.map((def, idx) => (
                    <li key={idx}>{def}</li>
                  ))}
                </ul>
              </div>
            )}

            {word.etymology && (
              <div>
                <span className="font-medium text-sm">Etymology:</span>
                <p className="text-sm text-gray-600 mt-1">{word.etymology}</p>
              </div>
            )}

            {/* Tables */}
            <div className="flex flex-col gap-2">
              {word.declensionTable && (
                <DeclensionTable
                  word={word}
                  isExpanded={isTableExpanded('declension')}
                  onToggle={() => toggleTableExpansion('declension')}
                />
              )}

              {word.adjectiveDeclensionTable && (
                <AdjectiveDeclensionTable
                  word={word}
                  isExpanded={isTableExpanded('adjective-declension')}
                  onToggle={() => toggleTableExpansion('adjective-declension')}
                />
              )}

              {word.conjugationTable && (
                <ConjugationTable
                  word={word}
                  isExpanded={isTableExpanded('conjugation')}
                  onToggle={() => toggleTableExpansion('conjugation')}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
