import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { MultiSelect } from '@/src/components/ui/multi-select';
import { parseMultiFilterValue, serializeMultiFilterValue } from '@/src/utils/wordFilters';
import { FormSelectionTable } from '../vocabulary/FormSelectionTable';
import type { PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import type { FormParadigm, ParadigmConfig, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import { getParadigmPOS } from '@/src/utils/paradigm';
import {
  PARADIGM_AVAILABLE_STEPS,
  PARADIGM_TABLE_TYPE,
  PARADIGM_LABELS,
  PARADIGM_RELEVANT_FILTERS,
} from '@/src/config/paradigmDefinitions';
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
import { AlertTriangle, GripVertical } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/src/components/ui/alert';
import {
  getCompatibilityStepLabels,
  getFormIdentificationCompatibilitySummary,
} from '@/src/utils/exercises/formIdentificationCompatibility';

interface MultiParadigmConfigSectionProps {
  availableParadigms: FormParadigm[];
  paradigmWordCounts?: Partial<Record<FormParadigm, number>>;
  paradigmConfigs: ParadigmConfigs;
  onUpdateParadigmConfig: (paradigm: FormParadigm, updates: Partial<ParadigmConfig>) => void;
  onToggleParadigm: (paradigm: FormParadigm, enabled: boolean) => void;
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
      <span className="flex-1 capitalize">{step.replace(/_/g, ' ')}</span>
    </div>
  );
};

const PRONOUN_PARADIGMS: FormParadigm[] = ['pronoun-personal', 'pronoun-gendered'];
const NON_PRONOUN_PARADIGMS: FormParadigm[] = ['verb-conjugation', 'noun-declension', 'adjective-declension'];

const getFormSelectionProps = (paradigm: FormParadigm) => {
  const pos = getParadigmPOS(paradigm);

  if (paradigm === 'pronoun-personal') {
    return { partOfSpeech: pos, pronounType: 'personal' as const, pronounPerson: '1st' as const };
  }
  if (paradigm === 'pronoun-gendered') {
    return { partOfSpeech: pos, pronounType: undefined, pronounPerson: undefined };
  }
  return { partOfSpeech: pos, pronounType: undefined, pronounPerson: undefined };
};

const getSkippedSelectionCount = (summary: ReturnType<typeof getFormIdentificationCompatibilitySummary> | null) =>
  summary ? summary.skipped.length + summary.unknownPaths.length : 0;

const getSkippedFormLabel = (label: string, count: number) =>
  label.toLowerCase().replace(/ forms$/, count === 1 ? ' form' : ' forms');

export const MultiParadigmConfigSection: React.FC<MultiParadigmConfigSectionProps> = ({
  availableParadigms,
  paradigmWordCounts,
  paradigmConfigs,
  onUpdateParadigmConfig,
  onToggleParadigm,
}) => {
  const firstParadigm = availableParadigms[0] as FormParadigm | undefined;
  const [activeParadigm, setActiveParadigm] = useState<FormParadigm | undefined>(firstParadigm);

  useEffect(() => {
    if (activeParadigm && !availableParadigms.includes(activeParadigm)) {
      setActiveParadigm(availableParadigms[0]);
    }
    if (!activeParadigm && availableParadigms.length > 0) {
      setActiveParadigm(availableParadigms[0]);
    }
  }, [availableParadigms, activeParadigm]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const currentConfig = activeParadigm ? paradigmConfigs[activeParadigm] : undefined;
  const formSelectionProps = activeParadigm ? getFormSelectionProps(activeParadigm) : null;

  const { handleToggleCell, handleTogglePaths, handleSelectAll, handleClearSelection } = useFormSelectionControls(
    formSelectionProps?.partOfSpeech,
    currentConfig?.formSelection,
    formSelectionValue => {
      if (activeParadigm) {
        onUpdateParadigmConfig(activeParadigm, { formSelection: formSelectionValue });
      }
    },
    formSelectionProps?.pronounType,
    formSelectionProps?.pronounPerson
  );

  const handleStepToggle = useCallback(
    (step: FormIdentificationStep) => {
      if (!activeParadigm) return;
      const config = paradigmConfigs[activeParadigm];
      const currentSteps = config?.steps || [];
      const newSteps = currentSteps.includes(step) ? currentSteps.filter(s => s !== step) : [...currentSteps, step];

      onUpdateParadigmConfig(activeParadigm, { steps: newSteps });
    },
    [activeParadigm, paradigmConfigs, onUpdateParadigmConfig]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!activeParadigm) return;
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const config = paradigmConfigs[activeParadigm];
        const steps = config?.steps || [];
        if (steps.length === 0) {
          return;
        }
        const oldIndex = steps.indexOf(active.id as FormIdentificationStep);
        const newIndex = steps.indexOf(over.id as FormIdentificationStep);
        const reorderedSteps = arrayMove(steps, oldIndex, newIndex);

        onUpdateParadigmConfig(activeParadigm, { steps: reorderedSteps });
      }
    },
    [activeParadigm, paradigmConfigs, onUpdateParadigmConfig]
  );

  const handleFilterChange = useCallback(
    (key: string, value: string | string[] | 'all') => {
      if (!activeParadigm) return;
      const config = paradigmConfigs[activeParadigm];
      const currentFilters = config?.filters || {};
      // Serialize array values to comma-separated strings for GeneratorFilters storage
      const serialized = Array.isArray(value) ? (serializeMultiFilterValue(value) ?? 'all') : value;
      onUpdateParadigmConfig(activeParadigm, {
        filters: { ...currentFilters, [key]: serialized },
      });
    },
    [activeParadigm, paradigmConfigs, onUpdateParadigmConfig]
  );

  if (availableParadigms.length === 0 || !activeParadigm) {
    return null;
  }

  const availableSteps = PARADIGM_AVAILABLE_STEPS[activeParadigm];
  const currentSteps = currentConfig?.steps || [];
  const tableType = PARADIGM_TABLE_TYPE[activeParadigm];
  const relevantFilters = PARADIGM_RELEVANT_FILTERS[activeParadigm];
  const getCompatibilitySummaryForParadigm = (paradigm: FormParadigm) => {
    const config = paradigmConfigs[paradigm];
    if (!config?.enabled || !config.formSelection) return null;
    return getFormIdentificationCompatibilitySummary(
      PARADIGM_TABLE_TYPE[paradigm],
      config.formSelection.selectedCellPaths,
      config.steps || []
    );
  };
  const compatibilitySummary = getCompatibilitySummaryForParadigm(activeParadigm);
  const answerableFormCount = (Object.keys(PARADIGM_TABLE_TYPE) as FormParadigm[]).reduce((total, paradigm) => {
    return total + (getCompatibilitySummaryForParadigm(paradigm)?.answerableCount ?? 0);
  }, 0);
  const activeSkippedCount = getSkippedSelectionCount(compatibilitySummary);
  const skippedGroups = compatibilitySummary
    ? Array.from(
        compatibilitySummary.skipped
          .reduce((groups, selection) => {
            const existing = groups.get(selection.support.label) ?? {
              label: selection.support.label,
              count: 0,
              steps: new Set<FormIdentificationStep>(),
            };
            existing.count += 1;
            selection.support.supportedSteps.forEach(step => existing.steps.add(step));
            groups.set(selection.support.label, existing);
            return groups;
          }, new Map<string, { label: string; count: number; steps: Set<FormIdentificationStep> }>())
          .values()
      )
    : [];
  const nonPronounAvailable = availableParadigms.filter(p => NON_PRONOUN_PARADIGMS.includes(p));
  const pronounAvailable = availableParadigms.filter(p => PRONOUN_PARADIGMS.includes(p));

  const renderParadigmTab = (paradigm: FormParadigm) => {
    const isActive = paradigm === activeParadigm;
    const wordCount = paradigmWordCounts?.[paradigm];

    return (
      <Button
        key={paradigm}
        type="button"
        variant={isActive ? 'default' : 'outline'}
        size="sm"
        onClick={() => setActiveParadigm(paradigm)}
        className="gap-2">
        <span>{PARADIGM_LABELS[paradigm]}</span>
        {wordCount !== undefined && (
          <Badge variant={isActive ? 'secondary' : 'outline'} className="text-xs">
            {wordCount}
          </Badge>
        )}
        {getSkippedSelectionCount(getCompatibilitySummaryForParadigm(paradigm)) > 0 && (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-xs text-amber-800"
            title="Selected forms that cannot be used with the current questions">
            {getSkippedSelectionCount(getCompatibilitySummaryForParadigm(paradigm))} skipped
          </Badge>
        )}
      </Button>
    );
  };

  const renderFilters = () => {
    const filters = currentConfig?.filters || {};

    return (
      <div className="space-y-4">
        {relevantFilters.includes('verbConjugation') && (
          <div>
            <Label className="text-sm">Conjugation</Label>
            <MultiSelect
              options={[
                { value: '1', label: '1st' },
                { value: '2', label: '2nd' },
                { value: '3', label: '3rd' },
                { value: '3io', label: '3rd -io' },
                { value: '4', label: '4th' },
                { value: 'irregular', label: 'Irregular' },
              ]}
              value={parseMultiFilterValue(filters.verbConjugation)}
              onChange={val => handleFilterChange('verbConjugation', val)}
              placeholder="All"
              className="mt-1"
            />
          </div>
        )}

        {relevantFilters.includes('isDeponent') && (
          <div>
            <Label className="text-sm">Deponent</Label>
            <Select value={filters.isDeponent || 'both'} onValueChange={val => handleFilterChange('isDeponent', val)}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue placeholder="Both" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Both</SelectItem>
                <SelectItem value="true">Deponent Only</SelectItem>
                <SelectItem value="false">Non-Deponent Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {relevantFilters.includes('nounDeclension') && (
          <div>
            <Label className="text-sm">Declension</Label>
            <MultiSelect
              options={[
                { value: '1', label: '1st' },
                { value: '2', label: '2nd' },
                { value: '3', label: '3rd' },
                { value: '3-istem', label: '3rd i-stem' },
                { value: '4', label: '4th' },
                { value: '5', label: '5th' },
              ]}
              value={parseMultiFilterValue(filters.nounDeclension)}
              onChange={val => handleFilterChange('nounDeclension', val)}
              placeholder="All"
              className="mt-1"
            />
          </div>
        )}

        {relevantFilters.includes('adjectiveDeclension') && (
          <div>
            <Label className="text-sm">Declension</Label>
            <MultiSelect
              options={[
                { value: '1-2', label: '1st/2nd' },
                { value: '3', label: '3rd' },
              ]}
              value={parseMultiFilterValue(filters.adjectiveDeclension)}
              onChange={val => handleFilterChange('adjectiveDeclension', val)}
              placeholder="All"
              className="mt-1"
            />
          </div>
        )}

        {relevantFilters.includes('pronounType') && (
          <div>
            <Label className="text-sm">Pronoun Type</Label>
            <MultiSelect
              options={[
                { value: 'personal', label: 'Personal (3rd person)' },
                { value: 'demonstrative', label: 'Demonstrative' },
                { value: 'relative', label: 'Relative' },
                { value: 'interrogative', label: 'Interrogative' },
                { value: 'reflexive', label: 'Reflexive' },
                { value: 'intensive', label: 'Intensive' },
                { value: 'indefinite', label: 'Indefinite' },
                { value: 'possessive', label: 'Possessive' },
              ]}
              value={parseMultiFilterValue(filters.pronounType)}
              onChange={val => handleFilterChange('pronounType', val)}
              placeholder="All"
              className="mt-1"
            />
          </div>
        )}

        {relevantFilters.includes('search') && (
          <div>
            <Label className="text-sm">Search</Label>
            <Input
              type="text"
              placeholder="Search words..."
              value={filters.search || ''}
              onChange={e => handleFilterChange('search', e.target.value)}
              className="mt-1"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-2">Configure Paradigms</h3>
          <p className="text-xs text-gray-600 mb-4">
            Select and configure which grammatical paradigms to include. Each paradigm has its own set of steps and form
            selections.
          </p>
        </div>

        <div className="space-y-4">
          {nonPronounAvailable.length > 0 && (
            <div className="flex flex-wrap gap-2">{nonPronounAvailable.map(renderParadigmTab)}</div>
          )}

          {pronounAvailable.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pronouns</p>
              <div className="flex flex-wrap gap-2">{pronounAvailable.map(renderParadigmTab)}</div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Include {PARADIGM_LABELS[activeParadigm]} in this exercise</p>
            <Button
              type="button"
              size="sm"
              variant={currentConfig?.enabled ? 'default' : 'outline'}
              onClick={() => onToggleParadigm(activeParadigm, !currentConfig?.enabled)}>
              {currentConfig?.enabled ? 'Enabled' : 'Enable'}
            </Button>
          </div>

          {currentConfig?.enabled && (
            <>
              {compatibilitySummary && activeSkippedCount > 0 && answerableFormCount > 0 && (
                <Alert role="status" className="border-amber-200 bg-amber-50 text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle>Some selected forms will be skipped</AlertTitle>
                  <AlertDescription className="space-y-1">
                    {compatibilitySummary.unknownPaths.length > 0 && (
                      <p>
                        <strong>{compatibilitySummary.unknownPaths.length}</strong>{' '}
                        {compatibilitySummary.unknownPaths.length === 1
                          ? 'unrecognized saved form will be skipped. Select a valid form or remove it from the selection.'
                          : 'unrecognized saved forms will be skipped. Select valid forms or remove them from the selection.'}
                      </p>
                    )}
                    {skippedGroups.map(group => (
                      <p key={group.label}>
                        <strong>{group.count}</strong> {getSkippedFormLabel(group.label, group.count)} will not appear
                        because none of the selected questions apply. Add{' '}
                        {getCompatibilityStepLabels(Array.from(group.steps))} to include{' '}
                        {group.count === 1 ? 'it' : 'them'}.
                      </p>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-3">Steps to Identify (in order)</label>
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {availableSteps.map(step => (
                        <Button
                          key={step}
                          type="button"
                          variant={currentSteps.includes(step) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleStepToggle(step)}
                          className="capitalize">
                          {step.replace(/_/g, ' ')}
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

                <div>
                  <label className="block text-sm font-medium mb-3">Filters</label>
                  {renderFilters()}
                </div>
              </div>

              {tableType && formSelectionProps && (
                <div>
                  <label className="block text-sm font-medium mb-3">Form Selection</label>
                  <FormSelectionTable
                    partOfSpeech={formSelectionProps.partOfSpeech}
                    pronounType={formSelectionProps.pronounType as PronounType | 'all' | undefined}
                    pronounPerson={formSelectionProps.pronounPerson as PronounPerson | 'all' | undefined}
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
      </CardContent>
    </Card>
  );
};
