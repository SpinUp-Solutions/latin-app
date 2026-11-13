import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VocabAutocompleteEvaluationsPage from '@/src/app/admin/(shell)/vocab-autocomplete-evaluations/page';
import { AdminSidebar } from '@/src/components/admin/shell/AdminSidebar';
import { getAdminBreadcrumbs } from '@/src/components/admin/shell';
import {
  listVocabularyEvaluationCasesInFirebase,
  runVocabularyEvaluationInFirebase,
  saveVocabularyEvaluationCaseInFirebase,
} from '@/src/lib/vocabulary-autocomplete-evaluations/firebase-client';
import type {
  VocabularyEvaluationCase,
  VocabularyEvaluationCell,
} from '@/src/lib/vocabulary-autocomplete-evaluations/contracts';
import { STARTER_VOCABULARY_EVALUATION_CASES } from '@/src/lib/vocabulary-autocomplete-evaluations/starter-cases';

const pathname = '/admin/vocab-autocomplete-evaluations';
const mockedList = jest.mocked(listVocabularyEvaluationCasesInFirebase);
const mockedSave = jest.mocked(saveVocabularyEvaluationCaseInFirebase);
const mockedRun = jest.mocked(runVocabularyEvaluationInFirebase);

jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/lib/vocabulary-autocomplete-evaluations/firebase-client', () => ({
  deleteVocabularyEvaluationCaseInFirebase: jest.fn(),
  listVocabularyEvaluationCasesInFirebase: jest.fn(),
  runVocabularyEvaluationInFirebase: jest.fn(),
  saveVocabularyEvaluationCaseInFirebase: jest.fn(),
}));
jest.mock('next/navigation', () => ({ usePathname: () => pathname }));
jest.mock('@/src/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: true }) }));
jest.mock('@/src/store/api/studentFeedbackApi', () => ({ useGetAdminFeedbackCountQuery: () => ({ data: undefined }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const saved = (
  input: VocabularyEvaluationCase['entries'],
  id = 'case-1',
  title = 'Verbs'
): VocabularyEvaluationCase => ({
  id,
  title,
  entries: input,
  createdAt: '2026-11-13T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2026-11-13T00:00:00.000Z',
  updatedBy: 'admin',
});

const cell = (
  profileId: 'baseline' | 'candidate',
  entryId: string,
  word: string,
  overrides: Partial<VocabularyEvaluationCell> = {}
): VocabularyEvaluationCell => ({
  entryId,
  word,
  partOfSpeech: 'verb',
  profileId,
  requestedModel: profileId === 'baseline' ? 'gpt-5.4-mini' : 'gpt-6.1-terra',
  actualModel: profileId === 'baseline' ? 'gpt-5.4-mini' : 'gpt-6.1-terra',
  reasoningEffort: profileId === 'baseline' ? 'low' : 'medium',
  maxOutputTokens: 32_000,
  generationLatencyMs: profileId === 'baseline' ? 30_000 : 60_000,
  appCacheHit: false,
  usage: { promptTokens: 2_000, completionTokens: 12_000, totalTokens: 14_000, reasoningTokens: 3_000 },
  cost: {
    inputCost: 0,
    outputCost: 0,
    totalCost: profileId === 'baseline' ? 0.05 : 0.1,
    tokens: { promptTokens: 2_000, completionTokens: 12_000, totalTokens: 14_000 },
  },
  ...overrides,
});

describe('vocab autocomplete evaluation admin page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([]);
  });

  it('sits after AI Evaluations in the admin navigation', () => {
    expect(getAdminBreadcrumbs(pathname)).toEqual(['Admin', 'Vocab Autocomplete Evaluation']);
    render(<AdminSidebar />);
    const links = screen.getAllByRole('link').map(link => link.getAttribute('href'));
    expect(links.indexOf(pathname)).toBe(links.indexOf('/admin/ai-evaluations') + 1);
  });

  it('offers starter cases that start with a verb', async () => {
    expect(STARTER_VOCABULARY_EVALUATION_CASES[0].entries[0].partOfSpeech).toBe('verb');
    mockedSave.mockImplementation(async input => saved(input.entries, `saved-${input.title}`, input.title));

    render(<VocabAutocompleteEvaluationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add starter cases' }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(STARTER_VOCABULARY_EVALUATION_CASES.length));
    expect(await screen.findByLabelText('Case title')).toHaveValue(STARTER_VOCABULARY_EVALUATION_CASES[0].title);
  });

  it('saves before running, then highlights differing forms and an out-of-tokens verb', async () => {
    const entries = [
      { id: 'amo', word: 'amō', partOfSpeech: 'verb' as const },
      { id: 'fero', word: 'ferō', partOfSpeech: 'verb' as const },
    ];
    mockedSave.mockResolvedValue(saved(entries));
    const amoBaseline = {
      translation: 'to love',
      principal_parts: [{ full_form: 'amō', shortened_form: 'amō' }],
      conjugation_table: { indicative: { active: { present: { singular: { second: ['amās'], third: ['amat'] } } } } },
    };
    const amoCandidate = {
      translation: 'to love, like',
      principal_parts: [{ full_form: 'amo', shortened_form: 'amo' }],
      conjugation_table: { indicative: { active: { present: { singular: { second: ['amāris'], third: ['amat'] } } } } },
    };
    mockedRun.mockResolvedValue({
      caseId: 'case-1',
      schemaVersion: 'vocabulary-autocomplete-evaluation-v1',
      forceRefresh: false,
      startedAt: '2026-11-13T00:00:00.000Z',
      completedAt: '2026-11-13T00:03:00.000Z',
      wallTimeMs: 180_000,
      cells: [
        cell('baseline', 'amo', 'amō', { output: amoBaseline }),
        cell('candidate', 'amo', 'amō', { output: amoCandidate }),
        cell('baseline', 'fero', 'ferō', { output: amoBaseline }),
        cell('candidate', 'fero', 'ferō', {
          error: 'OpenAI started the vocabulary JSON but did not finish it.',
          errorCode: 'token-budget',
          usage: { promptTokens: 2_000, completionTokens: 32_000, totalTokens: 34_000, reasoningTokens: 25_000 },
        }),
      ],
    });

    render(<VocabAutocompleteEvaluationsPage />);
    fireEvent.change(await screen.findByLabelText('Case title'), { target: { value: 'Verbs' } });
    fireEvent.change(screen.getByLabelText('Word'), { target: { value: 'amō' } });
    fireEvent.change(screen.getByLabelText('Part of speech'), { target: { value: 'verb' } });
    expect(screen.getByRole('button', { name: 'Run comparison' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save case' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run comparison' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Run comparison' }));

    expect(await screen.findByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(mockedRun).toHaveBeenCalledWith({ caseId: 'case-1', forceRefresh: false });

    const amoCard = screen.getByRole('heading', { name: 'amō' }).closest('div.space-y-4') as HTMLElement;
    expect(within(amoCard).getByText('1 difference')).toBeInTheDocument();
    const differing = amoCard.querySelectorAll('tr[data-agreement]');
    expect(Array.from(differing, row => row.getAttribute('data-agreement')).sort()).toEqual([
      'different',
      'macrons',
      'macrons',
    ]);
    expect(within(amoCard).getByText('amās')).toBeInTheDocument();
    expect(within(amoCard).getByText('amāris')).toBeInTheDocument();
    expect(within(amoCard).getByText('to love, like')).toBeInTheDocument();

    expect(screen.getByText('Ran out of output tokens')).toBeInTheDocument();
    expect(screen.getByText('1 ran out of tokens')).toBeInTheDocument();
    expect(screen.getByText(/Forms not compared: GPT-6.1 Terra returned no entry/)).toBeInTheDocument();
    expect(screen.getByText('32,000 / 32,000 · 100%')).toBeInTheDocument();
    expect(screen.getByText('2×', { exact: false })).toHaveTextContent('2× cheaper');
  });
});
