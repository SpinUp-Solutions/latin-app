'use client';

import { useEffect, useEffectEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import type { AICompletableField, AIAutocompleteResponse } from '@/shared/openai/types';
import type { VocabularyWord } from '@/shared/types/vocabulary/schemas';
import type { VocabularyAIReview, VocabularyAIUncertainty } from '@/shared/types/vocabulary/ai-review';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { useFirebaseAutocomplete } from '@/src/hooks/useFirebaseAutocomplete';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useGetVocabularyAIGuidanceQuery,
  useSaveVocabularyAIGuidanceMutation,
} from '@/src/store/api/vocabularyAIGuidanceApi';
import { wordFieldLabel } from './wordFields';

interface Props {
  review: VocabularyAIReview;
  snapshot: Partial<VocabularyWord>;
  snapshotKey: string;
  onReviewChange: (review: VocabularyAIReview) => void;
  onApply: (field: AICompletableField, value: unknown, uncertainty: VocabularyAIUncertainty) => void;
  disabled?: boolean;
  saveLabel?: string;
}

function GuidanceComposer({
  review,
  onReviewChange,
  disabled,
  saveLabel,
}: Pick<Props, 'review' | 'onReviewChange' | 'disabled' | 'saveLabel'>) {
  const id = useId();
  const [instruction, setInstruction] = useState('');
  const [scope, setScope] = useState('word');
  const [saving, setSaving] = useState(false);
  const { refetch } = useGetVocabularyAIGuidanceQuery();
  const [saveGlobal] = useSaveVocabularyAIGuidanceMutation();

  const save = async () => {
    const text = instruction.trim();
    if (!text || text.length > 2000) return;
    const rule = { id: crypto.randomUUID(), instruction: text };
    if (scope === 'word') {
      if (review.guidance.length >= 20) {
        toast.error('A word can remember up to 20 instructions. Edit or remove an existing instruction first.');
        return;
      }
      onReviewChange({ ...review, guidance: [...review.guidance, rule] });
      setInstruction('');
      toast.success(`Instruction added to this word. Save it with ${saveLabel}.`);
      return;
    }
    setSaving(true);
    try {
      // Fetch the current set before appending; revision checking also protects the race after this read.
      const current = await refetch().unwrap();
      await saveGlobal({ revision: current.revision, rules: [...current.rules, rule] }).unwrap();
      setInstruction('');
      toast.success('Global instruction saved for future autocomplete requests.');
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, 'Could not save the global instruction. Your text is still here; try again.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <label htmlFor={`${id}-instruction`} className="block text-sm font-medium">
        Instruction to remember
      </label>
      <p className="text-sm text-gray-600">
        Write the instruction you approve. AI answers are never saved as rules automatically.
      </p>
      <Textarea
        id={`${id}-instruction`}
        value={instruction}
        onChange={event => setInstruction(event.target.value)}
        maxLength={2000}
        disabled={disabled || saving}
      />
      <label htmlFor={`${id}-scope`} className="text-sm">
        Remember for
      </label>{' '}
      <select
        id={`${id}-scope`}
        value={scope}
        onChange={event => setScope(event.target.value)}
        disabled={disabled || saving}
        className="rounded border p-2 text-sm">
        <option value="word">This word only (saved with {saveLabel})</option>
        <option value="global">All words (saved immediately)</option>
      </select>
      <Button type="button" variant="outline" onClick={save} disabled={disabled || saving || !instruction.trim()}>
        {saving ? 'Saving instruction…' : 'Save guidance'}
      </Button>
    </div>
  );
}

function UncertaintyReview({
  uncertainty,
  snapshot,
  snapshotKey,
  onApply,
  onResolve,
  disabled,
  saveLabel,
}: {
  uncertainty: VocabularyAIUncertainty;
  snapshot: Props['snapshot'];
  snapshotKey: string;
  onApply: Props['onApply'];
  onResolve: () => void;
  disabled?: boolean;
  saveLabel?: string;
}) {
  const id = useId();
  const [question, setQuestion] = useState('');
  const [proposal, setProposal] = useState<AIAutocompleteResponse | null>(null);
  const [stale, setStale] = useState(false);
  const { requestAutocomplete, invalidate, isLoading } = useFirebaseAutocomplete({
    onError: message => toast.error(message),
  });
  const invalidateSnapshot = useEffectEvent(() => {
    invalidate();
    if (proposal) setStale(true);
    setProposal(null);
  });
  useEffect(() => {
    invalidateSnapshot();
  }, [snapshotKey]);

  const ask = async () => {
    if (!snapshot.word || !snapshot.part_of_speech || !question.trim()) return;
    setProposal(null);
    setStale(false);
    const result = await requestAutocomplete({
      word: snapshot.word,
      part_of_speech: snapshot.part_of_speech,
      existingData: snapshot,
      fieldsToComplete: [uncertainty.field],
      overwriteExisting: true,
      followUp: { question: question.trim(), uncertainty },
    });
    if (result) setProposal(result);
  };
  const proposedData = proposal?.data as Record<string, unknown> | undefined;
  const hasValue =
    proposedData !== undefined &&
    Object.prototype.hasOwnProperty.call(proposedData, uncertainty.field) &&
    proposedData[uncertainty.field] !== undefined;

  return (
    <article className="space-y-3 rounded border border-amber-200 bg-white p-3">
      <h4 className="font-medium">{wordFieldLabel(uncertainty.field)}</h4>
      <p className="whitespace-pre-wrap text-sm">{uncertainty.explanation}</p>
      <label htmlFor={`${id}-question`} className="block text-sm font-medium">
        Question for AI about {wordFieldLabel(uncertainty.field)}
      </label>
      <Textarea
        id={`${id}-question`}
        value={question}
        maxLength={4000}
        onChange={event => setQuestion(event.target.value)}
        disabled={disabled || isLoading}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={ask} disabled={disabled || isLoading || !question.trim()}>
          {isLoading ? 'Asking AI…' : 'Ask AI'}
        </Button>
        <Button type="button" variant="ghost" onClick={onResolve} disabled={disabled || isLoading}>
          Resolved manually
        </Button>
      </div>
      {stale && (
        <p role="status" className="text-sm text-amber-800">
          The word changed. Ask again before applying an answer.
        </p>
      )}
      {proposal && (
        <div className="space-y-2 border-t pt-3">
          <p className="whitespace-pre-wrap text-sm">
            {proposal.reviewAnswer || 'The AI returned a proposed value for your review.'}
          </p>
          {proposal.uncertainties?.map((item, index) => (
            <p key={index} className="text-sm text-amber-800">
              Still uncertain: {item.explanation}
            </p>
          ))}
          {hasValue ? (
            <>
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Proposed {wordFieldLabel(uncertainty.field)}
                </summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(proposedData[uncertainty.field], null, 2)}
                </pre>
              </details>
              <Button
                type="button"
                onClick={() => onApply(uncertainty.field, proposedData[uncertainty.field], uncertainty)}
                disabled={disabled}>
                Apply answer
              </Button>
              <p className="text-xs text-gray-600">
                Replaces this field and marks this issue resolved in your draft. Save the word with {saveLabel}.
              </p>
            </>
          ) : (
            <p className="text-sm">No replacement field was returned. The issue remains open.</p>
          )}
        </div>
      )}
    </article>
  );
}

