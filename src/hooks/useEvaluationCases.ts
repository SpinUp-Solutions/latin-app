import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import type { StoredEvaluationCase } from '@/src/lib/ai-evaluations/contracts';

/** What differs between evaluation suites: the case input and the four server calls. */
export interface EvaluationSuite<Input, Result> {
  blankCase: () => Input;
  /** The schema the server saves with, so the editor accepts exactly what can be saved. */
  inputSchema: z.ZodType<Input>;
  listCases: () => Promise<StoredEvaluationCase<Input>[]>;
  saveCaseInput: (value: Input, id?: string) => Promise<StoredEvaluationCase<Input>>;
  deleteCaseById: (id: string) => Promise<unknown>;
  runCase: (input: { caseId: string; forceRefresh: boolean }) => Promise<Result>;
  starterCases: readonly Input[];
  starterLabel: string;
}

const STORED_FIELDS = ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'];
/** A saved case without the fields the server adds, which the strict input schema rejects. */
const toInput = <Input>(saved: StoredEvaluationCase<Input>) =>
  Object.fromEntries(Object.entries(saved).filter(([field]) => !STORED_FIELDS.includes(field))) as Input;

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Case editing and execution shared by the evaluation suites; each suite keeps its own form and results. */
export function useEvaluationCases<Input extends { title: string }, Result extends { caseId: string }>({
  blankCase,
  inputSchema,
  listCases,
  saveCaseInput,
  deleteCaseById,
  runCase,
  starterCases,
  starterLabel,
}: EvaluationSuite<Input, Result>) {
  type Case = StoredEvaluationCase<Input>;
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Input>(blankCase);
  // What the form was when it was opened: the saved case, or the blank new one.
  const [baseline, setBaseline] = useState<Input>(form);
  const [collapsed, setCollapsed] = useState(false);
  const [displayedRun, setDisplayedRun] = useState<{ result: Result; evaluationCase: Input } | null>(null);
  const [loadingCases, setLoadingCases] = useState(true);
  const [busy, setBusy] = useState<'saving' | 'running' | 'deleting' | 'addingStarterCases' | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const runGenerationRef = useRef(0);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const validation = inputSchema.safeParse(form);
  const valid = validation.success;
  const interactionLocked = busy !== null;
  const missingStarterCases = starterCases.filter(starter => !cases.some(item => item.title === starter.title));
  const navigationGuard = useUnsavedNavigationGuard(
    dirty,
    'You have unsaved evaluation edits. Leave this page or switch cases without saving?'
  );

  const open = (id: string | null, input: Input) => {
    runGenerationRef.current += 1;
    setSelectedId(id);
    setForm(input);
    setBaseline(input);
    setCollapsed(false);
    setDisplayedRun(null);
  };
  const applySelectedCase = (evaluationCase: Case) => open(evaluationCase.id, toInput(evaluationCase));
  const applyNewCase = () => open(null, blankCase());

  const loadCases = async () => {
    setLoadingCases(true);
    setLoadError(null);
    try {
      const nextCases = await listCases();
      setCases(nextCases);
      if (nextCases.length > 0) applySelectedCase(nextCases[0]);
    } catch (error) {
      setLoadError(messageOf(error, 'Unable to load evaluation cases'));
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
    if (interactionLocked) return;
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? 'Complete the case before saving.');
      return;
    }
    setBusy('saving');
    try {
      const saved = await saveCaseInput(form, selectedId ?? undefined);
      setCases(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      applySelectedCase(saved);
      toast.success(selectedId ? 'Evaluation case saved' : 'Evaluation case created');
    } catch (error) {
      toast.error(messageOf(error, 'Unable to save evaluation case'));
    } finally {
      setBusy(null);
    }
  };

  const addStarterCases = async () => {
    if (interactionLocked || loadError || missingStarterCases.length === 0) return;
    setBusy('addingStarterCases');
    const added: Case[] = [];
    try {
      // Saved last to first so the newest-first list keeps the starter order.
      for (const starter of [...missingStarterCases].reverse()) {
        added.unshift(await saveCaseInput(starter));
      }
      toast.success(`Added ${added.length} ${starterLabel} ${added.length === 1 ? 'case' : 'cases'}`);
    } catch (error) {
      toast.error(messageOf(error, 'Unable to add starter cases'));
    } finally {
      setCases(previous => [...added, ...previous]);
      if (!selectedId && !dirty && added.length > 0) applySelectedCase(added[0]);
      setBusy(null);
    }
  };

  const deleteCase = async () => {
    if (!selectedId || interactionLocked) return;
    setBusy('deleting');
    try {
      await deleteCaseById(selectedId);
      const remaining = cases.filter(item => item.id !== selectedId);
      setCases(remaining);
      if (remaining.length > 0) applySelectedCase(remaining[0]);
      else applyNewCase();
      toast.success('Evaluation case deleted');
    } catch (error) {
      toast.error(messageOf(error, 'Unable to delete evaluation case'));
    } finally {
      setBusy(null);
    }
  };

  const runEvaluation = async (forceRefresh: boolean) => {
    if (!selectedId || dirty || !valid || interactionLocked) return;
    const caseIdAtStart = selectedId;
    const requestGeneration = ++runGenerationRef.current;
    setCollapsed(true);
    setBusy('running');
    setDisplayedRun(null);
    try {
      const response = await runCase({ caseId: caseIdAtStart, forceRefresh });
      if (requestGeneration !== runGenerationRef.current || response.caseId !== caseIdAtStart) return;
      setDisplayedRun({ result: response, evaluationCase: form });
      toast.success('Model comparison complete');
    } catch (error) {
      if (requestGeneration === runGenerationRef.current) {
        toast.error(messageOf(error, 'Unable to run model comparison'));
      }
    } finally {
      // Nothing else can start while a run holds the lock, so it is always this run's to release.
      setBusy(null);
    }
  };

  return {
    cases,
    selectedId,
    form,
    collapsed,
    setCollapsed,
    displayedRun,
    loadingCases,
    busy,
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
      if (!interactionLocked) setForm(baseline);
    },
  };
}
