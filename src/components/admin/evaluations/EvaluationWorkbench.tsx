import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Loader2, Play, Plus, Save, Trash2 } from 'lucide-react';
import { AdminErrorState, AdminLoadingState, AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Switch } from '@/src/components/ui/switch';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { EvaluationCaseSidebar } from '@/src/components/admin/evaluations/EvaluationCaseSidebar';
import { useEvaluationCases, type EvaluationSuite } from '@/src/hooks/useEvaluationCases';

const EXPAND_BUTTON_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/[0.08] text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

interface EvaluationWorkbenchProps<Input, Result> {
  suite: EvaluationSuite<Input, Result>;
  title: string;
  description: string;
  loadingLabel: string;
  /** Extra controls beside "New case" in the page header. */
  headerActions?: ReactNode;
  /** Whether the editor offers to skip the result cache. */
  canSkipCache?: boolean;
  /** One line under a case's title in the list of saved cases. */
  caseSubtitle: (value: Input) => string;
  /** One line under the title while the editor is collapsed. */
  caseSummary: (value: Input) => ReactNode;
  runningMessage: (value: Input) => ReactNode;
  /** The suite's own inputs; the title, buttons and dialogs around them are shared. */
  renderFields: (form: Input, updateForm: (updater: (previous: Input) => Input) => void) => ReactNode;
  renderResults: (run: { result: Result; evaluationCase: Input }) => ReactNode;
}

/**
 * The page every evaluation suite shares: saved cases on the left, a case
 * editor that collapses while its results are on show, and the save, run,
 * delete and unsaved-changes handling. A suite supplies its inputs and results.
 */
export function EvaluationWorkbench<Input extends { title: string }, Result extends { caseId: string }>({
  suite,
  title,
  description,
  loadingLabel,
  headerActions,
  canSkipCache = true,
  caseSubtitle,
  caseSummary,
  runningMessage,
  renderFields,
  renderResults,
}: EvaluationWorkbenchProps<Input, Result>) {
  const [forceRefresh, setForceRefresh] = useState(false);
  const state = useEvaluationCases(suite);
  const { form, selectedId, dirty, valid, busy, interactionLocked, displayedRun, navigationGuard } = state;

  if (state.loadingCases) {
    return (
      <AdminPage>
        <AdminLoadingState label={loadingLabel} />
      </AdminPage>
    );
  }

  const editor = (
    <fieldset disabled={interactionLocked} className="min-w-0 border-0 p-0">
      <RomanCard>
        <RomanCardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-xl">{selectedId ? 'Edit case' : 'New case'}</h2>
            <div className="flex items-center gap-2">
              {dirty && (
                <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">Unsaved changes</Badge>
              )}
              {displayedRun && !dirty && (
                <button
                  type="button"
                  onClick={() => state.setCollapsed(true)}
                  aria-label="Collapse case editor"
                  aria-expanded
                  className={EXPAND_BUTTON_CLASS}>
                  <ChevronUp className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {renderFields(form, state.updateForm)}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div>
              {selectedId && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => navigationGuard.requestNavigation(() => state.setDeleteOpen(true))}>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
              )}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canSkipCache && (
                  <label className="mr-1 flex cursor-pointer items-center gap-2 text-xs text-roman-stone">
                    <Switch
                      checked={forceRefresh}
                      onCheckedChange={setForceRefresh}
                      disabled={interactionLocked}
                      aria-label="Skip cache"
                    />
                    Skip cache
                  </label>
                )}
                {selectedId && dirty && (
                  <Button type="button" variant="ghost" onClick={state.discardChanges}>
                    Discard changes
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={!valid || !dirty}
                  onClick={() => void state.saveCase()}>
                  {busy === 'saving' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {busy === 'saving' ? 'Saving…' : 'Save case'}
                </Button>
                <Button
                  type="button"
                  disabled={!selectedId || dirty || !valid}
                  onClick={() => void state.runEvaluation(canSkipCache && forceRefresh)}>
                  {busy === 'running' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {busy === 'running' ? 'Running…' : 'Run comparison'}
                </Button>
              </div>
              {(dirty || !selectedId) && (
                <p className="text-[11px] text-roman-stone">Save the case to run a comparison.</p>
              )}
            </div>
          </div>
        </RomanCardContent>
      </RomanCard>
    </fieldset>
  );

  const caseBanner = (
    <RomanCard>
      <RomanCardContent className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-lg">{form.title}</h2>
          <p className="truncate text-xs text-roman-stone">{caseSummary(form)}</p>
        </div>
        <button
          type="button"
          onClick={() => state.setCollapsed(false)}
          disabled={interactionLocked}
          aria-label="Expand case editor"
          aria-expanded={false}
          className={EXPAND_BUTTON_CLASS}>
          <ChevronDown className="h-5 w-5" aria-hidden="true" />
        </button>
      </RomanCardContent>
    </RomanCard>
  );

  return (
    <AdminPage>
      <AdminPageHeader
        title={title}
        description={description}
        actions={
          <>
            {headerActions}
            <Button
              type="button"
              onClick={() => !interactionLocked && navigationGuard.requestNavigation(state.applyNewCase)}
              disabled={interactionLocked}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New case
            </Button>
          </>
        }
      />

      {state.loadError && (
        <AdminErrorState
          message={state.loadError}
          onRetry={() => navigationGuard.requestNavigation(() => void state.loadCases())}
          className="mb-6"
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <EvaluationCaseSidebar
          cases={state.cases}
          selectedId={selectedId}
          onSelect={state.selectCase}
          subtitle={caseSubtitle}
          locked={interactionLocked}
          addDisabled={Boolean(state.loadError)}
          canAdd={state.missingStarterCases.length > 0}
          adding={busy === 'addingStarterCases'}
          onAdd={() => void state.addStarterCases()}
          starterLabel={suite.starterLabel}
        />

        <div className="min-w-0 space-y-6">
          {state.collapsed ? caseBanner : editor}

          {busy === 'running' && (
            <div
              className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-4"
              role="status"
              aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-medium">{runningMessage(form)}</p>
            </div>
          )}

          {displayedRun && renderResults(displayedRun)}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={navigationGuard.isOpen}
        onClose={navigationGuard.stayOnPage}
        onConfirm={navigationGuard.leavePage}
        title="Leave without saving?"
        description={navigationGuard.message}
        confirmText="Leave without saving"
        confirmVariant="destructive"
      />

      <ConfirmationDialog
        isOpen={state.deleteOpen}
        onClose={() => state.setDeleteOpen(false)}
        onConfirm={() => void state.deleteCase()}
        title="Delete this evaluation case?"
        description="This removes the saved case. Cached results are not deleted and expire after 30 days."
        confirmText="Delete case"
        confirmVariant="destructive"
      />
    </AdminPage>
  );
}
