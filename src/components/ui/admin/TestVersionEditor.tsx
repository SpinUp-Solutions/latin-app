'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { shallowEqual } from 'react-redux';
import { BookOpen, Eye, FileCheck2, Loader2, Save, ScrollText, SlidersHorizontal, Undo2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader } from '@/src/components/ui/card';
import { cn } from '@/src/lib/utils';
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
import {
  testVersionDraftInputSchema,
  testVersionInputSchema,
  type CreateTestUnitInput,
  type TestVersionInput,
} from '@/src/lib/tests/schemas';
import type { TestUnit } from '@/src/types/learning-unit';
import type { RenderableContentItem } from '@/src/types/page';
import type { TestVersion } from '@/src/types/test';
import { PageSection } from './lesson-builder/PageSection';
import { ClipboardProvider } from '@/src/components/ui/core/clipboard';
import { PassingRequirementControl } from './test-version/PassingRequirementControl';
import { TestVersionPreview } from './test-version/TestVersionPreview';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { UnsavedNavigationDialog } from '@/src/components/ui/core/UnsavedNavigationDialog';
import { clearStableTestEditorIdentity, getStableTestEditorIdentity } from '@/src/lib/tests/editor-session';
import { MockAssignmentDialog } from './MockAssignmentDialog';
import { VocabularyPoolSelector } from './vocabulary-pools/VocabularyPoolSelector';
import {
  formatFormIdentificationConfigurationIssue,
  getGeneratedFormIdentificationConfigurationIssues,
} from '@/src/utils/exercises/formIdentificationConfiguration';
import { formatApiValidationIssues, getApiErrorMessage } from '@/src/store/api/baseQuery';

interface TestVersionEditorProps {
  initialTest?: TestUnit;
  initialVersion?: TestVersion;
  onSave: (
    value: TestVersionEditorValue
  ) => Promise<TestVersionEditorSaveResult | void> | TestVersionEditorSaveResult | void;
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
  /** Inactive versions may be persisted before they satisfy activation rules. */
  draftMode?: boolean;
}

export interface TestVersionEditorValue {
  test: CreateTestUnitInput;
  version: TestVersionInput;
}

export interface TestVersionEditorSaveResult {
  /** Keep the latest local draft when recovering an earlier successful create. */
  preserveDraft?: boolean;
  /** Runs after the editor has cleared or safely persisted its local state. */
  afterSave?: (result: { draftPreserved: boolean }) => void;
}

interface TestEditorSettings {
  title: string;
  description: string;
  passingPercentage: number | null;
  vocabularyPoolId: string | null;
}

