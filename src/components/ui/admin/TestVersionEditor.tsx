'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, FileCheck2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { ContentEditor } from './ContentEditor';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  addContentToPage,
  addPage,
  clearPageDocumentDraft,
  duplicatePage,
  removeContent,
  removePage,
  resetLessonState,
  savePageDocumentDraft,
  setTestVersion,
  startEditingContent,
  updateContentItem,
  updatePageDocumentInfo,
  updatePageTitle,
  loadDrafts,
  setDirty,
} from '@/src/store/slices/lessonEditorSlice';
import { TEST_VERSION_CONTENT_TYPES } from '@/src/utils/contentTypeConstants';
import { isExerciseType } from '@/src/lib/content/registry';
import { getTestVersionSummaryFields } from '@/src/lib/tests/domain';
import { pageDocumentDraftToTestVersion } from '@/src/lib/page-document-draft';
import type { CreateTestUnitInput, TestVersionInput } from '@/src/lib/tests/schemas';
import type { TestUnit } from '@/src/types/learning-unit';
import type { RenderableContentItem } from '@/src/types/page';
import type { TestVersion } from '@/src/types/test';
import { PageSection } from './lesson-builder/PageSection';
import { ClipboardProvider } from '@/src/components/ui/core/clipboard';
import { PassingRequirementControl } from './test-version/PassingRequirementControl';
import { TestVersionPreview } from './test-version/TestVersionPreview';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { clearStableTestEditorIdentity, getStableTestEditorIdentity } from '@/src/lib/tests/editor-session';
import { MockAssignmentDialog } from './MockAssignmentDialog';
import { VocabularyPoolSelector } from './vocabulary-pools/VocabularyPoolSelector';

interface TestVersionEditorProps {
  initialTest?: TestUnit;
  initialVersion?: TestVersion;
  onSave: (value: TestVersionEditorValue) => Promise<void> | void;
  saving?: boolean;
  /** Mock cards own their card settings outside the version editor. */
  hideTestSettings?: boolean;
  /** Stable route-level key for a create flow; cleared after save/discard. */
  creationScope?: string;
  defaultVersionName?: string;
  /** Set false when a route-level owner guards combined editor and container state. */
  manageNavigationGuard?: boolean;
  /** Existing normal versions can be transferred to a standalone mock card. */
  mockAssignment?: {
    testId: string;
    defaultTitle: string;
    defaultDescription?: string;
    defaultPassingPercentage: number | null;
    onAssigned: (mockId: string) => void;
  };
}

export interface TestVersionEditorValue {
  test: CreateTestUnitInput;
  version: TestVersionInput;
}

function toInitialVersion(version: TestVersion | undefined, id: string): TestVersion {
  const pages = version?.pages ?? [];
  const summary = getTestVersionSummaryFields(pages);

  return {
    id,
    name: version?.name ?? 'Version A',
    pages,
    vocabularyPoolId: version?.vocabularyPoolId ?? null,
    ...summary,
    createdAt: version?.createdAt,
    createdBy: version?.createdBy,
    updatedAt: version?.updatedAt,
    updatedBy: version?.updatedBy,
  };
}

