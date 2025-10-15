import React from 'react';
import { VocabularyWordWithId } from '@/src/types/vocabulary/index';

interface AdvancedWordCardProps {
  word: VocabularyWordWithId;
  selectedForm?: string | null;
  formPath?: string | null;
}

export const AdvancedWordCard: React.FC<AdvancedWordCardProps> = ({ word, selectedForm, formPath }) => {
  const displayWord = selectedForm || word.word;
  const pathLabel = formPath || 'root';

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer">
      <div className="flex flex-col items-center justify-center text-center gap-2">
        <h3 className="text-3xl font-serif font-bold text-roman-red">{displayWord}</h3>
        <span className="text-xs text-gray-500 italic">{pathLabel}</span>
      </div>
    </div>
  );
};
