import { BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';

export function EvaluationCaseSidebar<Case extends { id: string; title: string }>({
  cases,
  selectedId,
  onSelect,
  subtitle,
  locked,
  canAdd,
  addDisabled,
  adding,
  onAdd,
  starterLabel,
}: {
  cases: Case[];
  selectedId: string | null;
  onSelect: (value: Case) => void;
  subtitle: (value: Case) => string;
  locked: boolean;
  canAdd: boolean;
  addDisabled: boolean;
  adding: boolean;
  onAdd: () => void;
  starterLabel: string;
}) {
  return (
    <aside aria-label="Saved evaluation cases" className="space-y-3 xl:sticky xl:top-6 xl:self-start">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-roman-stone">Cases</p>
        <span className="text-xs tabular-nums text-roman-stone">{cases.length}</span>
      </div>
      {cases.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-white/60 p-4 text-sm text-roman-stone">
          No cases yet. Write one, or add the {starterLabel} cases.
        </p>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1 xl:max-h-[calc(100vh-16rem)]">
          {cases.map(evaluationCase => (
            <button
              type="button"
              key={evaluationCase.id}
              onClick={() => onSelect(evaluationCase)}
              disabled={locked}
              aria-pressed={selectedId === evaluationCase.id}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
                selectedId === evaluationCase.id
                  ? 'border-primary/40 bg-primary/[0.07]'
                  : 'border-transparent hover:bg-roman-marble/60'
              }`}>
              <p className="line-clamp-2 text-sm font-medium">{evaluationCase.title}</p>
              <p className="mt-0.5 text-[11px] text-roman-stone">{subtitle(evaluationCase)}</p>
            </button>
          ))}
        </div>
      )}
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onAdd}
          disabled={locked || addDisabled}>
          {adding ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {adding ? 'Adding…' : `Add ${starterLabel} cases`}
        </Button>
      )}
    </aside>
  );
}
