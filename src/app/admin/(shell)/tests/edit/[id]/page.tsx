'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarDays,
  Copy,
  Edit,
  Eye,
  EyeOff,
  FileCheck2,
  Layers3,
  Loader2,
  Plus,
  Shuffle,
} from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminEmptyState, AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { MockAssignmentDialog } from '@/src/components/ui/admin/MockAssignmentDialog';
import { PassingRequirementControl } from '@/src/components/ui/admin/test-version/PassingRequirementControl';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { UnsavedNavigationDialog } from '@/src/components/ui/core/UnsavedNavigationDialog';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useActivateTestVersionMutation,
  useDeactivateTestVersionMutation,
  useGetTestByIdQuery,
  useUpdateTestSettingsMutation,
} from '@/src/store/api/testApi';
import type { TestUnit } from '@/src/types/learning-unit';
import type { MockTest, TestVersionSummary } from '@/src/types/test';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

interface StatProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  className?: string;
}

function Stat({ icon: Icon, label, value, className }: StatProps) {
  return (
    <div className={`flex items-center gap-3 border-b px-5 py-4 last:border-b-0 sm:border-r sm:last:border-r-0 ${className ?? ''}`.trim()}>
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

interface VersionRowProps {
  testId: string;
  version: TestVersionSummary;
  role: 'rotation' | 'draft' | 'mock';
  mock?: MockTest;
  testTitle: string;
  passingPercentage: number | null;
}

function VersionRow({ testId, version, role, mock, testTitle, passingPercentage }: VersionRowProps) {
  const [assigning, setAssigning] = React.useState(false);
  const [confirming, setConfirming] = React.useState<'activate' | 'deactivate' | null>(null);
  const [activate, activateState] = useActivateTestVersionMutation();
  const [deactivate, deactivateState] = useDeactivateTestVersionMutation();
  const effectivePassing = role === 'mock' ? mock!.passingPercentage : passingPercentage;
  const stakes =
    effectivePassing === null
      ? 'Score only'
      : `Pass ≥ ${effectivePassing}% (${((version.totalPoints * effectivePassing) / 100).toFixed(1)} of ${version.totalPoints} points)`;
  const changeLifecycle = async () => {
    const action = confirming;
    if (!action) return;
    try {
      if (action === 'activate') {
        await activate({ testId, versionId: version.id }).unwrap();
        toast.success(`${version.name} is now active in rotation`);
      } else {
        await deactivate({ testId, versionId: version.id }).unwrap();
        toast.success(`${version.name} is now inactive`);
      }
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          action === 'activate' ? 'Could not activate this version.' : 'Could not deactivate this version.'
        )
      );
    }
  };

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {role === 'rotation' ? (
                <Badge
                  variant="outline"
                  className="gap-1.5 border-roman-gold/45 bg-roman-gold/[0.12] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-foreground">
                  <Shuffle className="h-3.5 w-3.5 text-roman-gold" aria-hidden="true" />
                  In rotation
                </Badge>
              ) : role === 'draft' ? (
                <Badge
                  variant="outline"
                  className="gap-1.5 border-amber-500/35 bg-amber-50 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-amber-800">
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  Inactive draft
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className={`gap-1.5 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] ${
                    mock!.isLive
                      ? 'border-roman-green/30 bg-roman-green/10 text-roman-green'
                      : 'border-roman-stone/30 bg-roman-stone/10 text-roman-stone'
                  }`}>
                  {mock!.isLive ? (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {mock!.isLive ? 'Live to students' : 'Hidden from students'}
                </Badge>
              )}
              <span className="text-sm text-roman-stone" aria-hidden="true">
                · {stakes}
              </span>
            </div>

            <h3 className="break-words font-serif text-xl leading-tight tracking-tight text-foreground sm:text-[1.4rem]">
              {version.name}
            </h3>
            {role === 'mock' && (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {mock!.isLive ? 'Live to students as' : 'Hidden from students as'} “{mock!.title}”
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 self-start">
            {role === 'rotation' ? (
              <>
                <Button asChild size="sm">
                  <Link href={`/admin/tests/edit/${testId}/versions/${version.id}/edit`}>
                    <Edit className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Edit
                    <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/tests/edit/${testId}/versions/${version.id}/edit?duplicate=1`}>
                    <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Duplicate
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAssigning(true)}>
                  Assign as mock
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deactivateState.isLoading}
                  onClick={() => setConfirming('deactivate')}>
                  Deactivate
                </Button>
              </>
            ) : role === 'draft' ? (
              <>
                <Button asChild size="sm">
                  <Link href={`/admin/tests/edit/${testId}/versions/${version.id}/edit`}>
                    <Edit className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Edit draft
                    <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activateState.isLoading}
                  onClick={() => setConfirming('activate')}>
                  {activateState.isLoading ? 'Activating…' : 'Activate'}
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <Link href={`/admin/mock-tests/${mock!.id}`}>
                  <Edit className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Manage mock
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid border-t bg-muted/30 sm:grid-cols-3">
          <Stat icon={FileCheck2} label="Exercises" value={version.totalExercises} />
          <Stat icon={Layers3} label="Points" value={version.totalPoints} />
          <Stat
            icon={CalendarDays}
            label="Last edited"
            value={version.updatedAt ? new Date(version.updatedAt).toLocaleDateString() : 'unknown'}
          />
        </div>
      </CardContent>
      {role === 'rotation' && (
        <MockAssignmentDialog
          open={assigning}
          onOpenChange={setAssigning}
          testId={testId}
          versionId={version.id}
          defaultTitle={`${testTitle} — ${version.name}`}
          defaultPassingPercentage={passingPercentage}
        />
      )}
      <ConfirmationDialog
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => void changeLifecycle()}
        title={confirming === 'activate' ? `Activate ${version.name}?` : `Deactivate ${version.name}?`}
        description={
          confirming === 'activate'
            ? 'Activation adds this version to rotation. It can be selected for new student attempts as soon as this test is available in the Learning Path.'
            : 'Deactivation removes this version from new-attempt rotation. Existing in-progress attempts keep their frozen copy. A Learning Path test cannot lose its final active version.'
        }
        confirmText={confirming === 'activate' ? 'Activate version' : 'Deactivate version'}
        confirmVariant={confirming === 'deactivate' ? 'destructive' : undefined}
      />
    </Card>
  );
}

function TestSettings({ test }: { test: TestUnit }) {
  const [title, setTitle] = React.useState(test.title);
  const [description, setDescription] = React.useState(test.description);
  const [passingPercentage, setPassingPercentage] = React.useState<number | null>(test.passingPercentage);
  const baseline = React.useRef({
    title: test.title,
    description: test.description,
    passingPercentage: test.passingPercentage,
  });
  const [update, { isLoading }] = useUpdateTestSettingsMutation();
  const [status, setStatus] = React.useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const dirty =
    title !== baseline.current.title ||
    description !== baseline.current.description ||
    passingPercentage !== baseline.current.passingPercentage;
  const navigationGuard = useUnsavedNavigationGuard(
    dirty,
    'Your test settings have not been saved. Leave this page anyway?'
  );

  const save = async () => {
    setStatus(null);
    try {
      await update({
        id: test.id,
        changes: { title: title.trim(), description: description.trim(), passingPercentage },
      }).unwrap();
      baseline.current = { title: title.trim(), description: description.trim(), passingPercentage };
      setTitle(title.trim());
      setDescription(description.trim());
      setStatus({ kind: 'success', message: 'Container settings saved.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: getApiErrorMessage(error, 'Could not save test settings.'),
      });
    }
  };

  const discard = () => {
    setTitle(baseline.current.title);
    setDescription(baseline.current.description);
    setPassingPercentage(baseline.current.passingPercentage);
    setStatus(null);
  };

  return (
    <Card aria-labelledby="test-settings">
      <CardContent className="space-y-4 p-5">
        <h2 id="test-settings" className="font-serif text-xl">
          Container settings
        </h2>
        <div className="space-y-2">
          <Label htmlFor="overview-test-title">Title</Label>
          <Input
            id="overview-test-title"
            value={title}
            onChange={event => {
              setTitle(event.target.value);
              setStatus(null);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="overview-test-description">Description</Label>
          <Textarea
            id="overview-test-description"
            value={description}
            onChange={event => {
              setDescription(event.target.value);
              setStatus(null);
            }}
          />
        </div>
        <PassingRequirementControl
          value={passingPercentage}
          onChange={value => {
            setPassingPercentage(value);
            setStatus(null);
          }}
        />
        {status && (
          <p
            role={status.kind === 'error' ? 'alert' : 'status'}
            className={status.kind === 'error' ? 'text-sm text-red-700' : 'text-sm text-roman-green'}>
            {status.message}
          </p>
        )}
        <div className="flex gap-2">
          <Button disabled={isLoading || !dirty || !title.trim()} onClick={() => void save()}>
            {isLoading ? 'Saving…' : 'Save container settings'}
          </Button>
          <Button variant="outline" disabled={!dirty || isLoading} onClick={discard}>
            Discard settings
          </Button>
        </div>
        <UnsavedNavigationDialog guard={navigationGuard} />
      </CardContent>
    </Card>
  );
}

function SectionHeading({ id, title, count }: { id: string; title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 id={id} className="font-serif text-xl">
        {title}
      </h2>
      {count !== undefined && (
        <span className="text-sm text-roman-stone">{count === 1 ? `${count} item` : `${count} items`}</span>
      )}
    </div>
  );
}

function AddVersionButton({ testId, className }: { testId: string; className?: string }) {
  return (
    <Button
      asChild
      variant="ghost"
      className={`h-9 rounded-full border border-dashed border-roman-gold/50 bg-white/70 px-3 text-sm font-medium text-foreground hover:border-roman-gold hover:bg-roman-gold/10 ${className ?? ''}`.trim()}>
      <Link href={`/admin/tests/edit/${testId}/versions/create`}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Add inactive version
      </Link>
    </Button>
  );
}

function TestOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data: detail, isLoading, isError } = useGetTestByIdQuery(id);

  if (isLoading) {
    return (
      <AdminPage className="flex items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="sr-only">Loading test</span>
      </AdminPage>
    );
  }
  if (isError || !detail)
    return (
      <AdminPage role="alert" className="text-red-700">
        Test not found or unavailable.
      </AdminPage>
    );

  const mocks = detail.mocks ?? [];
  const drafts = detail.drafts ?? [];
  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl space-y-7">
        <AdminPageHeader title={detail.test.title} description={detail.test.description || 'No description'} />

        <TestSettings test={detail.test} />

        <section aria-labelledby="rotation-versions">
          <SectionHeading id="rotation-versions" title="In rotation" count={detail.versions.length} />
          <p className="mb-3 text-sm text-roman-stone">
            Students receive one of these versions at random, least-used first.
          </p>
          {detail.versions.length ? (
            <div className="space-y-3">
              {detail.versions.map(version => (
                <VersionRow
                  key={version.id}
                  testId={id}
                  version={version}
                  role="rotation"
                  testTitle={detail.test.title}
                  passingPercentage={detail.test.passingPercentage}
                />
              ))}
              <AddVersionButton testId={id} className="w-full" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <AdminEmptyState
                  icon={Layers3}
                  title="No versions in rotation"
                  description="This unplaced normal-test container is valid. Create and activate a version before placing it in the Learning Path."
                  action={<AddVersionButton testId={id} />}
                />
              </CardContent>
            </Card>
          )}
        </section>

        <section aria-labelledby="inactive-versions">
          <SectionHeading id="inactive-versions" title="Inactive drafts" count={drafts.length} />
          <p className="mb-3 text-sm text-roman-stone">
            Drafts are admin-only. Save and preview incomplete work here, then activate it when it is ready for
            student rotation.
          </p>
          {drafts.length ? (
            <div className="space-y-3">
              {drafts.map(version => (
                <VersionRow
                  key={version.id}
                  testId={id}
                  version={version}
                  role="draft"
                  testTitle={detail.test.title}
                  passingPercentage={detail.test.passingPercentage}
                />
              ))}
              <AddVersionButton testId={id} className="w-full" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <AdminEmptyState
                  icon={EyeOff}
                  title="No inactive drafts"
                  description="New and duplicated versions appear here until an admin activates them."
                  action={<AddVersionButton testId={id} />}
                />
              </CardContent>
            </Card>
          )}
        </section>

        <section aria-labelledby="mock-cards">
          <SectionHeading id="mock-cards" title="Mock cards" count={mocks.length} />
          <p className="mb-3 text-sm text-roman-stone">These versions are mock-only and excluded from rotation.</p>
          {mocks.length ? (
            <div className="space-y-3">
              {mocks.map(mock => (
                <VersionRow
                  key={mock.id}
                  testId={id}
                  version={mock.version}
                  role="mock"
                  mock={mock}
                  testTitle={detail.test.title}
                  passingPercentage={detail.test.passingPercentage}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <AdminEmptyState
                  icon={EyeOff}
                  title="No mock cards"
                  description="No versions are assigned as mock-only cards for this test."
                />
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </AdminPage>
  );
}

export default withAdminAuth(TestOverviewPage);
