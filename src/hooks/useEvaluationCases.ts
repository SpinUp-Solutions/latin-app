import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';

interface EvaluationCasesOptions<Input, Case, Result> {
  blankCase: () => Input;
  cloneCase: (value: Input) => Input;
  hasDraft: (value: Input) => boolean;
  isValidCase: (value: Input) => boolean;
  listCases: () => Promise<Case[]>;
  saveCaseInput: (value: Input, id?: string) => Promise<Case>;
  deleteCaseById: (id: string) => Promise<unknown>;
  runCase: (input: { caseId: string; forceRefresh: boolean }) => Promise<Result>;
  starterCases: readonly Input[];
  starterLabel: string;
  validationMessage: string;
}

/** Shared case editing and execution; each evaluation keeps its own form and results. */
export function useEvaluationCases<
  Input extends { title: string },
  Case extends Input & { id: string },
  Result extends { caseId: string },
>({
  blankCase,
  cloneCase,
  hasDraft,
  isValidCase,
  listCases,
  saveCaseInput,
  deleteCaseById,
  runCase,
  starterCases,
  starterLabel,
  validationMessage,
}: EvaluationCasesOptions<Input, Case, Result>) {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Input>(blankCase);
  const [savedForm, setSavedForm] = useState<Input | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [displayedRun, setDisplayedRun] = useState<{ result: Result; evaluationCase: Input } | null>(null);
  const [loadingCases, setLoadingCases] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingStarterCases, setAddingStarterCases] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const runGenerationRef = useRef(0);

  const dirty = savedForm ? JSON.stringify(form) !== JSON.stringify(savedForm) : hasDraft(form);
  const valid = isValidCase(form);
  const interactionLocked = running || saving || deleting || addingStarterCases;
  const missingStarterCases = starterCases.filter(starter => !cases.some(item => item.title === starter.title));
  const navigationGuard = useUnsavedNavigationGuard(
    dirty,
    'You have unsaved evaluation edits. Leave this page or switch cases without saving?'
  );

  const applySelectedCase = (evaluationCase: Case) => {
    runGenerationRef.current += 1;
    setSelectedId(evaluationCase.id);
    setForm(cloneCase(evaluationCase));
    setSavedForm(cloneCase(evaluationCase));
    setCollapsed(false);
    setDisplayedRun(null);
  };

  const applyNewCase = () => {
    runGenerationRef.current += 1;
    setSelectedId(null);
    setForm(blankCase());
    setSavedForm(null);
    setCollapsed(false);
    setDisplayedRun(null);
  };

  const loadCases = async () => {
    setLoadingCases(true);
    setLoadError(null);
    try {
      const nextCases = await listCases();
      setCases(nextCases);
      if (nextCases.length > 0) applySelectedCase(nextCases[0]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load evaluation cases');
    } finally {
      setLoadingCases(false);
    }
  };

  const loadOnMount = useEffectEvent(() => void loadCases());
  useEffect(() => loadOnMount(), []);

  const updateForm = (updater: (previous: Input) => Input) => {
    if (interactionLocked) return;
    runGenerationRef.current += 1;
    setDisplayedRun(null);
    setForm(updater);
  };

  const selectCase = (evaluationCase: Case) => {
    if (interactionLocked) return;
    navigationGuard.requestNavigation(() => applySelectedCase(evaluationCase));
  };

  const saveCase = async () => {
    if (interactionLocked || !valid) {
      toast.error(validationMessage);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveCaseInput(form, selectedId ?? undefined);
      setCases(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      applySelectedCase(saved);
      toast.success(selectedId ? 'Evaluation case saved' : 'Evaluation case created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save evaluation case');
    } finally {
      setSaving(false);
    }
  };

  const addStarterCases = async () => {
    if (interactionLocked || loadError || missingStarterCases.length === 0) return;
    setAddingStarterCases(true);
    const added: Case[] = [];
    try {
      // Saved last to first so the newest-first list keeps the starter order.
      for (const starter of [...missingStarterCases].reverse()) {
        added.unshift(await saveCaseInput(starter));
      }
      toast.success(`Added ${added.length} ${starterLabel} ${added.length === 1 ? 'case' : 'cases'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to add starter cases');
    } finally {
      setCases(previous => [...added, ...previous]);
      if (!selectedId && !dirty && added.length > 0) applySelectedCase(added[0]);
      setAddingStarterCases(false);
    }
  };

  const deleteCase = async () => {
    if (!selectedId || interactionLocked) return;
    setDeleting(true);
    try {
      await deleteCaseById(selectedId);
      const remaining = cases.filter(item => item.id !== selectedId);
      setCases(remaining);
      if (remaining.length > 0) applySelectedCase(remaining[0]);
      else applyNewCase();
      toast.success('Evaluation case deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete evaluation case');
    } finally {
      setDeleting(false);
    }
  };

  const runEvaluation = async (forceRefresh: boolean) => {
    if (!selectedId || dirty || !valid || interactionLocked) return;
    const caseIdAtStart = selectedId;
    const caseSnapshot = cloneCase(form);
    const requestGeneration = ++runGenerationRef.current;
    setCollapsed(true);
    setRunning(true);
    setDisplayedRun(null);
    try {
      const response = await runCase({ caseId: caseIdAtStart, forceRefresh });
      if (requestGeneration !== runGenerationRef.current || response.caseId !== caseIdAtStart) return;
      setDisplayedRun({ result: response, evaluationCase: caseSnapshot });
      toast.success('Model comparison complete');
    } catch (error) {
      if (requestGeneration === runGenerationRef.current) {
        toast.error(error instanceof Error ? error.message : 'Unable to run model comparison');
      }
    } finally {
      if (requestGeneration === runGenerationRef.current) setRunning(false);
    }
  };

  return {
    cases,
    selectedId,
    form,
    savedForm,
    collapsed,
    setCollapsed,
    displayedRun,
    loadingCases,
    saving,
    running,
    addingStarterCases,
    deleteOpen,
    setDeleteOpen,
    loadError,
    dirty,
    valid,
    interactionLocked,
    missingStarterCases,
    navigationGuard,
    applyNewCase,
    loadCases,
    updateForm,
    selectCase,
    saveCase,
    addStarterCases,
    deleteCase,
    runEvaluation,
    discardChanges: () => {
      if (!interactionLocked && savedForm) setForm(cloneCase(savedForm));
    },
  };
}
