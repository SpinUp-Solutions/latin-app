import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { PosConfigTabs } from './PosConfigTabs';
import { FormSelectionTable } from '../vocabulary/FormSelectionTable';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import type { FormIdentificationPosConfig, PosGeneratorConfig } from '@/src/types/exercises/base';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  KeyboardSensor,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { GripVertical } from 'lucide-react';

interface MultiPosConfigSectionProps {
  exerciseType: 'form-identification' | 'translation';
  availablePartOfSpeech: PartOfSpeech[];
  wordCountsByPOS: Record<PartOfSpeech, number>;
  posConfigs: Partial<Record<PartOfSpeech, FormIdentificationPosConfig | PosGeneratorConfig>>;
  onUpdatePosConfig: (pos: PartOfSpeech, updates: Partial<FormIdentificationPosConfig | PosGeneratorConfig>) => void;
  onTogglePOS: (pos: PartOfSpeech, enabled: boolean) => void;
  availableSteps?: Record<PartOfSpeech, FormIdentificationStep[]>;
}

const SortableStepItem: React.FC<{ step: FormIdentificationStep }> = ({ step }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded border bg-white p-2 text-sm">
      <div {...attributes} {...listeners} className="cursor-move">
        <GripVertical className="h-4 w-4 text-gray-500" />
      </div>
      <span className="flex-1 capitalize">{step}</span>
    </div>
  );
};

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleStepToggle = useCallback(
    (step: FormIdentificationStep) => {
      if (!activePOS) return;
      const config = posConfigs[activePOS] as FormIdentificationPosConfig | undefined;
      const currentSteps = config?.steps || [];
      const newSteps = currentSteps.includes(step) ? currentSteps.filter(s => s !== step) : [...currentSteps, step];

      onUpdatePosConfig(activePOS, { steps: newSteps } as Partial<FormIdentificationPosConfig>);
    },
    [activePOS, posConfigs, onUpdatePosConfig]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!activePOS) return;
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const config = posConfigs[activePOS] as FormIdentificationPosConfig | undefined;
        const steps = config?.steps || [];
        if (steps.length === 0) {
          return;
        }
        const oldIndex = steps.indexOf(active.id as FormIdentificationStep);
        const newIndex = steps.indexOf(over.id as FormIdentificationStep);
        const reorderedSteps = arrayMove(steps, oldIndex, newIndex);

        onUpdatePosConfig(activePOS, { steps: reorderedSteps } as Partial<FormIdentificationPosConfig>);
      }
    },
    [activePOS, posConfigs, onUpdatePosConfig]
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
                  <div>
                    <label className="block text-sm font-medium mb-3">Steps to Identify (in order)</label>
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {currentAvailableSteps.map(step => (
                          <Button
                            key={step}
                            type="button"
                            variant={currentSteps.includes(step) ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleStepToggle(step)}
                            className="capitalize">
                            {step}
                          </Button>
                        ))}
                      </div>

                      {currentSteps.length > 0 && (
                        <div>
                          <p className="text-sm text-gray-600 mb-2">Selected steps (drag to reorder):</p>
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                            modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
                            <SortableContext items={currentSteps} strategy={verticalListSortingStrategy}>
                              <div className="space-y-2">
                                {currentSteps.map(step => (
                                  <SortableStepItem key={step} step={step} />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        </div>
                      )}
                    </div>
                  </div>
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
