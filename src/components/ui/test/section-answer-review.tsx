'use client';

import React from 'react';
import { z } from 'zod';
import type { Exercise } from '@/src/types/exercises';
import type { ExerciseAnswer, ExerciseAnswerEvent } from '@/src/types/runtime-mode';
import type { StudentTestDelivery } from '@/src/types/test';
import { isExerciseType, getContentTypeLabel } from '@/src/lib/content/registry';
import { isExerciseAnswerComplete } from '@/src/lib/tests/answer-completion';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import ContentRenderer from '@/src/components/ui/lesson/content-renderer';
import { SentenceDiagramStudent } from '@/src/features/sentence-diagramming/SentenceDiagramStudent';
import { TEST_RUNTIME_FEEDBACK_CONFIG } from '@/src/types/runtime-mode';
import { splitHtmlIntoWords } from '@/src/utils/htmlWordSplitter';
import { richTextToPlainText, stripHtmlTags } from '@/src/utils/exercises/helpers';
import { formatLabel } from '@/src/utils/label-formatter';

const generatedPromptSchema = z.object({
  id: z.string().optional(),
  text: z.string().optional(),
  selected_form: z.string().optional(),
  dictionary_entry: z.string().optional(),
  root_word: z.string().optional(),
  hasSelectedForm: z.boolean().optional(),
  step: z.string().optional(),
  steps: z.array(z.string()).optional(),
  expectedAnswerCount: z.number().optional(),
});
const Rich = ({ text }: { text?: string }) => (text ? <SimpleRichDisplay content={text} /> : null);
const patchArray = <T,>(values: T[], index: number, value: T, empty: T): T[] =>
  Array.from({ length: Math.max(values.length, index + 1) }, (_, i) => (i === index ? value : (values[i] ?? empty)));

function AnswerField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <Textarea id={id} value={value} onChange={event => onChange(event.target.value)} />
      ) : (
        <Input id={id} value={value} onChange={event => onChange(event.target.value)} />
      )}
      {!value.trim() && <p className="text-xs text-amber-800">Unanswered</p>}
    </div>
  );
}

