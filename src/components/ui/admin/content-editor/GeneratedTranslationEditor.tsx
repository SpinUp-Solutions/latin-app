import React, { useCallback } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { GeneratedTranslationExercise } from '@/src/types/exercises';
import { useAppSelector } from '@/src/store/hooks';
import { SimpleInput, SimpleTextarea, SimpleSelect } from '@/src/components/ui/form-components';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { AdvancedFiltersPanel } from '../vocabulary/AdvancedFiltersPanel';
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';
import { FormSelectionTable } from '../vocabulary/FormSelectionTable';
import { WordSourceSection } from './WordSourceSection';
import { MultiPosConfigSection } from './MultiPosConfigSection';
import { useGeneratedExerciseEditor } from '@/src/hooks/useGeneratedExerciseEditor';
import { splitTranslationAnswers } from '@/src/utils/exercises/generatedTranslationExercise';
import type { TranslationDirection } from '@/src/types/exercises/generated-translation';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import { parseMultiFilterValue, serializeMultiFilterValue } from '@/src/utils/wordFilters';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { getExerciseDisplayForm, hasSelectedForm } from '@/src/utils/exercises/formSelection';

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
  const editor = useGeneratedExerciseEditor(editingContent, {
    exerciseType: 'generated-translation',
  });

  const translationDirection = editingContent.translationDirection || 'latin-to-english';

  const handleDirectionChange = useCallback(
    (value: string) => {
      const normalizedValue: TranslationDirection =
        value === 'english-to-latin' ? 'english-to-latin' : 'latin-to-english';
      editor.updateContent({ translationDirection: normalizedValue });
    },
    [editor]
  );

  const filtersContent = (
    <div>
      <label className="block text-sm font-medium mb-3">Vocabulary Filters</label>
      <AdvancedFiltersPanel
        filters={{
          partOfSpeech: (editor.derivedFilters.partOfSpeech || 'all') as PartOfSpeech | 'all',
          search: editor.derivedFilters.search || '',
          verbConjugation: parseMultiFilterValue(editor.derivedFilters.verbConjugation) as
            | ('1' | '2' | '3' | '3io' | '4' | 'irregular')[]
            | 'all',
          isDeponent: (editor.derivedFilters.isDeponent || 'both') as 'true' | 'false' | 'both',
          nounDeclension: parseMultiFilterValue(editor.derivedFilters.nounDeclension) as
            | ('1' | '2' | '3' | '3-istem' | '4' | '5')[]
            | 'all',
          adjectiveDeclension: parseMultiFilterValue(editor.derivedFilters.adjectiveDeclension) as
            | ('1-2' | '3')[]
            | 'all',
          pronounType: parseMultiFilterValue(editor.derivedFilters.pronounType) as PronounType[] | 'all',
          pronounPerson: parseMultiFilterValue(editor.derivedFilters.pronounPerson) as PronounPerson[] | 'all',
          limit: editor.config.count,
        }}
        onFiltersChange={updates => {
          if ('limit' in updates) {
            const currentCount = editor.config?.count ?? 5;
            const nextCount = updates.limit === undefined ? currentCount : (updates.limit as typeof currentCount);
            editor.updateConfig({ count: nextCount });
          } else {
            const serialized: Record<string, string | undefined> = {};
            for (const [key, value] of Object.entries(updates)) {
              if (Array.isArray(value)) {
                serialized[key] = serializeMultiFilterValue(value) ?? 'all';
              } else {
                serialized[key] = value as string;
              }
            }
            editor.handleFiltersChange(serialized);
          }
        }}
        onReset={editor.handleResetFilters}
        onApply={() => editor.setIsPreviewOpen(true)}
        isLoading={editor.isPreviewFetching}
      />
    </div>
  );

  const poolContent = (
    <div>
      <label className="block text-sm font-medium mb-3">Vocabulary Pool</label>
      <VocabularyPoolSelector
        selectedPoolId={editor.config.poolId || undefined}
        onPoolSelect={poolId => editor.updateConfig({ poolId: poolId || null })}
      />
    </div>
  );

  const previewWords = editor.previewData?.words as ExerciseWordResponse[] | undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SimpleInput
          label="Exercise Title"
          value={editingContent.title || ''}
          onChange={value => editor.updateContent({ title: value })}
          placeholder="Enter exercise title..."
        />

        <SimpleTextarea
          label="Instructions"
          value={editingContent.instructions || ''}
          onChange={value => editor.updateContent({ instructions: value })}
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
          onAudioPathChange={audioPath => editor.updateContent({ audioPath })}
          contentItemId={editingContent.id}
        />
      </div>

      <WordSourceSection
        value={editor.config.wordSource}
        onChange={value => editor.updateConfig({ wordSource: value })}
        filtersContent={filtersContent}
        poolContent={poolContent}
      />

      {!editor.isPoolWordSource && editor.activePOS && (
        <Card>
          <CardContent className="p-6">
            <div>
              <label className="block text-sm font-medium mb-3">Form Selection</label>
              <FormSelectionTable
                partOfSpeech={editor.activePOS}
                pronounType={editor.derivedFilters.pronounType as PronounType | 'all' | undefined}
                pronounPerson={editor.derivedFilters.pronounPerson as PronounPerson | 'all' | undefined}
                selectedCellPaths={editor.derivedFormSelection?.selectedCellPaths || []}
                onToggleCell={editor.formSelectionControls.handleToggleCell}
                onTogglePaths={editor.formSelectionControls.handleTogglePaths}
                onSelectAll={editor.formSelectionControls.handleSelectAll}
                onClearSelection={editor.formSelectionControls.handleClearSelection}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {editor.isPoolWordSource && editor.posSummary.availablePOS.length > 0 && editor.posSummary.summary && (
        <MultiPosConfigSection
          exerciseType="translation"
          availablePartOfSpeech={editor.posSummary.availablePOS}
          wordCountsByPOS={editor.posSummary.summary}
          posConfigs={editingContent.data.posConfigs}
          onUpdatePosConfig={editor.handleUpdatePosConfig}
          onTogglePOS={editor.handleTogglePOS}
        />
      )}

      <div>
        <label className="block text-sm font-medium mb-3">Preview</label>
        <Card>
          <CardContent className="p-4 space-y-4">
            <Button type="button" onClick={() => editor.setIsPreviewOpen(true)} disabled={editor.isPreviewFetching}>
              {editor.isPreviewFetching ? 'Loading Preview...' : 'Preview Sample Items'}
            </Button>

            {editor.isPreviewOpen && previewWords && previewWords.length > 0 && (
              <div className="space-y-2 mt-4">
                <label className="block text-sm font-medium">Preview ({previewWords.length} items)</label>
                {previewWords.map((word, index) => {
                  const translations = splitTranslationAnswers(word.translation);

                  const displayWord = getExerciseDisplayForm(word);

                  return (
                    <Card key={index}>
                      <CardContent className="p-3 space-y-1">
                        <div className="font-medium">{displayWord}</div>
                        {hasSelectedForm(word) && word.selected_form !== word.root_word && (
                          <div className="text-xs text-gray-500">Root: {word.dictionary_entry || word.root_word}</div>
                        )}
                        <div className="text-sm text-gray-600">Accepted answers: {translations.join(' OR ')}</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {editor.isPreviewOpen && previewWords && previewWords.length === 0 && (
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
                <strong>Collection:</strong> {editor.config.collection}
              </div>
              <div>
                <strong>Number of Questions:</strong>{' '}
                {editor.config.count === 'all' ? 'All matching words' : editor.config.count}
              </div>
              <div>
                <strong>Part of Speech:</strong> {editor.derivedFilters.partOfSpeech || 'All'}
              </div>
              {editor.derivedFormSelection && editor.derivedFormSelection.selectedCellPaths.length > 0 && (
                <div>
                  <strong>Selected Forms:</strong> {editor.derivedFormSelection.selectedCellPaths.length} form(s)
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => editor.updateContent({ feedbackConfig })}
        itemProgressionDelay={editingContent.itemProgressionDelay}
        onItemProgressionDelayChange={itemProgressionDelay => editor.updateContent({ itemProgressionDelay })}
      />
    </div>
  );
};
