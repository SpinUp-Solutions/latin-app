'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Database,
  Download,
  FileCheck2,
  LibraryBig,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminIconChip, AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { Button } from '@/src/components/ui/button';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { useAdminApi } from '@/src/hooks/useAdminApi';
import type { LearningPathMigrationRecord } from '@/src/lib/learning-units/schemas';
import type { LearningPathDocument } from '@/src/types/learning-unit';
import { toast } from 'sonner';

type MigrationKey = 'poolTokens' | 'lessonSummaries' | 'learningPath';
type MigrationMode = 'dryRun' | 'run';
type MigrationResult = Record<string, unknown>;
type LearningPathWorkflowAction = 'apply' | 'verify' | 'rollback' | 'retire';

type LearningPathMigrationWorkflow = {
  path: LearningPathDocument | null;
  migration: LearningPathMigrationRecord | null;
  needsRecovery: boolean;
};

interface DashboardCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  children: ReactNode;
}

function DashboardCard({ icon: Icon, title, description, primaryAction, children }: DashboardCardProps) {
  return (
    <RomanCard className="group border-border/80 transition-[transform,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none sm:hover:-translate-y-0.5 sm:hover:border-primary/20 sm:hover:shadow-md">
      <RomanCardContent className="flex h-full flex-col p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <AdminIconChip icon={Icon} />
          <div className="min-w-0">
            <h2 className="font-serif text-lg leading-tight">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-roman-stone">{description}</p>
          </div>
        </div>
        <div className="space-y-1">{children}</div>
        {primaryAction && <div className="mt-auto pt-4">{primaryAction}</div>}
      </RomanCardContent>
    </RomanCard>
  );
}

function DashboardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group/link -mx-3 flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-sm transition-[background-color,color] duration-150 hover:bg-primary/[0.06] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span>{children}</span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-roman-stone transition-transform duration-150 ease-out group-hover/link:translate-x-0.5 group-hover/link:text-primary motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

function DashboardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="shrink-0 font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-roman-stone">
          {title}
        </h2>
        <div className="h-px flex-1 bg-border/80" aria-hidden="true" />
      </div>
      {children}
    </section>
  );
}