/** Only prompts and student values. This component never accepts a result review. */
function ExerciseAnswers({
  exercise,
  answer,
  resolved,
  onChange,
}: {
  exercise: Exercise;
  answer?: ExerciseAnswer;
  resolved: unknown[];
  onChange: (answer: ExerciseAnswer) => void;
}) {
  switch (exercise.type) {
    case 'fill':
    case 'fill-embolded-text':
    case 'generated-translation': {
      const values = answer && 'answers' in answer && Array.isArray(answer.answers) ? answer.answers : [];
      const prompts =
        exercise.type === 'fill'
          ? exercise.data.items.map(item => item.text)
          : exercise.type === 'fill-embolded-text'
            ? exercise.data.words.map(item => item.question)
            : resolved.map(item => generatedPromptSchema.parse(item).text ?? '');
      return (
        <>
          {exercise.type === 'fill-embolded-text' && <Rich text={exercise.data.passage} />}
          {prompts.map((prompt, index) => (
            <AnswerField
              key={index}
              label={
                <>
                  <span>{index + 1}. </span>
                  {exercise.type === 'fill-embolded-text' && (
                    <Rich text={splitHtmlIntoWords(exercise.data.passage)[exercise.data.words[index].wordIndex]} />
                  )}
                  <Rich text={prompt} />
                </>
              }
              value={values[index] ?? ''}
              onChange={value => onChange({ type: exercise.type, answers: patchArray(values, index, value, '') })}
            />
          ))}
        </>
      );
    }
    case 'translation-grading': {
      const values = answer?.type === 'translation-grading' ? answer.translations : [];
      return (
        <>
          {exercise.data.items.map((item, index) => (
            <div key={index} className="space-y-2">
              <Rich text={item.instructions} />
              <AnswerField
                multiline
                label={
                  <>
                    <span>{index + 1}. </span>
                    <Rich text={item.latinText} />
                  </>
                }
                value={values[index] ?? ''}
                onChange={value =>
                  onChange({ type: 'translation-grading', translations: patchArray(values, index, value, '') })
                }
              />
            </div>
          ))}
        </>
      );
    }
    case 'generated-form-identification': {
      const values = answer?.type === 'generated-form-identification' ? answer.answers : {};
      return (
        <>
          {resolved.map(raw => {
            const item = generatedPromptSchema.parse(raw);
            const id = item.id!;
            return (
              <div key={id} className="space-y-2">
                <Rich text={item.hasSelectedForm ? item.selected_form : item.dictionary_entry || item.selected_form} />
                {exercise.data.showDictionaryEntry && item.hasSelectedForm && (
                  <Rich text={item.dictionary_entry || item.root_word} />
                )}
                <AnswerField
                  label={`Identify ${item.steps && exercise.data.mode === 'single-field' ? item.steps.map(formatLabel).join(', ') : formatLabel(item.step ?? '')}`}
                  value={values[id] ?? ''}
                  onChange={value =>
                    onChange({ type: 'generated-form-identification', answers: { ...values, [id]: value } })
                  }
                />
                <p className="text-xs text-roman-stone">
                  {exercise.data.mode === 'single-field' ? 'Separate fields with commas. ' : ''}
                  {(item.expectedAnswerCount ?? 1) > 1
                    ? `Enter ${item.expectedAnswerCount} answers separated by semicolons.`
                    : ''}
                </p>
              </div>
            );
          })}
        </>
      );
    }
    case 'multiple-choice': {
      const selected = answer?.type === 'multiple-choice' ? answer.selectedOptionIds : [];
      return (
        <>
          <Rich text={exercise.data.question} />
          {exercise.data.options.map(option => (
            <label key={option.id} className="flex items-start gap-3 rounded-lg border p-3">
              <input
                type={exercise.data.allowMultipleSelections ? 'checkbox' : 'radio'}
                name={exercise.id}
                checked={selected.includes(option.id)}
                onChange={() =>
                  onChange({
                    type: 'multiple-choice',
                    selectedOptionIds: exercise.data.allowMultipleSelections
                      ? selected.includes(option.id)
                        ? selected.filter(id => id !== option.id)
                        : [...selected, option.id]
                      : [option.id],
                  })
                }
              />
              <Rich text={option.text} />
            </label>
          ))}
        </>
      );
    }
    case 'odd-one-out': {
      const current =
        answer?.type === 'odd-one-out' ? answer : { type: 'odd-one-out' as const, selectedItemId: '', explanation: '' };
      return (
        <>
          <Rich text={exercise.data.question} />
          {exercise.data.items.map(item => (
            <label key={item.id} className="flex gap-3 rounded-lg border p-3">
              <input
                type="radio"
                name={exercise.id}
                checked={current.selectedItemId === item.id}
                onChange={() => onChange({ ...current, selectedItemId: item.id })}
              />
              <Rich text={item.text} />
            </label>
          ))}
          {exercise.data.requireExplanation && (
            <AnswerField
              multiline
              label="Your explanation"
              value={richTextToPlainText(current.explanation)}
              onChange={value => onChange({ ...current, explanation: value })}
            />
          )}
        </>
      );
    }
    case 'matching': {
      const rounds = answer?.type === 'matching' ? answer.rounds : [];
      return (
        <>
          {Array.from({ length: exercise.data.requiredRepetitions ?? 1 }, (_, roundIndex) => (
            <fieldset key={roundIndex} className="space-y-3">
              <legend className="mb-2 font-medium">Round {roundIndex + 1}</legend>
              {exercise.data.leftColumn.map(left => (
                <label key={left.id} className="grid gap-2 sm:grid-cols-2">
                  <Rich text={left.value} />
                  <select
                    className="min-w-0 rounded-md border p-2"
                    aria-label={`Round ${roundIndex + 1}: ${stripHtmlTags(left.value)}`}
                    value={rounds[roundIndex]?.[left.id] ?? ''}
                    onChange={event => {
                      const round = { ...rounds[roundIndex] };
                      if (event.target.value) round[left.id] = event.target.value;
                      else delete round[left.id];
                      onChange({ type: 'matching', rounds: patchArray(rounds, roundIndex, round, {}) });
                    }}>
                    <option value="">Unanswered</option>
                    {exercise.data.rightColumn.map(right => (
                      <option
                        key={right.id}
                        value={right.id}
                        disabled={Object.entries(rounds[roundIndex] ?? {}).some(
                          ([id, value]) => id !== left.id && value === right.id
                        )}>
                        {stripHtmlTags(right.value)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>
          ))}
        </>
      );
    }
    case 'table-fill': {
      const values = answer?.type === 'table-fill' ? answer.answers : {};
      return (
        <div className="overflow-x-auto">
          <Rich text={exercise.data.title} />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {exercise.data.columns.map(column => (
                  <th className="border p-2" key={column.id}>
                    <Rich text={column.header} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exercise.data.rows.map((row, index) => (
                <tr key={row.id}>
                  {exercise.data.columns.map(column => {
                    const cell = row.cells[column.id];
                    const key = `${row.id}-${column.id}`;
                    return (
                      <td key={column.id} className="min-w-36 border p-2">
                        {cell?.isBlank ? (
                          <AnswerField
                            label={`Row ${index + 1}, ${stripHtmlTags(column.header)}`}
                            value={values[key] ?? ''}
                            onChange={value => onChange({ type: 'table-fill', answers: { ...values, [key]: value } })}
                          />
                        ) : (
                          <Rich text={cell?.content} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {exercise.data.footnotes?.map((note, i) => <Rich key={i} text={note} />)}
        </div>
      );
    }
    case 'text-selection': {
      const values = answer?.type === 'text-selection' ? answer.selectedWordIndices : [];
      const words = splitHtmlIntoWords(exercise.data.passage);
      return (
        <>
          <Rich text={exercise.data.passage} />
          {exercise.data.questions.map((question, index) => (
            <fieldset key={question.id} className="space-y-2">
              <legend>
                <Rich text={question.text} />
              </legend>
              <div className="flex flex-wrap gap-1">
                {words.map((word, i) => (
                  <button
                    type="button"
                    key={i}
                    aria-pressed={values[index] === i}
                    className={`rounded border px-2 py-1 ${values[index] === i ? 'border-roman-red bg-roman-parchment' : ''}`}
                    onClick={() =>
                      onChange({
                        type: 'text-selection',
                        selectedWordIndices: patchArray(values, index, values[index] === i ? -1 : i, -1),
                      })
                    }>
                    <Rich text={word} />
                  </button>
                ))}
              </div>
              {(values[index] ?? -1) < 0 && <p className="text-xs text-amber-800">Unanswered</p>}
            </fieldset>
          ))}
        </>
      );
    }
    case 'click-on-multiple-words': {
      const selected = answer?.type === 'click-on-multiple-words' ? answer.selectedWordIndices : [];
      return (
        <>
          <Rich text={exercise.data.instructions} />
          <div className="flex flex-wrap gap-1">
            {splitHtmlIntoWords(exercise.data.passage).map((word, index) => (
              <button
                type="button"
                key={index}
                aria-pressed={selected.includes(index)}
                className={`rounded border px-2 py-1 ${selected.includes(index) ? 'border-roman-red bg-roman-parchment' : ''}`}
                onClick={() =>
                  onChange({
                    type: 'click-on-multiple-words',
                    selectedWordIndices: selected.includes(index)
                      ? selected.filter(i => i !== index)
                      : [...selected, index],
                  })
                }>
                <Rich text={word} />
              </button>
            ))}
          </div>
        </>
      );
    }
    case 'sentence-diagramming':
      return (
        <SentenceDiagramStudent
          exercise={{ ...exercise, feedbackConfig: TEST_RUNTIME_FEEDBACK_CONFIG }}
          runtimeMode="test"
          initialAnswer={answer}
          answerEditing
          onAnswer={onChange}
        />
      );
  }
}

export function SectionAnswerReview({
  delivery,
  answers,
  onAnswer,
  disabled = false,
}: {
  delivery: StudentTestDelivery;
  answers: Record<string, ExerciseAnswer>;
  onAnswer: (event: ExerciseAnswerEvent) => void;
  disabled?: boolean;
}) {
  const page = delivery.pages[0];
  return (
    <div className="space-y-6" data-testid="section-answer-review">
      <Rich text={page.title} />
      {page.audioPath && <AudioPlayButton audioPath={page.audioPath} showLabel />}
      {page.items.map(item => {
        if (!isExerciseType(item.type))
          return (
            <ContentRenderer
              key={item.id}
              content={item}
              runtimeMode="test"
              resolvedVocabularyPool={delivery.vocabularyPool}
            />
          );
        const exercise = item as Exercise;
        const resolved = delivery.resolvedExercises[item.id]?.items ?? [];
        const complete = isExerciseAnswerComplete(exercise, answers[item.id], resolved.length);
        return (
          <fieldset
            key={item.id}
            disabled={disabled}
            inert={disabled || undefined}
            className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
            <legend className="px-2 font-serif text-lg text-roman-red">
              <Rich text={item.title || getContentTypeLabel(item.type)} />
            </legend>
            <Rich text={exercise.instructions} />
            {exercise.audioPath && <AudioPlayButton audioPath={exercise.audioPath} />}
            {!complete && <p className="text-sm text-amber-800">This exercise has unanswered parts.</p>}
            <ExerciseAnswers
              exercise={exercise}
              answer={answers[item.id]}
              resolved={resolved}
              onChange={answer => onAnswer({ exerciseId: item.id, answer })}
            />
          </fieldset>
        );
      })}
    </div>
  );
}
