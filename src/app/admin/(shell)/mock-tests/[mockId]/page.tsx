'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { shallowEqual } from 'react-redux';
import { useRouter } from 'next/navigation';
import { Archive, Copy, Loader2, MoveRight, Save } from 'lucide-react';
import { toast } from 'sonner';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { TestVersionEditor } from '@/src/components/ui/admin';
import type { TestVersionEditorValue } from '@/src/components/ui/admin/TestVersionEditor';
import { PassingRequirementControl } from '@/src/components/ui/admin/test-version/PassingRequirementControl';
import { TestVersionPreview } from '@/src/components/ui/admin/test-version/TestVersionPreview';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { useAppSelector } from '@/src/store/hooks';
import { useGetTestsQuery, useGetTestVersionByIdQuery } from '@/src/store/api/testApi';
import {
  useArchiveMockMutation,
  useDuplicateMockIntoTestMutation,
  useGetMockQuery,
  useMoveMockToTestMutation,
  useReactivateStandaloneMockMutation,
  useUpdateMockMutation,
  useUpdateMockVersionMutation,
} from '@/src/store/api/mockTestApi';
import type { MockTest } from '@/src/types/test';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { AdminPage, AdminPageHeader, AdminStatusBadge } from '@/src/components/admin/shell';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { UnsavedNavigationDialog } from '@/src/components/ui/core/UnsavedNavigationDialog';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';

const errorMessage = (error: unknown) => getApiErrorMessage(error, 'The change could not be saved.');

interface MockCardSettings {
  title: string;
  description: string;
  passingPercentage: number | null;
  isLive: boolean;
}

const EMPTY_MOCK_SETTINGS: MockCardSettings = {
  title: '',
  description: '',
  passingPercentage: null,
  isLive: false,
};

function getMockCardSettings(mock: MockTest): MockCardSettings {
  return {
    title: mock.title,
    description: mock.description,
    passingPercentage: mock.passingPercentage,
    isLive: mock.isLive,
  };
}

