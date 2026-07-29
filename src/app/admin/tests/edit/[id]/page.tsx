'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Edit, FilePlus2, Loader2 } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { MockAssignmentDialog } from '@/src/components/ui/admin/MockAssignmentDialog';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { PassingRequirementControl } from '@/src/components/ui/admin/test-version/PassingRequirementControl';
import { useGetTestByIdQuery, useUpdateTestSettingsMutation } from '@/src/store/api/testApi';
import type { TestUnit } from '@/src/types/learning-unit';
import type { MockTest, TestVersionSummary } from '@/src/types/test';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';

function VersionRow({ testId, version, role, mock, testTitle, passingPercentage }: { testId: string; version: TestVersionSummary; role: 'rotation' | 'mock'; mock?: MockTest; testTitle: string; passingPercentage: number | null }) {
  const [assigning, setAssigning] = React.useState(false);
  const effectivePassing = role === 'mock' ? mock!.passingPercentage : passingPercentage;
  const stakes = effectivePassing === null ? 'Score only' : `Pass ≥ ${effectivePassing}% (${((version.totalPoints * effectivePassing) / 100).toFixed(1)} of ${version.totalPoints} points)`;
  return <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><h3 className="font-medium">{version.name}</h3><p className="text-sm text-gray-600">{version.totalExercises} exercises · {version.totalPoints} points · last edited {version.updatedAt ? new Date(version.updatedAt).toLocaleDateString() : 'unknown'}</p><p className="mt-1 text-xs text-gray-600">{role === 'rotation' ? `In rotation — students receive one at random, least-used first. ${stakes}.` : `${mock!.isLive ? `Excluded from rotation · Live to students as “${mock!.title}”` : `Excluded from rotation · Hidden from students as “${mock!.title}”`} · ${stakes}.`}</p></div><div className="flex flex-wrap gap-2">{role === 'rotation' ? <><Button asChild size="sm" variant="outline"><Link href={`/admin/tests/edit/${testId}/versions/${version.id}/edit`}><Edit className="mr-1 h-4 w-4" />Edit and preview</Link></Button><Button asChild size="sm" variant="outline"><Link href={`/admin/tests/edit/${testId}/versions/${version.id}/edit?duplicate=1`}><Copy className="mr-1 h-4 w-4" />Duplicate</Link></Button><Button size="sm" variant="outline" onClick={() => setAssigning(true)}>Assign as mock</Button></> : <Button asChild size="sm"><Link href={`/admin/mock-tests/${mock!.id}`}>Edit mock-owned version</Link></Button>}</div></CardContent>{role === 'rotation' && <MockAssignmentDialog open={assigning} onOpenChange={setAssigning} testId={testId} versionId={version.id} defaultTitle={`${testTitle} — ${version.name}`} defaultPassingPercentage={passingPercentage} />}</Card>;
}

