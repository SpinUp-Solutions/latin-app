import React from 'react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';

interface PosConfigTabsProps {
  availablePartOfSpeech: PartOfSpeech[];
  activePOS: PartOfSpeech;
  onPOSChange: (pos: PartOfSpeech | undefined) => void;
  wordCounts?: Record<PartOfSpeech, number>;
  children: React.ReactNode;
}

export const PosConfigTabs: React.FC<PosConfigTabsProps> = ({
  availablePartOfSpeech,
  activePOS,
  onPOSChange,
  wordCounts,
  children,
}) => {
  const formatLabel = (pos: PartOfSpeech) => {
    return pos.charAt(0).toUpperCase() + pos.slice(1);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Configure Parts of Speech</h3>
        <p className="text-xs text-gray-600 mb-4">
          This pool contains multiple parts of speech. Enable and configure each type independently.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {availablePartOfSpeech.map(pos => {
          const isActive = pos === activePOS;
          const wordCount = wordCounts?.[pos];

          return (
            <Button
              key={pos}
              type="button"
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPOSChange(pos)}
              className="gap-2">
              <span>{formatLabel(pos)}</span>
              {wordCount !== undefined && (
                <Badge variant={isActive ? 'secondary' : 'outline'} className="text-xs">
                  {wordCount}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      <div className="mt-4">{children}</div>
    </div>
  );
};
