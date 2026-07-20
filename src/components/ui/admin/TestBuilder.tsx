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

interface TestVersionEditorProps {
  initialTest?: TestUnit;
  initialVersion?: TestVersion;
  onSave: (value: TestVersionEditorValue) => Promise<void> | void;
  saving?: boolean;
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
    ...summary,
    createdAt: version?.createdAt,
    createdBy: version?.createdBy,
    updatedAt: version?.updatedAt,
    updatedBy: version?.updatedBy,
  };
}

export function TestVersionEditor({ initialTest, initialVersion, onSave, saving = false }: TestVersionEditorProps) {
  const dispatch = useAppDispatch();
  const document = useAppSelector(state => state.lessonEditor.currentPageDocument);
  const [testId] = useState(() => initialTest?.id || `test-${globalThis.crypto.randomUUID()}`);
  const [versionId] = useState(() => initialVersion?.id || `${testId}-version-a`);
  const [testTitle, setTestTitle] = useState(initialTest?.title || 'New Test');
  const [description, setDescription] = useState(initialTest?.description || '');
  const [passingPercentage, setPassingPercentage] = useState<number | null>(initialTest?.passingPercentage ?? null);

  useEffect(() => {
    dispatch(setTestVersion(toInitialVersion(initialVersion, versionId)));
    return () => {
      dispatch(resetLessonState());
    };
    // The builder is keyed by test ID, so initialization intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    if (!document) return;
    const timer = setTimeout(() => dispatch(savePageDocumentDraft(document)), 1000);
    return () => clearTimeout(timer);
  }, [dispatch, document]);

  const summary = useMemo(() => getTestVersionSummaryFields(document?.pages ?? []), [document?.pages]);

  const save = () => {
    if (!document) return;
    const version = pageDocumentDraftToTestVersion(document, summary, initialVersion);

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
          pages: version.pages.map(page => ({
            ...page,
            items: page.items.map(item =>
              isExerciseType(item.type) ? { ...item, maxPoints: item.maxPoints ?? 1 } : { ...item }
            ),
          })),
        },
      })
    )
      .then(() => dispatch(clearPageDocumentDraft({ editorKind: 'test-version', ownerId: version.id })))
      .catch(() => undefined);
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
                  disabled={saving || !testTitle.trim() || !document.title.trim() || summary.totalExercises === 0}>
                  {saving ? 'Saving...' : 'Save Test'}
                </Button>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="test-title">Test title</Label>
                  <Input id="test-title" value={testTitle} onChange={event => setTestTitle(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-version-name">Version name</Label>
                  <Input
                    id="test-version-name"
                    value={document.title}
                    onChange={event => dispatch(updatePageDocumentInfo({ title: event.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="test-id">Test ID</Label>
                  <Input id="test-id" value={testId} readOnly className="bg-gray-50" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-description">Description</Label>
                <Textarea
                  id="test-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                />
              </div>
              <PassingRequirementControl value={passingPercentage} onChange={setPassingPercentage} />
              {passingPercentage !== null && summary.totalPoints > 0 && (
                <p className="text-sm text-gray-500">
                  {passingPercentage}% ={' '}
                  {((summary.totalPoints * passingPercentage) / 100).toFixed(2).replace(/\.00$/, '')} of{' '}
                  {summary.totalPoints} points
                </p>
              )}
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
            <TestVersionPreview pages={document.pages} />
          </div>
        </div>
      </div>
      <ContentEditor />
    </ClipboardProvider>
  );
}
