import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/src/components/ui/alert';
import { Label } from '@/src/components/ui/label';
import { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { useAppSelector } from '@/src/store/hooks';
import { SimpleInput, SimpleTextarea } from '@/src/components/ui/form-components';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { WordSourceSection } from './WordSourceSection';
import { MultiParadigmConfigSection } from './MultiParadigmConfigSection';
import { useFormIdentificationEditor } from '@/src/hooks/useFormIdentificationEditor';
import {
  extractStepValue,
  getAcceptedAnswersForStep,
  getDisplayForm,
} from '@/src/utils/exercises/formIdentificationHelpers';
import { getExerciseDisplayForm, hasSelectedForm } from '@/src/utils/exercises/formSelection';
import { getGeneratedFormIdentificationConfigurationMessages } from '@/src/utils/exercises/formIdentificationConfiguration';
import { prepareGeneratedFormIdentificationWord } from '@/src/utils/exercises/formIdentificationPreparation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { GeneratedVocabularyFilters } from './GeneratedVocabularyFilters';
import { GeneratedPoolSourceFields } from './GeneratedPoolSourceFields';
import { GeneratedUniqueWordCountField } from './GeneratedUniqueWordCountField';
import { getAppliedUniqueWordCount } from '@/src/utils/exercises/generatorConfigDefaults';
import { GeneratedExerciseSummary } from './GeneratedExerciseSummary';
import { GeneratedPreviewPanel } from './GeneratedPreviewPanel';

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
  const isSingleField = editingContent.data.mode === 'single-field';

  const editor = useFormIdentificationEditor(editingContent);
  const configurationMessages = getGeneratedFormIdentificationConfigurationMessages(editingContent);

  const setMode = (mode: 'step-by-step' | 'single-field') => {
    editor.updateContent({
      data: { ...editingContent.data, mode },
    });
  };

  const handleResetFilters = () => {
    editor.handleGlobalFiltersChange({
      partOfSpeech: 'all',
      search: '',
      verbConjugation: 'all',
      isDeponent: 'both',
      nounDeclension: 'all',
      adjectiveDeclension: 'all',
      pronounType: 'all',
      pronounPerson: 'all',
    });
  };

  const filtersContent = (
    <GeneratedVocabularyFilters
      derivedFilters={editor.derivedFilters}
      count={editor.config.count}
      limitMode="combined"
      onCountChange={count => editor.updateConfig({ count })}
      onFiltersChange={editor.handleGlobalFiltersChange}
      onReset={handleResetFilters}
      onApply={() => editor.setIsPreviewOpen(true)}
      isLoading={editor.isPreviewFetching}
    />
  );

  const poolContent = (
    <GeneratedPoolSourceFields
      poolId={editor.config.poolId}
      count={editor.config.count}
      questionCountId="form-identification-question-count"
      onPoolChange={poolId => editor.updateConfig({ poolId })}
      onCountChange={count => editor.updateConfig({ count })}>
      <GeneratedUniqueWordCountField
        id="form-identification-unique-word-count"
        uniqueWordCount={editor.config.uniqueWordCount}
        count={editor.config.count}
        onChange={uniqueWordCount => editor.updateConfig({ uniqueWordCount })}
      />
    </GeneratedPoolSourceFields>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Exercise Mode</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={!isSingleField ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('step-by-step')}>
                Step-by-Step
              </Button>
              <Button
                type="button"
                variant={isSingleField ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('single-field')}>
                Single Field
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              {isSingleField
                ? 'Students answer all steps in one field, separated by semicolons'
                : 'Students answer one step at a time'}
            </p>
          </div>
          {!isSingleField && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requireAllPrimaryAnswers"
                  checked={!!editingContent.data.requireAllPrimaryAnswers}
                  onCheckedChange={checked =>
                    editor.updateContent({
                      data: { ...editingContent.data, requireAllPrimaryAnswers: !!checked },
                    })
                  }
                />
                <Label htmlFor="requireAllPrimaryAnswers" className="text-sm cursor-pointer">
                  Require all primary answers
                </Label>
              </div>
              <p className="text-xs text-gray-500 ml-6">
                Students must enter all primary path answers for each step, separated by semicolons. Order must be
                consistent across steps.
              </p>
            </div>
          )}
          <div className="mt-4 pt-4 border-t space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="showDictionaryEntry"
                checked={!!editingContent.data.showDictionaryEntry}
                onCheckedChange={checked =>
                  editor.updateContent({
                    data: { ...editingContent.data, showDictionaryEntry: !!checked },
                  })
                }
              />
              <Label htmlFor="showDictionaryEntry" className="text-sm cursor-pointer">
                Show dictionary entry
              </Label>
            </div>
            <p className="text-xs text-gray-500 ml-6">Display the dictionary entry next to the selected form.</p>
          </div>
        </CardContent>
      </Card>

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

      {configurationMessages.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>No answerable morphology forms remain</AlertTitle>
          <AlertDescription>
            <p>Add a compatible question or select a different form before saving.</p>
            <ul className="list-disc pl-4">
              {configurationMessages.map(message => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {editor.paradigmInfo.isLoading ? (
        <Card>
          <CardContent className="p-6 flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading paradigm information...</span>
          </CardContent>
        </Card>
      ) : editor.paradigmInfo.availableParadigms.length > 0 ? (
        <MultiParadigmConfigSection
          availableParadigms={editor.paradigmInfo.availableParadigms}
          paradigmWordCounts={editor.paradigmInfo.paradigmWordCounts}
          paradigmConfigs={editor.paradigmConfigs}
          onUpdateParadigmConfig={editor.handleUpdateParadigmConfig}
          onToggleParadigm={editor.handleToggleParadigm}
        />
      ) : (
        <Card>
          <CardContent className="p-4 text-gray-500 text-sm">
            {editor.config.wordSource === 'pool' && !editor.config.poolId
              ? 'Select a vocabulary pool above to see available paradigms.'
              : editor.config.wordSource === 'pool'
                ? 'The selected pool has no words. Add words to the pool or choose a different one.'
                : 'No paradigms available for the current filter settings.'}
          </CardContent>
        </Card>
      )}

      <GeneratedPreviewPanel
        isFetching={editor.isPreviewFetching}
        isOpen={editor.isPreviewOpen}
        previewError={editor.previewError}
        previewData={editor.previewData}
        idleLabel={`Preview Sample Items${editor.config.count !== 'all' ? ` (${editor.config.count})` : ''}`}
        onPreview={() => editor.setIsPreviewOpen(true)}
        renderItems={previewWords =>
          previewWords.map((word, index) => {
            const prepared = prepareGeneratedFormIdentificationWord(editingContent, word);
            const wordSteps = prepared?.steps ?? [];

            let primaryAnswersDisplay = '';
            let optionalAnswersDisplay = '';

            if (isSingleField && prepared) {
              const formatPath = (path: Record<string, string | undefined>) =>
                wordSteps
                  .map(step => (path[step] ? getDisplayForm(path[step]) : null))
                  .filter(Boolean)
                  .join(',');

              primaryAnswersDisplay = prepared.primary.map(formatPath).filter(Boolean).join(';');
              optionalAnswersDisplay = prepared.optional.map(formatPath).filter(Boolean).join(';');
            }

            const displayWord = getExerciseDisplayForm(word);

            return (
              <Card key={index}>
                <CardContent className="p-3 space-y-1">
                  <div className="font-medium">{displayWord}</div>
                  {hasSelectedForm(word) && word.selected_form !== word.root_word && (
                    <div className="text-xs text-gray-500">Root: {word.dictionary_entry || word.root_word}</div>
                  )}
                  <div className="text-sm space-y-0.5">
                    {isSingleField ? (
                      <>
                        <div className="text-gray-600">
                          <strong>Answer:</strong> {primaryAnswersDisplay}
                        </div>
                        {optionalAnswersDisplay && (
                          <div className="text-gray-500 text-xs">
                            <strong>Optional:</strong> {optionalAnswersDisplay}
                          </div>
                        )}
                      </>
                    ) : (
                      wordSteps.map(step => {
                        const primaryValues = (prepared?.primary ?? [])
                          .map(path => path[step])
                          .filter((value): value is string => Boolean(value));
                        const optionalValues = (prepared?.optional ?? [])
                          .map(path => path[step])
                          .filter((value): value is string => Boolean(value));

                        const uniquePrimaryValues = Array.from(new Set(primaryValues));
                        const uniqueOptionalValues = Array.from(
                          new Set(optionalValues.filter(value => !uniquePrimaryValues.includes(value)))
                        );

                        const displayValue =
                          uniquePrimaryValues.length > 0
                            ? uniquePrimaryValues.join(' OR ')
                            : extractStepValue(word, step);

                        if (!displayValue) return null;

                        const answers = getAcceptedAnswersForStep(
                          uniquePrimaryValues.length > 0 ? uniquePrimaryValues[0] : displayValue
                        );

                        return (
                          <div key={step} className="text-gray-600">
                            <strong className="capitalize">{step.replace(/_/g, ' ')}:</strong> {displayValue}{' '}
                            {answers.length > 1 && `(or ${answers.slice(1).join(', ')})`}
                            {uniqueOptionalValues.length > 0 && (
                              <span className="text-gray-400 text-xs ml-1">
                                [optional: {uniqueOptionalValues.join(' OR ')}]
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        }
      />

      <GeneratedExerciseSummary
        collection={editor.config.collection}
        count={editor.config.count}
        uniqueWordCount={getAppliedUniqueWordCount(editor.config)}
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
