import { useCallback, useEffect, useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { produce } from 'immer';
import { useAppDispatch } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { useGetMultiPosWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import { usePoolPOSSummary } from '@/src/hooks/usePoolPOSSummary';
import { ensureGeneratorConfig, DEFAULT_POS_FILTERS } from '@/src/utils/exercises/generatorConfigDefaults';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { AVAILABLE_STEPS } from '@/src/config/formIdentificationSteps';
import type {
  BaseExercise,
  GeneratorFilters,
  PosGeneratorConfig,
  FormSelection,
  GeneratorConfigBase,
} from '@/src/types/exercises/base';
import type { FormIdentificationPosConfig } from '@/src/types/exercises/base';
import type { GeneratedExerciseType } from '@/src/config/exerciseSelectFields';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import type { GetAdvancedWordsResponse } from '@/src/store/api/advancedVocabularyApi';

interface UseGeneratedExerciseEditorOptions {
  exerciseType: GeneratedExerciseType;
}

interface GeneratedExerciseData {
  generatorConfig: GeneratorConfigBase;
  posConfigs?: Record<string, PosGeneratorConfig | FormIdentificationPosConfig>;
  steps?: Array<string>;
}

interface GeneratedExercise extends BaseExercise {
  data: GeneratedExerciseData;
}

export interface UseGeneratedExerciseEditorReturn<T extends GeneratedExercise> {
  editingContent: T;
  config: ReturnType<typeof ensureGeneratorConfig>;
  activePOS: PartOfSpeech | undefined;
  derivedFilters: GeneratorFilters;
  derivedFormSelection: FormSelection | undefined;
  isPoolWordSource: boolean;
  isPreviewOpen: boolean;
  setIsPreviewOpen: (open: boolean) => void;
  posSummary: ReturnType<typeof usePoolPOSSummary>;
  updateContent: (updates: Partial<T>) => void;
  updateConfig: (configUpdates: Partial<ReturnType<typeof ensureGeneratorConfig>>) => void;
  handlePartOfSpeechChange: (pos: GeneratorFilters['partOfSpeech']) => void;
  handleFiltersChange: (updates: Partial<GeneratorFilters>) => void;
  handleResetFilters: () => void;
  handleUpdatePosConfig: (
    pos: PartOfSpeech,
    updates: Partial<PosGeneratorConfig> | Partial<FormIdentificationPosConfig>
  ) => void;
  handleTogglePOS: (pos: PartOfSpeech, enabled: boolean) => void;
  formSelectionControls: {
    handleToggleCell: (path: string) => void;
    handleTogglePaths: (paths: string[]) => void;
    handleSelectAll: () => void;
    handleClearSelection: () => void;
  };
  previewData: GetAdvancedWordsResponse['data'] | undefined;
  isPreviewFetching: boolean;
}

export function useGeneratedExerciseEditor<T extends GeneratedExercise>(
  editingContent: T,
  options: UseGeneratedExerciseEditorOptions
): UseGeneratedExerciseEditorReturn<T> {
  const dispatch = useAppDispatch();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const rawConfig = editingContent.data?.generatorConfig;
  const config = useMemo(() => ensureGeneratorConfig(rawConfig), [rawConfig]);
  const isPoolWordSource = config.wordSource === 'pool';

  const posSummary = usePoolPOSSummary(isPoolWordSource ? config.poolId || null : null);

  const activePOS = useMemo(() => {
    const posConfigs = editingContent.data.posConfigs ?? {};
    const enabledEntries = Object.entries(posConfigs).filter(([, cfg]) => cfg?.enabled);
    if (enabledEntries.length === 1) {
      return enabledEntries[0][0] as PartOfSpeech;
    }
    return undefined;
  }, [editingContent.data.posConfigs]);

  const derivedFilters = useMemo((): GeneratorFilters => {
    if (!activePOS) {
      return {
        partOfSpeech: 'all',
        search: '',
        verbConjugation: 'all',
        isDeponent: 'both',
        nounDeclension: 'all',
        adjectiveDeclension: 'all',
        pronounType: 'all',
        pronounPerson: 'all',
      };
    }
    const posConfig = editingContent.data.posConfigs?.[activePOS];
    return {
      partOfSpeech: activePOS,
      ...posConfig?.filters,
    };
  }, [activePOS, editingContent.data.posConfigs]);

  const derivedFormSelection = useMemo(() => {
    if (!activePOS) return undefined;
    return editingContent.data.posConfigs?.[activePOS]?.formSelection;
  }, [activePOS, editingContent.data.posConfigs]);

  const previewResult = useGetMultiPosWordsQuery(
    isPreviewOpen && editingContent.data.posConfigs
      ? {
          exerciseType: options.exerciseType,
          collection: config.collection,
          wordSource: config.wordSource,
          poolId: config.poolId,
          count: config.count,
          posConfigs: editingContent.data.posConfigs,
        }
      : skipToken
  );

  const previewData = previewResult.data;
  const isPreviewFetching = previewResult.isFetching;

  const updateContent = useCallback(
    (updates: Partial<T>) => {
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

      const nextContent = produce(editingContent, draft => {
        const currentConfigs = draft.data.posConfigs ?? {};

        if (newPos === 'all' || !newPos) {
          Object.keys(currentConfigs).forEach(pos => {
            currentConfigs[pos] = { ...currentConfigs[pos], enabled: false };
          });
          draft.data.posConfigs = currentConfigs;
          return;
        }

        const tableType = deriveTableTypeFromPOS(newPos);

        Object.keys(currentConfigs).forEach(pos => {
          if (pos !== newPos) {
            currentConfigs[pos] = { ...currentConfigs[pos], enabled: false };
          }
        });

        const existingConfig = currentConfigs[newPos];
        const baseConfig = {
          enabled: true,
          filters: existingConfig?.filters ?? { ...DEFAULT_POS_FILTERS },
          formSelection: tableType ? { tableType, selectedCellPaths: [] } : undefined,
        };

        if (options.exerciseType === 'generated-form-identification') {
          const existingSteps = existingConfig && 'steps' in existingConfig ? existingConfig.steps : undefined;
          const defaultSteps = AVAILABLE_STEPS[newPos as PartOfSpeech];
          currentConfigs[newPos] = {
            ...baseConfig,
            steps: existingSteps ?? (defaultSteps ? [...defaultSteps] : []),
          };
        } else {
          currentConfigs[newPos] = baseConfig;
        }

        draft.data.posConfigs = currentConfigs;
      });
      updateContent(nextContent);
    },
    [editingContent, updateContent, options.exerciseType]
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
    (pos: PartOfSpeech, updates: Partial<PosGeneratorConfig> | Partial<FormIdentificationPosConfig>) => {
      const isFormIdExercise = options.exerciseType === 'generated-form-identification';
      const tableType = deriveTableTypeFromPOS(pos);

      const nextContent = produce(editingContent, draft => {
        if (!draft.data.posConfigs) {
          draft.data.posConfigs = {};
        }

        const currentConfig =
          draft.data.posConfigs[pos] ||
          (isFormIdExercise
            ? {
                enabled: false,
                filters: { ...DEFAULT_POS_FILTERS },
                formSelection: tableType ? { tableType, selectedCellPaths: [] } : undefined,
                steps: [],
              }
            : {
                enabled: false,
                filters: { ...DEFAULT_POS_FILTERS },
                formSelection: tableType ? { tableType, selectedCellPaths: [] } : undefined,
              });

        draft.data.posConfigs[pos] = { ...currentConfig, ...updates };
      });
      updateContent(nextContent);
    },
    [editingContent, updateContent, options.exerciseType]
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

    const isFormIdExercise = options.exerciseType === 'generated-form-identification';
    const initialConfigs: Record<string, FormIdentificationPosConfig | PosGeneratorConfig> = {};

    posSummary.availablePOS.forEach(pos => {
      const tableType = deriveTableTypeFromPOS(pos);
      const baseConfig = {
        enabled: false,
        filters: { ...DEFAULT_POS_FILTERS },
        formSelection: tableType ? { tableType, selectedCellPaths: [] } : undefined,
      };

      if (isFormIdExercise) {
        const availableSteps = AVAILABLE_STEPS[pos] || [];
        initialConfigs[pos] = {
          ...baseConfig,
          steps: [...availableSteps],
        };
      } else {
        initialConfigs[pos] = baseConfig;
      }
    });

    const nextContent = produce(editingContent, draft => {
      draft.data.posConfigs = initialConfigs;
    });
    updateContent(nextContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPoolWordSource, posSummary.availablePOS, editingContent.data.posConfigs, updateContent, options.exerciseType]);

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
    editingContent,
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
    handlePartOfSpeechChange,
    handleFiltersChange,
    handleResetFilters,
    handleUpdatePosConfig,
    handleTogglePOS,
    formSelectionControls,
    previewData,
    isPreviewFetching,
  };
}
