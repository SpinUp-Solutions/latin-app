import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { advancedVocabularyApi } from '@/src/store/api/advancedVocabularyApi';
import { RetainedLessonPages } from '@/src/components/ui/lesson/retained-lesson-pages';
import PageTemplate from '@/src/components/ui/lesson/page-template';
import type { Page } from '@/src/types/lesson';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

const mockQuery = jest.fn();
jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockQuery(...args),
}));
jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));
jest.mock('@/src/hooks/useTranslationGrading', () => ({ useTranslationGrading: () => ({}) }));

const pages: Page[] = [
  {
    id: 'generated',
    items: [
      {
        id: 'translate',
        type: 'generated-translation',
        title: 'Translate',
        instructions: '',
        translationDirection: 'latin-to-english',
        feedbackConfig: { escalationLevels: [], progressionRules: { autoAdvanceOnCorrect: false, showProgress: true } },
        data: {
          generatorConfig: { collection: VOCABULARY_WORDS_COLLECTION, wordSource: 'filters', count: 2 },
          posConfigs: {},
        },
      },
    ],
  },
  { id: 'other', items: [] },
];

it('retains the generated sample and progress after the real query cache expires', async () => {
  jest.useFakeTimers();
  mockQuery.mockResolvedValue({
    data: {
      words: [
        { id: 'a', root_word: 'unus', selected_form: 'unus', translation: 'one', part_of_speech: 'noun' },
        { id: 'b', root_word: 'duo', selected_form: 'duo', translation: 'two', part_of_speech: 'noun' },
      ],
      diagnostics: [],
      requestedCount: 2,
      collected: 2,
      globalScanLimitReached: false,
    },
  });
  const store = configureStore({
    reducer: { [advancedVocabularyApi.reducerPath]: advancedVocabularyApi.reducer },
    middleware: getDefault => getDefault().concat(advancedVocabularyApi.middleware),
  });
  const viewAt = (index: number) => (
    <Provider store={store}>
      <RetainedLessonPages pages={pages} currentPageIndex={index}>
        {(page, pageIndex) => (
          <PageTemplate
            page={page}
            pageIndex={pageIndex}
            generatedExerciseContext={{ kind: 'lesson', lessonId: 'lesson' }}
          />
        )}
      </RetainedLessonPages>
    </Provider>
  );
  const view = render(viewAt(0));
  await screen.findByRole('textbox');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'one' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('duo')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'draft two' } });
  view.rerender(viewAt(1));
  await act(async () => {
    jest.advanceTimersByTime(65000);
  });
  expect(Object.keys(store.getState()[advancedVocabularyApi.reducerPath].queries)).toHaveLength(0);
  mockQuery.mockResolvedValue({
    data: { words: [], diagnostics: [], requestedCount: 2, collected: 0, globalScanLimitReached: false },
  });
  view.rerender(viewAt(0));
  await act(async () => {});
  expect(mockQuery).toHaveBeenCalledTimes(1);
  expect(screen.getByText('duo')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('draft two');
  expect(screen.getByText('1 of 2 complete (50%)')).toBeInTheDocument();
  cleanup();
  store.dispatch(advancedVocabularyApi.util.resetApiState());
  jest.useRealTimers();
});
