'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Bug, Check, Lightbulb, MessageCircle, Star, type LucideIcon } from 'lucide-react';
import {
  FEEDBACK_AREAS,
  FEEDBACK_AREA_LABELS,
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_TYPE_LABELS,
  type FeedbackArea,
  type FeedbackSeverity,
  type FeedbackType,
} from '@/shared/student-feedback';
import { cn } from '@/src/lib/utils';

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-sm font-medium text-destructive">
      {message}
    </p>
  );
}

export function FieldHeading({ children, optional, htmlFor }: { children: ReactNode; optional?: boolean; htmlFor?: string }) {
  const content = (
    <>
      {children}
      {optional && <span className="ml-2 text-xs font-normal text-roman-stone">Optional</span>}
    </>
  );
  const className = 'mb-3 block text-sm font-semibold text-foreground';
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {content}
    </label>
  ) : (
    <legend className={className}>{content}</legend>
  );
}

/** A transparent native input over the whole card keeps clicks, keyboard use and form semantics native. */
const OVERLAY_INPUT = 'absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0';

type ChoiceOption<T extends string> = { value: T; hint: string; icon?: LucideIcon };

function ChoiceCards<T extends string>({
  id,
  heading,
  labels,
  options,
  value,
  error,
  onChange,
}: {
  id: string;
  heading: string;
  labels: Record<T, string>;
  options: Array<ChoiceOption<T>>;
  value: T | null;
  error?: string;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>
      <FieldHeading>{heading}</FieldHeading>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {options.map(({ value: option, icon: Icon, hint }, index) => {
          const checked = value === option;
          return (
            <label
              key={option}
              className={cn(
                'relative flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 sm:flex-col sm:items-start',
                checked ? 'border-roman-red bg-roman-red/[0.04] ring-1 ring-roman-red' : 'border-border hover:border-roman-red/40'
              )}>
              <input
                id={index === 0 ? id : undefined}
                type="radio"
                name={id}
                className={OVERLAY_INPUT}
                checked={checked}
                onChange={() => onChange(option)}
                aria-label={labels[option]}
                aria-describedby={`${id}-${option}-hint`}
              />
              {Icon && (
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                    checked ? 'bg-roman-red text-white' : 'bg-roman-parchment text-roman-red'
                  )}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 pr-5">
                <span className="block text-sm font-semibold text-foreground">{labels[option]}</span>
                <span id={`${id}-${option}-hint`} className="block text-xs text-roman-stone">
                  {hint}
                </span>
              </span>
              {checked && <Check className="absolute right-3 top-3 h-4 w-4 text-roman-red" aria-hidden="true" />}
            </label>
          );
        })}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  );
}

const TYPE_OPTIONS: Array<ChoiceOption<FeedbackType>> = [
  { value: 'bug_report', icon: Bug, hint: "Something isn't working" },
  { value: 'feature_suggestion', icon: Lightbulb, hint: 'An idea or improvement' },
  { value: 'general', icon: MessageCircle, hint: 'Anything else on your mind' },
];

const SEVERITY_OPTIONS: Array<ChoiceOption<FeedbackSeverity>> = [
  { value: 'blocking', hint: "I can't continue" },
  { value: 'major', hint: 'Broken, but I found a way around it' },
  { value: 'minor', hint: 'Looks off or is awkward to use' },
];

type PickerProps<T> = { id: string; value: T | null; error?: string; onChange: (value: T) => void };

export const TypePicker = (props: PickerProps<FeedbackType>) => (
  <ChoiceCards {...props} heading="What kind of feedback is this?" labels={FEEDBACK_TYPE_LABELS} options={TYPE_OPTIONS} />
);

export const SeverityPicker = (props: PickerProps<FeedbackSeverity>) => (
  <ChoiceCards {...props} heading="How much does it affect you?" labels={FEEDBACK_SEVERITY_LABELS} options={SEVERITY_OPTIONS} />
);

export function AreaChips({
  id,
  value,
  error,
  onChange,
}: {
  id: string;
  value: FeedbackArea[];
  error?: string;
  onChange: (value: FeedbackArea[]) => void;
}) {
  return (
    <fieldset aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : `${id}-hint`}>
      <FieldHeading>Which part of the app is it about?</FieldHeading>
      <p id={`${id}-hint`} className="-mt-2 mb-3 text-xs text-roman-stone">
        Choose all that apply.
      </p>
      <div className="flex flex-wrap gap-2">
        {FEEDBACK_AREAS.map((area, index) => {
          const checked = value.includes(area);
          return (
            <label
              key={area}
              className={cn(
                'relative inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                checked
                  ? 'border-roman-red bg-roman-red text-white'
                  : 'border-border bg-white text-foreground hover:border-roman-red/40'
              )}>
              <input
                id={index === 0 ? id : undefined}
                type="checkbox"
                className={OVERLAY_INPUT}
                checked={checked}
                onChange={event =>
                  onChange(event.target.checked ? [...value, area] : value.filter(item => item !== area))
                }
              />
              {checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {FEEDBACK_AREA_LABELS[area]}
            </label>
          );
        })}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  );
}

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function RatingField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value;
  return (
    <fieldset>
      <FieldHeading optional>How is your experience with the app overall?</FieldHeading>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex" onMouseLeave={() => setHovered(null)}>
          {RATING_LABELS.map((label, index) => {
            const rating = index + 1;
            return (
              <label
                key={label}
                className="relative cursor-pointer rounded-md p-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                onMouseEnter={() => setHovered(rating)}>
                <input
                  id={index === 0 ? id : undefined}
                  type="radio"
                  name={`${id}-rating`}
                  className={OVERLAY_INPUT}
                  checked={value === rating}
                  onChange={() => onChange(rating)}
                  aria-label={`${rating} of 5: ${label}`}
                />
                <Star
                  className={cn(
                    'h-7 w-7 transition-colors',
                    shown !== null && rating <= shown ? 'fill-roman-gold text-roman-gold' : 'text-roman-stone/40'
                  )}
                  aria-hidden="true"
                />
              </label>
            );
          })}
        </div>
        <span className="text-sm text-roman-stone" aria-live="polite">
          {shown ? RATING_LABELS[shown - 1] : 'Not rated'}
        </span>
        {value !== null && (
          <button type="button" className="text-xs font-medium text-roman-red hover:underline" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}
