import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ContentRenderer from '@/src/components/ui/lesson/content-renderer';
import { TestTranslationGradingProvider } from '@/src/components/ui/test/test-translation-grading-context';
import { sanitizeTestDeliveryState, type FrozenTestDeliveryState } from '@/src/lib/tests/delivery';
import type { ContentItem } from '@/src/types/lesson';
import type { TestTranslationGradeHandler } from '@/src/types/runtime-mode';
import type { TestTranslationGrades } from '@/src/types/test';
import type {
  FillExercise,
  GeneratedFormIdentificationExercise,
  GeneratedTranslationExercise,
  MatchingExercise,
  MultipleChoiceExercise,
  SentenceDiagrammingExercise,
  TranslationGradingExercise,
} from '@/src/types/exercises';
import { createAnnotationId, createEmptySentenceDiagramDocument } from '@/src/features/sentence-diagramming';

jest.mock('@/src/store/api/advancedVocabularyApi', () => ({
  useGetMultiPosWordsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useGetMultiParadigmWordsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));
jest.mock('@/src/services/wordLookupService', () => ({}));
jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));
jest.mock('@/src/hooks/useTranslationGrading', () => ({ useTranslationGrading: () => ({}) }));

const feedbackConfig = { escalationLevels: [] };

const sanitizeExercise = (
  exercise:
    | FillExercise
    | GeneratedTranslationExercise
    | GeneratedFormIdentificationExercise
    | MatchingExercise
    | MultipleChoiceExercise
    | SentenceDiagrammingExercise
    | TranslationGradingExercise
) => {
  const state: FrozenTestDeliveryState = {
    versionId: 'version',
    pages: [{ id: 'page', items: [exercise] }],
    resolvedExercises: {},
  };
  return { state, content: sanitizeTestDeliveryState(state).pages[0] as { items: ContentItem[] } };
};

