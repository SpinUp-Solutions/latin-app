import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import lessonEditorReducer, { setTestVersion, startEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { useAppSelector } from '@/src/store/hooks';
import { useFormIdentificationEditor } from '@/src/hooks/useFormIdentificationEditor';
import { useGeneratedExerciseEditor } from '@/src/hooks/useGeneratedExerciseEditor';
import { MultiParadigmConfigSection } from '@/src/components/ui/admin/content-editor/MultiParadigmConfigSection';
import { MultiPosConfigSection } from '@/src/components/ui/admin/content-editor/MultiPosConfigSection';
import { DEFAULT_POS_FILTERS, getWordSourceUpdate } from '@/src/utils/exercises/generatorConfigDefaults';
import type { GeneratedFormIdentificationExercise, GeneratedTranslationExercise } from '@/src/types/exercises';
import type { RenderableContentItem } from '@/src/types/page';

jest.mock('@/src/hooks/useAvailableParadigms', () => ({
  useAvailableParadigms: () => ({
    availableParadigms: [],
    paradigmWordCounts: {},
    isLoading: false,
    isError: false,
    hasMultipleParadigms: false,
    uniqueParadigm: undefined,
  }),
}));

jest.mock('@/src/hooks/usePoolPOSSummary', () => ({
  usePoolPOSSummary: () => ({
    availablePOS: [],
    summary: undefined,
    uniquePOS: undefined,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('@/src/hooks/useGeneratedExercisePreview', () => ({
  useGeneratedExercisePreview: () => ({
    isPreviewOpen: false,
    setIsPreviewOpen: jest.fn(),
    previewData: undefined,
    isPreviewFetching: false,
    previewError: undefined,
  }),
}));

function createEditorStore(item: RenderableContentItem) {
  const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
  store.dispatch(
    setTestVersion({
      id: 'version-1',
      name: 'Version 1',
      pages: [{ id: 'page-1', items: [item] }],
      totalPages: 1,
      totalItems: 1,
      totalExercises: 1,
      totalPoints: 1,
    })
  );
  store.dispatch(startEditingContent({ pageIndex: 0, itemIndex: 0 }));
  return store;
}

const makeMorphologyExercise = (
  overrides: Partial<GeneratedFormIdentificationExercise['data']> = {}
): GeneratedFormIdentificationExercise => ({
  id: 'morphology-lviii',
  type: 'generated-form-identification',
  title: 'Morphology: numbers 1-3, 1000s',
  instructions: '',
  feedbackConfig: { escalationLevels: [] },
  data: {
    mode: 'single-field',
    generatorConfig: {
      collection: VOCABULARY_WORDS_COLLECTION,
      wordSource: 'filters',
      poolId: 'pool-numerals',
      count: 30,
      uniqueWordCount: 4,
      filters: { partOfSpeech: 'adjective', search: 'unus', adjectiveDeclension: '1-2' },
    },
    paradigmConfigs: {
      'adjective-declension': {
        enabled: true,
        steps: ['case', 'number', 'gender'],
        filters: { ...DEFAULT_POS_FILTERS, search: 'unus', adjectiveDeclension: '1-2' },
        formSelection: {
          tableType: 'adjective-declension',
          selectedCellPaths: ['positive.nominative.masculine.singular'],
        },
      },
      'noun-declension': {
        enabled: true,
        steps: ['case', 'number', 'gender'],
        filters: { ...DEFAULT_POS_FILTERS, nounDeclension: '3-istem' },
        formSelection: {
          tableType: 'declension',
          selectedCellPaths: ['nominative.plural'],
        },
      },
    },
    ...overrides,
  },
});

const makeTranslationExercise = (
  overrides: Partial<GeneratedTranslationExercise['data']> = {}
): GeneratedTranslationExercise => ({
  id: 'translation-1',
  type: 'generated-translation',
  title: 'Definitions',
  instructions: '',
  translationDirection: 'latin-to-english',
  feedbackConfig: { escalationLevels: [] },
  data: {
    generatorConfig: {
      collection: VOCABULARY_WORDS_COLLECTION,
      wordSource: 'filters',
      poolId: 'pool-numerals',
      count: 10,
      filters: { partOfSpeech: 'adjective', search: 'unus' },
    },
    posConfigs: {
      adjective: {
        enabled: true,
        filters: { ...DEFAULT_POS_FILTERS, search: 'unus', adjectiveDeclension: '1-2' },
      },
      noun: {
        enabled: false,
        filters: { ...DEFAULT_POS_FILTERS, nounDeclension: '3' },
      },
    },
    ...overrides,
  },
});

describe('useFormIdentificationEditor filter lifecycle', () => {
  const renderFormEditorHook = (exercise: GeneratedFormIdentificationExercise) => {
    const store = createEditorStore(exercise);
    const rendered = renderHook(
      () =>
        useFormIdentificationEditor(
          useAppSelector(state => state.lessonEditor.editingContent!.content) as GeneratedFormIdentificationExercise
        ),
      { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> }
    );
    return { ...rendered, store };
  };

  it('clears stale global and per-paradigm filters when switching from custom filters to a pool while preserving form selections', () => {
    const { result } = renderFormEditorHook(makeMorphologyExercise());

    act(() => {
      result.current.updateConfig(getWordSourceUpdate('pool', result.current.config.count));
    });

    expect(result.current.config.wordSource).toBe('pool');
    expect(result.current.config.count).toBe('all');
    expect(result.current.config.filters).toEqual({ partOfSpeech: 'all', ...DEFAULT_POS_FILTERS });
    expect(result.current.paradigmConfigs['adjective-declension']?.filters).toEqual(DEFAULT_POS_FILTERS);
    expect(result.current.paradigmConfigs['noun-declension']?.filters).toEqual(DEFAULT_POS_FILTERS);
    expect(result.current.paradigmConfigs['adjective-declension']?.formSelection?.selectedCellPaths).toEqual([
      'positive.nominative.masculine.singular',
    ]);
    expect(result.current.paradigmConfigs['adjective-declension']?.steps).toEqual(['case', 'number', 'gender']);
  });

  it('clears stale per-paradigm filters when switching from a pool to custom filters', () => {
    const exercise = makeMorphologyExercise();
    exercise.data.generatorConfig.wordSource = 'pool';
    exercise.data.generatorConfig.filters = { partOfSpeech: 'all', ...DEFAULT_POS_FILTERS };

    const { result } = renderFormEditorHook(exercise);

    act(() => {
      result.current.updateConfig(getWordSourceUpdate('filters', result.current.config.count));
    });

    expect(result.current.config.wordSource).toBe('filters');
    expect(result.current.paradigmConfigs['adjective-declension']?.filters).toEqual(DEFAULT_POS_FILTERS);
    expect(result.current.paradigmConfigs['noun-declension']?.filters).toEqual(DEFAULT_POS_FILTERS);
  });

  it('preserves per-paradigm filters when updating count or poolId without changing wordSource', () => {
    const exercise = makeMorphologyExercise();
    exercise.data.generatorConfig.wordSource = 'pool';

    const { result } = renderFormEditorHook(exercise);

    act(() => {
      result.current.updateConfig({ count: 20 });
    });

    expect(result.current.config.count).toBe(20);
    expect(result.current.paradigmConfigs['adjective-declension']?.filters.search).toBe('unus');
  });

  it('clears all per-paradigm filters on handleResetFilters even when multiple paradigms are enabled', () => {
    const { result } = renderFormEditorHook(makeMorphologyExercise());

    act(() => {
      result.current.handleResetFilters();
    });

    expect(result.current.config.filters).toEqual({ partOfSpeech: 'all', ...DEFAULT_POS_FILTERS });
    expect(result.current.paradigmConfigs['adjective-declension']?.filters).toEqual(DEFAULT_POS_FILTERS);
    expect(result.current.paradigmConfigs['noun-declension']?.filters).toEqual(DEFAULT_POS_FILTERS);
  });

  it('propagates global search edits to all matching paradigms even when multiple paradigms are enabled', () => {
    const { result } = renderFormEditorHook(makeMorphologyExercise());

    act(() => {
      result.current.handleGlobalFiltersChange({ search: '' });
    });

    expect(result.current.config.filters.search).toBe('');
    expect(result.current.paradigmConfigs['adjective-declension']?.filters.search).toBe('');
    expect(result.current.paradigmConfigs['noun-declension']?.filters.search).toBe('');
  });
});

describe('useGeneratedExerciseEditor filter lifecycle', () => {
  const renderTranslationEditorHook = (exercise: GeneratedTranslationExercise) => {
    const store = createEditorStore(exercise);
    const rendered = renderHook(
      () =>
        useGeneratedExerciseEditor(
          useAppSelector(state => state.lessonEditor.editingContent!.content) as GeneratedTranslationExercise
        ),
      { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> }
    );
    return { ...rendered, store };
  };

  it('clears stale per-POS filters when switching from custom filters to a vocabulary pool', () => {
    const { result, store } = renderTranslationEditorHook(makeTranslationExercise());

    act(() => {
      result.current.updateConfig(getWordSourceUpdate('pool', result.current.config.count));
    });

    const updated = store.getState().lessonEditor.editingContent!.content as GeneratedTranslationExercise;
    expect(updated.data.generatorConfig.wordSource).toBe('pool');
    expect(updated.data.posConfigs.adjective?.filters).toEqual(DEFAULT_POS_FILTERS);
    expect(updated.data.posConfigs.noun?.filters).toEqual(DEFAULT_POS_FILTERS);
  });

  it('clears per-POS filters on handleResetFilters so re-enabling a POS does not resurrect stale search filters', () => {
    const { result, store } = renderTranslationEditorHook(makeTranslationExercise());

    act(() => {
      result.current.handleResetFilters();
    });

    const afterReset = store.getState().lessonEditor.editingContent!.content as GeneratedTranslationExercise;
    expect(afterReset.data.posConfigs.adjective?.enabled).toBe(false);
    expect(afterReset.data.posConfigs.adjective?.filters).toEqual(DEFAULT_POS_FILTERS);
    expect(afterReset.data.posConfigs.noun?.filters).toEqual(DEFAULT_POS_FILTERS);

    act(() => {
      result.current.handleFiltersChange({ partOfSpeech: 'adjective' });
    });

    const afterReenable = store.getState().lessonEditor.editingContent!.content as GeneratedTranslationExercise;
    expect(afterReenable.data.posConfigs.adjective?.enabled).toBe(true);
    expect(afterReenable.data.posConfigs.adjective?.filters.search).toBe('');
  });
});

describe('MultiParadigmConfigSection active filter indicator and clear action', () => {
  it('marks tabs with active filters and clears them in one click', () => {
    const onUpdateParadigmConfig = jest.fn();

    render(
      <MultiParadigmConfigSection
        availableParadigms={['noun-declension', 'adjective-declension']}
        paradigmWordCounts={{ 'noun-declension': 1, 'adjective-declension': 3 }}
        paradigmConfigs={{
          'noun-declension': {
            enabled: true,
            filters: { ...DEFAULT_POS_FILTERS },
            steps: ['case', 'number', 'gender'],
            formSelection: { tableType: 'declension', selectedCellPaths: ['nominative.plural'] },
          },
          'adjective-declension': {
            enabled: true,
            filters: { ...DEFAULT_POS_FILTERS, search: 'unus' },
            steps: ['case', 'number', 'gender'],
            formSelection: {
              tableType: 'adjective-declension',
              selectedCellPaths: ['positive.nominative.masculine.singular'],
            },
          },
        }}
        onUpdateParadigmConfig={onUpdateParadigmConfig}
        onToggleParadigm={jest.fn()}
      />
    );

    // Noun Declension is active first, yet the inactive Adjective Declension tab still surfaces its active filter.
    expect(screen.getByRole('button', { name: /Noun Declension/ })).not.toHaveTextContent('Filtered');
    const adjTab = screen.getByRole('button', { name: /Adjective Declension.*Filtered/ });
    expect(adjTab).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    fireEvent.click(adjTab);

    const filterNotice = screen
      .getByText(/Active filters narrow the words used for this paradigm/)
      .closest('[role="status"]');
    expect(filterNotice).toHaveTextContent('Search ("unus")');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onUpdateParadigmConfig).toHaveBeenCalledWith('adjective-declension', {
      filters: DEFAULT_POS_FILTERS,
    });
  });

  it('does not show a Filtered badge when a paradigm is disabled or has only default filters', () => {
    render(
      <MultiParadigmConfigSection
        availableParadigms={['adjective-declension']}
        paradigmConfigs={{
          'adjective-declension': {
            enabled: false,
            filters: { ...DEFAULT_POS_FILTERS, search: 'unus' },
            steps: ['case'],
            formSelection: { tableType: 'adjective-declension', selectedCellPaths: [] },
          },
        }}
        onUpdateParadigmConfig={jest.fn()}
        onToggleParadigm={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Adjective Declension/ })).not.toHaveTextContent('Filtered');
  });
});

describe('MultiPosConfigSection stale filter indicator and clear action', () => {
  it('surfaces lingering filters on a pool translation POS and lets admins clear them', () => {
    const onUpdatePosConfig = jest.fn();

    render(
      <MultiPosConfigSection
        availablePartOfSpeech={['noun', 'adjective']}
        wordCountsByPOS={{ noun: 1, adjective: 3 }}
        posConfigs={{
          noun: { enabled: true, filters: { ...DEFAULT_POS_FILTERS } },
          adjective: { enabled: true, filters: { ...DEFAULT_POS_FILTERS, search: 'unus' } },
        }}
        onUpdatePosConfig={onUpdatePosConfig}
        onTogglePOS={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Noun/ })).not.toHaveTextContent('Filtered');
    const adjTab = screen.getByRole('button', { name: /Adjective.*Filtered/ });
    expect(adjTab).toBeInTheDocument();

    fireEvent.click(adjTab);

    const filterNotice = screen
      .getByText(/Active filters narrow the words used for this part of speech/)
      .closest('[role="status"]');
    expect(filterNotice).toHaveTextContent('Search ("unus")');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onUpdatePosConfig).toHaveBeenCalledWith('adjective', {
      filters: DEFAULT_POS_FILTERS,
    });
  });
});