function getInitialEditorSettings(test?: TestUnit, version?: TestVersion): TestEditorSettings {
  return {
    title: test?.title || 'New Test',
    description: test?.description || '',
    passingPercentage: test?.passingPercentage ?? null,
    vocabularyPoolId: version?.vocabularyPoolId ?? null,
  };
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

export function TestVersionEditor({
  initialTest,
  initialVersion,
  onSave,
  saving = false,
  hideTestSettings = false,
  creationScope,
  defaultVersionName,
  manageNavigationGuard = true,
  mockAssignment,
  draftMode = false,
}: TestVersionEditorProps) {
  const dispatch = useAppDispatch();
  const document = useAppSelector(state => state.lessonEditor.currentPageDocument);
  const editorDirty = useAppSelector(state => state.lessonEditor.dirty);
  const [testId] = useState(
    () =>
      initialTest?.id ||
      (creationScope
        ? getStableTestEditorIdentity(creationScope, 'test', 'test')
        : `test-${globalThis.crypto.randomUUID()}`)
  );
  const [versionId] = useState(
    () =>
      initialVersion?.id ||
      (creationScope
        ? getStableTestEditorIdentity(creationScope, 'version', 'version')
        : `version-${globalThis.crypto.randomUUID()}`)
  );
  const [settings, setSettings] = useState<TestEditorSettings>(() =>
    getInitialEditorSettings(initialTest, initialVersion)
  );
  const { title: testTitle, description, passingPercentage, vocabularyPoolId } = settings;
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [savePending, setSavePending] = useState(false);
  const savePendingRef = React.useRef(false);
  const initialSettings = React.useRef(settings);
  const latestDocument = React.useRef(document);
  const latestSettings = React.useRef(settings);
  latestDocument.current = document;
  latestSettings.current = settings;
  const settingsKey = `test_editor_settings:${versionId}`;
  const updateSetting = <Key extends keyof TestEditorSettings>(key: Key, value: TestEditorSettings[Key]) =>
    setSettings(current => ({ ...current, [key]: value }));
  const clearCreationIdentity = () => {
    if (!creationScope) return;
    clearStableTestEditorIdentity(creationScope);
  };
  const getInitialDocument = () => {
    const initialDocument = toInitialVersion(initialVersion, versionId);
    return !initialVersion && defaultVersionName ? { ...initialDocument, name: defaultVersionName } : initialDocument;
  };

  useEffect(() => {
    let alive = true;
    void dispatch(loadDrafts())
      .unwrap()
      .then(drafts => {
        if (!alive) return;
        const draft = drafts[`test-version:${versionId}`]?.document;
        if (draft?.editorKind === 'test-version') {
          dispatch(
            setTestVersion(
              pageDocumentDraftToTestVersion(draft, getTestVersionSummaryFields(draft.pages), initialVersion)
            )
          );
          dispatch(setDirty(true));
        } else dispatch(setTestVersion(getInitialDocument()));
        try {
          const settings = sessionStorage.getItem(settingsKey);
          if (settings) {
            const parsed = JSON.parse(settings) as TestEditorSettings;
            setSettings({ ...parsed, vocabularyPoolId: parsed.vocabularyPoolId ?? null });
          }
        } catch {
          /* A bad local draft must never stop authoring. */
        }
      })
      .catch(() => dispatch(setTestVersion(getInitialDocument())));
    return () => {
      alive = false;
      dispatch(resetLessonState());
    };
    // The editor is keyed by test ID, so initialization intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const summary = useMemo(() => getTestVersionSummaryFields(document?.pages ?? []), [document?.pages]);
  const formIdentificationIssues = useMemo(
    () => getGeneratedFormIdentificationConfigurationIssues(document?.pages ?? []),
    [document?.pages]
  );
  const hasFormIdentificationIssues = formIdentificationIssues.length > 0;
  const settingsDirty = !shallowEqual(settings, initialSettings.current);
  const dirty = editorDirty || settingsDirty;

  useEffect(() => {
    if (!dirty || !document) return;
    const timer = setTimeout(() => dispatch(savePageDocumentDraft(document)), 1000);
    return () => clearTimeout(timer);
  }, [dirty, dispatch, document]);

  useEffect(() => {
    if (!dirty || !document) return;
    const timer = setTimeout(() => sessionStorage.setItem(settingsKey, JSON.stringify(settings)), 300);
    return () => clearTimeout(timer);
  }, [dirty, document, settings, settingsKey]);

  const navigationGuard = useUnsavedNavigationGuard(
    manageNavigationGuard && dirty,
    'Your test changes have not been saved. Leave this page anyway?'
  );

  const save = () => {
    if (!document || saving || savePendingRef.current) return;
    if (hasFormIdentificationIssues) {
      setSaveErrors(formIdentificationIssues.map(formatFormIdentificationConfigurationIssue));
      return;
    }
    const version = {
      ...pageDocumentDraftToTestVersion(document, summary, initialVersion),
      vocabularyPoolId,
    };
    const submittedDocument = document;
    const submittedSettings = settings;

    const value: TestVersionEditorValue = {
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
    };
    const validation = (draftMode ? testVersionDraftInputSchema : testVersionInputSchema).safeParse(value.version);
    if (!validation.success) {
      setSaveErrors(formatApiValidationIssues(validation.error.issues));
      return;
    }

    setSaveErrors([]);
    savePendingRef.current = true;
    setSavePending(true);
    void Promise.resolve(onSave(value))
      .then(async result => {
        initialSettings.current = submittedSettings;

        const changedWhileSaving =
          latestDocument.current !== submittedDocument || !shallowEqual(latestSettings.current, submittedSettings);
        const preserveDraft = result?.preserveDraft === true || changedWhileSaving;
        if (preserveDraft) {
          const latestDraft = latestDocument.current;
          if (latestDraft) await dispatch(savePageDocumentDraft(latestDraft)).unwrap();
          sessionStorage.setItem(settingsKey, JSON.stringify(latestSettings.current));
          clearCreationIdentity();
          return { draftPreserved: true, afterSave: result?.afterSave };
        }

        await dispatch(clearPageDocumentDraft({ editorKind: 'test-version', ownerId: version.id })).unwrap();
        sessionStorage.removeItem(settingsKey);
        clearCreationIdentity();
        return { draftPreserved: false, afterSave: result?.afterSave };
      })
      .then(async result => {
        if (result.afterSave) {
          await navigationGuard.replaceAfterSave(() => result.afterSave?.({ draftPreserved: result.draftPreserved }));
        } else if (!result.draftPreserved) {
          dispatch(setTestVersion(version));
        }
      })
      .catch(error => {
        setSaveErrors([getApiErrorMessage(error, 'The test could not be saved. Please try again.')]);
      })
      .finally(() => {
        savePendingRef.current = false;
        setSavePending(false);
      });
  };

  const saveInProgress = saving || savePending;

  const discard = () => {
    sessionStorage.removeItem(settingsKey);
    dispatch(clearPageDocumentDraft({ editorKind: 'test-version', ownerId: versionId }));
    setSettings(initialSettings.current);
    dispatch(setTestVersion(getInitialDocument()));
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
          <header className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
            <div
              aria-hidden="true"
              className="h-[3px] w-full bg-gradient-to-r from-roman-red via-roman-gold/80 to-roman-red"
            />
            <div className="px-4 pb-3 pt-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-roman-red to-[#5f1b27] shadow-md ring-1 ring-roman-gold/60 ring-offset-2 ring-offset-white">
                    <span
                      aria-hidden="true"
                      className="absolute inset-[3px] rounded-full border border-roman-gold/35"
                    />
                    <FileCheck2 className="h-4 w-4 text-roman-parchment" aria-hidden="true" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-roman-stone">
                    <span className="text-roman-red">Tests</span>
                    <span aria-hidden="true" className="text-roman-gold">
                      •
                    </span>
                    <span className="max-w-64 truncate">{testTitle || 'Untitled test'}</span>
                    <span aria-hidden="true" className="text-roman-gold">
                      •
                    </span>
                    <span className="max-w-48 truncate text-gray-600">{document.title}</span>
                  </p>
                  <div className="mt-0.5 flex items-center gap-2.5">
                    <h1 className="font-serif text-lg tracking-tight text-gray-900 sm:text-xl">Test Version Editor</h1>
                    <span aria-hidden="true" className="hidden items-center gap-1.5 md:flex">
                      <span className="h-1 w-1 rotate-45 bg-roman-gold" />
                      <span className="h-px w-12 bg-gradient-to-r from-roman-gold/80 to-transparent" />
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3">
                {dirty ? (
                  <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                    </span>
                    Unsaved changes — save or discard before leaving.
                  </p>
                ) : (
                  <p className="text-xs text-roman-stone">
                    {summary.totalPages} {summary.totalPages === 1 ? 'page' : 'pages'}
                    <span aria-hidden="true" className="px-1.5 text-roman-gold">
                      •
                    </span>
                    {summary.totalExercises} {summary.totalExercises === 1 ? 'exercise' : 'exercises'}
                  </p>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <PointsCoin points={summary.totalPoints} />
                  <span
                    aria-hidden="true"
                    className="h-8 w-px bg-gradient-to-b from-transparent via-roman-gold/60 to-transparent"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {mockAssignment && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAssignmentOpen(true)}
                        disabled={dirty}
                        title={dirty ? 'Save or discard changes before assigning this version as a mock.' : undefined}>
                        <ScrollText className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Assign as mock
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDiscardConfirmationOpen(true)}
                      disabled={!dirty}>
                      <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Discard changes
                    </Button>
                    <Button
                      size="sm"
                      className={cn(
                        'shadow-sm',
                        dirty &&
                          !saveInProgress &&
                          'shadow-md shadow-roman-red/25 ring-2 ring-roman-gold/50 ring-offset-1'
                      )}
                      onClick={save}
                      disabled={
                        saveInProgress || hasFormIdentificationIssues || !testTitle.trim() || !document.title.trim()
                      }>
                      {saveInProgress ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      )}
                      {saveInProgress ? 'Saving...' : draftMode ? 'Save Draft' : 'Save Test'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {saveErrors.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
              <p className="font-medium">The test could not be saved. Please fix:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {saveErrors.map(message => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}
          {hasFormIdentificationIssues && (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
              <p className="font-medium">Fix the morphology configuration before saving:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {formIdentificationIssues.map(issue => (
                  <li key={`${issue.pageIndex}-${issue.itemIndex}-${issue.message}`}>
                    {formatFormIdentificationConfigurationIssue(issue)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mockAssignment && dirty && (
            <p className="flex items-center gap-2 px-1 text-xs font-medium text-amber-700">
              <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Save or discard your version changes before transferring it out of rotation.
            </p>
          )}

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-roman-parchment/45 px-5 py-4">
              <SectionHeading kicker="Setup" title="Test settings" icon={SlidersHorizontal} />
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                {!hideTestSettings && (
                  <div className="space-y-2">
                    <Label htmlFor="test-title">Test title</Label>
                    <Input
                      id="test-title"
                      value={testTitle}
                      onChange={event => updateSetting('title', event.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="test-version-name">Version name</Label>
                  <Input
                    id="test-version-name"
                    value={document.title}
                    onChange={event => dispatch(updatePageDocumentInfo({ title: event.target.value }))}
                  />
                </div>
                {!hideTestSettings && (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="test-id">Test ID</Label>
                    <Input id="test-id" value={testId} readOnly className="bg-gray-50" />
                  </div>
                )}
              </div>
              {!hideTestSettings && (
                <div className="space-y-2">
                  <Label htmlFor="test-description">Description</Label>
                  <Textarea
                    id="test-description"
                    value={description}
                    onChange={event => updateSetting('description', event.target.value)}
                  />
                </div>
              )}
              {!hideTestSettings && (
                <PassingRequirementControl
                  value={passingPercentage}
                  onChange={value => updateSetting('passingPercentage', value)}
                />
              )}
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
                  onPoolSelect={poolId => updateSetting('vocabularyPoolId', poolId ?? null)}
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
          <div className="sticky top-0 z-10 border-b border-border bg-white/95 px-5 py-4 backdrop-blur-sm">
            <SectionHeading
              kicker="Student view"
              title="Interactive preview"
              description="Assessment feedback is withheld in preview mode."
              icon={Eye}
            />
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
      {mockAssignment && (
        <MockAssignmentDialog
          open={assignmentOpen}
          onOpenChange={setAssignmentOpen}
          testId={mockAssignment.testId}
          versionId={versionId}
          defaultTitle={mockAssignment.defaultTitle}
          defaultDescription={mockAssignment.defaultDescription}
          defaultPassingPercentage={mockAssignment.defaultPassingPercentage}
          onAssigned={mock => mockAssignment.onAssigned(mock.id)}
        />
      )}
      <UnsavedNavigationDialog guard={navigationGuard} />
      <ConfirmationDialog
        isOpen={discardConfirmationOpen}
        onClose={() => setDiscardConfirmationOpen(false)}
        onConfirm={discard}
        title="Discard unsaved changes?"
        description="This resets the test and version to the last saved state. This action cannot be undone."
        confirmText="Discard changes"
        confirmVariant="destructive"
      />
    </ClipboardProvider>
  );
}

function PointsCoin({ points }: { points: number }) {
  return (
    <div className="flex shrink-0 items-center gap-2" title="Total points across all exercises">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f0dc82] via-roman-gold to-[#a5831f] p-[2px] shadow-sm ring-1 ring-[#8a6d1c]/40">
        <div className="flex h-full w-full items-center justify-center rounded-full border border-[#8a6d1c]/30">
          <span
            className={cn(
              'font-serif leading-none tabular-nums text-[#43320b]',
              points > 99 ? 'text-[10px]' : 'text-sm'
            )}>
            {points}
          </span>
        </div>
      </div>
      <span className="shrink-0 text-[9px] font-semibold uppercase leading-tight tracking-[0.16em] text-roman-stone">
        Total
        <br />
        points
      </span>
    </div>
  );
}

function SectionHeading({
  kicker,
  title,
  description,
  icon: Icon,
}: {
  kicker: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-roman-gold">
        <span aria-hidden="true" className="h-px w-5 bg-roman-gold/70" />
        {kicker}
      </p>
      <h2 className="mt-1.5 flex items-center gap-2 font-serif text-lg tracking-tight text-gray-900">
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-roman-red" aria-hidden="true" /> : null}
        <span className="truncate">{title}</span>
      </h2>
      {description ? <p className="mt-1 text-sm text-roman-stone">{description}</p> : null}
    </div>
  );
}
