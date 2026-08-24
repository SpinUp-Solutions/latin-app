import { useCallback, useEffect, useMemo } from 'react';
import { produce } from 'immer';
import { useAppDispatch } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { useAvailableParadigms } from '@/src/hooks/useAvailableParadigms';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import { useGeneratedExercisePreview } from '@/src/hooks/useGeneratedExercisePreview';
import { ensureGeneratorConfig, DEFAULT_POS_FILTERS } from '@/src/utils/exercises/generatorConfigDefaults';
import { PARADIGM_STEPS, PARADIGM_TABLE_TYPE, PARADIGM_RELEVANT_FILTERS } from '@/src/config/paradigmDefinitions';
import { getParadigmPOS } from '@/src/utils/paradigm';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import type { FormParadigm, ParadigmConfig, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import type { GeneratorFilters, FormSelection } from '@/src/types/exercises/base';
import { buildLegacyParadigmConfigs } from '@/src/utils/exercises/legacyExerciseCompat';

export function useFormIdentificationEditor(editingContent: GeneratedFormIdentificationExercise) {
  const dispatch = useAppDispatch();

  const rawConfig = editingContent.data?.generatorConfig;
  const config = useMemo(() => ensureGeneratorConfig(rawConfig), [rawConfig]);
  const isPoolWordSource = config.wordSource === 'pool';
  const paradigmConfigs = useMemo(
    () =>
      editingContent.data.paradigmConfigs && Object.keys(editingContent.data.paradigmConfigs).length > 0
        ? editingContent.data.paradigmConfigs
        : buildLegacyParadigmConfigs(
            editingContent.data.generatorConfig as Parameters<typeof buildLegacyParadigmConfigs>[0]
          ),
    [editingContent.data.paradigmConfigs, editingContent.data.generatorConfig]
  );

  const paradigmInfo = useAvailableParadigms(config.wordSource, config.poolId, config.filters);

  const activeParadigm = useMemo(() => {
    const enabledEntries = Object.entries(paradigmConfigs).filter(([, cfg]) => cfg?.enabled);
    if (enabledEntries.length === 1) {
      return enabledEntries[0][0] as FormParadigm;
    }
    return undefined;
  }, [paradigmConfigs]);

  const derivedFilters = useMemo((): GeneratorFilters => {
    if (config.wordSource === 'filters') {
      const paradigmFilters = activeParadigm ? paradigmConfigs[activeParadigm]?.filters : {};
      return {
        ...config.filters,
        ...paradigmFilters,
      };
    }

    if (!activeParadigm) {
      return { partOfSpeech: 'all' };
    }
    const pos = getParadigmPOS(activeParadigm);
    return {
      partOfSpeech: pos,
      ...paradigmConfigs[activeParadigm]?.filters,
    };
  }, [config.wordSource, config.filters, activeParadigm, paradigmConfigs]);

  const derivedFormSelection = useMemo(() => {
    if (!activeParadigm) return undefined;
    return paradigmConfigs[activeParadigm]?.formSelection;
  }, [activeParadigm, paradigmConfigs]);

  const previewRequest = useMemo(
    () => ({
      type: 'generated-form-identification' as const,
      data: editingContent.data,
    }),
    [editingContent.data]
  );
  const { isPreviewOpen, setIsPreviewOpen, previewData, isPreviewFetching, previewError } =
    useGeneratedExercisePreview(previewRequest);

  const updateContent = useCallback(
    (updates: Partial<GeneratedFormIdentificationExercise>) => {
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

  const handleUpdateParadigmConfig = useCallback(
    (paradigm: FormParadigm, updates: Partial<ParadigmConfig>) => {
      const tableType = PARADIGM_TABLE_TYPE[paradigm];
      const defaultSteps = PARADIGM_STEPS[paradigm];

      const nextContent = produce(editingContent, draft => {
        if (!draft.data.paradigmConfigs || Object.keys(draft.data.paradigmConfigs).length === 0) {
          draft.data.paradigmConfigs = { ...paradigmConfigs };
        }

        const currentConfig = draft.data.paradigmConfigs[paradigm] || {
          enabled: false,
          filters: { ...DEFAULT_POS_FILTERS },
          formSelection: tableType ? { tableType, selectedCellPaths: [] } : undefined,
          steps: [...defaultSteps],
        };

        draft.data.paradigmConfigs[paradigm] = { ...currentConfig, ...updates };
      });
      updateContent(nextContent);
    },
    [editingContent, paradigmConfigs, updateContent]
  );

  const handleToggleParadigm = useCallback(
    (paradigm: FormParadigm, enabled: boolean) => {
      handleUpdateParadigmConfig(paradigm, { enabled });
    },
    [handleUpdateParadigmConfig]
  );

  const handleGlobalFiltersChange = useCallback(
    (updates: Partial<GeneratorFilters>) => {
      updateConfig({ filters: { ...config.filters, ...updates } });

      if (activeParadigm) {
        const relevantFilters = PARADIGM_RELEVANT_FILTERS[activeParadigm];
        const paradigmFilterUpdates: Partial<GeneratorFilters> = {};

        for (const key of Object.keys(updates) as (keyof GeneratorFilters)[]) {
          if (relevantFilters.includes(key as keyof Omit<GeneratorFilters, 'partOfSpeech'>)) {
            paradigmFilterUpdates[key] = updates[key];
          }
        }

        if (Object.keys(paradigmFilterUpdates).length > 0) {
          const currentFilters = paradigmConfigs[activeParadigm]?.filters || {};
          handleUpdateParadigmConfig(activeParadigm, {
            filters: { ...currentFilters, ...paradigmFilterUpdates },
          });
        }
      }
    },
    [config.filters, updateConfig, activeParadigm, paradigmConfigs, handleUpdateParadigmConfig]
  );

  useEffect(() => {
    if (paradigmInfo.availableParadigms.length === 0) {
      return;
    }

    const currentConfigs = paradigmConfigs;
    const existingParadigms = Object.keys(currentConfigs);
    const newParadigms = paradigmInfo.availableParadigms.filter(p => !existingParadigms.includes(p));
    const shouldAutoEnable = paradigmInfo.availableParadigms.length === 1;
    const soleParadigm = shouldAutoEnable ? paradigmInfo.availableParadigms[0] : null;

    const needsNewConfigs = newParadigms.length > 0;
    const needsAutoEnable =
      shouldAutoEnable && soleParadigm && currentConfigs[soleParadigm] && !currentConfigs[soleParadigm].enabled;

    if (!needsNewConfigs && !needsAutoEnable) {
      return;
    }

    const updatedConfigs: ParadigmConfigs = { ...currentConfigs };

    newParadigms.forEach(paradigm => {
      const tableType = PARADIGM_TABLE_TYPE[paradigm];
      const defaultSteps = PARADIGM_STEPS[paradigm];
      updatedConfigs[paradigm] = {
        enabled: shouldAutoEnable && paradigm === soleParadigm,
        filters: { ...DEFAULT_POS_FILTERS },
        formSelection: tableType ? { tableType, selectedCellPaths: [] } : undefined,
        steps: [...defaultSteps],
      };
    });

    if (needsAutoEnable && soleParadigm && !newParadigms.includes(soleParadigm)) {
      const existing = updatedConfigs[soleParadigm];
      if (existing) {
        updatedConfigs[soleParadigm] = {
          enabled: true,
          filters: existing.filters ?? { ...DEFAULT_POS_FILTERS },
          formSelection: existing.formSelection,
          steps: existing.steps ?? PARADIGM_STEPS[soleParadigm],
        };
      }
    }

    updateContent({
      ...editingContent,
      data: { ...editingContent.data, paradigmConfigs: updatedConfigs },
    });
  }, [paradigmInfo.availableParadigms, editingContent, paradigmConfigs, updateContent]);

  const formSelectionControls = useFormSelectionControls(
    activeParadigm ? getParadigmPOS(activeParadigm) : undefined,
    derivedFormSelection,
    (formSelectionValue: FormSelection | undefined) => {
      if (!activeParadigm) return;
      handleUpdateParadigmConfig(activeParadigm, {
        formSelection: formSelectionValue,
      });
    },
    derivedFilters.pronounType,
    derivedFilters.pronounPerson
  );

  return {
    editingContent,
    paradigmConfigs,
    config,
    activeParadigm,
    derivedFilters,
    derivedFormSelection,
    isPoolWordSource,
    isPreviewOpen,
    setIsPreviewOpen,
    paradigmInfo,
    updateContent,
    updateConfig,
    handleUpdateParadigmConfig,
    handleToggleParadigm,
    handleGlobalFiltersChange,
    formSelectionControls,
    previewData,
    isPreviewFetching,
    previewError,
  };
}