export function TestVersionEditor({ initialTest, initialVersion, onSave, saving = false, hideTestSettings = false, creationScope, defaultVersionName, manageNavigationGuard = true, mockAssignment }: TestVersionEditorProps) {
  const dispatch = useAppDispatch();
  const document = useAppSelector(state => state.lessonEditor.currentPageDocument);
  const editorDirty = useAppSelector(state => state.lessonEditor.dirty);
  const [testId] = useState(() => initialTest?.id || (creationScope ? getStableTestEditorIdentity(creationScope, 'test', 'test') : `test-${globalThis.crypto.randomUUID()}`));
  const [versionId] = useState(() => initialVersion?.id || (creationScope ? getStableTestEditorIdentity(creationScope, 'version', 'version') : `version-${globalThis.crypto.randomUUID()}`));
  const [testTitle, setTestTitle] = useState(initialTest?.title || 'New Test');
  const [description, setDescription] = useState(initialTest?.description || '');
  const [passingPercentage, setPassingPercentage] = useState<number | null>(initialTest?.passingPercentage ?? null);
  const [vocabularyPoolId, setVocabularyPoolId] = useState<string | null>(
    initialVersion?.vocabularyPoolId ?? null
  );
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const initialSettings = React.useRef({
    title: initialTest?.title || 'New Test',
    description: initialTest?.description || '',
    passingPercentage: initialTest?.passingPercentage ?? null,
    vocabularyPoolId: initialVersion?.vocabularyPoolId ?? null,
  });
  const latestDocument = React.useRef(document);
  const latestSettings = React.useRef({ testTitle, description, passingPercentage, vocabularyPoolId });
  latestDocument.current = document;
  latestSettings.current = { testTitle, description, passingPercentage, vocabularyPoolId };
  const settingsKey = `test_editor_settings:${versionId}`;
  const clearCreationIdentity = () => {
    if (!creationScope) return;
    clearStableTestEditorIdentity(creationScope);
  };

  useEffect(() => {
    let alive = true;
    void dispatch(loadDrafts()).unwrap().then(drafts => {
      if (!alive) return;
      const draft = drafts[`test-version:${versionId}`]?.document;
      if (draft?.editorKind === 'test-version') {
        dispatch(setTestVersion(pageDocumentDraftToTestVersion(draft, getTestVersionSummaryFields(draft.pages), initialVersion)));
        dispatch(setDirty(true));
      } else dispatch(setTestVersion(toInitialVersion(initialVersion ? initialVersion : defaultVersionName ? { ...toInitialVersion(undefined, versionId), name: defaultVersionName } : undefined, versionId)));
      try {
        const settings = sessionStorage.getItem(settingsKey);
        if (settings) {
          const parsed = JSON.parse(settings) as typeof initialSettings.current;
          setTestTitle(parsed.title);
          setDescription(parsed.description);
          setPassingPercentage(parsed.passingPercentage);
          setVocabularyPoolId(parsed.vocabularyPoolId ?? null);
        }
      } catch { /* A bad local draft must never stop authoring. */ }
    }).catch(() => dispatch(setTestVersion(toInitialVersion(initialVersion ? initialVersion : defaultVersionName ? { ...toInitialVersion(undefined, versionId), name: defaultVersionName } : undefined, versionId))));
    return () => {
      alive = false;
      dispatch(resetLessonState());
    };
    // The editor is keyed by test ID, so initialization intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const summary = useMemo(() => getTestVersionSummaryFields(document?.pages ?? []), [document?.pages]);
  const settingsDirty =
    testTitle !== initialSettings.current.title ||
    description !== initialSettings.current.description ||
    passingPercentage !== initialSettings.current.passingPercentage ||
    vocabularyPoolId !== initialSettings.current.vocabularyPoolId;
  const dirty = editorDirty || settingsDirty;

  useEffect(() => {
    if (!dirty || !document) return;
    const timer = setTimeout(() => dispatch(savePageDocumentDraft(document)), 1000);
    return () => clearTimeout(timer);
  }, [dirty, dispatch, document]);

  useEffect(() => {
    if (!dirty || !document) return;
    const timer = setTimeout(
      () =>
        sessionStorage.setItem(
          settingsKey,
          JSON.stringify({ title: testTitle, description, passingPercentage, vocabularyPoolId })
        ),
      300
    );
    return () => clearTimeout(timer);
  }, [description, dirty, document, passingPercentage, settingsKey, testTitle, vocabularyPoolId]);

  useUnsavedNavigationGuard(manageNavigationGuard && dirty, 'You have unsaved test changes. Leave this page?');

  const save = () => {
    if (!document) return;
    const version = {
      ...pageDocumentDraftToTestVersion(document, summary, initialVersion),
      vocabularyPoolId,
    };
    const submittedDocument = document;
    const submittedSettings = { testTitle, description, passingPercentage, vocabularyPoolId };

    void Promise.resolve(
      onSave({
        test: {
          id: testId,
          title: testTitle.trim(),
          description: description.trim(),
          passingPercentage,
        },
        version: {
          id: version.id,
          name: version.name,
          vocabularyPoolId: version.vocabularyPoolId,
          pages: version.pages.map(page => ({
            ...page,
            items: page.items.map(item =>
              isExerciseType(item.type) ? { ...item, maxPoints: item.maxPoints ?? 1 } : { ...item }
            ),
          })),
        },
      })
    )
      .then(() => {
        initialSettings.current = {
          title: submittedSettings.testTitle,
          description: submittedSettings.description,
          passingPercentage: submittedSettings.passingPercentage,
          vocabularyPoolId: submittedSettings.vocabularyPoolId,
        };

        const currentSettings = latestSettings.current;
        const changedWhileSaving =
          latestDocument.current !== submittedDocument ||
          currentSettings.testTitle !== submittedSettings.testTitle ||
          currentSettings.description !== submittedSettings.description ||
          currentSettings.passingPercentage !== submittedSettings.passingPercentage ||
          currentSettings.vocabularyPoolId !== submittedSettings.vocabularyPoolId;
        if (changedWhileSaving) return false;

        dispatch(setTestVersion(version));
        dispatch(clearPageDocumentDraft({ editorKind: 'test-version', ownerId: version.id }));
        return true;
      })
      .then(fullySaved => {
        if (!fullySaved) return;
        sessionStorage.removeItem(settingsKey);
        clearCreationIdentity();
      })
      .catch(() => undefined);
  };

  const discard = () => {
    if (!dirty || window.confirm('Discard all unsaved test changes?')) {
      sessionStorage.removeItem(settingsKey);
      clearCreationIdentity();
      dispatch(clearPageDocumentDraft({ editorKind: 'test-version', ownerId: versionId }));
      setTestTitle(initialSettings.current.title);
      setDescription(initialSettings.current.description);
      setPassingPercentage(initialSettings.current.passingPercentage);
      setVocabularyPoolId(initialSettings.current.vocabularyPoolId);
      dispatch(setTestVersion(toInitialVersion(initialVersion, versionId)));
    }
  };

  const updatePoints = (pageIndex: number, itemIndex: number, item: RenderableContentItem, value: string) => {
    dispatch(
      updateContentItem({
        pageIndex,
        itemIndex,
        content: { ...item, maxPoints: Math.max(1, Math.floor(Number(value) || 1)) },
      })
    );
  };

  if (!document) return <div className="p-8 text-center text-gray-500">Loading test builder...</div>;

  return (
    <ClipboardProvider>
      <div className="flex h-full min-w-0 flex-col bg-gray-50 lg:flex-row">
        <div className="min-w-0 space-y-6 overflow-y-auto p-4 lg:w-1/2 lg:flex-none">
          <div className="rounded-lg border bg-white p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Tests / {testTitle || 'Untitled Test'} / {document.title}
            </p>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold">
                  <FileCheck2 className="h-5 w-5 text-roman-red" /> Test Version Editor
                </h1>
                <p className="text-sm text-gray-500">
                  Build scored exercises and supporting content across multiple pages.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-roman-parchment px-3 py-2 text-sm font-medium">
                  Total: {summary.totalPoints} points
                </div>
                <Button
                  onClick={save}
                  disabled={saving || !testTitle.trim() || !document.title.trim()}>
                  {saving ? 'Saving...' : 'Save Test'}
                </Button>
                <Button variant="outline" onClick={discard} disabled={!dirty}>Discard changes</Button>
                {mockAssignment && <Button
                  variant="outline"
                  onClick={() => setAssignmentOpen(true)}
                  disabled={dirty}
                  title={dirty ? 'Save or discard changes before assigning this version as a mock.' : undefined}>
                  Assign as mock
                </Button>}
              </div>
            </div>
          </div>

          {dirty && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Unsaved draft recovered or edited. Save it, or explicitly discard it before leaving.</p>}
          {mockAssignment && dirty && <p className="text-sm text-gray-600">Save or discard your version changes before transferring it out of rotation.</p>}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                {!hideTestSettings && <div className="space-y-2">
                  <Label htmlFor="test-title">Test title</Label>
                  <Input id="test-title" value={testTitle} onChange={event => setTestTitle(event.target.value)} />
                </div>
                }
                <div className="space-y-2">
                  <Label htmlFor="test-version-name">Version name</Label>
                  <Input
                    id="test-version-name"
                    value={document.title}
                    onChange={event => dispatch(updatePageDocumentInfo({ title: event.target.value }))}
                  />
                </div>
                {!hideTestSettings && <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="test-id">Test ID</Label>
                  <Input id="test-id" value={testId} readOnly className="bg-gray-50" />
                </div>}
              </div>
              {!hideTestSettings && <div className="space-y-2">
                <Label htmlFor="test-description">Description</Label>
                <Textarea
                  id="test-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                />
              </div>}
              {!hideTestSettings && <PassingRequirementControl value={passingPercentage} onChange={setPassingPercentage} />}
              {!hideTestSettings && passingPercentage !== null && summary.totalPoints > 0 && (
                <p className="text-sm text-gray-500">
                  {passingPercentage}% ={' '}
                  {((summary.totalPoints * passingPercentage) / 100).toFixed(2).replace(/\.00$/, '')} of{' '}
                  {summary.totalPoints} points
                </p>
              )}
              <div className="space-y-2">
                <Label>Version vocabulary pool</Label>
                <p className="text-sm text-gray-500">
                  Vocabulary Pool content on this version will display words from this pool.
                </p>
                <VocabularyPoolSelector
                  selectedPoolId={vocabularyPoolId ?? undefined}
                  onPoolSelect={poolId => setVocabularyPoolId(poolId ?? null)}
                  disabled={saving}
                  assignmentLabel="test version"
                />
              </div>
            </CardContent>
          </Card>

          <PageSection
            title="Pages"
            icon={BookOpen}
            pages={document.pages}
            editorKind="test-version"
            contentTypes={TEST_VERSION_CONTENT_TYPES}
            onAddPage={() => dispatch(addPage())}
            onRemovePage={pageIndex => dispatch(removePage({ pageIndex }))}
            onDuplicatePage={pageIndex => dispatch(duplicatePage({ pageIndex }))}
            onUpdatePageTitle={(pageIndex, title) => dispatch(updatePageTitle({ pageIndex, title }))}
            onAddContent={(pageIndex, content) => dispatch(addContentToPage({ pageIndex, content }))}
            onEditContent={(pageIndex, itemIndex) => dispatch(startEditingContent({ pageIndex, itemIndex }))}
            onRemoveContent={(pageIndex, itemIndex) => dispatch(removeContent({ pageIndex, itemIndex }))}
            renderContentItemMeta={(pageIndex, item, itemIndex) =>
              isExerciseType(item.type) ? (
                <div className="flex items-center gap-1.5" onPointerDown={event => event.stopPropagation()}>
                  <Label htmlFor={`points-${item.id}`} className="text-xs">
                    Points
                  </Label>
                  <Input
                    id={`points-${item.id}`}
                    type="number"
                    min={1}
                    step={1}
                    className="h-7 w-16 text-xs"
                    value={item.maxPoints ?? 1}
                    onChange={event => updatePoints(pageIndex, itemIndex, item, event.target.value)}
                  />
                </div>
              ) : null
            }
          />
        </div>

        <div className="min-w-0 overflow-x-hidden overflow-y-auto border-t border-border bg-[#fbfaf7] lg:w-1/2 lg:flex-none lg:border-l lg:border-t-0">
          <div className="sticky top-0 z-10 border-b border-border bg-white p-4">
            <h2 className="flex items-center gap-2 text-xl font-serif text-gray-800">
              <FileCheck2 className="h-5 w-5" /> Interactive Preview
            </h2>
            <p className="text-sm text-roman-stone">Assessment feedback is withheld in preview mode.</p>
          </div>
          <div className="mx-auto w-full max-w-3xl p-3 pb-8 sm:p-4 md:p-5">
            <TestVersionPreview
              title={testTitle}
              description={description}
              pages={document.pages}
              vocabularyPoolId={vocabularyPoolId}
            />
          </div>
        </div>
      </div>
      <ContentEditor />
      {mockAssignment && <MockAssignmentDialog
        open={assignmentOpen}
        onOpenChange={setAssignmentOpen}
        testId={mockAssignment.testId}
        versionId={versionId}
        defaultTitle={mockAssignment.defaultTitle}
        defaultDescription={mockAssignment.defaultDescription}
        defaultPassingPercentage={mockAssignment.defaultPassingPercentage}
        onAssigned={mock => mockAssignment.onAssigned(mock.id)}
      />}
    </ClipboardProvider>
  );
}
