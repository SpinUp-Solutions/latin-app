import { useCallback, useEffect, useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { produce } from 'immer';
import { useAppDispatch } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { useGetMultiParadigmWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { useAvailableParadigms } from '@/src/hooks/useAvailableParadigms';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import { ensureGeneratorConfig, DEFAULT_POS_FILTERS } from '@/src/utils/exercises/generatorConfigDefaults';
import { PARADIGM_STEPS, PARADIGM_TABLE_TYPE } from '@/src/config/paradigmDefinitions';
import { getParadigmPOS } from '@/src/utils/paradigm';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import type { FormParadigm, ParadigmConfig, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import type { GeneratorFilters, FormSelection } from '@/src/types/exercises/base';

export function useFormIdentificationEditor(editingContent: GeneratedFormIdentificationExercise) {
  const dispatch = useAppDispatch();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const rawConfig = editingContent.data?.generatorConfig;
  const config = useMemo(() => ensureGeneratorConfig(rawConfig), [rawConfig]);
  const isPoolWordSource = config.wordSource === 'pool';

  const paradigmInfo = useAvailableParadigms(config.wordSource, config.poolId, config.filters);

  const activeParadigm = useMemo(() => {
    const paradigmConfigs = editingContent.data.paradigmConfigs ?? {};
    const enabledEntries = Object.entries(paradigmConfigs).filter(([, cfg]) => cfg?.enabled);
    if (enabledEntries.length === 1) {
      return enabledEntries[0][0] as FormParadigm;
    }
    return undefined;
  }, [editingContent.data.paradigmConfigs]);

  const derivedFilters = useMemo((): GeneratorFilters => {
    if (config.wordSource === 'filters') {
      const paradigmFilters = activeParadigm ? editingContent.data.paradigmConfigs?.[activeParadigm]?.filters : {};
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
      ...editingContent.data.paradigmConfigs?.[activeParadigm]?.filters,
    };
  }, [config.wordSource, config.filters, activeParadigm, editingContent.data.paradigmConfigs]);

  const derivedFormSelection = useMemo(() => {
    if (!activeParadigm) return undefined;
    return editingContent.data.paradigmConfigs?.[activeParadigm]?.formSelection;
  }, [activeParadigm, editingContent.data.paradigmConfigs]);

  const previewResult = useGetMultiParadigmWordsQuery(
    isPreviewOpen && editingContent.data.paradigmConfigs
      ? {
          exerciseType: 'generated-form-identification',
          collection: config.collection,
          wordSource: config.wordSource,
          poolId: config.poolId,
          count: config.count,
          paradigmConfigs: editingContent.data.paradigmConfigs,
        }
      : skipToken
  );

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
        if (!draft.data.paradigmConfigs) {
          draft.data.paradigmConfigs = {};
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
    [editingContent, updateContent]
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
    },
    [config.filters, updateConfig]
  );

  useEffect(() => {
    if (paradigmInfo.availableParadigms.length === 0) {
      return;
    }

    const currentConfigs = editingContent.data.paradigmConfigs ?? {};
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
  }, [paradigmInfo.availableParadigms, editingContent, updateContent]);

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
    previewData: previewResult.data,
    isPreviewFetching: previewResult.isFetching,
  };
}
