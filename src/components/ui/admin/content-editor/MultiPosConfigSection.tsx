import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { FormSelectionTable } from '../vocabulary/FormSelectionTable';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import type { PosGeneratorConfig } from '@/src/types/exercises/base';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';

interface MultiPosConfigSectionProps {
  availablePartOfSpeech: PartOfSpeech[];
  wordCountsByPOS: Record<PartOfSpeech, number>;
  posConfigs: Partial<Record<PartOfSpeech, PosGeneratorConfig>>;
  onUpdatePosConfig: (pos: PartOfSpeech, updates: Partial<PosGeneratorConfig>) => void;
  onTogglePOS: (pos: PartOfSpeech, enabled: boolean) => void;
}

export const MultiPosConfigSection: React.FC<MultiPosConfigSectionProps> = ({
  availablePartOfSpeech,
  wordCountsByPOS,
  posConfigs,
  onUpdatePosConfig,
  onTogglePOS,
}) => {
  const firstPOS = availablePartOfSpeech[0] as PartOfSpeech | undefined;
  const [activePOS, setActivePOS] = useState<PartOfSpeech | undefined>(firstPOS);

  useEffect(() => {
    if (activePOS && !availablePartOfSpeech.includes(activePOS)) {
      setActivePOS(availablePartOfSpeech[0]);
    }
    if (!activePOS && availablePartOfSpeech.length > 0) {
      setActivePOS(availablePartOfSpeech[0]);
    }
  }, [availablePartOfSpeech, activePOS]);

  const currentConfig = activePOS ? posConfigs[activePOS] : undefined;
  const pronounType = currentConfig?.filters?.pronounType as PronounType | 'all' | undefined;
  const pronounPerson = currentConfig?.filters?.pronounPerson as PronounPerson | 'all' | undefined;
  const tableType = activePOS ? deriveTableTypeFromPOS(activePOS, pronounType, pronounPerson) : undefined;

  const { handleToggleCell, handleTogglePaths, handleSelectAll, handleClearSelection } = useFormSelectionControls(
    activePOS,
    currentConfig?.formSelection,
    formSelectionValue => {
      if (activePOS) {
        onUpdatePosConfig(activePOS, { formSelection: formSelectionValue });
      }
    },
    pronounType,
    pronounPerson
  );

  if (availablePartOfSpeech.length === 0 || !activePOS) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
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
              const wordCount = wordCountsByPOS[pos];

              return (
                <Button
                  key={pos}
                  type="button"
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActivePOS(pos)}
                  className="gap-2">
                  <span>{pos.charAt(0).toUpperCase() + pos.slice(1)}</span>
                  {wordCount !== undefined && (
                    <Badge variant={isActive ? 'secondary' : 'outline'} className="text-xs">
                      {wordCount}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>

          <div className="mt-4">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Include <span className="capitalize">{activePOS}</span> in this exercise
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant={currentConfig?.enabled ? 'default' : 'outline'}
                  onClick={() => onTogglePOS(activePOS, !currentConfig?.enabled)}>
                  {currentConfig?.enabled ? 'Enabled' : 'Enable'}
                </Button>
              </div>

              {currentConfig?.enabled && tableType && (
                <div>
                  <label className="block text-sm font-medium mb-3">Form Selection</label>
                  <FormSelectionTable
                    partOfSpeech={activePOS}
                    pronounType={pronounType}
                    pronounPerson={pronounPerson}
                    selectedCellPaths={currentConfig.formSelection?.selectedCellPaths || []}
                    onToggleCell={handleToggleCell}
                    onTogglePaths={handleTogglePaths}
                    onSelectAll={handleSelectAll}
                    onClearSelection={handleClearSelection}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
