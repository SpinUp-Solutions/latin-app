import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { TestTakingView } from '@/src/components/ui/test/test-taking-view';
import { TestVersionPreview } from '@/src/components/ui/admin/test-version/TestVersionPreview';
import { advancedVocabularyApi } from '@/src/store/api/advancedVocabularyApi';
import type { Page } from '@/src/types/page';

const mockBaseQuery = jest.fn();
jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));

jest.mock('@/src/services/wordLookupService', () => ({}));
jest.mock('@/src/hooks/useTranslationGrading', () => ({ useTranslationGrading: () => ({}) }));
jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));

jest.mock('@/src/components/ui/lesson/page-template', () => ({
  PageTemplate: ({
    page,
    runtimeMode,
    answers,
    onAnswer,
    resolvedExerciseState,
  }: {
    page: Page;
    runtimeMode: string;
    answers?: Record<string, { type: string; selectedOptionIds?: string[] }>;
    onAnswer?: (event: {
      exerciseId: string;
      answer: { type: 'multiple-choice'; selectedOptionIds: string[] };
    }) => void;
    resolvedExerciseState?: Record<string, { items: unknown[] }>;
  }) => {
    const exerciseId = page.items[0]?.id;
    const restored = exerciseId ? answers?.[exerciseId]?.selectedOptionIds?.join(',') : undefined;
    return (
      <div>
        <span>
          {page.id}:{runtimeMode}
        </span>
        <span data-testid={`restored-${page.id}`}>{restored || 'empty'}</span>
        {exerciseId && (
          <span data-testid={`resolved-${exerciseId}`}>{resolvedExerciseState?.[exerciseId]?.items.length ?? 0}</span>
        )}
        {exerciseId && (
          <button
            onClick={() =>
              onAnswer?.({
                exerciseId,
                answer: { type: 'multiple-choice', selectedOptionIds: [`answer-${exerciseId}`] },
              })
            }>
            Answer {exerciseId}
          </button>
        )}
      </div>
    );
  },
}));

const multipleChoice = (id: string) => ({
  id,
  type: 'multiple-choice',
  title: id,
  instructions: '',
  feedbackConfig: { escalationLevels: [] },
  data: {
    question: `Question ${id}`,
    allowMultipleSelections: false,
    options: [{ id: `answer-${id}`, text: `Option ${id}`, isCorrect: true }],
  },
});

const pages = [
  { id: 'page-one', title: 'First page', items: [multipleChoice('question-one')] },
  { id: 'page-two', title: 'Second page', items: [multipleChoice('question-two')] },
] as unknown as Page[];

function renderPreview(previewPages: Page[]) {
  const store = configureStore({
    reducer: { [advancedVocabularyApi.reducerPath]: advancedVocabularyApi.reducer },
    middleware: get => get().concat(advancedVocabularyApi.middleware),
  });
  const view = (next: Page[]) => (
    <Provider store={store}>
      <TestVersionPreview title="Preview assessment" description="Preview description" pages={next} />
    </Provider>
  );
  const rendered = render(view(previewPages));
  return { ...rendered, rerenderPages: (next: Page[]) => rendered.rerender(view(next)) };
}

beforeEach(() => {
  mockBaseQuery.mockReset();
});

describe('shared Roman test-taking view', () => {
  it('renders one section of the student shell and delegates review', () => {
    const onReview = jest.fn();
    render(
      <TestTakingView
        title="Roman assessment"
        description="Assessment description"
        page={pages[0]}
        sectionIndex={0}
        totalSections={2}
        answeredCount={1}
        totalExercises={2}
        status="Answer saved."
        onReview={onReview}
      />
    );

    expect(screen.getByText('Roman assessment')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
    expect(screen.getByText('page-one:test')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page|previous page/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review section' }));
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Exit test' })).not.toBeInTheDocument();
  });

  it('exposes an Exit control when the student player provides one', () => {
    const onExit = jest.fn();
    render(
      <TestTakingView
        title="Roman assessment"
        page={pages[0]}
        sectionIndex={0}
        totalSections={2}
        answeredCount={0}
        totalExercises={2}
        status="Answer saved."
        onReview={jest.fn()}
        onExit={onExit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Exit test' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('admin test preview', () => {
  it('walks every section through review and confirmation like a student attempt', async () => {
    renderPreview(pages);

    expect(await screen.findByText('page-one:test')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 answered')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Answer question-one' }));
    expect(screen.getByText('1 of 1 answered')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review section' }));
    expect(screen.getByText('Review section')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Option question-one' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Return to section/ }));
    expect(screen.getByTestId('restored-page-one')).toHaveTextContent('answer-question-one');

    fireEvent.click(screen.getByRole('button', { name: 'Review section' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm section and continue/ }));
    expect(screen.getByText('page-two:test')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review section' }));
    const confirm = screen.getByRole('button', { name: /Confirm section and submit/ });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(confirm);

    expect(screen.getByText('End of the test preview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restart preview' }));
    expect(screen.getByText('page-one:test')).toBeInTheDocument();
    expect(screen.getByTestId('restored-page-one')).toHaveTextContent('empty');
    expect(mockBaseQuery).not.toHaveBeenCalled();
  });

  it('restarts from the first section when the authored pages change', async () => {
    const { rerenderPages } = renderPreview(pages);

    fireEvent.click(await screen.findByRole('button', { name: 'Answer question-one' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review section' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm section and continue/ }));
    expect(screen.getByText('page-two:test')).toBeInTheDocument();

    rerenderPages([{ ...pages[0], title: 'Updated first page' }, pages[1]]);

    await waitFor(() => expect(screen.getByText('page-one:test')).toBeInTheDocument());
    expect(screen.getByText('0 of 1 answered')).toBeInTheDocument();
    expect(screen.getByTestId('restored-page-one')).toHaveTextContent('empty');
    expect(screen.getByRole('status')).toHaveTextContent('Preview mode — answers are not saved.');
  });

  const generatedPages = [
    {
      id: 'generated-page',
      items: [
        {
          id: 'generated',
          type: 'generated-translation',
          title: 'Generated',
          instructions: '',
          feedbackConfig: { escalationLevels: [] },
          data: {
            generatorConfig: { collection: 'words', wordSource: 'filters', count: 1 },
            posConfigs: { verb: { enabled: true, filters: {} } },
          },
        },
      ],
    },
  ] as unknown as Page[];

  it('freezes generated questions before the preview starts, as a student delivery does', async () => {
    mockBaseQuery.mockResolvedValue({ data: { items: [{ text: 'amo', acceptedAnswers: ['love'] }] } });

    renderPreview(generatedPages);

    expect(screen.getByText('Preparing generated questions…')).toBeInTheDocument();
    expect(await screen.findByTestId('resolved-generated')).toHaveTextContent('1');
    expect(mockBaseQuery).toHaveBeenCalledTimes(1);
    expect(mockBaseQuery.mock.calls[0][0]).toMatchObject({
      url: '/admin/exercises/generated-preview',
      method: 'POST',
      body: { type: 'generated-translation', translationDirection: 'latin-to-english' },
    });
  });

  it('explains when a generated exercise cannot produce questions', async () => {
    mockBaseQuery.mockResolvedValue({ data: { items: [] } });

    renderPreview(generatedPages);

    expect(await screen.findByText(/could not produce questions/)).toBeInTheDocument();
    expect(screen.queryByTestId('test-taking-view')).not.toBeInTheDocument();
  });
});
