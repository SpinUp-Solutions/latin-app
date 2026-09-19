import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ContentRenderer from '@/src/components/ui/lesson/content-renderer';
import { SectionedTestProvider } from '@/src/components/ui/test/sectioned-test-context';
import type { Page } from '@/src/types/page';

jest.mock('@/src/services/wordLookupService', () => ({}));
jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));
jest.mock('@/src/hooks/useTranslationGrading', () => ({ useTranslationGrading: () => ({ grade: jest.fn() }) }));
jest.mock('@/src/store/api/advancedVocabularyApi', () => ({
  useGetGeneratedExerciseWordsQuery: () => ({}),
  useGetMultiPosWordsQuery: () => ({}),
  useGetMultiParadigmWordsQuery: () => ({}),
}));
const fixtures = [
  { type: 'fill', data: { items: [{ text: 'First' }, { text: 'Second' }] } },
  {
    type: 'fill-embolded-text',
    data: {
      passage: 'Puella cantat',
      words: [
        { wordIndex: 0, question: 'First' },
        { wordIndex: 1, question: 'Second' },
      ],
    },
  },
  { type: 'generated-translation', data: {}, resolved: [{ text: 'First' }, { text: 'Second' }] },
  {
    type: 'generated-form-identification',
    data: { mode: 'step-by-step' },
    resolved: [
      { id: 'word1', selected_form: 'First', hasSelectedForm: true, step: 'case' },
      { id: 'word2', selected_form: 'Second', hasSelectedForm: true, step: 'case' },
    ],
  },
];
it.each(fixtures)('records and advances $type in one action, completing once', fixture => {
  const complete = jest.fn();
  const answer = jest.fn();
  const content = {
    id: 'exercise',
    ...fixture,
    title: 'Exercise',
    instructions: '',
    feedbackConfig: { escalationLevels: [] },
  } as unknown as Page['items'][number];
  render(
    <SectionedTestProvider value>
      <ContentRenderer
        content={content}
        runtimeMode="test"
        onAnswer={answer}
        onComplete={complete}
        resolvedExerciseState={{ items: fixture.resolved ?? [] }}
      />
    </SectionedTestProvider>
  );
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'one' } });
  fireEvent.click(screen.getByRole('button', { name: /check/i }));
  expect(screen.getByText('Second')).toBeVisible();
  expect(screen.queryByRole('button', { name: /continue|finish exercise/i })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'two' } });
  fireEvent.click(screen.getByRole('button', { name: /check/i }));
  expect(answer).toHaveBeenCalledTimes(2);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(complete).toHaveBeenCalledWith(0);
});
it('advances text-selection directly and finishes once', () => {
  const complete = jest.fn();
  const answer = jest.fn();
  const content = {
    id: 'select',
    type: 'text-selection',
    title: 'Selection',
    instructions: '',
    feedbackConfig: { escalationLevels: [] },
    data: {
      passage: 'Puella cantat',
      questions: [
        { id: 'q1', text: 'First' },
        { id: 'q2', text: 'Second' },
      ],
    },
  } as unknown as Page['items'][number];
  render(
    <SectionedTestProvider value>
      <ContentRenderer content={content} runtimeMode="test" onAnswer={answer} onComplete={complete} />
    </SectionedTestProvider>
  );
  fireEvent.click(screen.getByText('Puella'));
  expect(screen.getByText('Second')).toBeVisible();
  fireEvent.click(screen.getByText('cantat'));
  expect(answer).toHaveBeenCalledTimes(2);
  expect(complete).toHaveBeenCalledTimes(1);
});
it('saves translation drafts and advances without calling an AI grading route', () => {
  const complete = jest.fn();
  const answer = jest.fn();
  const content = {
    id: 'translation',
    type: 'translation-grading',
    title: 'Translate',
    instructions: '',
    feedbackConfig: { escalationLevels: [] },
    data: { items: [{ latinText: 'First' }, { latinText: 'Second' }] },
  } as unknown as Page['items'][number];
  render(
    <SectionedTestProvider value>
      <ContentRenderer content={content} runtimeMode="test" onAnswer={answer} onComplete={complete} />
    </SectionedTestProvider>
  );
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'one' } });
  expect(answer).toHaveBeenLastCalledWith(
    expect.objectContaining({ answer: { type: 'translation-grading', translations: ['one', ''] } })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Record translation' }));
  expect(screen.getByText('Second')).toBeVisible();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'two' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record translation' }));
  expect(complete).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/translation feedback|score|\/10|continue/i)).not.toBeInTheDocument();
});
