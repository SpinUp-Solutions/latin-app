import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SectionedTestPlayer } from '@/src/components/ui/test/sectioned-test-player';
import type { StudentInProgressTestAttempt } from '@/src/types/test';

const refresh = jest.fn();
const mockConfirm = jest.fn();
jest.mock('@/src/store/api/testApi', () => ({
  useConfirmTestSectionMutation: () => [mockConfirm],
  useSetTestSectionPhaseMutation: () => [jest.fn()],
  useLazyGetTestAttemptQuery: () => [refresh],
}));
jest.mock('@/src/components/ui/test/test-taking-view', () => ({ TestTakingView: () => <p>Answering</p> }));
jest.mock('@/src/components/ui/test/section-answer-review', () => ({
  SectionAnswerReview: ({ delivery }: { delivery: { pages: { id: string }[] } }) => (
    <p data-testid={`review-${delivery.pages[0].id}`}>Section prompts</p>
  ),
}));
const initial = {
  id: 'attempt',
  flowVersion: 1,
  status: 'in-progress',
  answers: {},
  section: { pageId: 'page-1', pageIndex: 0, totalPages: 2, revision: 1, phase: 'review' },
  delivery: { versionId: 'version', pages: [{ id: 'page-1', items: [] }], resolvedExercises: {} },
} as unknown as StudentInProgressTestAttempt;
const onSubmitted = jest.fn();
const reset = jest.fn();
function Harness() {
  const [attempt, setAttempt] = useState<StudentInProgressTestAttempt>(initial);
  const buffer = {
    answers: { answer: { type: 'fill', answers: ['Remember my unsaved text'] } },
    conflict: true,
    saveStatus: 'error',
    getSectionRevision: () => 1,
    activateAttempt: jest.fn(),
    reset,
  } as unknown as React.ComponentProps<typeof SectionedTestPlayer>['buffer'];
  return (
    <SectionedTestPlayer
      attempt={attempt as StudentInProgressTestAttempt}
      onAttempt={setAttempt}
      buffer={buffer}
      title="Test"
      uid="student"
      originKey="normal-test:test"
      onSubmitted={onSubmitted}
      onExit={jest.fn()}
    />
  );
}
beforeEach(() => jest.clearAllMocks());
it('keeps unsaved text without redisplaying a section confirmed in another tab', async () => {
  refresh.mockReturnValue({
    unwrap: async () => ({
      ...initial,
      section: { ...initial.section, pageId: 'page-2', pageIndex: 1, revision: 0 },
      delivery: { ...initial.delivery, pages: [{ id: 'page-2', items: [] }] },
    }),
  });
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved answers' }));
  await waitFor(() => expect(screen.getByTestId('review-page-2')).toBeInTheDocument());
  expect(screen.queryByTestId('review-page-1')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Text from your unsaved answers')).toHaveValue('Remember my unsaved text');
});
it('retains a conflicting draft when refresh finds an already-submitted result', async () => {
  const submitted = { id: 'attempt', status: 'submitted' };
  refresh.mockReturnValue({ unwrap: async () => submitted });
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved answers' }));
  await screen.findByRole('heading', { name: 'This attempt has been submitted' });
  expect(screen.queryByTestId('review-page-1')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Text from your unsaved answers')).toHaveValue('Remember my unsaved text');
  expect(onSubmitted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View submitted result' }));
  expect(reset).toHaveBeenCalledTimes(1);
  expect(onSubmitted).toHaveBeenCalledWith(submitted);
});

it('resumes an interrupted confirmation once, without asking for the acknowledgement again', async () => {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => '9f0c2f5e-4d5b-4a8e-9a55-3c3f2a1b7c10',
  });
  const confirming = {
    ...initial,
    section: { ...initial.section, phase: 'confirming' },
  } as unknown as StudentInProgressTestAttempt;
  mockConfirm.mockReturnValue({
    unwrap: async () => ({
      attempt: { ...confirming, section: { ...confirming.section, phase: 'review' } },
      pending: false,
    }),
  });
  const buffer = {
    answers: {},
    conflict: false,
    saveStatus: 'saved',
    getSectionRevision: () => 1,
    activateAttempt: jest.fn(),
    flushPendingAnswers: async () => undefined,
    hasUnsavedAnswers: () => false,
    reset,
  } as unknown as React.ComponentProps<typeof SectionedTestPlayer>['buffer'];
  function ResumeHarness() {
    const [attempt, setAttempt] = useState(confirming);
    return (
      <SectionedTestPlayer
        attempt={attempt}
        onAttempt={setAttempt}
        buffer={buffer}
        title="Test"
        uid="student"
        originKey="normal-test:test"
        onSubmitted={onSubmitted}
        onExit={jest.fn()}
      />
    );
  }

  render(<ResumeHarness />);

  await waitFor(() => expect(buffer.activateAttempt).toHaveBeenCalledTimes(1));
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ pageId: 'page-1', expectedRevision: 1, acknowledgeIncomplete: true })
  );
});
