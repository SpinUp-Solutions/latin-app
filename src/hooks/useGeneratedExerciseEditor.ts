import { useCallback, useEffect, useMemo } from 'react';
import { produce } from 'immer';
import { useAppDispatch } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import type { GeneratedExercisePreviewRequest } from '@/src/store/api/advancedVocabularyApi';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import { useGeneratedExercisePreview } from '@/src/hooks/useGeneratedExercisePreview';
import { usePoolPOSSummary } from '@/src/hooks/usePoolPOSSummary';
import { ensureGeneratorConfig, DEFAULT_POS_FILTERS } from '@/src/utils/exercises/generatorConfigDefaults';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import type { GeneratorFilters, PosGeneratorConfig, FormSelection } from '@/src/types/exercises/base';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import type { GeneratedTranslationExercise } from '@/src/types/exercises/generated-translation';

const createPosConfig = (pos: string, enabled: boolean, filters?: PosGeneratorConfig['filters']): PosGeneratorConfig => {
  const tableType = deriveTableTypeFromPOS(pos);
  return {
    enabled,
    filters: filters ?? { ...DEFAULT_POS_FILTERS },
    formSelection: tableType ? { tableType, selectedCellPaths: [] } : undefined,
  };
};

export function useGeneratedExerciseEditor(editingContent: GeneratedTranslationExercise) {
  const dispatch = useAppDispatch();

  const rawConfig = editingContent.data.generatorConfig;
  const config = useMemo(() => ensureGeneratorConfig(rawConfig), [rawConfig]);
  const isPoolWordSource = config.wordSource === 'pool';

  const posSummary = usePoolPOSSummary(isPoolWordSource ? config.poolId || null : null);

  const activePOS = useMemo(() => {
    const enabledEntries = Object.entries(editingContent.data.posConfigs ?? {}).filter(([, cfg]) => cfg?.enabled);
    return enabledEntries.length === 1 ? (enabledEntries[0][0] as PartOfSpeech) : undefined;
  }, [editingContent.data.posConfigs]);

  const derivedFilters = useMemo(
    (): GeneratorFilters =>
      activePOS
        ? { partOfSpeech: activePOS, ...editingContent.data.posConfigs?.[activePOS]?.filters }
        : { partOfSpeech: 'all', ...DEFAULT_POS_FILTERS },
    [activePOS, editingContent.data.posConfigs]
  );

  const derivedFormSelection = activePOS ? editingContent.data.posConfigs?.[activePOS]?.formSelection : undefined;

  const previewRequest = useMemo(
    (): GeneratedExercisePreviewRequest => ({
      type: 'generated-translation',
      translationDirection: editingContent.translationDirection,
      data: editingContent.data,
    }),
    [editingContent]
  );
  const { isPreviewOpen, setIsPreviewOpen, previewData, isPreviewFetching, previewError } =
    useGeneratedExercisePreview(previewRequest);

  const updateContent = useCallback(
    (updates: Partial<GeneratedTranslationExercise>) => {
      dispatch(updateEditingContent({ ...editingContent, ...updates }));
    },
    [dispatch, editingContent]
  );

  const updateConfig = useCallback(
    (configUpdates: Partial<typeof config>) => {
      const nextContent = produce(editingContent, draft => {
        draft.data.generatorConfig = ensureGeneratorConfig({ ...rawConfig, ...configUpdates });
      });
      updateContent(nextContent);
    },
    [editingContent, rawConfig, updateContent]
  );

  const handlePartOfSpeechChange = useCallback(
    (newPos: GeneratorFilters['partOfSpeech']) => {
      if (newPos === undefined) {
        return;
      }

      const enabledPos = newPos && newPos !== 'all' ? newPos : null;
      const nextContent = produce(editingContent, draft => {
        const currentConfigs = (draft.data.posConfigs ?? {}) as Record<string, PosGeneratorConfig>;

        Object.keys(currentConfigs).forEach(pos => {
          if (pos !== enabledPos) {
            currentConfigs[pos] = { ...currentConfigs[pos], enabled: false };
          }
        });

        if (enabledPos) {
          currentConfigs[enabledPos] = createPosConfig(enabledPos, true, currentConfigs[enabledPos]?.filters);
        }

        draft.data.posConfigs = currentConfigs;
      });
      updateContent(nextContent);
    },
    [editingContent, updateContent]
  );

  useEffect(() => {
    if (!isPoolWordSource || !posSummary.uniquePOS) {
      return;
    }
    if (activePOS === posSummary.uniquePOS) {
      return;
    }
    handlePartOfSpeechChange(posSummary.uniquePOS);
  }, [activePOS, handlePartOfSpeechChange, isPoolWordSource, posSummary.uniquePOS]);

  useEffect(() => {
    if (!isPoolWordSource || posSummary.uniquePOS || posSummary.availablePOS.length === 0) {
      return;
    }
    const posConfigs = editingContent.data.posConfigs ?? {};
    const hasAnyEnabled = Object.values(posConfigs).some(cfg => cfg?.enabled);
    if (hasAnyEnabled) {
      return;
    }
    if (!activePOS || !posSummary.availablePOS.includes(activePOS)) {
      handlePartOfSpeechChange(posSummary.availablePOS[0]);
    }
  }, [
    posSummary.availablePOS,
    activePOS,
    handlePartOfSpeechChange,
    isPoolWordSource,
    posSummary.uniquePOS,
    editingContent.data.posConfigs,
  ]);

  const handleUpdatePosConfig = useCallback(
    (pos: PartOfSpeech, updates: Partial<PosGeneratorConfig>) => {
      const nextContent = produce(editingContent, draft => {
        draft.data.posConfigs ??= {};
        const currentConfig = draft.data.posConfigs[pos] || createPosConfig(pos, false);
        draft.data.posConfigs[pos] = { ...currentConfig, ...updates };
      });
      updateContent(nextContent);
    },
    [editingContent, updateContent]
  );

  const handleTogglePOS = useCallback(
    (pos: PartOfSpeech, enabled: boolean) => {
      handleUpdatePosConfig(pos, { enabled });
    },
    [handleUpdatePosConfig]
  );

  const handleFiltersChange = useCallback(
    (filterUpdates: Partial<GeneratorFilters>) => {
      const { partOfSpeech, ...posFilters } = filterUpdates;

      if (partOfSpeech !== undefined) {
        handlePartOfSpeechChange(partOfSpeech);
        return;
      }

      if (!activePOS) return;

      handleUpdatePosConfig(activePOS, {
        filters: { ...derivedFilters, ...posFilters },
      });
    },
    [activePOS, derivedFilters, handlePartOfSpeechChange, handleUpdatePosConfig]
  );

  const handleResetFilters = useCallback(() => {
    handlePartOfSpeechChange('all');
  }, [handlePartOfSpeechChange]);

  useEffect(() => {
    if (editingContent.data.posConfigs && Object.keys(editingContent.data.posConfigs).length > 0) {
      return;
    }

    if (!isPoolWordSource || posSummary.availablePOS.length === 0) {
      return;
    }

    const initialConfigs = Object.fromEntries(posSummary.availablePOS.map(pos => [pos, createPosConfig(pos, false)]));
    const nextContent = produce(editingContent, draft => {
      draft.data.posConfigs = initialConfigs;
    });
    updateContent(nextContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPoolWordSource, posSummary.availablePOS, editingContent.data.posConfigs, updateContent]);

  const formSelectionControls = useFormSelectionControls(
    activePOS,
    derivedFormSelection,
    (formSelectionValue: FormSelection | undefined) => {
      if (!activePOS) return;
      handleUpdatePosConfig(activePOS, {
        formSelection: formSelectionValue,
      });
    },
    derivedFilters.pronounType,
    derivedFilters.pronounPerson
  );

  return {
    config,
    activePOS,
    derivedFilters,
    derivedFormSelection,
    isPoolWordSource,
    isPreviewOpen,
    setIsPreviewOpen,
    posSummary,
    updateContent,
    updateConfig,
    handleFiltersChange,
    handleResetFilters,
    handleUpdatePosConfig,
    handleTogglePOS,
    formSelectionControls,
    previewData,
    isPreviewFetching,
    previewError,
  };
}
