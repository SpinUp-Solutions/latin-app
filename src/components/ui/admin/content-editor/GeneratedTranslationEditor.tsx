import React, { useCallback } from 'react';
import { Card, CardContent } from '@/src/components/ui/card';
import { GeneratedTranslationExercise } from '@/src/types/exercises';
import { useAppSelector } from '@/src/store/hooks';
import { SimpleInput, SimpleTextarea, SimpleSelect } from '@/src/components/ui/form-components';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { FormSelectionTable } from '../vocabulary/FormSelectionTable';
import { WordSourceSection } from './WordSourceSection';
import { MultiPosConfigSection } from './MultiPosConfigSection';
import { useGeneratedExerciseEditor } from '@/src/hooks/useGeneratedExerciseEditor';
import { splitTranslationAnswers } from '@/src/utils/exercises/generatedTranslationExercise';
import type { TranslationDirection } from '@/src/types/exercises/generated-translation';
import type { PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import { getExerciseDisplayForm, hasSelectedForm } from '@/src/utils/exercises/formSelection';
import { GeneratedVocabularyFilters } from './GeneratedVocabularyFilters';
import { GeneratedPoolSourceFields } from './GeneratedPoolSourceFields';
import { GeneratedExerciseSummary } from './GeneratedExerciseSummary';
import { GeneratedPreviewPanel } from './GeneratedPreviewPanel';

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
    <GeneratedVocabularyFilters
      derivedFilters={editor.derivedFilters}
      count={editor.config.count}
      limitMode="exclusive"
      onCountChange={count => editor.updateConfig({ count })}
      onFiltersChange={editor.handleFiltersChange}
      onReset={editor.handleResetFilters}
      onApply={() => editor.setIsPreviewOpen(true)}
      isLoading={editor.isPreviewFetching}
    />
  );

  const poolContent = (
    <GeneratedPoolSourceFields
      poolId={editor.config.poolId}
      count={editor.config.count}
      questionCountId="translation-question-count"
      onPoolChange={poolId => editor.updateConfig({ poolId })}
      onCountChange={count => editor.updateConfig({ count })}
    />
  );

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

      <GeneratedPreviewPanel
        isFetching={editor.isPreviewFetching}
        isOpen={editor.isPreviewOpen}
        previewError={editor.previewError}
        previewData={editor.previewData}
        idleLabel="Preview Sample Items"
        onPreview={() => editor.setIsPreviewOpen(true)}
        renderItems={words =>
          words.map((word, index) => {
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
          })
        }
      />

      <GeneratedExerciseSummary
        collection={editor.config.collection}
        count={editor.config.count}
        partOfSpeech={editor.derivedFilters.partOfSpeech}
        selectedFormCount={editor.derivedFormSelection?.selectedCellPaths.length}
      />

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => editor.updateContent({ feedbackConfig })}
        itemProgressionDelay={editingContent.itemProgressionDelay}
        onItemProgressionDelayChange={itemProgressionDelay => editor.updateContent({ itemProgressionDelay })}
      />
    </div>
  );
};