function AdministrationPage() {
  const { makeAdminRequest } = useAdminApi();
  const [runningMigration, setRunningMigration] = useState<string | null>(null);
  const [migrationResults, setMigrationResults] = useState<Partial<Record<MigrationKey, MigrationResult>>>({});
  const [pendingMigration, setPendingMigration] = useState<MigrationKey | null>(null);
  const [pendingLearningPathAction, setPendingLearningPathAction] = useState<LearningPathWorkflowAction | null>(null);
  const [learningPathWorkflow, setLearningPathWorkflow] = useState<LearningPathMigrationWorkflow | null>(null);
  const [learningPathWorkflowLoading, setLearningPathWorkflowLoading] = useState(true);

  const createLearningPathMigrationId = () => {
    const timestamp = new Date().toISOString().replace(/\D/g, '');
    return `learning-path-${timestamp.slice(0, 8)}-${timestamp.slice(8, 14)}`;
  };

  const refreshLearningPathWorkflow = useCallback(async () => {
    setLearningPathWorkflowLoading(true);
    try {
      const workflow = await makeAdminRequest('learning-path/migration');
      setLearningPathWorkflow(workflow as LearningPathMigrationWorkflow);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load Learning Path migration workflow');
    } finally {
      setLearningPathWorkflowLoading(false);
    }
  }, [makeAdminRequest]);

  useEffect(() => {
    void refreshLearningPathWorkflow();
  }, [refreshLearningPathWorkflow]);

  const prepareLearningPathMigration = async () => {
    setRunningMigration('learningPath-prepare');
    try {
      const response = await makeAdminRequest('learning-path/migration', {
        method: 'POST',
        body: JSON.stringify({
          action: 'dry-run',
          migrationId: createLearningPathMigrationId(),
        }),
      });
      if (!response?.manifest || !response?.workflow) {
        throw new Error('The Learning Path preparation did not return a durable manifest');
      }
      setLearningPathWorkflow(response.workflow as LearningPathMigrationWorkflow);
      setMigrationResults(previous => ({
        ...previous,
        learningPath: { prepared: true, migrationId: response.manifest.migrationId },
      }));
      toast.success('Learning Path manifest prepared and saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Learning Path preparation failed');
    } finally {
      setRunningMigration(null);
    }
  };

  const recoverLearningPathMigration = async () => {
    setRunningMigration('learningPath-recover');
    try {
      const response = await makeAdminRequest('learning-path/migration', {
        method: 'POST',
        body: JSON.stringify({ action: 'recover' }),
      });
      setLearningPathWorkflow(response.workflow as LearningPathMigrationWorkflow);
      toast.success('Active Learning Path migration recovered and saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Learning Path recovery failed');
    } finally {
      setRunningMigration(null);
    }
  };

  const runLearningPathWorkflowAction = async (action: LearningPathWorkflowAction) => {
    const migrationId = learningPathWorkflow?.migration?.migrationId;
    if (!migrationId) {
      toast.error('Prepare or recover a Learning Path migration first');
      return;
    }

    setPendingLearningPathAction(null);
    setRunningMigration(`learningPath-${action}`);
    try {
      const response = await makeAdminRequest('learning-path/migration', {
        method: 'POST',
        body: JSON.stringify({ action, migrationId }),
      });
      let finalResponse = response;
      if (action === 'apply') {
        finalResponse = await makeAdminRequest('learning-path/migration', {
          method: 'POST',
          body: JSON.stringify({ action: 'verify', migrationId }),
        });
      }
      setLearningPathWorkflow(finalResponse.workflow as LearningPathMigrationWorkflow);
      setMigrationResults(previous => ({
        ...previous,
        learningPath: {
          action,
          migrationId,
          ...(finalResponse.verified ? { verified: true } : {}),
        },
      }));
      toast.success(
        action === 'apply'
          ? 'Learning Path applied and verified'
          : `Learning Path migration ${
              action === 'verify' ? 'verified' : action === 'rollback' ? 'rolled back' : 'retired'
            }`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Learning Path ${action} failed`);
      await refreshLearningPathWorkflow();
    } finally {
      setRunningMigration(null);
    }
  };

  const downloadLearningPathManifest = () => {
    const manifest = learningPathWorkflow?.migration?.manifest;
    if (!manifest) return;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `learning-path-manifest-${manifest.migrationId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const runMigration = async (key: MigrationKey, mode: MigrationMode) => {
    const endpoints: Record<MigrationKey, string> = {
      poolTokens: 'vocabulary-pools/backfill-search-tokens',
      lessonSummaries: 'lessons/backfill-summaries',
      learningPath: 'learning-path/migration',
    };
    const labels: Record<MigrationKey, string> = {
      poolTokens: 'vocabulary search tokens',
      lessonSummaries: 'lesson summaries',
      learningPath: 'Learning Path',
    };
    const isDryRun = mode === 'dryRun';
    const runId = `${key}-${mode}`;
    setRunningMigration(runId);

    try {
      const response = await makeAdminRequest(`${endpoints[key]}${isDryRun ? '?dryRun=true' : ''}`, { method: 'POST' });
      setMigrationResults(previous => ({ ...previous, [key]: response.data }));
      toast.success(`${isDryRun ? 'Dry run completed' : 'Migration completed'}: ${labels[key]}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Migration failed');
    } finally {
      setRunningMigration(null);
    }
  };

  const renderMigrationResult = (key: MigrationKey) => {
    const result = migrationResults[key];
    if (!result) return null;

    return (
      <pre className="mt-3 max-h-32 animate-in overflow-auto rounded-md border bg-white p-3 text-xs text-foreground fade-in slide-in-from-top-1 duration-200">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  };

  const migrationLabels: Record<MigrationKey, string> = {
    poolTokens: 'vocabulary search tokens',
    lessonSummaries: 'lesson summaries',
    learningPath: 'Learning Path',
  };
  const migrationLabel = pendingMigration ? migrationLabels[pendingMigration] : 'data';
  const learningPathMigration = learningPathWorkflow?.migration ?? null;
  const learningPathCutoverState = learningPathWorkflow?.path?.cutover?.state;
  const canApplyLearningPath =
    learningPathMigration?.status === 'prepared' || learningPathMigration?.status === 'rolled-back';
  const canVerifyLearningPath =
    learningPathCutoverState === 'active' &&
    (learningPathMigration?.status === 'active' || learningPathMigration?.status === 'verified');
  const canRollbackLearningPath = canVerifyLearningPath;
  const canRetireLearningPath = learningPathCutoverState === 'active' && learningPathMigration?.status === 'verified';

  const learningPathActionCopy: Record<
    LearningPathWorkflowAction,
    { title: string; description: string; confirm: string }
  > = {
    apply: {
      title: 'Apply Learning Path migration?',
      description:
        'This applies the immutable server-stored manifest and immediately verifies the admin and student projections. The rollback window remains open.',
      confirm: 'Apply and verify',
    },
    verify: {
      title: 'Verify Learning Path migration?',
      description: 'This rechecks the stored manifest, active path, legacy source, and both production projections.',
      confirm: 'Verify',
    },
    rollback: {
      title: 'Roll back Learning Path migration?',
      description:
        'This returns normal placement reads to the untouched legacy order. The durable manifest remains available for diagnosis and reapply.',
      confirm: 'Roll back',
    },
    retire: {
      title: 'Permanently retire the legacy fallback?',
      description:
        'This irreversible action removes cutover metadata, disables rollback, and enables Learning Path editing. It is available only after final verification.',
      confirm: 'Retire fallback',
    },
  };

  return (
    <AdminPage>
      <AdminPageHeader title="Administration" description="Manage lessons, vocabulary, tests and content." />

      <div className="space-y-7">
        <DashboardSection title="Content">
          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardCard
              icon={BookOpen}
              title="Lesson Management"
              description="Create, organize, and publish course lessons."
              primaryAction={
                <Button asChild size="sm">
                  <Link href="/admin/lessons/create">
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Create New Lesson
                  </Link>
                </Button>
              }>
              <DashboardLink href="/admin/lessons/manage">Manage Existing Lessons</DashboardLink>
              <DashboardLink href="/admin/lessons/live">Manage Live Lessons</DashboardLink>
              <DashboardLink href="/admin/practice-categories?lessonType=vocab&status=active">
                Manage Practice Categories
              </DashboardLink>
            </DashboardCard>
            <DashboardCard
              icon={LibraryBig}
              title="Vocabulary"
              description="View, edit, review, and organize Latin words.">
              <DashboardLink href="/admin/vocabulary">All Words</DashboardLink>
              <DashboardLink href="/admin/vocabulary/pending">Pending Review</DashboardLink>
              <DashboardLink href="/admin/vocabulary-pools">Vocabulary Pools</DashboardLink>
            </DashboardCard>
          </div>
        </DashboardSection>

        <DashboardSection title="Assessment">
          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardCard
              icon={FileCheck2}
              title="Tests"
              description="Create scored tests and manage their versions."
              primaryAction={
                <Button asChild size="sm">
                  <Link href="/admin/tests/create">
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Create Test
                  </Link>
                </Button>
              }>
              <DashboardLink href="/admin/tests/manage">Manage Tests</DashboardLink>
            </DashboardCard>
            <DashboardCard icon={ClipboardCheck} title="Mock Tests" description="Manage independent rehearsal cards.">
              <DashboardLink href="/admin/mock-tests">Manage Mock Tests</DashboardLink>
            </DashboardCard>
          </div>
        </DashboardSection>

        <DashboardSection title="System">
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <DashboardCard
              icon={ClipboardList}
              title="Diagramming Audit"
              description="Inspect student submissions and expected answers.">
              <DashboardLink href="/admin/diagramming-attempts">View Diagramming Attempts</DashboardLink>
            </DashboardCard>
            <DashboardCard icon={Database} title="Data Migrations" description="Temporary backfill tools.">
              <div className="space-y-4 pt-1">
                <div className="rounded-lg border border-border/70 bg-roman-marble/60 p-3">
                  <p className="mb-2 text-sm font-medium">Vocabulary Search Tokens</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={runningMigration !== null}
                      onClick={() => runMigration('poolTokens', 'dryRun')}>
                      {runningMigration === 'poolTokens-dryRun' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Dry Run
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="border border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10"
                      disabled={runningMigration !== null}
                      onClick={() => setPendingMigration('poolTokens')}>
                      {runningMigration === 'poolTokens-run' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Run
                    </Button>
                  </div>
                  {renderMigrationResult('poolTokens')}
                </div>
                <div className="rounded-lg border border-border/70 bg-roman-marble/60 p-3">
                  <p className="mb-2 text-sm font-medium">Lesson Summaries</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={runningMigration !== null}
                      onClick={() => runMigration('lessonSummaries', 'dryRun')}>
                      {runningMigration === 'lessonSummaries-dryRun' && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Dry Run
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="border border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10"
                      disabled={runningMigration !== null}
                      onClick={() => setPendingMigration('lessonSummaries')}>
                      {runningMigration === 'lessonSummaries-run' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Run
                    </Button>
                  </div>
                  {renderMigrationResult('lessonSummaries')}
                </div>
                <div className="rounded-lg border border-border/70 bg-roman-marble/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Learning Path</p>
                      <p className="mt-1 text-xs leading-relaxed text-roman-stone">
                        Durable, resumable manifest and cutover workflow.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0"
                      variant="outline"
                      aria-label="Refresh Learning Path migration"
                      disabled={runningMigration !== null}
                      onClick={() => void refreshLearningPathWorkflow()}>
                      <RefreshCw className={`h-4 w-4 ${learningPathWorkflowLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>

                  {learningPathWorkflowLoading && !learningPathWorkflow ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-roman-stone">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading migration state…
                    </div>
                  ) : learningPathWorkflow?.needsRecovery ? (
                    <div className="mt-3 rounded-md border border-amber-300/70 bg-amber-50 p-3">
                      <p className="text-xs font-medium text-amber-950">Active cutover needs a durable audit record</p>
                      <p className="mt-1 text-xs text-amber-900/80">
                        Recover the manifest from the active path and unchanged legacy source, then run final
                        verification.
                      </p>
                      <Button
                        size="sm"
                        className="mt-3"
                        disabled={runningMigration !== null}
                        onClick={() => void recoverLearningPathMigration()}>
                        {runningMigration === 'learningPath-recover' && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Recover active migration
                      </Button>
                    </div>
                  ) : learningPathMigration ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-md border bg-white/80 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{learningPathMigration.migrationId}</span>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                            {learningPathMigration.status}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-roman-stone">
                          <span>{learningPathMigration.manifest.unitIds.length} units</span>
                          <span className="text-right">{learningPathMigration.events.length} audit events</span>
                        </div>
                        <p
                          className="mt-2 truncate font-mono text-[0.6875rem] text-roman-stone"
                          title={learningPathMigration.manifest.sourceHash}>
                          {learningPathMigration.manifest.sourceHash}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" variant="outline" onClick={downloadLearningPathManifest}>
                          <Download className="mr-2 h-4 w-4" /> Download manifest
                        </Button>
                        {canApplyLearningPath && (
                          <Button
                            size="sm"
                            disabled={runningMigration !== null}
                            onClick={() => setPendingLearningPathAction('apply')}>
                            {runningMigration === 'learningPath-apply' && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Apply and verify
                          </Button>
                        )}
                        {canVerifyLearningPath && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={runningMigration !== null}
                            onClick={() => void runLearningPathWorkflowAction('verify')}>
                            <ShieldCheck className="mr-2 h-4 w-4" /> Verify again
                          </Button>
                        )}
                        {canRollbackLearningPath && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={runningMigration !== null}
                            onClick={() => setPendingLearningPathAction('rollback')}>
                            <Undo2 className="mr-2 h-4 w-4" /> Roll back
                          </Button>
                        )}
                        {canRetireLearningPath && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={runningMigration !== null}
                            onClick={() => setPendingLearningPathAction('retire')}>
                            Retire fallback
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label="Prepare Learning Path migration"
                        disabled={runningMigration !== null}
                        onClick={() => void prepareLearningPathMigration()}>
                        {runningMigration === 'learningPath-prepare' && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Prepare and save manifest
                      </Button>
                    </div>
                  )}

                  {learningPathMigration?.status === 'rolled-back' && (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      disabled={runningMigration !== null}
                      onClick={() => void prepareLearningPathMigration()}>
                      Prepare a new manifest
                    </Button>
                  )}
                  {renderMigrationResult('learningPath')}
                </div>
              </div>
            </DashboardCard>
          </div>
        </DashboardSection>
      </div>

      <ConfirmationDialog
        isOpen={pendingMigration !== null}
        onClose={() => setPendingMigration(null)}
        onConfirm={() => {
          if (pendingMigration) void runMigration(pendingMigration, 'run');
        }}
        title={`Run ${migrationLabel} migration?`}
        description="This will mutate production data. Run a dry run first if you have not already."
        confirmText="Run migration"
        confirmVariant="destructive"
      />

      <ConfirmationDialog
        isOpen={pendingLearningPathAction !== null}
        onClose={() => setPendingLearningPathAction(null)}
        onConfirm={() => {
          if (pendingLearningPathAction) void runLearningPathWorkflowAction(pendingLearningPathAction);
        }}
        title={pendingLearningPathAction ? learningPathActionCopy[pendingLearningPathAction].title : ''}
        description={pendingLearningPathAction ? learningPathActionCopy[pendingLearningPathAction].description : ''}
        confirmText={pendingLearningPathAction ? learningPathActionCopy[pendingLearningPathAction].confirm : 'Continue'}
        confirmVariant="destructive"
      />
    </AdminPage>
  );
}

export default withAdminAuth(AdministrationPage);
