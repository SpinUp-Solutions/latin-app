import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { GeneratedTranslationExercise } from '@/src/types/exercises';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { SimpleInput, SimpleTextarea, SimpleSelect } from '@/src/components/ui/form-components';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { AdvancedFiltersPanel } from '../vocabulary/AdvancedFiltersPanel';
import { FormSelectionTable } from '../vocabulary/FormSelectionTable';
import { useGetAdvancedWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { useGeneratedExerciseQuery } from '@/src/hooks/useGeneratedExerciseQuery';
import { useFormSelection } from '@/src/hooks/useFormSelection';
import type { GeneratorFilters } from '@/src/types/exercises/base';
import type { TranslationDirection } from '@/src/types/exercises/generated-translation';
import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';

export const GeneratedTranslationEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as GeneratedTranslationExercise
  );

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const formSelection = useFormSelection();

  const config = editingContent?.data?.generatorConfig;
  const translationDirection = editingContent?.translationDirection || 'latin-to-english';
  const previewLimit =
    config?.count === 'all' ? 'all' : Math.min(typeof config?.count === 'number' ? config.count : 5, 5);
  const { queryArgs, selectFields } = useGeneratedExerciseQuery(
    'generated-translation',
    config || { collection: '', count: 5, filters: { partOfSpeech: 'all', search: '' } },
    previewLimit
  );

  const { data: previewData, isFetching: isPreviewFetching } = useGetAdvancedWordsQuery(queryArgs, {
    skip: !isPreviewOpen,
  });

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<GeneratedTranslationExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateConfig = (configUpdates: Partial<typeof config>) => {
    updateContent({
      data: {
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
      } else {
        const tableType = deriveTableTypeFromPOS(newPos);
        if (tableType) {
          updates.formSelection = {
            tableType,
            selectedCellPaths: [],
          };
        }
      }
    }

    updateConfig(updates);
  };

  const handleDirectionChange = (value: string) => {
    const normalizedValue: TranslationDirection =
      value === 'english-to-latin' ? 'english-to-latin' : 'latin-to-english';
    updateContent({ translationDirection: normalizedValue });
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

  const previewWords = previewData?.words as ExerciseWordResponse[] | undefined;

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

        <SimpleSelect
          label="Translation Direction"
          value={translationDirection}
          onChange={handleDirectionChange}
          options={[
            { value: 'latin-to-english', label: 'Latin → English' },
            { value: 'english-to-latin', label: 'English → Latin' },
          ]}
          placeholder="Select direction"
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

      {config.filters.partOfSpeech !== 'all' && (
        <FormSelectionTable
          partOfSpeech={config.filters.partOfSpeech as PartOfSpeech}
          selectedCellPaths={config.formSelection?.selectedCellPaths || []}
          onToggleCell={handleToggleCell}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onTogglePaths={handleTogglePaths}
        />
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
                <label className="block text-sm font-medium">Preview ({previewWords.length} items)</label>
                {previewWords.map((word, index) => {
                  const translations = word.translation ? word.translation.split(',').map(t => t.trim()) : [];

                  return (
                    <Card key={index}>
                      <CardContent className="p-3 space-y-1">
                        <div className="font-medium">{word.selected_form}</div>
                        {word.selected_form !== word.root_word && (
                          <div className="text-xs text-gray-500">Root: {word.root_word}</div>
                        )}
                        <div className="text-sm text-gray-600">Accepted answers: {translations.join(' OR ')}</div>
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
                <strong>Number of Questions:</strong> {config.count === 'all' ? 'All matching words' : config.count}
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
