import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { SimpleInput, SimpleTextarea } from '@/src/components/ui/form-components';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { AdvancedFiltersPanel } from '../vocabulary/AdvancedFiltersPanel';
import { FormSelectionTable } from '../vocabulary/FormSelectionTable';
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';
import { useGetAdvancedWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { useGeneratedExerciseQuery } from '@/src/hooks/useGeneratedExerciseQuery';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import type { GeneratorFilters } from '@/src/types/exercises/base';
import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import {
  FormIdentificationStep,
  FormIdentificationStepSchema,
} from '@/src/types/exercises/schemas/form-identification';
import { extractStepValue, getAcceptedAnswersForStep } from '@/src/utils/exercises/formIdentificationHelpers';
import { WordSourceSection } from './WordSourceSection';
import { normalizeGeneratorConfig, mergeGeneratorConfig } from '@/src/utils/exercises/generatorConfigDefaults';
import { usePoolPartOfSpeech } from '@/src/hooks/usePoolPartOfSpeech';
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

const AVAILABLE_STEPS: Record<PartOfSpeech, FormIdentificationStep[]> = {
  verb: ['conjugation', 'tense', 'voice', 'mood', 'person', 'number'],
  noun: ['declension', 'case', 'number', 'gender'],
  adjective: ['declension', 'degree', 'gender', 'number', 'case'],
  pronoun: ['gender', 'number', 'case'],
  adverb: [],
  preposition: [],
  conjunction: [],
  interjection: [],
};

const formatPartOfSpeechLabel = (value: PartOfSpeech) => value.charAt(0).toUpperCase() + value.slice(1);

interface SortableStepItemProps {
  step: FormIdentificationStep;
}

const SortableStepItem: React.FC<SortableStepItemProps> = ({ step }) => {
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

export const GeneratedFormIdentificationEditor: React.FC = () => {
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as GeneratedFormIdentificationExercise
  );

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  return <GeneratedFormIdentificationEditorView editingContent={editingContent} />;
};

const GeneratedFormIdentificationEditorView: React.FC<{
  editingContent: GeneratedFormIdentificationExercise;
}> = ({ editingContent }) => {
  const dispatch = useAppDispatch();

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const rawConfig = editingContent.data?.generatorConfig;
  const config = useMemo(() => normalizeGeneratorConfig(rawConfig), [rawConfig]);
  const isPoolWordSource = config.wordSource === 'pool';
  const { uniquePartOfSpeech, availablePartOfSpeech } = usePoolPartOfSpeech(isPoolWordSource ? config.poolId : null);

  const previewLimit =
    config.count === 'all' ? 'all' : Math.min(typeof config.count === 'number' ? config.count : 5, 5);
  const { queryArgs, selectFields } = useGeneratedExerciseQuery('generated-form-identification', config, previewLimit);

  const { data: previewData, isFetching: isPreviewFetching } = useGetAdvancedWordsQuery(queryArgs, {
    skip: !isPreviewOpen,
  });

  const updateContent = useCallback(
    (updates: Partial<GeneratedFormIdentificationExercise>) => {
      dispatch(updateEditingContent({ ...editingContent, ...updates }));
    },
    [dispatch, editingContent]
  );

  const updateConfig = useCallback(
    (configUpdates: Partial<typeof config>) => {
      const nextConfig = mergeGeneratorConfig(rawConfig, configUpdates);
      updateContent({
        data: {
          ...editingContent.data,
          generatorConfig: nextConfig,
        },
      });
    },
    [editingContent, rawConfig, updateContent]
  );

  const handlePartOfSpeechChange = useCallback(
    (newPos: GeneratorFilters['partOfSpeech']) => {
      if (newPos === undefined) {
        return;
      }

      if (newPos === 'all') {
        updateConfig({
          filters: {
            ...config.filters,
            partOfSpeech: 'all',
          },
          formSelection: undefined,
        });
        updateContent({
          data: {
            ...editingContent.data,
            steps: [],
          },
        });
        return;
      }

      const tableType = deriveTableTypeFromPOS(newPos);
      const updates: Partial<typeof config> = {
        filters: {
          ...config.filters,
          partOfSpeech: newPos,
        },
      };

      if (tableType) {
        updates.formSelection = {
          tableType,
          selectedCellPaths: [],
        };
      }

      updateConfig(updates);

      const availableSteps = AVAILABLE_STEPS[newPos as PartOfSpeech] || [];
      const currentSteps = editingContent.data.steps;
      const validSteps = currentSteps.filter(step => availableSteps.includes(step));

      if (validSteps.length !== currentSteps.length) {
        updateContent({
          data: {
            ...editingContent.data,
            steps: validSteps,
          },
        });
      }
    },
    [config.filters, editingContent.data, updateConfig, updateContent]
  );

  useEffect(() => {
    if (!isPoolWordSource || !uniquePartOfSpeech) {
      return;
    }
    if (config.filters.partOfSpeech === uniquePartOfSpeech) {
      return;
    }
    handlePartOfSpeechChange(uniquePartOfSpeech);
  }, [config.filters.partOfSpeech, handlePartOfSpeechChange, isPoolWordSource, uniquePartOfSpeech]);

  useEffect(() => {
    if (!isPoolWordSource || uniquePartOfSpeech || availablePartOfSpeech.length === 0) {
      return;
    }
    const currentPartOfSpeech =
      config.filters.partOfSpeech && config.filters.partOfSpeech !== 'all'
        ? (config.filters.partOfSpeech as PartOfSpeech)
        : undefined;
    if (!currentPartOfSpeech || !availablePartOfSpeech.includes(currentPartOfSpeech)) {
      handlePartOfSpeechChange(availablePartOfSpeech[0]);
    }
  }, [
    availablePartOfSpeech,
    config.filters.partOfSpeech,
    handlePartOfSpeechChange,
    isPoolWordSource,
    uniquePartOfSpeech,
  ]);

  const handleFiltersChange = (filterUpdates: Partial<GeneratorFilters>) => {
    const { partOfSpeech, ...rest } = filterUpdates;
    if (Object.keys(rest).length > 0) {
      updateConfig({
        filters: {
          ...config.filters,
          ...rest,
        },
      });
    }

    if (partOfSpeech !== undefined) {
      handlePartOfSpeechChange(partOfSpeech);
    }
  };

  const handleResetFilters = () => {
    updateConfig({
      filters: {
        partOfSpeech: 'all',
        search: '',
        verbConjugation: 'all',
        isDeponent: 'both',
        nounDeclension: 'all',
        adjectiveDeclension: 'all',
      },
      formSelection: undefined,
    });
    updateContent({
      data: {
        ...editingContent.data,
        steps: [],
      },
    });
  };

  const { handleToggleCell, handleTogglePaths, handleSelectAll, handleClearSelection } = useFormSelectionControls(
    config.filters.partOfSpeech,
    config.formSelection,
    formSelectionValue => updateConfig({ formSelection: formSelectionValue })
  );

  const handleToggleStep = (step: FormIdentificationStep) => {
    const currentSteps = editingContent.data.steps;
    const newSteps = currentSteps.includes(step) ? currentSteps.filter(s => s !== step) : [...currentSteps, step];

    try {
      const validSteps = FormIdentificationStepSchema.array().parse(newSteps);
      updateContent({
        data: {
          ...editingContent.data,
          steps: validSteps,
        },
      });
    } catch (error) {
      console.error('Invalid steps selected:', error);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const steps = editingContent.data.steps;
      const oldIndex = steps.indexOf(active.id as FormIdentificationStep);
      const newIndex = steps.indexOf(over.id as FormIdentificationStep);

      const reorderedSteps = arrayMove(steps, oldIndex, newIndex);

      updateContent({
        data: {
          ...editingContent.data,
          steps: reorderedSteps,
        },
      });
    }
  };

  const poolPartOfSpeechContent = (
    <div>
      <label className="block text-sm font-medium mb-3">Part of Speech (for form selection)</label>
      <Card>
        <CardContent className="p-4 space-y-3">
          {!config.poolId ? (
            <p className="text-sm text-gray-600">Select a vocabulary pool to configure part of speech.</p>
          ) : uniquePartOfSpeech ? (
            <p className="text-sm text-gray-600">
              This pool only contains {formatPartOfSpeechLabel(uniquePartOfSpeech)} entries. The part of speech is fixed
              to match the pool.
            </p>
          ) : availablePartOfSpeech.length > 0 ? (
            <>
              <p className="text-sm text-gray-600">
                This pool includes multiple parts of speech. Choose which one drives the form selection table.
              </p>
              <Select
                value={
                  config.filters.partOfSpeech && config.filters.partOfSpeech !== 'all'
                    ? (config.filters.partOfSpeech as PartOfSpeech)
                    : availablePartOfSpeech[0]
                }
                onValueChange={value => handlePartOfSpeechChange(value as PartOfSpeech)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select part of speech" />
                </SelectTrigger>
                <SelectContent>
                  {availablePartOfSpeech.map(pos => (
                    <SelectItem key={pos} value={pos}>
                      {formatPartOfSpeechLabel(pos)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              This pool does not have recognized parts of speech yet. Add words to configure forms.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const filtersContent = (
    <div>
      <label className="block text-sm font-medium mb-3">Vocabulary Filters</label>
      <AdvancedFiltersPanel
        filters={{
          partOfSpeech: (config.filters.partOfSpeech || 'all') as PartOfSpeech | 'all',
          search: config.filters.search || '',
          verbConjugation: (config.filters.verbConjugation || 'all') as '1' | '2' | '3' | '3io' | '4' | 'all',
          isDeponent: (config.filters.isDeponent || 'both') as 'true' | 'false' | 'both',
          nounDeclension: (config.filters.nounDeclension || 'all') as '1' | '2' | '3' | '3-istem' | '4' | '5' | 'all',
          adjectiveDeclension: (config.filters.adjectiveDeclension || 'all') as '1-2' | '3' | 'all',
          limit: config.count,
        }}
        onFiltersChange={updates => {
          if ('limit' in updates) {
            const currentCount = config?.count ?? 5;
            const nextCount = updates.limit === undefined ? currentCount : (updates.limit as typeof currentCount);
            updateConfig({ count: nextCount });
          } else {
            handleFiltersChange(updates);
          }
        }}
        onReset={handleResetFilters}
        onApply={() => setIsPreviewOpen(true)}
        isLoading={isPreviewFetching}
      />
    </div>
  );

  const poolContent = (
    <>
      <div>
        <label className="block text-sm font-medium mb-3">Vocabulary Pool</label>
        <VocabularyPoolSelector
          selectedPoolId={config.poolId || undefined}
          onPoolSelect={poolId => updateConfig({ poolId: poolId || null })}
        />
      </div>
      {poolPartOfSpeechContent}
    </>
  );

  const previewWords = previewData?.words as ExerciseWordResponse[] | undefined;
  const selectedPos = config.filters.partOfSpeech;
  const availableSteps = selectedPos && selectedPos !== 'all' ? AVAILABLE_STEPS[selectedPos as PartOfSpeech] : [];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SimpleInput
          label="Exercise Title"
          value={editingContent.title || ''}
          onChange={value => updateContent({ title: value })}
          placeholder="Enter exercise title..."
        />

        <SimpleTextarea
          label="Instructions"
          value={editingContent.instructions || ''}
          onChange={value => updateContent({ instructions: value })}
          placeholder="Provide instructions for students..."
          rows={3}
        />

        <AudioUploadSection
          audioPath={editingContent.audioPath}
          onAudioPathChange={audioPath => updateContent({ audioPath })}
          contentItemId={editingContent.id}
        />
      </div>

      <WordSourceSection
        value={config.wordSource}
        onChange={value => updateConfig({ wordSource: value })}
        filtersContent={filtersContent}
        poolContent={poolContent}
      />

      {(config.wordSource === 'filters' && config.filters.partOfSpeech !== 'all') ||
      (config.wordSource === 'pool' && config.filters.partOfSpeech && config.filters.partOfSpeech !== 'all') ? (
        <>
          <div>
            <label className="block text-sm font-medium mb-3">Steps to Identify</label>
            <Card>
              <CardContent className="p-4">
                {availableSteps.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {availableSteps.map(step => {
                      const isSelected = editingContent.data.steps.includes(step);
                      return (
                        <Button
                          key={step}
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleToggleStep(step)}>
                          {step}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No steps available for this part of speech</div>
                )}
                {editingContent.data.steps.length > 0 && (
                  <div className="mt-3 text-sm text-gray-600">Selected: {editingContent.data.steps.join(', ')}</div>
                )}
                {editingContent.data.steps.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-sm font-medium">Drag to Reorder</div>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
                      <SortableContext items={editingContent.data.steps} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {editingContent.data.steps.map(step => (
                            <SortableStepItem key={step} step={step} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <FormSelectionTable
            partOfSpeech={config.filters.partOfSpeech as PartOfSpeech}
            selectedCellPaths={config.formSelection?.selectedCellPaths || []}
            onToggleCell={handleToggleCell}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onTogglePaths={handleTogglePaths}
          />
        </>
      ) : config.wordSource === 'pool' ? (
        <div>
          <label className="block text-sm font-medium mb-3">Form Selection</label>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">
                To configure form selection, first select a part of speech for this pool using the filter above.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium mb-3">Preview</label>
        <Card>
          <CardContent className="p-4 space-y-4">
            <Button type="button" onClick={() => setIsPreviewOpen(true)} disabled={isPreviewFetching}>
              {isPreviewFetching ? 'Loading Preview...' : 'Preview Sample Items'}
            </Button>

            {isPreviewOpen && previewWords && previewWords.length > 0 && (
              <div className="space-y-2 mt-4">
                <label className="block text-sm font-medium">
                  Preview ({previewWords.length} words × {editingContent.data.steps.length} steps ={' '}
                  {previewWords.length * editingContent.data.steps.length} items)
                </label>
                {previewWords.slice(0, 3).map((word, index) => {
                  return (
                    <Card key={index}>
                      <CardContent className="p-3 space-y-2">
                        <div className="font-medium">{word.selected_form}</div>
                        {word.selected_form !== word.root_word && (
                          <div className="text-xs text-gray-500">Root: {word.root_word}</div>
                        )}
                        {editingContent.data.steps.map(step => {
                          const correctAnswer = extractStepValue(word, step);
                          const acceptedAnswers = getAcceptedAnswersForStep(correctAnswer);
                          return (
                            <div key={step} className="text-sm">
                              <span className="text-gray-600 capitalize">{step}:</span>{' '}
                              <span className="font-medium">{acceptedAnswers.join(' OR ')}</span>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {isPreviewOpen && previewWords && previewWords.length === 0 && (
              <div className="text-sm text-amber-600 mt-4">
                No words match the current filters. Try adjusting your filter criteria.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Exercise Summary</label>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm space-y-2">
              <div>
                <strong>Collection:</strong> {config.collection}
              </div>
              <div>
                <strong>Number of Words:</strong> {config.count === 'all' ? 'All matching words' : config.count}
              </div>
              <div>
                <strong>Number of Steps:</strong> {editingContent.data.steps.length}
              </div>
              <div>
                <strong>Total Items:</strong>{' '}
                {config.count === 'all'
                  ? `All × ${editingContent.data.steps.length} steps`
                  : config.count * editingContent.data.steps.length}
              </div>
              <div>
                <strong>Part of Speech:</strong> {config.filters.partOfSpeech || 'All'}
              </div>
              {config.formSelection && config.formSelection.selectedCellPaths.length > 0 && (
                <div>
                  <strong>Selected Forms:</strong> {config.formSelection.selectedCellPaths.length} form(s)
                </div>
              )}
              <div>
                <strong>API Fields:</strong> {selectFields.join(', ')}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
        itemProgressionDelay={editingContent.itemProgressionDelay}
        onItemProgressionDelayChange={itemProgressionDelay => updateContent({ itemProgressionDelay })}
      />
    </div>
  );
};
