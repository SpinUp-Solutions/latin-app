import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SectionedTestPlayer } from '@/src/components/ui/test/sectioned-test-player';
import { createEmptySentenceDiagramDocument } from '@/src/features/sentence-diagramming';
import { useBufferedAttemptAnswers } from '@/src/hooks/useBufferedAttemptAnswers';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { StudentInProgressTestAttempt } from '@/src/types/test';

jest.mock('@/src/services/wordLookupService', () => ({}));
jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));
jest.mock('@/src/hooks/useTranslationGrading', () => ({ useTranslationGrading: () => ({}) }));

const mockSaveAnswers = jest.fn();
const mockSetPhase = jest.fn();
jest.mock('@/src/store/api/testApi', () => ({
  useSaveTestAttemptAnswersMutation: () => [mockSaveAnswers],
  useSetTestSectionPhaseMutation: () => [mockSetPhase],
  useConfirmTestSectionMutation: () => [jest.fn()],
  useLazyGetTestAttemptQuery: () => [jest.fn()],
}));

const diagramData = createEmptySentenceDiagramDocument('amat', 'he loves');
diagramData.availableStudentTools = ['verb'];
// Test deliveries never carry the answer key.
const { solutionAnnotations: _withheld, ...deliveredDiagramData } = diagramData;

/** A stand-in for the attempt API that keeps whatever the player saves. */
let server: { answers: Record<string, ExerciseAnswer>; revision: number };

function attemptAt(phase: 'answering' | 'review'): StudentInProgressTestAttempt {
  return {
    id: 'attempt',
    flowVersion: 1,
    status: 'in-progress',
    answers: { ...server.answers },
    section: { pageId: 'page-1', pageIndex: 0, totalPages: 1, revision: server.revision, phase },
    delivery: {
      versionId: 'version',
      pages: [
        {
          id: 'page-1',
          items: [
            {
              id: 'diagram',
              type: 'sentence-diagramming',
              title: 'Diagram',
              instructions: '',
              maxPoints: 1,
              data: deliveredDiagramData,
            },
          ],
        },
      ],
      resolvedExercises: {},
    },
    updatedAt: `revision-${server.revision}`,
  } as unknown as StudentInProgressTestAttempt;
}

function Harness() {
  const buffer = useBufferedAttemptAnswers();
  const [attempt, setAttempt] = useState(() => attemptAt('answering'));
  const [activated, setActivated] = useState(false);
  if (!activated) {
    setActivated(true);
    buffer.activateAttempt({
      attemptId: attempt.id,
      answers: attempt.answers,
      section: attempt.section,
      originKey: 'normal-test:test',
    });
  }
  return (
    <SectionedTestPlayer
      attempt={attempt}
      onAttempt={setAttempt}
      buffer={buffer}
      title="Test"
      uid="student"
      originKey="normal-test:test"
      onSubmitted={jest.fn()}
      onExit={jest.fn()}
    />
  );
}

function labelAmatAsVerb() {
  fireEvent.mouseUp(screen.getByText('amat').closest('[data-diagram-token-index]') as Element);
  fireEvent.click(screen.getByRole('button', { name: 'Finite Verb' }));
}

function labelsOnAmat() {
  fireEvent.mouseUp(screen.getByText('amat').closest('[data-diagram-token-index]') as Element);
  return within(screen.getByTestId('diagram-selection-summary')).queryByText('Finite Verb');
}

beforeEach(() => {
  jest.clearAllMocks();
  server = { answers: {}, revision: 0 };
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: jest.fn() });
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => '9f0c2f5e-4d5b-4a8e-9a55-3c3f2a1b7c10',
  });
  mockSaveAnswers.mockImplementation(
    ({ answers, section }: { answers: Record<string, ExerciseAnswer>; section: { expectedRevision: number } }) => ({
      unwrap: async () => {
        server.answers = { ...server.answers, ...answers };
        server.revision = section.expectedRevision + 1;
        return attemptAt('answering');
      },
    })
  );
  mockSetPhase.mockImplementation(
    ({ phase, expectedRevision }: { phase: 'answering' | 'review'; expectedRevision: number }) => ({
      unwrap: async () => {
        server.revision = expectedRevision + 1;
        return attemptAt(phase);
      },
    })
  );
});

it('keeps an unchecked diagram through Review section and back, still editable, without a Check button', async () => {
  render(<Harness />);

  expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument();
  expect(screen.getByText(/Diagram changes save automatically/)).toBeInTheDocument();
  labelAmatAsVerb();

  fireEvent.click(screen.getByRole('button', { name: /Review section/ }));
  await screen.findByRole('heading', { name: 'Review section' });

  expect(mockSaveAnswers).toHaveBeenCalledWith(
    expect.objectContaining({
      answers: { diagram: { type: 'sentence-diagramming', annotations: [expect.objectContaining({ kind: 'verb' })] } },
    })
  );
  expect(screen.queryByText('This exercise has unanswered parts.')).not.toBeInTheDocument();
  expect(labelsOnAmat()).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Return to section/ }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Review section' })).not.toBeInTheDocument());

  // The restored answer is not locked: the student can keep working on it.
  expect(labelsOnAmat()).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Finite Verb' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /Clear All/ }));
  expect(labelsOnAmat()).not.toBeInTheDocument();

  // Clearing is saved too, so the old labels do not come back from the server.
  await waitFor(
    () =>
      expect(mockSaveAnswers).toHaveBeenLastCalledWith(
        expect.objectContaining({ answers: { diagram: { type: 'sentence-diagramming', annotations: [] } } })
      ),
    { timeout: 3000 }
  );
});