describe('sanitized test delivery rendering', () => {
  it('records a static exercise answer without shipping or invoking its answer key', () => {
    const exercise: FillExercise = {
      id: 'fill',
      type: 'fill',
      title: 'Fill',
      instructions: '',
      maxPoints: 1,
      feedbackConfig,
      data: { items: [{ text: 'Question', answer: 'secret' }] },
    };
    const { content } = sanitizeExercise(exercise);
    const onAnswer = jest.fn();

    render(<ContentRenderer content={content.items[0]} runtimeMode="test" onAnswer={onAnswer} />);
    fireEvent.change(screen.getByPlaceholderText('Type your answer'), { target: { value: 'response' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByText('Answer recorded.')).toBeInTheDocument();
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ answer: { type: 'fill', answers: ['response'] } }));
  });

  it('restores the authenticated student committed answer when an attempt resumes', () => {
    const exercise: FillExercise = {
      id: 'fill',
      type: 'fill',
      title: 'Fill',
      instructions: '',
      maxPoints: 1,
      feedbackConfig,
      data: { items: [{ text: 'Question', answer: 'secret' }] },
    };
    const { content } = sanitizeExercise(exercise);

    render(
      <ContentRenderer
        content={content.items[0]}
        runtimeMode="test"
        initialAnswer={{ type: 'fill', answers: ['saved response'] }}
      />
    );

    expect(screen.getByDisplayValue('saved response')).toBeInTheDocument();
    expect(screen.getByText('Answer recorded.')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('uses the public match count when the sanitized delivery contains an unmapped left item', () => {
    const exercise: MatchingExercise = {
      id: 'matching',
      type: 'matching',
      title: 'Matching',
      instructions: '',
      maxPoints: 1,
      feedbackConfig,
      data: {
        leftColumn: [
          { id: 'left', value: 'Alpha' },
          { id: 'distractor', value: 'Distractor' },
        ],
        rightColumn: [{ id: 'right', value: 'One' }],
        answers: { left: 'right' },
      },
    };
    const { content } = sanitizeExercise(exercise);
    const onAnswer = jest.fn();
    const onComplete = jest.fn();
    const sanitized = content.items[0] as MatchingExercise;

    expect(sanitized.data.answers).toBeUndefined();
    expect(sanitized.data.expectedMatchCount).toBe(1);

    render(<ContentRenderer content={sanitized} runtimeMode="test" onAnswer={onAnswer} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'One' }));

    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ answer: { type: 'matching', rounds: [{ left: 'right' }] } })
    );
    expect(onComplete).toHaveBeenCalledWith(0);
  });

  it('preserves multi-select behavior after stripping multiple-choice answer flags', () => {
    const exercise: MultipleChoiceExercise = {
      id: 'multiple-choice',
      type: 'multiple-choice',
      title: 'Select both',
      instructions: '',
      maxPoints: 1,
      feedbackConfig,
      data: {
        question: 'Which two?',
        allowMultipleSelections: false,
        options: [
          { id: 'a', text: 'Alpha', isCorrect: true },
          { id: 'b', text: 'Beta', isCorrect: true },
          { id: 'c', text: 'Gamma', isCorrect: false },
        ],
      },
    };
    const { content } = sanitizeExercise(exercise);
    const sanitized = content.items[0] as MultipleChoiceExercise;
    const onAnswer = jest.fn();

    expect(sanitized.data.allowMultipleSelections).toBe(true);
    expect(sanitized.data.options.every(option => option.isCorrect === undefined)).toBe(true);

    render(<ContentRenderer content={sanitized} runtimeMode="test" onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));

    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: { type: 'multiple-choice', selectedOptionIds: ['a', 'b'] },
      })
    );
  });

  it('renders and records sanitized generated translation items', () => {
    const exercise: GeneratedTranslationExercise = {
      id: 'translation',
      type: 'generated-translation',
      title: 'Translation',
      instructions: '',
      maxPoints: 1,
      feedbackConfig,
      data: {
        generatorConfig: { collection: 'words', wordSource: 'filters', count: 1 },
        posConfigs: {},
      },
    };
    const { state, content } = sanitizeExercise(exercise);
    state.resolvedExercises.translation = {
      items: [{ text: 'amo', acceptedAnswers: ['love'], hint: 'secret hint' }],
    };
    const resolvedItems = sanitizeTestDeliveryState(state).resolvedExercises.translation;

    render(<ContentRenderer content={content.items[0]} runtimeMode="test" resolvedExerciseState={resolvedItems} />);
    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), { target: { value: 'response' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByText('Answer recorded.')).toBeInTheDocument();
  });

  it('grades AI translations immediately and shows compact test feedback', async () => {
    const exercise: TranslationGradingExercise = {
      id: 'ai-translation',
      type: 'translation-grading',
      title: 'Translate the sentence',
      instructions: '',
      maxPoints: 5,
      feedbackConfig,
      translationDirection: 'latin-to-english',
      data: { items: [{ latinText: 'Puella cantat.' }] },
    };
    const { content } = sanitizeExercise(exercise);
    const onAnswer = jest.fn();
    const onGradeTestTranslation = jest.fn(async (_event: Parameters<TestTranslationGradeHandler>[0]) => ({
      score: 8.5,
      feedback: 'Accurate overall; check the tense.',
    }));

    function TestTranslationHarness() {
      const [grades, setGrades] = React.useState<TestTranslationGrades>({});
      const grade: TestTranslationGradeHandler = async event => {
        const result = await onGradeTestTranslation(event);
        setGrades(previous => ({
          ...previous,
          [event.exerciseId]: {
            ...previous[event.exerciseId],
            [String(event.itemIndex)]: { translation: event.userTranslation, ...result },
          },
        }));
      };

      return (
        <TestTranslationGradingProvider value={{ grades, grade }}>
          <ContentRenderer content={content.items[0]} runtimeMode="test" onAnswer={onAnswer} />
        </TestTranslationGradingProvider>
      );
    }

    render(<TestTranslationHarness />);
    fireEvent.change(screen.getByPlaceholderText('Type your English translation...'), {
      target: { value: 'The girl sings.' },
    });
    fireEvent.click(screen.getByTitle('Check Translation'));

    expect(await screen.findByText('8.5/10')).toBeInTheDocument();
    expect(screen.getByText('Accurate overall; check the tense.')).toBeInTheDocument();
    expect(onGradeTestTranslation).toHaveBeenCalledWith({
      exerciseId: 'ai-translation',
      itemIndex: 0,
      userTranslation: 'The girl sings.',
    });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByText('Suggested Translation')).not.toBeInTheDocument();
  });

  it('does not silently record an ungraded translation in test preview', () => {
    const exercise: TranslationGradingExercise = {
      id: 'ai-translation-preview',
      type: 'translation-grading',
      title: 'Translate the sentence',
      instructions: '',
      maxPoints: 5,
      feedbackConfig,
      data: { items: [{ latinText: 'Puella cantat.' }] },
    };
    const { content } = sanitizeExercise(exercise);
    const onAnswer = jest.fn();

    render(<ContentRenderer content={content.items[0]} runtimeMode="test" onAnswer={onAnswer} />);
    fireEvent.change(screen.getByPlaceholderText('Type your English translation...'), {
      target: { value: 'The girl sings.' },
    });

    expect(screen.getByTitle('Check Translation')).toBeDisabled();
    expect(screen.getByText(/live ai grading is available in a student test attempt/i)).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('renders and records sanitized generated morphology items', () => {
    const exercise: GeneratedFormIdentificationExercise = {
      id: 'morphology',
      type: 'generated-form-identification',
      title: 'Morphology',
      instructions: '',
      maxPoints: 1,
      feedbackConfig,
      data: {
        mode: 'single-field',
        generatorConfig: { collection: 'words', wordSource: 'filters', count: 1 },
        paradigmConfigs: {},
      },
    };
    const { state, content } = sanitizeExercise(exercise);
    state.resolvedExercises.morphology = {
      items: [
        {
          id: 'word',
          wordId: 'word',
          word: 'amamus',
          root_word: 'amo',
          dictionary_entry: 'amo, amare',
          selected_form: 'amamus',
          hasSelectedForm: true,
          steps: ['person', 'number'],
          correctAnswerDisplay: 'first,plural',
          primaryFormPaths: [{ person: 'first', number: 'plural' }],
          optionalFormPaths: [],
        },
      ],
    };
    const resolvedItems = sanitizeTestDeliveryState(state).resolvedExercises.morphology;
    const onComplete = jest.fn();

    render(
      <ContentRenderer
        content={content.items[0]}
        runtimeMode="test"
        resolvedExerciseState={resolvedItems}
        onComplete={onComplete}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/e.g., value,value/i), { target: { value: 'response' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByText('Answer recorded.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish exercise' }));
    expect(onComplete).toHaveBeenCalledWith(0);
  });

  it('emits a raw-only sentence-diagram audit event in test mode', () => {
    const data = createEmptySentenceDiagramDocument('amat', 'he loves');
    const span = {
      startTokenIndex: 0,
      endTokenIndex: 0,
      startCharOffset: 0,
      endCharOffset: 4,
    };
    data.availableStudentTools = ['verb'];
    data.solutionAnnotations = [{ id: createAnnotationId('verb', span), kind: 'verb', span }];
    const exercise: SentenceDiagrammingExercise = {
      id: 'diagram',
      type: 'sentence-diagramming',
      title: 'Diagram',
      instructions: '',
      maxPoints: 1,
      feedbackConfig,
      data,
    };
    const { content } = sanitizeExercise(exercise);
    const sanitized = content.items[0] as SentenceDiagrammingExercise;
    const onAnswer = jest.fn();
    const onComplete = jest.fn();
    const onDiagrammingAttempt = jest.fn();

    expect(sanitized.data.solutionAnnotations).toBeUndefined();
    render(
      <ContentRenderer
        content={sanitized}
        runtimeMode="test"
        onAnswer={onAnswer}
        onComplete={onComplete}
        onDiagrammingAttempt={onDiagrammingAttempt}
      />
    );

    const token = screen.getByText('amat').closest('[data-diagram-token-index]');
    expect(token).not.toBeNull();
    fireEvent.mouseUp(token as Element);
    fireEvent.click(screen.getByRole('button', { name: 'Finite Verb' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(onDiagrammingAttempt).toHaveBeenCalledTimes(1);
    const auditPayload = onDiagrammingAttempt.mock.calls[0][0];
    expect(Object.keys(auditPayload)).toEqual(['studentAnnotations']);
    expect(auditPayload.studentAnnotations).toEqual([{ id: createAnnotationId('verb', span), kind: 'verb', span }]);
    expect(auditPayload).not.toHaveProperty('solutionAnnotations');
    expect(auditPayload).not.toHaveProperty('comparison');
    expect(auditPayload).not.toHaveProperty('tokens');
    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        exerciseId: 'diagram',
        answer: { type: 'sentence-diagramming', annotations: auditPayload.studentAnnotations },
      })
    );
    expect(onComplete).toHaveBeenCalledWith(0);
  });
});