export function VocabularyAIReviewPanel({
  review,
  snapshot,
  snapshotKey,
  onReviewChange,
  onApply,
  disabled,
  saveLabel = 'Apply',
}: Props) {
  const resolve = (item: VocabularyAIUncertainty) =>
    onReviewChange({
      ...review,
      uncertainties: review.uncertainties.filter(
        candidate => candidate.field !== item.field || candidate.explanation !== item.explanation
      ),
    });
  return (
    <section aria-label="AI review" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-semibold">
        AI review {review.uncertainties.length > 0 && `(${review.uncertainties.length} open)`}
      </h3>
      <p className="text-sm text-gray-700">
        These are model suggestions, not dictionary verification. Open issues stay with the word until you accept an
        answer or resolve them manually.
      </p>
      {review.uncertainties.length === 0 && <p className="text-sm">No open AI issues.</p>}
      {review.uncertainties.map(item => (
        <UncertaintyReview
          key={`${item.field}:${item.explanation}`}
          uncertainty={item}
          snapshot={snapshot}
          snapshotKey={snapshotKey}
          onApply={onApply}
          onResolve={() => resolve(item)}
          disabled={disabled}
          saveLabel={saveLabel}
        />
      ))}
      {review.guidance.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Remembered for this word</h4>
          <p className="text-xs text-gray-600">Edits and removals are saved with {saveLabel}.</p>
          {review.guidance.map((rule, index) => (
            <div key={rule.id} className="flex items-start gap-2">
              <Textarea
                aria-label={`Word instruction ${index + 1}`}
                value={rule.instruction}
                maxLength={2000}
                disabled={disabled}
                onChange={event =>
                  onReviewChange({
                    ...review,
                    guidance: review.guidance.map(candidate =>
                      candidate.id === rule.id ? { ...candidate, instruction: event.target.value } : candidate
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  onReviewChange({ ...review, guidance: review.guidance.filter(candidate => candidate.id !== rule.id) })
                }>
                Remove instruction {index + 1}
              </Button>
            </div>
          ))}
        </div>
      )}
      <GuidanceComposer review={review} onReviewChange={onReviewChange} disabled={disabled} saveLabel={saveLabel} />
    </section>
  );
}