function TestSettings({ test }: { test: TestUnit }) {
  const [title, setTitle] = React.useState(test.title);
  const [description, setDescription] = React.useState(test.description);
  const [passingPercentage, setPassingPercentage] = React.useState<number | null>(test.passingPercentage);
  const baseline = React.useRef({ title: test.title, description: test.description, passingPercentage: test.passingPercentage });
  const [update, { isLoading }] = useUpdateTestSettingsMutation();
  const [status, setStatus] = React.useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const dirty = title !== baseline.current.title || description !== baseline.current.description || passingPercentage !== baseline.current.passingPercentage;
  useUnsavedNavigationGuard(dirty, 'You have unsaved test settings. Leave this page?');
  const save = async () => {
    setStatus(null);
    try {
      await update({ id: test.id, changes: { title: title.trim(), description: description.trim(), passingPercentage } }).unwrap();
      baseline.current = { title: title.trim(), description: description.trim(), passingPercentage };
      setTitle(title.trim());
      setDescription(description.trim());
      setStatus({ kind: 'success', message: 'Container settings saved.' });
    } catch (error) {
      setStatus({ kind: 'error', message: (error as { data?: { error?: string } })?.data?.error ?? 'Could not save test settings.' });
    }
  };
  const discard = () => {
    setTitle(baseline.current.title);
    setDescription(baseline.current.description);
    setPassingPercentage(baseline.current.passingPercentage);
    setStatus(null);
  };
  return <section className="space-y-4 rounded-lg border bg-white p-5" aria-labelledby="test-settings"><h2 id="test-settings" className="font-serif text-2xl">Container settings</h2><div className="space-y-2"><Label htmlFor="overview-test-title">Title</Label><Input id="overview-test-title" value={title} onChange={event => { setTitle(event.target.value); setStatus(null); }} /></div><div className="space-y-2"><Label htmlFor="overview-test-description">Description</Label><Textarea id="overview-test-description" value={description} onChange={event => { setDescription(event.target.value); setStatus(null); }} /></div><PassingRequirementControl value={passingPercentage} onChange={value => { setPassingPercentage(value); setStatus(null); }} />{status && <p role={status.kind === 'error' ? 'alert' : 'status'} className={status.kind === 'error' ? 'text-sm text-red-700' : 'text-sm text-green-700'}>{status.message}</p>}<div className="flex gap-2"><Button disabled={isLoading || !dirty || !title.trim()} onClick={() => void save()}>{isLoading ? 'Saving…' : 'Save container settings'}</Button><Button variant="outline" disabled={!dirty || isLoading} onClick={discard}>Discard settings</Button></div></section>;
}

function TestOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params); const { data: detail, isLoading, isError } = useGetTestByIdQuery(id);
  if (isLoading) return <div className="flex min-h-screen items-center justify-center" role="status"><Loader2 className="h-8 w-8 animate-spin" /><span className="sr-only">Loading test</span></div>;
  if (isError || !detail) return <main className="p-8 text-red-700" role="alert">Test not found or unavailable.</main>;
  const mocks = detail.mocks ?? [];
  return <main className="min-h-screen bg-roman-marble"><header className="flex flex-wrap items-center justify-between gap-2 border-b bg-white p-3"><Button asChild variant="ghost"><Link href="/admin/tests/manage"><ArrowLeft className="mr-2 h-4 w-4" />Test Management</Link></Button><Button asChild><Link href={`/admin/tests/edit/${id}/versions/create`}><FilePlus2 className="mr-2 h-4 w-4" />Add version</Link></Button></header><div className="container mx-auto max-w-5xl space-y-7 px-4 py-8"><section><span className="rounded bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-800">NORMAL TEST</span><h1 className="mt-3 font-serif text-3xl">{detail.test.title}</h1><p className="text-gray-600">{detail.test.description || 'No description'}</p><p className="mt-2 text-sm">{detail.test.passingPercentage === null ? 'Score only' : `Pass ≥ ${detail.test.passingPercentage}%`}</p></section><TestSettings test={detail.test} /><section aria-labelledby="rotation-versions"><h2 id="rotation-versions" className="mb-1 font-serif text-2xl">In rotation</h2><p className="mb-3 text-sm text-gray-600">Students receive one of these versions at random, least-used first.</p>{detail.versions.length ? <div className="space-y-3">{detail.versions.map(version => <VersionRow key={version.id} testId={id} version={version} role="rotation" testTitle={detail.test.title} passingPercentage={detail.test.passingPercentage} />)}</div> : <div className="rounded border border-dashed bg-white p-5 text-sm text-gray-600">No versions are currently in rotation. This unplaced normal-test container is valid; add a version before placing it in the Learning Path.</div>}</section><section aria-labelledby="mock-cards"><h2 id="mock-cards" className="mb-1 font-serif text-2xl">Mock cards</h2><p className="mb-3 text-sm text-gray-600">These versions are mock-only and are excluded from normal rotation.</p>{mocks.length ? <div className="space-y-3">{mocks.map(mock => <VersionRow key={mock.id} testId={id} version={mock.version} role="mock" mock={mock} testTitle={detail.test.title} passingPercentage={detail.test.passingPercentage} />)}</div> : <p className="text-sm text-gray-600">No active parent-linked mock cards.</p>}</section></div></main>;
}
export default withAdminAuth(TestOverviewPage);
