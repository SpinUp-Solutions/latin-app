import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AIEvaluationsPage from '@/src/app/admin/(shell)/ai-evaluations/page';
import { AdminSidebar } from '@/src/components/admin/shell/AdminSidebar';
import { getAdminBreadcrumbs } from '@/src/components/admin/shell';
import {
  deleteEvaluationCaseInFirebase,
  listEvaluationCasesInFirebase,
  runEvaluationInFirebase,
  saveEvaluationCaseInFirebase,
} from '@/src/lib/ai-evaluations/firebase-client';
import type { EvaluationCase, EvaluationCellResult, EvaluationRunResult } from '@/src/lib/ai-evaluations/contracts';

const mockedRunEvaluationInFirebase = jest.mocked(runEvaluationInFirebase);
const mockedListEvaluationCasesInFirebase = jest.mocked(listEvaluationCasesInFirebase);
const mockedSaveEvaluationCaseInFirebase = jest.mocked(saveEvaluationCaseInFirebase);
const mockedDeleteEvaluationCaseInFirebase = jest.mocked(deleteEvaluationCaseInFirebase);
const pathname = '/admin/ai-evaluations';

jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/lib/ai-evaluations/firebase-client', () => ({
  deleteEvaluationCaseInFirebase: jest.fn(),
  listEvaluationCasesInFirebase: jest.fn(),
  runEvaluationInFirebase: jest.fn(),
  saveEvaluationCaseInFirebase: jest.fn(),
}));
jest.mock('next/navigation', () => ({ usePathname: () => pathname }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe('AI evaluation admin workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRunEvaluationInFirebase.mockReset();
    mockedListEvaluationCasesInFirebase.mockReset();
    mockedListEvaluationCasesInFirebase.mockResolvedValue([]);
    mockedSaveEvaluationCaseInFirebase.mockReset();
    mockedDeleteEvaluationCaseInFirebase.mockReset();
  });

  it('keeps the workspace route labeled while marking its navigation entry as WIP', () => {
    expect(getAdminBreadcrumbs('/admin/ai-evaluations')).toEqual(['Admin', 'AI Evaluations']);
    render(<AdminSidebar />);
    const disabledItem = screen.getByText('AI Evaluations').closest('[aria-disabled="true"]');
    expect(disabledItem).toBeInTheDocument();
    expect(disabledItem).toHaveTextContent('WIP');
    expect(screen.queryByRole('link', { name: 'AI Evaluations' })).not.toBeInTheDocument();
  });

  it('asks before a load retry replaces edits made after the initial request failed', async () => {
    const savedCase = {
      id: 'case-from-retry',
      title: 'Loaded case',
      direction: 'latin-to-english',
      sourceText: 'Gallia est omnis divisa.',
      answers: [{ id: 'answer-loaded', label: 'Answer', text: 'All Gaul is divided.' }],
      createdAt: '2026-08-01T00:00:00.000Z',
      createdBy: 'admin',
      updatedAt: '2026-08-01T00:00:00.000Z',
      updatedBy: 'admin',
    } as EvaluationCase;
    mockedListEvaluationCasesInFirebase
      .mockRejectedValueOnce(new Error('Unable to load cases'))
      .mockResolvedValueOnce([savedCase]);

    render(<AIEvaluationsPage />);
    const title = await screen.findByLabelText('Case title');
    fireEvent.change(title, { target: { value: 'Unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Leave without saving?');
    expect(mockedListEvaluationCasesInFirebase).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));

    await waitFor(() => expect(mockedListEvaluationCasesInFirebase).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('Case title')).toHaveValue('Loaded case');
  });

  it('saves a case before enabling a comparison and renders both model cells', async () => {
    const savedCase = {
      id: 'case-1',
      title: 'Cicero case',
      direction: 'latin-to-english',
      sourceText: 'Si quid est in me ingeni.',
      answers: [{ id: 'answer-1', label: 'Student A', text: 'If there is talent in me.' }],
      createdAt: '2026-08-01T00:00:00.000Z',
      createdBy: 'admin',
      updatedAt: '2026-08-01T00:00:00.000Z',
      updatedBy: 'admin',
    };
    const cell = (modelKey: 'baseline' | 'candidate', model: string, grade: 'A' | 'A-'): EvaluationCellResult => ({
      answerId: 'answer-1',
      answerLabel: 'Student A',
      modelKey,
      requestedModel: model,
      actualModel: model,
      reasoningEffort: modelKey === 'baseline' ? 'low' : 'high',
      output: {
        grade,
        notes: 'Good work.',
        suggestedText: 'If there is any talent in me.',
        breakdown: [],
        grammaticalBreakdown: [],
      },
      latencyMs: 120,
      generationLatencyMs: 120,
      cacheStatus: 'fresh-api',
      appCacheHit: false,
      openAIPromptCacheHit: false,
      coalescedDuplicate: false,
      duplicateWithinRun: false,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      originalCostStatus: 'measured',
      originalCost: {
        inputCost: 0.00001,
        outputCost: 0.00002,
        totalCost: 0.00003,
        tokens: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      },
      costIncurredThisRunStatus: 'measured',
      costIncurredThisRun: {
        inputCost: 0.00001,
        outputCost: 0.00002,
        totalCost: 0.00003,
        tokens: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      },
    });
    const runResult: EvaluationRunResult = {
      caseId: 'case-1',
      schemaVersion: 'ai-translation-evaluation-v1',
      forceRefresh: false,
      startedAt: '2026-08-01T00:00:00.000Z',
      completedAt: '2026-08-01T00:00:00.500Z',
      aggregate: {
        cellCount: 2,
        evaluatedCellCount: 2,
        failedCellCount: 0,
        appCacheHits: 0,
        openAIPromptCacheHits: 0,
        wallTimeMs: 500,
        generationTimeMs: 240,
        providerTimeThisRunMs: 240,
        originalCostStatus: 'measured',
        originalCost: {
          inputCost: 0.00002,
          outputCost: 0.00004,
          totalCost: 0.00006,
          tokens: { promptTokens: 20, completionTokens: 40, totalTokens: 60 },
        },
        costIncurredThisRunStatus: 'measured',
        costIncurredThisRun: {
          inputCost: 0.00002,
          outputCost: 0.00004,
          totalCost: 0.00006,
          tokens: { promptTokens: 20, completionTokens: 40, totalTokens: 60 },
        },
        usage: { promptTokens: 20, completionTokens: 40, totalTokens: 60 },
        usageStatus: 'measured',
        usageIncurredThisRun: { promptTokens: 20, completionTokens: 40, totalTokens: 60 },
        usageIncurredThisRunStatus: 'measured',
        unknownOriginalCostCells: 0,
        unknownIncurredCostCells: 0,
      },
      cells: [cell('baseline', 'gpt-5.4-mini', 'A'), cell('candidate', 'gpt-5.6-luna', 'A-')],
    };
    mockedSaveEvaluationCaseInFirebase.mockResolvedValue(savedCase as never);
    mockedRunEvaluationInFirebase.mockResolvedValue(runResult);

    render(<AIEvaluationsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save case' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Case title'), { target: { value: savedCase.title } });
    fireEvent.change(screen.getByLabelText('Source text'), { target: { value: savedCase.sourceText } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Student A' } });
    fireEvent.change(screen.getByLabelText('Student answer'), { target: { value: savedCase.answers[0].text } });

    expect(screen.getByRole('button', { name: 'Test models' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save case' }));
    await waitFor(() =>
      expect(mockedSaveEvaluationCaseInFirebase).toHaveBeenCalledWith(
        expect.objectContaining({
          title: savedCase.title,
          answers: [expect.objectContaining({ text: savedCase.answers[0].text })],
        }),
        undefined
      )
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test models' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Test models' }));
    await waitFor(() =>
      expect(mockedRunEvaluationInFirebase).toHaveBeenCalledWith({ caseId: 'case-1', forceRefresh: false })
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument());
    expect(screen.getAllByText('GPT-5.4 Mini · Low').length).toBeGreaterThan(0);
    expect(screen.getAllByText('GPT-5.6 Luna · High').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Good work.')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Cicero case/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Immutable run snapshot')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Source text'), { target: { value: 'Changed after the run.' } });
    expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeInTheDocument();
  });

  it('locks conflicting editor and case actions while a save is pending', async () => {
    const savedCase = {
      id: 'case-save',
      title: 'Saved case',
      direction: 'latin-to-english',
      sourceText: 'Gallia est omnis divisa.',
      answers: [{ id: 'answer-save', label: 'Answer', text: 'All Gaul is divided.' }],
      createdAt: '2026-08-01T00:00:00.000Z',
      createdBy: 'admin',
      updatedAt: '2026-08-01T00:00:00.000Z',
      updatedBy: 'admin',
    };
    let resolveSave: ((value: EvaluationCase) => void) | undefined;
    const deferredSave = new Promise<EvaluationCase>(resolve => {
      resolveSave = resolve;
    });
    mockedListEvaluationCasesInFirebase.mockResolvedValue([savedCase as EvaluationCase]);
    mockedSaveEvaluationCaseInFirebase.mockReturnValue(deferredSave);

    render(<AIEvaluationsPage />);
    const title = await screen.findByLabelText('Case title');
    fireEvent.change(title, { target: { value: 'Updated case' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save case' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'New case' })).toBeDisabled());
    expect(title).toBeDisabled();
    expect(screen.getByRole('button', { name: /Saved case/ })).toBeDisabled();

    resolveSave?.({ ...savedCase, title: 'Updated case' } as EvaluationCase);
    await waitFor(() => expect(title).toHaveValue('Updated case'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New case' })).toBeEnabled());
  });

  it('ignores a deferred response when the local run generation no longer matches', async () => {
    const savedCase = {
      id: 'case-race',
      title: 'Race case',
      direction: 'latin-to-english',
      sourceText: 'Gallia est omnis divisa.',
      answers: [{ id: 'answer-race', label: 'Answer', text: 'All Gaul is divided.' }],
      createdAt: '2026-08-01T00:00:00.000Z',
      createdBy: 'admin',
      updatedAt: '2026-08-01T00:00:00.000Z',
      updatedBy: 'admin',
    };
    let resolveRun: ((value: EvaluationRunResult) => void) | undefined;
    const deferredRun = new Promise<EvaluationRunResult>(resolve => {
      resolveRun = resolve;
    });
    const staleResult: EvaluationRunResult = {
      caseId: 'different-case',
      schemaVersion: 'ai-translation-evaluation-v1',
      forceRefresh: false,
      startedAt: '2026-08-01T00:00:00.000Z',
      completedAt: '2026-08-01T00:00:00.100Z',
      aggregate: {
        cellCount: 0,
        evaluatedCellCount: 0,
        failedCellCount: 0,
        appCacheHits: 0,
        openAIPromptCacheHits: 0,
        wallTimeMs: 100,
        generationTimeMs: 0,
        providerTimeThisRunMs: 0,
        originalCostStatus: 'measured',
        costIncurredThisRunStatus: 'measured',
        usageStatus: 'measured',
        unknownOriginalCostCells: 0,
        unknownIncurredCostCells: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        usageIncurredThisRun: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        usageIncurredThisRunStatus: 'measured',
      },
      cells: [],
    };
    mockedListEvaluationCasesInFirebase.mockResolvedValue([savedCase as EvaluationCase]);
    mockedRunEvaluationInFirebase.mockReturnValue(deferredRun);

    render(<AIEvaluationsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test models' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Test models' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Running models/ })).toBeDisabled());

    // A response for a different saved case represents a deferred navigation
    // race. The response must not be applied to the current editor.
    resolveRun?.(staleResult);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeInTheDocument());
  });
});
