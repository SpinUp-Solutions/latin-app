import { act, renderHook } from '@testing-library/react';
import type { GeneratedTranslationExercise } from '@/src/types/exercises/generated-translation';
import {
  fingerprintGeneratedExercisePreviewRequest,
  formatGeneratedPreviewDiagnostics,
  matchingGeneratedPreviewData,
} from '@/src/utils/generated/generatedExercisePreview';

const mockReset = jest.fn();
const mockPreview = jest.fn();
const previewState: {
  data: { words: Array<{ id: string }> } | undefined;
  isLoading: boolean;
  error: unknown;
  originalArgs:
    | {
        type: 'generated-translation';
        translationDirection?: 'latin-to-english' | 'english-to-latin';
        data: Record<string, unknown>;
      }
    | undefined;
  reset: typeof mockReset;
} = {
  data: undefined,
  isLoading: false,
  error: undefined,
  originalArgs: undefined,
  reset: mockReset,
};

jest.mock('@/src/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
}));
jest.mock('@/src/hooks/usePoolPOSSummary', () => ({
  usePoolPOSSummary: () => ({ uniquePOS: undefined, availablePOS: [], summary: undefined }),
}));
jest.mock('@/src/hooks/useFormSelection', () => ({
  useFormSelectionControls: () => ({
    handleToggleCell: jest.fn(),
    handleTogglePaths: jest.fn(),
    handleSelectAll: jest.fn(),
    handleClearSelection: jest.fn(),
  }),
}));
jest.mock('@/src/store/api/advancedVocabularyApi', () => ({
  usePreviewGeneratedExerciseMutation: () => [mockPreview, previewState],
}));

import { useGeneratedExerciseEditor } from '@/src/hooks/useGeneratedExerciseEditor';

const makeExercise = (count: number, direction: 'latin-to-english' | 'english-to-latin' = 'latin-to-english') =>
  ({
    id: 'ex-1',
    type: 'generated-translation',
    title: 'Preview',
    instructions: '',
    translationDirection: direction,
    feedbackConfig: { escalationLevels: [] },
    data: {
      generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count },
      posConfigs: { noun: { enabled: true, filters: {} } },
    },
  }) as GeneratedTranslationExercise;

describe('generated exercise preview staleness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    previewState.data = undefined;
    previewState.originalArgs = undefined;
    previewState.isLoading = false;
    previewState.error = undefined;
  });

  it('hides preview results whose request fingerprint no longer matches', () => {
    const current = {
      type: 'generated-translation',
      translationDirection: 'latin-to-english' as const,
      data: { generatorConfig: { count: 5 } },
    };
    const stale = {
      type: 'generated-translation',
      translationDirection: 'latin-to-english' as const,
      data: { generatorConfig: { count: 10 } },
    };
    expect(
      matchingGeneratedPreviewData(
        fingerprintGeneratedExercisePreviewRequest(current),
        stale,
        { words: [{ id: 'old' }] }
      )
    ).toBeUndefined();
    expect(
      matchingGeneratedPreviewData(
        fingerprintGeneratedExercisePreviewRequest(current),
        current,
        { words: [{ id: 'fresh' }] }
      )
    ).toEqual({ words: [{ id: 'fresh' }] });
  });

  it('formats per-spec diagnostics and the global scan-budget suffix', () => {
    expect(
      formatGeneratedPreviewDiagnostics({
        diagnostics: [
          { specId: 'noun', collected: 3, scanned: 12, exhausted: true, scanLimitReached: false },
          { specId: 'verb', collected: 2, scanned: 40, exhausted: false, scanLimitReached: true },
        ],
        globalScanLimitReached: true,
      })
    ).toBe('noun: 3 usable (12 scanned, exhausted) · verb: 2 usable (40 scanned, scan limit) · Global scan budget reached');
  });

  it('closes and resets preview when count, filters, or direction change', () => {
    const { result, rerender } = renderHook(
      ({ exercise }: { exercise: GeneratedTranslationExercise }) =>
        useGeneratedExerciseEditor(exercise, { exerciseType: 'generated-translation' }),
      { initialProps: { exercise: makeExercise(10) } }
    );

    act(() => {
      result.current.setIsPreviewOpen(true);
    });
    expect(result.current.isPreviewOpen).toBe(true);
    expect(mockPreview).toHaveBeenCalled();

    rerender({ exercise: makeExercise(5) });
    expect(result.current.isPreviewOpen).toBe(false);
    expect(mockReset).toHaveBeenCalled();

    mockReset.mockClear();
    act(() => {
      result.current.setIsPreviewOpen(true);
    });
    rerender({ exercise: makeExercise(5, 'english-to-latin') });
    expect(result.current.isPreviewOpen).toBe(false);
    expect(mockReset).toHaveBeenCalled();
  });
});
