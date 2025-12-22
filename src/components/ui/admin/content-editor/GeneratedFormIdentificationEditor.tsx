import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Label } from '@/src/components/ui/label';
import { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { useAppSelector } from '@/src/store/hooks';
import { SimpleInput, SimpleTextarea } from '@/src/components/ui/form-components';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { AdvancedFiltersPanel } from '../vocabulary/AdvancedFiltersPanel';
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import {
  extractStepValue,
  getAcceptedAnswersForStep,
  getDisplayForm,
  enrichPathsWithSteps,
} from '@/src/utils/exercises/formIdentificationHelpers';
import { WordSourceSection } from './WordSourceSection';
import { MultiParadigmConfigSection } from './MultiParadigmConfigSection';
import { useFormIdentificationEditor } from '@/src/hooks/useFormIdentificationEditor';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import { deriveParadigm } from '@/src/utils/paradigm';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { Loader2 } from 'lucide-react';

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
          pronounType: (editor.derivedFilters.pronounType || 'all') as PronounType | 'all',
          pronounPerson: (editor.derivedFilters.pronounPerson || 'all') as PronounPerson | 'all',
          limit: editor.config.count,
        }}
        onFiltersChange={updates => {
          const { limit, ...filterUpdates } = updates;

          if (limit !== undefined) {
            editor.updateConfig({ count: limit });
          }

          if (Object.keys(filterUpdates).length > 0) {
            editor.handleGlobalFiltersChange(filterUpdates);
          }
        }}
        onReset={handleResetFilters}
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

  const getWordSteps = (word: ExerciseWordResponse): FormIdentificationStep[] => {
    const pronounType = word.part_of_speech === 'pronoun' ? (word.pronoun_type as PronounType | undefined) : undefined;
    const pronounPerson = word.part_of_speech === 'pronoun' ? (word.person as PronounPerson | undefined) : undefined;
    const paradigm = deriveParadigm(word.part_of_speech as PartOfSpeech, pronounType, pronounPerson);
    if (!paradigm) return [];
    return editingContent.data.paradigmConfigs?.[paradigm]?.steps || [];
  };

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
          paradigmConfigs={editingContent.data.paradigmConfigs ?? {}}
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

      <div>
        <label className="block text-sm font-medium mb-3">Preview</label>
        <Card>
          <CardContent className="p-4 space-y-4">
            <Button type="button" onClick={() => editor.setIsPreviewOpen(true)} disabled={editor.isPreviewFetching}>
              {editor.isPreviewFetching
                ? 'Loading Preview...'
                : `Preview Sample Items${editor.config.count !== 'all' ? ` (${editor.config.count})` : ''}`}
            </Button>

            {editor.isPreviewOpen && previewWords && previewWords.length > 0 && (
              <div className="space-y-2 mt-4">
                <label className="block text-sm font-medium">Preview ({previewWords.length} items)</label>
                {previewWords.map((word, index) => {
                  const wordWithPath = word;
                  const wordSteps = getWordSteps(word);

                  let primaryAnswersDisplay = '';
                  let optionalAnswersDisplay = '';

                  if (isSingleField) {
                    const basePrimaryPaths = (word.primary_form_paths ||
                      (word.form_path ? [word.form_path] : [])) as Array<Record<string, string | undefined>>;
                    const baseOptionalPaths = (word.optional_form_paths || []) as Array<
                      Record<string, string | undefined>
                    >;

                    const enrichedPrimaryPaths = enrichPathsWithSteps(basePrimaryPaths, wordWithPath, wordSteps);
                    const enrichedOptionalPaths = enrichPathsWithSteps(baseOptionalPaths, wordWithPath, wordSteps);

                    const primaryDisplays = enrichedPrimaryPaths
                      .map(path => {
                        const pathValues = wordSteps
                          .map(step => {
                            const val = path[step];
                            return val ? getDisplayForm(val) : null;
                          })
                          .filter(Boolean);
                        return pathValues.join(',');
                      })
                      .filter(display => display.length > 0);

                    const optionalDisplays = enrichedOptionalPaths
                      .map(path => {
                        const pathValues = wordSteps
                          .map(step => {
                            const val = path[step];
                            return val ? getDisplayForm(val) : null;
                          })
                          .filter(Boolean);
                        return pathValues.join(',');
                      })
                      .filter(display => display.length > 0);

                    primaryAnswersDisplay = primaryDisplays.join(';');
                    optionalAnswersDisplay = optionalDisplays.join(';');
                  }

                  const displayWord =
                    word.selected_form === word.root_word
                      ? word.dictionary_entry || word.selected_form
                      : word.selected_form;

                  return (
                    <Card key={index}>
                      <CardContent className="p-3 space-y-1">
                        <div className="font-medium">{displayWord}</div>
                        {word.selected_form !== word.root_word && (
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
                            (() => {
                              const basePrimaryPaths = (word.primary_form_paths ||
                                (word.form_path ? [word.form_path] : [])) as Array<Record<string, string | undefined>>;
                              const baseOptionalPaths = (word.optional_form_paths || []) as Array<
                                Record<string, string | undefined>
                              >;

                              return wordSteps.map(step => {
                                const primaryValues = basePrimaryPaths
                                  .map(path => path[step])
                                  .filter((v): v is string => !!v);
                                const optionalValues = baseOptionalPaths
                                  .map(path => path[step])
                                  .filter((v): v is string => !!v);

                                const uniquePrimaryValues = Array.from(new Set(primaryValues));
                                const uniqueOptionalValues = Array.from(
                                  new Set(optionalValues.filter(v => !uniquePrimaryValues.includes(v)))
                                );

                                const displayValue =
                                  uniquePrimaryValues.length > 0
                                    ? uniquePrimaryValues.join(' OR ')
                                    : extractStepValue(wordWithPath, step);

                                if (!displayValue) return null;

                                const answers = getAcceptedAnswersForStep(
                                  uniquePrimaryValues.length > 0 ? uniquePrimaryValues[0] : displayValue
                                );

                                return (
                                  <div key={step} className="text-gray-600">
                                    <strong className="capitalize">{step}:</strong> {displayValue}{' '}
                                    {answers.length > 1 && `(or ${answers.slice(1).join(', ')})`}
                                    {uniqueOptionalValues.length > 0 && (
                                      <span className="text-gray-400 text-xs ml-1">
                                        [optional: {uniqueOptionalValues.join(' OR ')}]
                                      </span>
                                    )}
                                  </div>
                                );
                              });
                            })()
                          )}
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
