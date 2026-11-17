'use client';

import { useState } from 'react';
import { BookMarked, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ADMIN_NOTE_MAX, AI_REVIEW_ITEM_LIMIT } from '@/shared/types/vocabulary/ai-review';
import type { SaveVocabularyAIGuidance } from '@/shared/types/vocabulary/ai-guidance-settings';
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
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useGetVocabularyAIGuidanceQuery,
  useSaveVocabularyAIGuidanceMutation,
} from '@/src/store/api/vocabularyAIGuidanceApi';

/** Loaded fresh each time the dialog opens; saved as one revision-checked set. */
function RulesEditor({ onClose }: { onClose: () => void }) {
  const query = useGetVocabularyAIGuidanceQuery();
  const [save, { isLoading: saving }] = useSaveVocabularyAIGuidanceMutation();
  const [draft, setDraft] = useState<SaveVocabularyAIGuidance | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (query.isLoading) return <p className="text-sm text-gray-600">Loading rules…</p>;
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

  const saveRules = async () => {
    if (!draft) return;
    setError(null);
    try {
      await save(draft).unwrap();
      toast.success('AI rules saved');
      onClose();
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'Could not save the AI rules.'));
    }
  };

  const reload = async () => {
    await query.refetch();
    setDraft(null);
    setError(null);
  };

  return (
    <div className="space-y-3">
      {rules.length === 0 && (
        <p className="text-sm text-gray-600">
          No rules yet. Add one when a correction applies to every word, for example “Label postclassical senses as
          such.” A correction for one word belongs in a note on that word.
        </p>
      )}
      <ol className="space-y-2">
        {rules.map((rule, index) => (
          <li key={rule.id} className="flex items-start gap-2">
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
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={saving || rules.length >= AI_REVIEW_ITEM_LIMIT}
          onClick={() => edit([...rules, { id: crypto.randomUUID(), instruction: '' }])}>
          <Plus className="h-3.5 w-3.5" />
          Add rule
        </Button>
        <span className="text-xs text-gray-500">
          {rules.length} of {AI_REVIEW_ITEM_LIMIT}
        </span>
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
          disabled={!draft || saving || rules.some(rule => !rule.instruction.trim())}>
          {saving ? 'Saving…' : 'Save rules'}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Rules the AI follows for every word, saved on their own rather than with a word. */
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
        <BookMarked className="h-4 w-4" />
        AI rules
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI rules for all words</DialogTitle>
          <DialogDescription>
            Sent with every vocabulary AI request. A note on a single word takes precedence over these rules.
          </DialogDescription>
        </DialogHeader>
        {open && <RulesEditor onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
