import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';
import { useGetAdvancedWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { useGeneratedExerciseQuery } from '@/src/hooks/useGeneratedExerciseQuery';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import type { GeneratorFilters } from '@/src/types/exercises/base';
import type { TranslationDirection } from '@/src/types/exercises/generated-translation';
import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { WordSourceSection } from './WordSourceSection';
import { normalizeGeneratorConfig, mergeGeneratorConfig } from '@/src/utils/exercises/generatorConfigDefaults';
import { usePoolPartOfSpeech } from '@/src/hooks/usePoolPartOfSpeech';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';

const formatPartOfSpeechLabel = (value: PartOfSpeech) => value.charAt(0).toUpperCase() + value.slice(1);

export const GeneratedTranslationEditor: React.FC = () => {
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as GeneratedTranslationExercise
  );

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  return <GeneratedTranslationEditorView editingContent={editingContent} />;
};

const GeneratedTranslationEditorView: React.FC<{ editingContent: GeneratedTranslationExercise }> = ({
  editingContent,
}) => {
  const dispatch = useAppDispatch();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const rawConfig = editingContent.data?.generatorConfig;
  const config = useMemo(() => normalizeGeneratorConfig(rawConfig), [rawConfig]);
  const isPoolWordSource = config.wordSource === 'pool';
  const { uniquePartOfSpeech, availablePartOfSpeech } = usePoolPartOfSpeech(isPoolWordSource ? config.poolId : null);

  const translationDirection = editingContent.translationDirection || 'latin-to-english';
  const previewLimit =
    config.count === 'all' ? 'all' : Math.min(typeof config.count === 'number' ? config.count : 5, 5);
  const { queryArgs, selectFields } = useGeneratedExerciseQuery('generated-translation', config, previewLimit);

  const { data: previewData, isFetching: isPreviewFetching } = useGetAdvancedWordsQuery(queryArgs, {
    skip: !isPreviewOpen,
  });

  const updateContent = useCallback(
    (updates: Partial<GeneratedTranslationExercise>) => {
      dispatch(updateEditingContent({ ...editingContent, ...updates }));
    },
    [dispatch, editingContent]
  );

  const updateConfig = useCallback(
    (configUpdates: Partial<typeof config>) => {
      const nextConfig = mergeGeneratorConfig(rawConfig, configUpdates);
      dispatch(
        updateEditingContent({
          ...editingContent,
          data: {
            ...editingContent.data,
            generatorConfig: nextConfig,
          },
        })
      );
    },
    [dispatch, editingContent, rawConfig]
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
    },
    [config.filters, updateConfig]
  );

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

  const { handleToggleCell, handleTogglePaths, handleSelectAll, handleClearSelection } = useFormSelectionControls(
    config.filters.partOfSpeech,
    config.formSelection,
    formSelectionValue => updateConfig({ formSelection: formSelectionValue })
  );

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
              automatically.
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

      <WordSourceSection
        value={config.wordSource}
        onChange={value => updateConfig({ wordSource: value })}
        filtersContent={filtersContent}
        poolContent={poolContent}
      />

      {(config.wordSource === 'filters' && config.filters.partOfSpeech !== 'all') ||
      (config.wordSource === 'pool' && config.filters.partOfSpeech && config.filters.partOfSpeech !== 'all') ? (
        <FormSelectionTable
          partOfSpeech={config.filters.partOfSpeech as PartOfSpeech}
          selectedCellPaths={config.formSelection?.selectedCellPaths || []}
          onToggleCell={handleToggleCell}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onTogglePaths={handleTogglePaths}
        />
      ) : config.wordSource === 'pool' ? (
        <div>
          <label className="block text-sm font-medium mb-3">Form Selection</label>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">
                To configure form selection, first select a part of speech for this pool using the selector above.
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