function MockOverviewPage({ params }: { params: Promise<{ mockId: string }> }) {
  const { mockId } = use(params);
  const router = useRouter();
  const { data: incomingMock, isLoading, isError, refetch: refetchMock } = useGetMockQuery(mockId);
  const [displayedMock, setDisplayedMock] = useState<MockTest | null>(null);
  const mock = displayedMock ?? incomingMock;
  const {
    data: version,
    isLoading: loadingVersion,
    isError: versionError,
    refetch: refetchVersion,
  } = useGetTestVersionByIdQuery(mock?.versionId ?? '', { skip: !mock });
  const { data: tests = [], isLoading: loadingTests, isError: testsError, refetch: refetchTests } = useGetTestsQuery();
  const [update, { isLoading: saving }] = useUpdateMockMutation();
  const [updateVersion, { isLoading: savingVersion }] = useUpdateMockVersionMutation();
  const [archive, { isLoading: archiving }] = useArchiveMockMutation();
  const [reactivate, { isLoading: reactivating }] = useReactivateStandaloneMockMutation();
  const [move, { isLoading: moving }] = useMoveMockToTestMutation();
  const [duplicate, { isLoading: duplicating }] = useDuplicateMockIntoTestMutation();
  const [settings, setSettings] = useState<MockCardSettings>(EMPTY_MOCK_SETTINGS);
  const { title, description, passingPercentage, isLive } = settings;
  const [testId, setTestId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const versionDirty = useAppSelector(state => state.lessonEditor.dirty);
  const settingsBaseline = useRef(EMPTY_MOCK_SETTINGS);
  const latestSettings = useRef(settings);
  const duplicateRequestId = useRef<string | null>(null);
  const initializedMockId = useRef<string | null>(null);
  const lastIncomingMock = useRef<MockTest | null>(null);
  const pendingMockSnapshot = useRef<MockTest | null>(null);
  const versionDirtyRef = useRef(false);
  const [hasDeferredSnapshot, setHasDeferredSnapshot] = useState(false);
  const settingsDirty = !shallowEqual(settings, settingsBaseline.current);
  const dirty = versionDirty || settingsDirty;
  latestSettings.current = settings;
  versionDirtyRef.current = versionDirty;
  const updateSetting = <Key extends keyof MockCardSettings>(key: Key, value: MockCardSettings[Key]) =>
    setSettings(current => ({ ...current, [key]: value }));
  const applyMockSnapshot = useCallback((snapshot: MockTest) => {
    const nextSettings = getMockCardSettings(snapshot);
    setDisplayedMock(snapshot);
    setSettings(nextSettings);
    settingsBaseline.current = nextSettings;
    initializedMockId.current = snapshot.id;
    pendingMockSnapshot.current = null;
    setHasDeferredSnapshot(false);
  }, []);

  useEffect(() => {
    if (!incomingMock) return;
    if (lastIncomingMock.current === incomingMock) return;
    lastIncomingMock.current = incomingMock;
    if (initializedMockId.current === incomingMock.id && dirty) {
      pendingMockSnapshot.current = incomingMock;
      setHasDeferredSnapshot(true);
      return;
    }
    applyMockSnapshot(incomingMock);
  }, [applyMockSnapshot, dirty, incomingMock]);

  useEffect(() => {
    if (dirty || !pendingMockSnapshot.current) return;
    const latest = pendingMockSnapshot.current;
    applyMockSnapshot(latest);
    setError('The latest server state has been applied.');
  }, [applyMockSnapshot, dirty]);

  useEffect(() => {
    duplicateRequestId.current = null;
  }, [testId]);

  const navigationGuard = useUnsavedNavigationGuard(
    dirty,
    'Your mock test changes have not been saved. Leave this page anyway?'
  );

  const navigate = (href: string) => {
    navigationGuard.requestNavigation(() => router.push(href));
  };

  const submit = async () => {
    setError(null);
    try {
      const submittedSettings = settings;
      const result = await update({
        id: mockId,
        body: { title: title.trim(), description: description.trim(), passingPercentage, isLive },
      }).unwrap();
      const saved = result.mock;
      const savedSettings = getMockCardSettings(saved);
      settingsBaseline.current = savedSettings;
      if (shallowEqual(latestSettings.current, submittedSettings)) setSettings(savedSettings);
      if (versionDirtyRef.current) {
        pendingMockSnapshot.current = saved;
        setHasDeferredSnapshot(true);
      } else {
        setDisplayedMock(saved);
        pendingMockSnapshot.current = null;
        setHasDeferredSnapshot(false);
      }
      toast.success('Mock card settings saved');
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  const discardSettings = () => {
    setSettings(settingsBaseline.current);
  };

  const saveVersion = async (value: TestVersionEditorValue) => {
    if (!mock || !version) return;
    try {
      await updateVersion({
        mockId: mock.id,
        parentTestId: mock.parent.kind === 'test' ? mock.parent.testId : undefined,
        versionId: version.id,
        changes: {
          name: value.version.name,
          pages: value.version.pages,
          vocabularyPoolId: value.version.vocabularyPoolId,
        },
      }).unwrap();
      toast.success('Mock test version saved');
    } catch (reason) {
      const message = errorMessage(reason);
      toast.error(message);
      throw reason;
    }
  };

  const transfer = async (kind: 'move' | 'duplicate') => {
    if (!testId || !mock || dirty) {
      if (dirty) setError('Save or explicitly discard all card and version changes before moving or duplicating it.');
      return;
    }
    const selected = tests.find(test => test.id === testId);
    const action =
      kind === 'move'
        ? `Move this version into ${selected?.title ?? 'the selected test'}? The mock card will be archived and this exact version will join normal rotation.`
        : `Duplicate this version into ${selected?.title ?? 'the selected test'}? A new copy will join normal rotation and this mock card will stay active.`;
    if (!window.confirm(action)) return;
    setError(null);
    try {
      if (kind === 'move') {
        await move({ id: mockId, body: { testId } }).unwrap();
        toast.success('Version moved into normal rotation; the mock card was archived.');
      } else {
        duplicateRequestId.current ??= `duplicate-${crypto.randomUUID()}`;
        await duplicate({ id: mockId, body: { testId, requestId: duplicateRequestId.current } }).unwrap();
        duplicateRequestId.current = null;
        toast.success('Version copied into normal rotation; the mock card remains active.');
      }
      navigate(`/admin/tests/edit/${testId}`);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  if (isLoading || loadingVersion)
    return (
      <AdminPage className="flex items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="sr-only">Loading mock test</span>
      </AdminPage>
    );
  if (!mock || !version)
    return <AdminPage role="alert">Mock test or its version is unavailable. Retry from the Mock Tests page.</AdminPage>;
  const standalone = mock.parent.kind === 'standalone';
  const archivedStandalone = standalone && mock.status === 'archived';
  const parentTestId = mock.parent.kind === 'test' ? mock.parent.testId : undefined;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminPageHeader
          title={<SimpleRichDisplay content={mock.title} />}
          description={
            mock.status === 'archived'
              ? 'Assignment ended.'
              : mock.isLive
                ? 'Live to students.'
                : 'Hidden from students (still mock-only).'
          }
          actions={
            parentTestId ? (
              <Button variant="outline" onClick={() => navigate(`/admin/tests/edit/${parentTestId}`)}>
                View parent test
              </Button>
            ) : undefined
          }
        />
        {(isError || versionError) && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <span>
              Latest server data could not be refreshed. Your current editor and unsaved changes are preserved.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void Promise.all([
                  isError ? refetchMock() : Promise.resolve(),
                  versionError ? refetchVersion() : Promise.resolve(),
                ])
              }>
              Retry refresh
            </Button>
          </div>
        )}
        <AdminStatusBadge tone={mock.status === 'archived' ? 'neutral' : mock.isLive ? 'success' : 'warning'}>
          {mock.status === 'archived' ? 'Archived mock test' : mock.isLive ? 'Live mock test' : 'Hidden mock test'}
        </AdminStatusBadge>
        <section className="space-y-4 rounded-lg border bg-white p-5">
          <h2 className="font-serif text-xl">Mock card settings</h2>
          <div className="space-y-2">
            <Label htmlFor="title">Student-facing title</Label>
            <Input
              id="title"
              value={title}
              onChange={event => updateSetting('title', event.target.value)}
              disabled={mock.status === 'archived'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={event => updateSetting('description', event.target.value)}
              disabled={mock.status === 'archived'}
            />
          </div>
          <fieldset disabled={mock.status === 'archived'}>
            <PassingRequirementControl
              value={passingPercentage}
              onChange={value => updateSetting('passingPercentage', value)}
            />
          </fieldset>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              aria-label="Live to students"
              checked={isLive}
              onChange={event => updateSetting('isLive', event.target.checked)}
              disabled={mock.status === 'archived'}
            />
            Live to students
          </label>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={saving || mock.status === 'archived' || !title.trim()}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
            <Button variant="outline" onClick={() => setDiscardConfirmationOpen(true)} disabled={!settingsDirty}>
              Discard card changes
            </Button>
          </div>
        </section>
        {dirty && (
          <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Save or explicitly discard all card and version changes before leaving or changing delivery ownership.
            {hasDeferredSnapshot ? ' A newer server state is waiting and will be applied when the draft is clean.' : ''}
          </p>
        )}
        {mock.status === 'active' && (
          <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-serif text-xl">Delivery ownership</h2>
            <p className="text-sm">
              This card exclusively owns one version. Archive it to end the mock assignment
              {mock.parent.kind === 'test' ? ' and return the version to its parent rotation' : ''}.
            </p>
            <Button
              variant="destructive"
              onClick={() => {
                if (dirty) {
                  setError('Save or explicitly discard all card and version changes before archiving.');
                  return;
                }
                if (window.confirm('Archive this mock assignment? This changes future delivery only.'))
                  void archive(mockId)
                    .unwrap()
                    .then(() => toast.success('Mock assignment archived'))
                    .catch(reason => setError(errorMessage(reason)));
              }}
              disabled={archiving || dirty}>
              <Archive className="mr-2 h-4 w-4" />
              {archiving ? 'Archiving…' : 'Archive assignment'}
            </Button>
          </section>
        )}
        {archivedStandalone && (
          <section className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-5">
            <h2 className="font-serif text-xl">Reactivate standalone mock</h2>
            <p className="text-sm">
              Reactivate this same mock and version ID only while its version is not owned by normal rotation or another
              active mock.
            </p>
            <Button
              onClick={() => {
                if (window.confirm('Reactivate this standalone mock using its existing version and history?'))
                  void reactivate({ id: mockId, body: { isLive: false } })
                    .unwrap()
                    .then(() => toast.success('Standalone mock reactivated'))
                    .catch(reason => setError(errorMessage(reason)));
              }}
              disabled={reactivating}>
              {reactivating ? 'Reactivating…' : 'Reactivate as hidden mock'}
            </Button>
          </section>
        )}
        {standalone && mock.status === 'active' && (
          <section className="space-y-3 rounded-lg border bg-white p-5">
            <h2 className="font-serif text-xl">Use this version in normal rotation</h2>
            <p className="text-sm text-gray-600">
              Move transfers this exact version and archives the mock card. Duplicate creates a separate normal-rotation
              version and keeps this card active.
            </p>
            {dirty && (
              <p className="text-sm text-amber-800">
                Save or explicitly discard all changes before transferring this version.
              </p>
            )}
            {loadingTests ? (
              <p role="status" className="text-sm">
                Loading normal tests…
              </p>
            ) : testsError ? (
              <div role="alert" className="flex items-center gap-3 text-sm text-red-700">
                Unable to load normal tests.
                <Button size="sm" variant="outline" onClick={() => void refetchTests()}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <Label htmlFor="target-test">Target normal test</Label>
                <select
                  id="target-test"
                  className="w-full rounded border p-2"
                  value={testId}
                  onChange={event => setTestId(event.target.value)}>
                  <option value="">Select a normal test</option>
                  {tests.map(test => (
                    <option key={test.id} value={test.id}>
                      {test.title}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!testId || moving || duplicating || dirty}
                    onClick={() => void transfer('move')}>
                    <MoveRight className="mr-2 h-4 w-4" />
                    Move and archive mock
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!testId || moving || duplicating || dirty}
                    onClick={() => void transfer('duplicate')}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate into rotation
                  </Button>
                </div>
              </>
            )}
          </section>
        )}
        <section className="overflow-hidden rounded-lg border bg-white">
          <div className="border-b p-5">
            <h2 className="font-serif text-xl">Version content and preview</h2>
            <p className="text-sm text-gray-600">
              {mock.status === 'active'
                ? 'This mock owns one editable version. Saving updates that version and its interactive preview.'
                : mock.parent.kind === 'test'
                  ? 'This archived assignment no longer owns the version. Preview it here; edit it from its parent normal test.'
                  : 'This archived standalone assignment is read-only here. Preview it below; its version may be unowned or in normal rotation.'}
            </p>
          </div>
          {mock.status === 'active' ? (
            <div className="h-[min(85vh,900px)]">
              <TestVersionEditor
                key={version.id}
                initialTest={{
                  id: mock.id,
                  kind: 'test',
                  title: mock.title,
                  description: mock.description,
                  passingPercentage: mock.passingPercentage,
                  rotationVersions: [],
                }}
                initialVersion={version}
                onSave={saveVersion}
                saving={savingVersion}
                hideTestSettings
                manageNavigationGuard={false}
              />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl p-5">
              <TestVersionPreview
                title={<SimpleRichDisplay content={mock.title} />}
                description={mock.description ? <SimpleRichDisplay content={mock.description} /> : undefined}
                pages={version.pages}
                vocabularyPoolId={version.vocabularyPoolId}
              />
            </div>
          )}
        </section>
      </div>
      <UnsavedNavigationDialog guard={navigationGuard} />
      <ConfirmationDialog
        isOpen={discardConfirmationOpen}
        onClose={() => setDiscardConfirmationOpen(false)}
        onConfirm={discardSettings}
        title="Discard card changes?"
        description="This resets the card settings to the last saved state. Version changes are not affected."
        confirmText="Discard card changes"
        confirmVariant="destructive"
      />
    </AdminPage>
  );
}

export default withAdminAuth(MockOverviewPage);
