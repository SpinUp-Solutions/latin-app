'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileCheck2,
  LibraryBig,
  Loader2,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminIconChip, AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { Button } from '@/src/components/ui/button';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { useAdminApi } from '@/src/hooks/useAdminApi';
import type { LearningPathMigrationManifestInput } from '@/src/lib/learning-units/schemas';
import { toast } from 'sonner';

type MigrationKey = 'poolTokens' | 'lessonSummaries' | 'learningPath';
type MigrationMode = 'dryRun' | 'run';
type MigrationResult = Record<string, unknown>;

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
  const [learningPathManifest, setLearningPathManifest] = useState<LearningPathMigrationManifestInput | null>(null);

  const createLearningPathMigrationId = () => {
    const timestamp = new Date().toISOString().replace(/\D/g, '');
    return `learning-path-${timestamp.slice(0, 8)}-${timestamp.slice(8, 14)}`;
  };

  const runLearningPathMigration = async (mode: MigrationMode) => {
    const runId = `learningPath-${mode}`;
    let appliedResult: unknown;
    setRunningMigration(runId);

    try {
      if (mode === 'dryRun') {
        const response = await makeAdminRequest('learning-path/migration', {
          method: 'POST',
          body: JSON.stringify({
            action: 'dry-run',
            migrationId: createLearningPathMigrationId(),
          }),
        });
        if (!response?.manifest) {
          throw new Error('The Learning Path dry run did not return a manifest');
        }

        const manifest = response.manifest as LearningPathMigrationManifestInput;
        setLearningPathManifest(manifest);
        setMigrationResults(previous => ({ ...previous, learningPath: { manifest } }));
        toast.success('Dry run completed: Learning Path');
        return;
      }

      if (!learningPathManifest) {
        throw new Error('Run a Learning Path dry run before applying the migration');
      }

      appliedResult = await makeAdminRequest('learning-path/migration', {
        method: 'POST',
        body: JSON.stringify({ action: 'apply', manifest: learningPathManifest }),
      });
      setMigrationResults(previous => ({
        ...previous,
        learningPath: {
          manifest: learningPathManifest,
          applied: appliedResult,
          verification: { status: 'pending' },
        },
      }));

      const verification = await makeAdminRequest('learning-path/migration', {
        method: 'POST',
        body: JSON.stringify({ action: 'verify', manifest: learningPathManifest }),
      });
      setMigrationResults(previous => ({
        ...previous,
        learningPath: { manifest: learningPathManifest, applied: appliedResult, verification },
      }));
      toast.success('Learning Path migration applied and verified');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Learning Path migration failed';
      if (mode === 'run' && appliedResult && learningPathManifest) {
        setMigrationResults(previous => ({
          ...previous,
          learningPath: {
            manifest: learningPathManifest,
            applied: appliedResult,
            verification: { status: 'failed', error: message },
          },
        }));
        toast.error(`The migration was applied but verification failed: ${message}. Use rollback before retrying.`);
      } else {
        toast.error(message);
      }
    } finally {
      setRunningMigration(null);
    }
  };

  const runMigration = async (key: MigrationKey, mode: MigrationMode) => {
    if (key === 'learningPath') {
      await runLearningPathMigration(mode);
      return;
    }

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
  const isLearningPathConfirmation = pendingMigration === 'learningPath';

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
                  <p className="text-sm font-medium">Learning Path</p>
                  <p className="mb-2 mt-1 text-xs leading-relaxed text-roman-stone">
                    Build and review the legacy lesson manifest before applying it. Run applies that exact manifest and
                    immediately verifies the admin and student order.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="Dry run Learning Path migration"
                      disabled={runningMigration !== null}
                      onClick={() => runMigration('learningPath', 'dryRun')}>
                      {runningMigration === 'learningPath-dryRun' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Dry Run
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="border border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10"
                      aria-label="Run Learning Path migration"
                      disabled={runningMigration !== null || !learningPathManifest}
                      onClick={() => setPendingMigration('learningPath')}>
                      {runningMigration === 'learningPath-run' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Run
                    </Button>
                  </div>
                  {!learningPathManifest && (
                    <p className="mt-2 text-xs text-roman-stone">Run is enabled after a successful dry run.</p>
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
        description={
          isLearningPathConfirmation
            ? 'This will create the canonical Learning Path from the exact manifest shown in the dry-run result, then verify the admin and student projections. The rollback window will remain open.'
            : 'This will mutate production data. Run a dry run first if you have not already.'
        }
        confirmText={isLearningPathConfirmation ? 'Apply and verify' : 'Run migration'}
        confirmVariant="destructive"
      />
    </AdminPage>
  );
}

export default withAdminAuth(AdministrationPage);
