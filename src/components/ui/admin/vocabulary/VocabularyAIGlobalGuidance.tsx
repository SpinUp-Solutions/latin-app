'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Label } from '@/src/components/ui/label';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useGetVocabularyAIGuidanceQuery,
  useSaveVocabularyAIGuidanceMutation,
} from '@/src/store/api/vocabularyAIGuidanceApi';
import type { SaveVocabularyAIGuidance } from '@/shared/types/vocabulary/ai-guidance-settings';
import { toast } from 'sonner';

export function VocabularyAIGlobalGuidance({ disabled = false }: { disabled?: boolean }) {
  const query = useGetVocabularyAIGuidanceQuery();
  const [save, { isLoading: saving }] = useSaveVocabularyAIGuidanceMutation();
  const [draft, setDraft] = useState<SaveVocabularyAIGuidance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = disabled || saving;

  async function saveRules() {
    if (!draft) return;
    setError(null);
    try {
      await save(draft).unwrap();
      setDraft(null);
      toast.success('Global AI guidance saved');
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'Could not save global guidance'));
    }
  }

  async function reloadRules() {
    const result = await query.refetch();
    if (result.data) {
      setDraft({ revision: result.data.revision, rules: result.data.rules });
      setError(null);
    } else {
      setError(getApiErrorMessage(result.error, 'Could not reload global guidance'));
    }
  }

  return (
    <details className="rounded border border-roman-stone/20 p-3">
      <summary className="cursor-pointer font-medium">Global AI guidance</summary>
      <p className="my-2 text-sm text-roman-stone">
        These admin-approved rules are included in future vocabulary AI requests for every word. Changes here save
        immediately, separately from the word.
      </p>
      {query.error && <p role="alert">{getApiErrorMessage(query.error, 'Could not load global guidance')}</p>}
      {error && <p role="alert">{error}</p>}
      {!draft ? (
        <>
          <ul className="my-3 space-y-2 text-sm">
            {query.data?.rules.map(rule => (
              <li key={rule.id} className="whitespace-pre-wrap">
                {rule.instruction}
              </li>
            ))}
          </ul>
          {query.data?.rules.length === 0 && <p className="my-2 text-sm">No global rules saved.</p>}
          <Button
            type="button"
            variant="outline"
            disabled={busy || !query.data}
            onClick={() => {
              if (query.data) setDraft({ revision: query.data.revision, rules: query.data.rules });
            }}>
            Edit global guidance
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          {draft.rules.map((rule, index) => (
            <div key={rule.id} className="space-y-1">
              <Label htmlFor={`global-guidance-${rule.id}`}>Global rule {index + 1}</Label>
              <Textarea
                id={`global-guidance-${rule.id}`}
                value={rule.instruction}
                maxLength={2000}
                disabled={busy}
                onChange={event =>
                  setDraft({
                    ...draft,
                    rules: draft.rules.map(item =>
                      item.id === rule.id ? { ...item, instruction: event.target.value } : item
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setDraft({ ...draft, rules: draft.rules.filter(item => item.id !== rule.id) })}>
                Remove rule {index + 1}
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || draft.rules.length >= 20}
              onClick={() =>
                setDraft({ ...draft, rules: [...draft.rules, { id: crypto.randomUUID(), instruction: '' }] })
              }>
              Add global rule
            </Button>
            <Button
              type="button"
              disabled={busy || draft.rules.some(rule => !rule.instruction.trim())}
              onClick={saveRules}>
              {saving ? 'Saving...' : 'Save global guidance'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}>
              Cancel
            </Button>
            {error && (
              <Button type="button" variant="outline" disabled={busy || query.isFetching} onClick={reloadRules}>
                Discard draft and reload global rules
              </Button>
            )}
          </div>
        </div>
      )}
    </details>
  );
}
