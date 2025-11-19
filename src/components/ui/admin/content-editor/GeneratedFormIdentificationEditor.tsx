import React, { useState } from 'react';
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
import { useGetAdvancedWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { useGeneratedExerciseQuery } from '@/src/hooks/useGeneratedExerciseQuery';
import { useFormSelection } from '@/src/hooks/useFormSelection';
import type { GeneratorFilters } from '@/src/types/exercises/base';
import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import {
  FormIdentificationStep,
  FormIdentificationStepSchema,
} from '@/src/types/exercises/schemas/form-identification';
import { extractStepValue, getAcceptedAnswersForStep } from '@/src/utils/exercises/formIdentificationHelpers';

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

export const GeneratedFormIdentificationEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as GeneratedFormIdentificationExercise
  );

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const formSelection = useFormSelection();

  const config = editingContent?.data?.generatorConfig;
  const { queryArgs, selectFields } = useGeneratedExerciseQuery(
    'generated-form-identification',
    config || { collection: '', count: 5, filters: { partOfSpeech: 'all', search: '' } },
    Math.min(config?.count || 5, 5)
  );

  const { data: previewData, isFetching: isPreviewFetching } = useGetAdvancedWordsQuery(queryArgs, {
    skip: !isPreviewOpen,
  });

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<GeneratedFormIdentificationExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateConfig = (configUpdates: Partial<typeof config>) => {
    updateContent({
      data: {
        ...editingContent.data,
        generatorConfig: {
          ...config,
          ...configUpdates,
        },
      },
    });
  };

  const handleFiltersChange = (filterUpdates: Partial<GeneratorFilters>) => {
    const updates: Partial<typeof config> = {
      filters: {
        ...config.filters,
        ...filterUpdates,
      },
    };

    if ('partOfSpeech' in filterUpdates) {
      const newPos = filterUpdates.partOfSpeech;
      if (newPos === 'all') {
        updates.formSelection = undefined;
        updateContent({
          data: {
            ...editingContent.data,
            steps: [],
          },
        });
      } else {
        const tableType = deriveTableTypeFromPOS(newPos);
        if (tableType) {
          updates.formSelection = {
            tableType,
            selectedCellPaths: [],
          };
        }
        const currentSteps = editingContent.data.steps;
        const availableSteps = AVAILABLE_STEPS[newPos as PartOfSpeech] || [];
        const validSteps = currentSteps.filter(step => availableSteps.includes(step));
        updateContent({
          data: {
            ...editingContent.data,
            steps: validSteps,
          },
        });
      }
    }

    updateConfig(updates);
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

  const handleToggleCell = (path: string) => {
    const newPaths = formSelection.toggleCell(path, config.formSelection?.selectedCellPaths || []);
    const tableType = config.formSelection?.tableType || deriveTableTypeFromPOS(config.filters.partOfSpeech);
    if (tableType) {
      updateConfig({
        formSelection: {
          tableType,
          selectedCellPaths: newPaths,
        },
      });
    }
  };

  const handleTogglePaths = (paths: string[]) => {
    const newPaths = formSelection.togglePaths(paths, config.formSelection?.selectedCellPaths || []);
    const tableType = config.formSelection?.tableType || deriveTableTypeFromPOS(config.filters.partOfSpeech);
    if (tableType) {
      updateConfig({
        formSelection: {
          tableType,
          selectedCellPaths: newPaths,
        },
      });
    }
  };

  const handleSelectAll = () => {
    const allPaths = formSelection.getAllPaths(config.filters.partOfSpeech || 'all');
    const tableType = deriveTableTypeFromPOS(config.filters.partOfSpeech);
    if (tableType) {
      updateConfig({
        formSelection: {
          tableType,
          selectedCellPaths: allPaths,
        },
      });
    }
  };

  const handleClearSelection = () => {
    const tableType = config.formSelection?.tableType || deriveTableTypeFromPOS(config.filters.partOfSpeech);
    if (tableType) {
      updateConfig({
        formSelection: {
          tableType,
          selectedCellPaths: [],
        },
      });
    }
  };

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
            if ('limit' in updates && updates.limit !== undefined) {
              updateConfig({ count: updates.limit });
            } else {
              handleFiltersChange(updates);
            }
          }}
          onReset={handleResetFilters}
          onApply={() => setIsPreviewOpen(true)}
          isLoading={isPreviewFetching}
        />
      </div>

      {config.filters.partOfSpeech !== 'all' && (
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
      )}

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
                <strong>Number of Words:</strong> {config.count}
              </div>
              <div>
                <strong>Number of Steps:</strong> {editingContent.data.steps.length}
              </div>
              <div>
                <strong>Total Items:</strong> {config.count * editingContent.data.steps.length}
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
