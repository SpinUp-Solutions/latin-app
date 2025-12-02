import React from 'react';

interface AdvancedWordCardProps {
  word: Record<string, unknown>;
}

export const AdvancedWordCard: React.FC<AdvancedWordCardProps> = ({ word }) => {
  console.log('[AdvancedWordCard] Rendering word:', word);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 hover:shadow-md transition-all">
      <pre className="text-xs overflow-auto max-h-96 whitespace-pre-wrap break-words font-mono">
        {JSON.stringify(word, null, 2)}
      </pre>
    </div>
  );
};
