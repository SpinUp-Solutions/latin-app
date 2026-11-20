'use client';

import { useState, type KeyboardEvent } from 'react';
import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ADMIN_NOTE_MAX, AI_REVIEW_ITEM_LIMIT } from '@/shared/types/vocabulary/ai-review';
import { sameAIRule, type SaveVocabularyAIGuidance } from '@/shared/types/vocabulary/ai-guidance-settings';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Textarea } from '@/src/components/ui/textarea';
import { Skeleton } from '@/src/components/ui/skeleton';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useGetVocabularyAIGuidanceQuery,
  useSaveVocabularyAIGuidanceMutation,
} from '@/src/store/api/vocabularyAIGuidanceApi';

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The editor's shape while the rules load: a few rules, then the box for adding one. */
function RulesSkeleton() {
  return (
    <div role="status" aria-label="Loading rules" className="space-y-4">
      <ol className="space-y-3" aria-hidden>
        {['w-1/2', 'w-2/5', 'w-1/3'].map(caption => (
          <li key={caption} className="space-y-1">
            <div className="flex items-start gap-2">
              <Skeleton className="h-[60px] flex-1" />
              <Skeleton className="h-9 w-9 shrink-0" />
            </div>
            <Skeleton className={`h-3 ${caption}`} />
          </li>
        ))}
      </ol>
      <div className="space-y-2 rounded-md border border-dashed border-gray-300 p-3" aria-hidden>
        <Skeleton className="h-4 w-32" />
        <div className="flex items-start gap-2">
          <Skeleton className="h-[60px] flex-1" />
          <Skeleton className="h-9 w-20 shrink-0" />
        </div>
      </div>
    </div>
  );
}

/**
 * Loaded fresh each time the dialog opens; additions, edits and removals are
 * saved as one revision-checked set.
 */
function RulesEditor({ onClose }: { onClose: () => void }) {
  const query = useGetVocabularyAIGuidanceQuery();
  const [save, { isLoading: saving }] = useSaveVocabularyAIGuidanceMutation();
  const [draft, setDraft] = useState<SaveVocabularyAIGuidance | null>(null);
  const [newRule, setNewRule] = useState('');
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  if (query.isLoading) return <RulesSkeleton />;
  if (!query.data) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {getApiErrorMessage(query.error, 'Could not load the AI rules.')}
      </p>
    );
  }

  const saved = query.data;
  const rules = draft?.rules ?? saved.rules;
  const edit = (next: SaveVocabularyAIGuidance['rules']) =>
    setDraft({ revision: draft?.revision ?? saved.revision, rules: next });

  const typed = newRule.trim();
  const full = rules.length >= AI_REVIEW_ITEM_LIMIT;
  const duplicate = typed ? rules.find(rule => sameAIRule(rule.instruction, typed)) : undefined;
  const canAdd = Boolean(typed) && !duplicate && !full;
  // Text still in the box is saved with the rest, so a rule typed but not added is not lost.
  const withTyped = () => (canAdd ? [...rules, { id: crypto.randomUUID(), instruction: typed }] : rules);

  const addRule = () => {
    if (!canAdd) return;
    const next = withTyped();
    edit(next);
    setAddedIds(new Set(addedIds).add(next[next.length - 1].id));
    setNewRule('');
  };

  const addOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    addRule();
  };

  const saveRules = async () => {
    if (!draft && !canAdd) return;
    setError(null);
    try {
      await save({ revision: draft?.revision ?? saved.revision, rules: withTyped() }).unwrap();
      toast.success('AI rules saved');
      onClose();
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'Could not save the AI rules.'));
    }
  };

  const reload = async () => {
    await query.refetch();
    setDraft(null);
    setAddedIds(new Set());
    setError(null);
  };

  return (
    <div className="space-y-4">
      {rules.length === 0 ? (
        <p className="text-sm text-gray-600">
          No rules yet. Add one below, or answer the AI about a word: when your answer applies to every word, for
          example “only give locative forms for place names”, the AI turns it into a rule here.
        </p>
      ) : (
        <ol className="space-y-3">
          {rules.map((rule, index) => (
            <li key={rule.id} className="space-y-1">
              <div className="flex items-start gap-2">
                <Textarea
                  aria-label={`Rule ${index + 1}`}
                  rows={2}
                  value={rule.instruction}
                  maxLength={ADMIN_NOTE_MAX}
                  disabled={saving}
                  onChange={event =>
                    edit(rules.map(item => (item.id === rule.id ? { ...item, instruction: event.target.value } : item)))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove rule ${index + 1}`}
                  disabled={saving}
                  onClick={() => edit(rules.filter(item => item.id !== rule.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="pr-12 text-xs text-gray-500" title={rule.learnedFrom?.message}>
                {addedIds.has(rule.id) ? (
                  <span className="font-medium text-amber-700">New. Saved when you click Save rules.</span>
                ) : rule.learnedFrom ? (
                  <>
                    Learned from an answer about <span className="font-medium">{rule.learnedFrom.word}</span>: “
                    {shorten(rule.learnedFrom.message, 160)}”
                  </>
                ) : (
                  'Added by an admin.'
                )}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="space-y-2 rounded-md border border-dashed border-gray-300 p-3">
        <label htmlFor="new-ai-rule" className="block text-sm font-medium text-gray-800">
          Add your own rule
        </label>
        <div className="flex items-start gap-2">
          <Textarea
            id="new-ai-rule"
            rows={2}
            value={newRule}
            maxLength={ADMIN_NOTE_MAX}
            disabled={saving || full}
            placeholder="For example: Leave the vocative empty when it is the same as the nominative."
            onChange={event => setNewRule(event.target.value)}
            onKeyDown={addOnEnter}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0 gap-1.5"
            disabled={!canAdd || saving}
            onClick={addRule}>
            <Plus className="h-4 w-4" />
            Add rule
          </Button>
        </div>
        <p className="text-xs text-gray-500" aria-live="polite">
          {full
            ? `${AI_REVIEW_ITEM_LIMIT} rules is the limit. Remove one to add another.`
            : duplicate
              ? `Rule ${rules.indexOf(duplicate) + 1} already says this.`
              : `Write it the way you would tell the AI. ${rules.length} of ${AI_REVIEW_ITEM_LIMIT} rules.`}
        </p>
      </div>

      {error && (
        <div role="alert" className="space-y-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" disabled={saving || query.isFetching} onClick={reload}>
            Discard my changes and reload
          </Button>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={saveRules}
          disabled={(!draft && !canAdd) || saving || rules.some(rule => !rule.instruction.trim())}>
          {saving ? 'Saving…' : 'Save rules'}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Rules the AI follows for every word, written by admins or learned from their answers; saved on their own rather than with a word. */
export function VocabularyAIRulesDialog({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={disabled}
        onClick={() => setOpen(true)}>
        <Lightbulb className="h-4 w-4" />
        AI rules
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI rules for all words</DialogTitle>
          <DialogDescription>
            The AI follows these in every request. Add your own, or let the AI write them from your answers when a
            correction applies to every word. A note on a single word takes precedence.
          </DialogDescription>
        </DialogHeader>
        {open && <RulesEditor onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
