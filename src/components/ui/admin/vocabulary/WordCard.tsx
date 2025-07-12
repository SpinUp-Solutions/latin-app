import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Edit, ChevronDown, ChevronRight, Volume2, List, ChevronUp } from 'lucide-react';
import { Word } from '@/src/types/admin-vocabulary';
import { DeclensionTable } from './tables/DeclensionTable';
import { AdjectiveDeclensionTable } from './tables/AdjectiveDeclensionTable';
import { ConjugationTable } from './tables/ConjugationTable';
import { getWordTypeColor } from '@/src/utils/vocabUtils';

interface WordCardProps {
  word: Word;
  onEdit: (word: Word) => void;
  isLast?: boolean;
}

const ExpandableDefinitions: React.FC<{ definitions: string[] }> = ({ definitions }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const showExpandButton = definitions.length > 3;
  const visibleDefinitions = isExpanded ? definitions : definitions.slice(0, 3);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm text-gray-700">Definitions:</span>
        {showExpandButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700">
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <List className="h-3 w-3 mr-1" />
                Show All ({definitions.length})
              </>
            )}
          </Button>
        )}
      </div>
      <ul className="space-y-1">
        {visibleDefinitions.map((def, idx) => (
          <li key={idx} className="text-sm text-gray-600 leading-relaxed flex items-start gap-2">
            <span className="text-gray-400 mt-1 text-xs">{idx + 1}.</span>
            <span className="flex-1">{def}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

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

  const hasTables = word.declensionTable || word.adjectiveDeclensionTable || word.conjugationTable;

  return (
    <div className={`bg-white hover:bg-gray-50 transition-colors ${!isLast ? 'border-b border-gray-200' : ''}`}>
      {/* Main header row */}
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 hover:text-roman-red transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${word.word}`}>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-serif font-semibold text-roman-red text-lg">{word.word}</span>
          </button>

          <div className="flex items-center gap-2">
            <Badge className={getWordTypeColor(word.wordType)} shrink-0>
              {word.wordType}
            </Badge>

            {word.declensionClass && (
              <Badge variant="outline" className="text-xs">
                {word.declensionClass}
              </Badge>
            )}

            {word.conjugationClass && (
              <Badge variant="outline" className="text-xs">
                {word.conjugationClass}
              </Badge>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-gray-700 truncate font-medium" title={word.translation}>
              {word.translation}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {word.pronunciation && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
              title={`Pronunciation: ${word.pronunciation}`}>
              <Volume2 className="h-4 w-4" />
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => onEdit(word)} className="flex items-center gap-1">
            <Edit className="h-3 w-3" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100">
          <div className="space-y-4 mt-3">
            {/* Basic info in a simple grid */}
            <div className="text-sm space-y-2">
              {word.grammaticalInfo && (
                <div className="text-blue-700 font-medium bg-blue-50 p-2 rounded">{word.grammaticalInfo}</div>
              )}

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
                {word.gender && (
                  <span>
                    <strong>Gender:</strong> {word.gender}
                  </span>
                )}
                {word.pronunciation && (
                  <span>
                    <strong>Pronunciation:</strong> {word.pronunciation}
                  </span>
                )}
                {word.declensionClass && (
                  <span>
                    <strong>Declension:</strong> {word.declensionClass}
                  </span>
                )}
                {word.conjugationClass && (
                  <span>
                    <strong>Conjugation:</strong> {word.conjugationClass}
                  </span>
                )}
              </div>
            </div>

            {/* Principal parts as simple badges */}
            {word.principalParts && word.principalParts.length > 0 && (
              <div>
                <span className="text-sm font-medium text-gray-700 mr-2">Principal Parts:</span>
                {word.principalParts.map((part, idx) => (
                  <Badge key={idx} variant="secondary" className="mr-1 text-xs">
                    {part}
                  </Badge>
                ))}
              </div>
            )}

            {/* Definitions */}
            {word.definitions && word.definitions.length > 0 && (
              <ExpandableDefinitions definitions={word.definitions} />
            )}

            {/* Etymology - simple and compact */}
            {word.etymology && (
              <div>
                <span className="text-sm font-medium text-gray-700">Etymology:</span>
                <p className="text-sm text-gray-600 italic mt-1">{word.etymology}</p>
              </div>
            )}

            {/* Tables section */}
            {hasTables && (
              <div className="border-t pt-3 mt-4">
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};
