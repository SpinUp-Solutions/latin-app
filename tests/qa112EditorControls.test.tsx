import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import lessonEditorReducer, { startEditingContent, setTestVersion } from '@/src/store/slices/lessonEditorSlice';
import { useAppSelector } from '@/src/store/hooks';
import { useFormIdentificationEditor } from '@/src/hooks/useFormIdentificationEditor';
import { ExerciseFeedbackSection } from '@/src/components/ui/admin/content-editor/ExerciseFeedbackSection';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

jest.mock('@/src/hooks/useAvailableParadigms', () => ({
  useAvailableParadigms: () => ({ availableParadigms: [] }),
}));
jest.mock('@/src/hooks/useGeneratedExercisePreview', () => ({
  useGeneratedExercisePreview: () => ({}),
}));
jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));

it('keeps successive morphology POS changes and per-paradigm resets in the same store update', () => {
  const exercise: GeneratedFormIdentificationExercise = {
    id: 'morphology',
    type: 'generated-form-identification',
    title: 'Morphology',
    instructions: '',
    feedbackConfig: { escalationLevels: [] },
    data: {
      mode: 'step-by-step',
      generatorConfig: {
        collection: VOCABULARY_WORDS_COLLECTION,
        wordSource: 'filters',
        count: 5,
        filters: { partOfSpeech: 'noun' },
      },
      paradigmConfigs: {
        'noun-declension': {
          enabled: true,
          filters: { nounDeclension: '1' },
          steps: ['case'],
          formSelection: { tableType: 'declension', selectedCellPaths: ['nominative.singular'] },
        },
      },
    },
  };
  const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
  store.dispatch(
    setTestVersion({
      id: 'version',
      name: 'Version',
      pages: [{ id: 'page', items: [exercise] }],
      totalPages: 1,
      totalItems: 1,
      totalExercises: 1,
      totalPoints: 1,
    })
  );
  store.dispatch(startEditingContent({ pageIndex: 0, itemIndex: 0 }));
  const { result } = renderHook(
    () =>
      useFormIdentificationEditor(
        useAppSelector(state => state.lessonEditor.editingContent!.content) as GeneratedFormIdentificationExercise
      ),
    {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    }
  );
  for (const partOfSpeech of ['verb', 'adjective', 'all'] as const) {
    act(() =>
      result.current.handleGlobalFiltersChange({ partOfSpeech, nounDeclension: 'all', verbConjugation: 'all' })
    );
    expect(result.current.config.filters.partOfSpeech).toBe(partOfSpeech);
    expect(result.current.derivedFilters.partOfSpeech).toBe(partOfSpeech);
    expect(result.current.paradigmConfigs['noun-declension']?.filters.nounDeclension).toBe('all');
  }
});

it('shows the effective default timing when omitted, preserves zero and commits edits on blur', () => {
  const onDelayChange = jest.fn();
  const view = (delay?: number) => (
    <ExerciseFeedbackSection
      feedbackConfig={{ escalationLevels: [] }}
      onChange={jest.fn()}
      itemProgressionDelay={delay}
      onItemProgressionDelayChange={onDelayChange}
    />
  );
  const { rerender } = render(view());
  fireEvent.click(screen.getByText('Timing Configuration'));
  expect(screen.getByRole('spinbutton')).toHaveValue(2000);
  rerender(view(0));
  expect(screen.getByRole('spinbutton')).toHaveValue(0);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '750' } });
  fireEvent.blur(screen.getByRole('spinbutton'));
  expect(onDelayChange).toHaveBeenLastCalledWith(750);
});
