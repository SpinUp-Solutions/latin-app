import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { ChevronDown, ChevronRight, Volume2, List, ChevronUp } from 'lucide-react';
import { VocabularyWordWithId } from '@/src/types/vocabulary/vocabulary-new';
import { getWordTypeColor, isVerb } from '@/src/utils/vocabUtils';

interface WordCardProps {
  word: VocabularyWordWithId;
  onSelect: (word: VocabularyWordWithId) => void;
  isSelected?: boolean;
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

export const WordCard: React.FC<WordCardProps> = ({ word, onSelect, isSelected = false, isLast = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`bg-white transition-all cursor-pointer ${
        isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
      } ${!isLast ? 'border-b border-gray-200' : ''}`}
      onClick={() => onSelect(word)}>
      {/* Main header row */}
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={e => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
              onSelect(word);
            }}
            className="flex items-center gap-2 hover:text-roman-red transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${word.word}`}>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-serif font-semibold text-roman-red text-lg">{word.word}</span>
          </button>

          <div className="flex items-center gap-2">
            <Badge className={`${getWordTypeColor(word.part_of_speech)} shrink-0`}>{word.part_of_speech}</Badge>

            {word.part_of_speech === 'noun' && word.declension && (
              <Badge variant="outline" className="text-xs">
                Declension {word.declension}
              </Badge>
            )}

            {word.part_of_speech === 'verb' && word.conjugation && (
              <Badge variant="outline" className="text-xs">
                Conjugation {word.conjugation}
              </Badge>
            )}

            {word.part_of_speech === 'adjective' && word.declension && (
              <Badge variant="outline" className="text-xs">
                Declension {word.declension}
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
              onClick={e => e.stopPropagation()}
              className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
              title={`Pronunciation: ${word.pronunciation}`}>
              <Volume2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100">
          <div className="space-y-4 mt-3">
            <div className="text-sm space-y-2">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
                {word.part_of_speech === 'noun' && word.gender && (
                  <span>
                    <strong>Gender:</strong> {word.gender}
                  </span>
                )}
                {word.pronunciation && (
                  <span>
                    <strong>Pronunciation:</strong> {word.pronunciation}
                  </span>
                )}
                {word.part_of_speech === 'noun' && word.declension && (
                  <span>
                    <strong>Declension:</strong> {word.declension}
                  </span>
                )}
                {word.part_of_speech === 'verb' && word.conjugation && (
                  <span>
                    <strong>Conjugation:</strong> {word.conjugation}
                  </span>
                )}
                {word.part_of_speech === 'adjective' && word.declension && (
                  <span>
                    <strong>Declension:</strong> {word.declension}
                  </span>
                )}
                {word.part_of_speech === 'verb' && word.is_deponent && (
                  <span>
                    <strong>Deponent:</strong> Yes
                  </span>
                )}
              </div>
            </div>

            {isVerb(word) && Array.isArray(word.principal_parts) && word.principal_parts.length > 0 && (
              <div>
                <span className="text-sm font-medium text-gray-700 mr-2">Principal Parts:</span>
                {word.principal_parts.map((part, idx) => (
                  <Badge key={idx} variant="secondary" className="mr-1 text-xs">
                    {part.full_form || part.shortened_form}
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
          </div>
        </div>
      )}
    </div>
  );
};
