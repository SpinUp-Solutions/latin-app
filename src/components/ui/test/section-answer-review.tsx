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
import { ClipboardList } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';

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
    <div className="space-y-2.5">
      <label htmlFor={id} className="block text-sm font-medium leading-relaxed text-slate-700">
        {label}
      </label>
      {multiline ? (
        <Textarea
          id={id}
          className="min-h-28 rounded-xl border-slate-200 bg-slate-50/70 p-3 focus-visible:ring-roman-red/30"
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          className="h-11 rounded-xl border-slate-200 bg-slate-50/70 focus-visible:ring-roman-red/30"
          value={value}
          onChange={event => onChange(event.target.value)}
        />
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
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-roman-red/20',
                selected.includes(option.id)
                  ? 'border-roman-red/30 bg-roman-parchment/50'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70'
              )}>
              <input
                className="mt-1 h-4 w-4 shrink-0 accent-roman-red"
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
            <label
              key={item.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-roman-red/20',
                current.selectedItemId === item.id
                  ? 'border-roman-red/30 bg-roman-parchment/50'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70'
              )}>
              <input
                className="mt-1 h-4 w-4 shrink-0 accent-roman-red"
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
                    className="min-h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red/30"
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
                  <Button
                    variant="outline"
                    type="button"
                    key={i}
                    aria-pressed={values[index] === i}
                    className={cn(
                      'h-auto min-h-11 whitespace-normal rounded-xl border-slate-200 px-3 py-2 text-slate-700 hover:bg-roman-parchment',
                      values[index] === i && 'border-roman-red/40 bg-roman-parchment text-roman-red'
                    )}
                    onClick={() =>
                      onChange({
                        type: 'text-selection',
                        selectedWordIndices: patchArray(values, index, values[index] === i ? -1 : i, -1),
                      })
                    }>
                    <Rich text={word} />
                  </Button>
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
              <Button
                variant="outline"
                type="button"
                key={index}
                aria-pressed={selected.includes(index)}
                className={cn(
                  'h-auto min-h-11 whitespace-normal rounded-xl border-slate-200 px-3 py-2 text-slate-700 hover:bg-roman-parchment',
                  selected.includes(index) && 'border-roman-red/40 bg-roman-parchment text-roman-red'
                )}
                onClick={() =>
                  onChange({
                    type: 'click-on-multiple-words',
                    selectedWordIndices: selected.includes(index)
                      ? selected.filter(i => i !== index)
                      : [...selected, index],
                  })
                }>
                <Rich text={word} />
              </Button>
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
    <div className="space-y-7" data-testid="section-answer-review">
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
            className="min-w-0 space-y-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_-24px_rgba(30,41,59,0.35)] sm:p-6">
            <legend className="max-w-full px-1">
              <span className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-roman-red/15 bg-white px-4 py-2 font-serif text-base font-medium text-roman-red shadow-sm sm:px-5 sm:text-lg">
                <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words leading-snug">
                  <Rich text={item.title || getContentTypeLabel(item.type)} />
                </span>
              </span>
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
