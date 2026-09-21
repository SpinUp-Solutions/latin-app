import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { PosConfigTabs } from './PosConfigTabs';
import { FormSelectionTable } from '../vocabulary/FormSelectionTable';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import type { FormIdentificationPosConfig, PosGeneratorConfig } from '@/src/types/exercises/base';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import { SortableStepList } from './SortableStepList';

interface MultiPosConfigSectionProps {
  exerciseType: 'form-identification' | 'translation';
  availablePartOfSpeech: PartOfSpeech[];
  wordCountsByPOS: Record<PartOfSpeech, number>;
  posConfigs: Partial<Record<PartOfSpeech, FormIdentificationPosConfig | PosGeneratorConfig>>;
  onUpdatePosConfig: (pos: PartOfSpeech, updates: Partial<FormIdentificationPosConfig | PosGeneratorConfig>) => void;
  onTogglePOS: (pos: PartOfSpeech, enabled: boolean) => void;
  availableSteps?: Record<PartOfSpeech, FormIdentificationStep[]>;
}

export const MultiPosConfigSection: React.FC<MultiPosConfigSectionProps> = ({
  exerciseType,
  availablePartOfSpeech,
  wordCountsByPOS,
  posConfigs,
  onUpdatePosConfig,
  onTogglePOS,
  availableSteps,
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

  const currentAvailableSteps = availableSteps?.[activePOS] || [];
  const currentSteps =
    exerciseType === 'form-identification' ? (posConfigs[activePOS] as FormIdentificationPosConfig)?.steps || [] : [];

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <PosConfigTabs
          availablePartOfSpeech={availablePartOfSpeech}
          activePOS={activePOS}
          onPOSChange={setActivePOS}
          wordCounts={wordCountsByPOS}>
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

            {currentConfig?.enabled && (
              <>
                {exerciseType === 'form-identification' && currentAvailableSteps.length > 0 && (
                  <SortableStepList
                    availableSteps={currentAvailableSteps}
                    selectedSteps={currentSteps}
                    onChange={steps => onUpdatePosConfig(activePOS, { steps } as Partial<FormIdentificationPosConfig>)}
                  />
                )}

                {tableType && (
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
              </>
            )}
          </div>
        </PosConfigTabs>
      </CardContent>
    </Card>
  );
};
