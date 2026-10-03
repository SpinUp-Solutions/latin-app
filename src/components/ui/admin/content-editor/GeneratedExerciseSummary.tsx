import React from 'react';
import { Card, CardContent } from '@/src/components/ui/card';

interface GeneratedExerciseSummaryProps {
  collection: string;
  count: number | 'all';
  uniqueWordCount?: number | null;
  partOfSpeech: string | undefined;
  selectedFormCount: number | undefined;
}

export const GeneratedExerciseSummary: React.FC<GeneratedExerciseSummaryProps> = ({
  collection,
  count,
  uniqueWordCount,
  partOfSpeech,
  selectedFormCount,
}) => {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">Exercise Summary</label>
      <Card>
        <CardContent className="p-4">
          <div className="text-sm space-y-2">
            <div>
              <strong>Collection:</strong> {collection}
            </div>
            <div>
              <strong>Number of Questions:</strong> {count === 'all' ? 'All matching words' : count}
            </div>
            {uniqueWordCount ? (
              <div>
                <strong>Unique Words:</strong> {uniqueWordCount}
              </div>
            ) : null}
            <div>
              <strong>Part of Speech:</strong> {partOfSpeech || 'All'}
            </div>
            {selectedFormCount !== undefined && selectedFormCount > 0 && (
              <div>
                <strong>Selected Forms:</strong> {selectedFormCount} form(s)
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
