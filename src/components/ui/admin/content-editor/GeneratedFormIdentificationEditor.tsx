import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { useAppSelector } from '@/src/store/hooks';
import { SimpleInput, SimpleTextarea } from '@/src/components/ui/form-components';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { AdvancedFiltersPanel } from '../vocabulary/AdvancedFiltersPanel';
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';
import { FormSelectionTable } from '../vocabulary/FormSelectionTable';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { extractStepValue, getAcceptedAnswersForStep } from '@/src/utils/exercises/formIdentificationHelpers';
import { WordSourceSection } from './WordSourceSection';
import { MultiPosConfigSection } from './MultiPosConfigSection';
import { useGeneratedExerciseEditor } from '@/src/hooks/useGeneratedExerciseEditor';
import { AVAILABLE_STEPS } from '@/src/config/formIdentificationSteps';
import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';

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
  const editor = useGeneratedExerciseEditor(editingContent, {
    exerciseType: 'generated-form-identification',
  });

  const filtersContent = (
    <div>
      <label className="block text-sm font-medium mb-3">Vocabulary Filters</label>
      <AdvancedFiltersPanel
        filters={{
          partOfSpeech: (editor.derivedFilters.partOfSpeech || 'all') as PartOfSpeech | 'all',
          search: editor.derivedFilters.search || '',
          verbConjugation: (editor.derivedFilters.verbConjugation || 'all') as '1' | '2' | '3' | '3io' | '4' | 'all',
          isDeponent: (editor.derivedFilters.isDeponent || 'both') as 'true' | 'false' | 'both',
          nounDeclension: (editor.derivedFilters.nounDeclension || 'all') as
            | '1'
            | '2'
            | '3'
            | '3-istem'
            | '4'
            | '5'
            | 'all',
          adjectiveDeclension: (editor.derivedFilters.adjectiveDeclension || 'all') as '1-2' | '3' | 'all',
          limit: editor.config.count,
        }}
        onFiltersChange={updates => {
          if ('limit' in updates) {
            const currentCount = editor.config?.count ?? 5;
            const nextCount = updates.limit === undefined ? currentCount : (updates.limit as typeof currentCount);
            editor.updateConfig({ count: nextCount });
          } else {
            editor.handleFiltersChange(updates);
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

  const availableStepsForSection: Record<PartOfSpeech, FormIdentificationStep[]> = Object.entries(
    AVAILABLE_STEPS
  ).reduce(
    (acc, [pos, steps]) => {
      acc[pos as PartOfSpeech] = [...steps];
      return acc;
    },
    {} as Record<PartOfSpeech, FormIdentificationStep[]>
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
          <CardContent className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium mb-3">Steps to Identify (in order)</label>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {editor.activePOS &&
                    availableStepsForSection[editor.activePOS]?.map(step => {
                      const activePOS = editor.activePOS!;
                      const currentSteps = editingContent.data.posConfigs[activePOS]?.steps || [];
                      const isSelected = currentSteps.includes(step);

                      return (
                        <Button
                          key={step}
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            const newSteps = isSelected
                              ? currentSteps.filter((s: FormIdentificationStep) => s !== step)
                              : [...currentSteps, step];
                            editor.handleUpdatePosConfig(activePOS, { steps: newSteps });
                          }}
                          className="capitalize">
                          {step}
                        </Button>
                      );
                    })}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-3">Form Selection</label>
              <FormSelectionTable
                partOfSpeech={editor.activePOS}
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
          exerciseType="form-identification"
          availablePartOfSpeech={editor.posSummary.availablePOS}
          wordCountsByPOS={editor.posSummary.summary}
          posConfigs={editingContent.data.posConfigs}
          onUpdatePosConfig={editor.handleUpdatePosConfig}
          onTogglePOS={editor.handleTogglePOS}
          availableSteps={availableStepsForSection}
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
                  const wordWithPath = word;
                  const wordSteps = editingContent.data.posConfigs[word.part_of_speech as PartOfSpeech]?.steps || [];
                  return (
                    <Card key={index}>
                      <CardContent className="p-3 space-y-1">
                        <div className="font-medium">{word.selected_form}</div>
                        {word.selected_form !== word.root_word && (
                          <div className="text-xs text-gray-500">Root: {word.root_word}</div>
                        )}
                        <div className="text-sm space-y-0.5">
                          {wordSteps.map(step => {
                            const stepValue = extractStepValue(wordWithPath, step);
                            if (!stepValue) return null;

                            const answers = getAcceptedAnswersForStep(stepValue);

                            return (
                              <div key={step} className="text-gray-600">
                                <strong className="capitalize">{step}:</strong> {stepValue}{' '}
                                {answers.length > 1 && `(or ${answers.join(', ')})`}
                              </div>
                            );
                          })}
                        </div>
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
