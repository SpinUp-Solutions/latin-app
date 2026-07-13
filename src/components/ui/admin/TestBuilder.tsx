'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Eye, FileCheck2, Sparkles } from 'lucide-react';
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
  duplicatePage,
  removeContent,
  removePage,
  resetLessonState,
  setLesson,
  startEditingContent,
  updatePageTitle,
} from '@/src/store/slices/lessonEditorSlice';
import { ALL_CONTENT_TYPES, EXERCISE_TYPES } from '@/src/utils/contentTypeConstants';
import { calculateTestTotal, getTestItems, getTestPages, isScoredTestExercise } from '@/src/utils/testDefinition';
import type { Exercise } from '@/src/types/exercises';
import type { RenderableContentItem } from '@/src/types/page';
import type { TestDefinition } from '@/src/types/test';
import { TestRunner } from './TestRunner';
import { PageSection } from './lesson-builder/PageSection';
import { ClipboardProvider } from '@/src/components/ui/core/clipboard';

const TEST_EXERCISE_TYPES = EXERCISE_TYPES.filter(type => type.type !== 'translation-grading');
const TEST_CONTENT_TYPES = ALL_CONTENT_TYPES.filter(type =>
  type.type !== 'translation-grading' && type.type !== 'listening-passage'
);
const isTestExerciseType = (type: string) => TEST_EXERCISE_TYPES.some(exerciseType => exerciseType.type === type);

interface TestBuilderProps {
  initialTest?: TestDefinition;
  onSave: (test: TestDefinition) => Promise<void> | void;
  saving?: boolean;
}

export function TestBuilder({ initialTest, onSave, saving = false }: TestBuilderProps) {
  const dispatch = useAppDispatch();
  const currentLesson = useAppSelector(state => state.lessonEditor.currentLesson);
  const [title, setTitle] = useState(initialTest?.title || 'New Test');
  const [description, setDescription] = useState(initialTest?.description || '');
  const [testId, setTestId] = useState(() => initialTest?.id || `test-${Date.now()}`);
  const [points, setPoints] = useState<Record<string, number>>(
    Object.fromEntries(getTestItems(initialTest || {}).filter(isScoredTestExercise).map(item => [item.exercise.id, item.maxPoints]))
  );

  useEffect(() => {
    dispatch(
      setLesson({
        id: initialTest?.id || testId,
        title: initialTest?.title || 'New Test',
        description: initialTest?.description || '',
        type: 'normal',
        pages: getTestPages(initialTest || { id: testId }),
        isLive: false,
        liveOrder: null,
        publishedAt: null,
        publishedBy: null,
      })
    );
    return () => {
      dispatch(resetLessonState());
    };
    // The builder is keyed by test ID, so this initialization intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const items = useMemo(
    () => (currentLesson?.pages.flatMap(page => page.items) || []) as RenderableContentItem[],
    [currentLesson?.pages]
  );
  const testItems = useMemo(
    () =>
      items.map(content =>
        isTestExerciseType(content.type)
          ? { exercise: content as Exercise, maxPoints: points[content.id] || 1 }
          : { content }
      ),
    [items, points]
  );
  const exercises = useMemo(() => testItems.filter(isScoredTestExercise), [testItems]);
  const totalPoints = calculateTestTotal(testItems);
  const previewTest = useMemo<TestDefinition>(
    () => ({
      id: testId.trim() || 'test-preview',
      title: title.trim() || 'Untitled Test',
      description: description.trim(),
      pages: currentLesson?.pages,
      items: testItems,
      exercises,
      totalPoints,
    }),
    [currentLesson?.pages, description, exercises, testId, testItems, title, totalPoints]
  );
  const previewKey = useMemo(() => JSON.stringify(previewTest), [previewTest]);

  const save = () => {
    void onSave({
      id: testId.trim(),
      title: title.trim(),
      description: description.trim(),
      pages: currentLesson?.pages || [],
      items: testItems,
      exercises,
      totalPoints,
      createdAt: initialTest?.createdAt,
      createdBy: initialTest?.createdBy,
      updatedAt: initialTest?.updatedAt,
      updatedBy: initialTest?.updatedBy,
      version: initialTest?.version,
    });
  };

  if (!currentLesson) return <div className="p-8 text-center text-gray-500">Loading test builder...</div>;

  return (
    <ClipboardProvider>
      <div className="flex h-full min-w-0 flex-col bg-gray-50 lg:flex-row">
        <div className="min-w-0 space-y-6 overflow-y-auto p-4 lg:w-1/2 lg:flex-none">
          <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold">
                <FileCheck2 className="h-5 w-5 text-roman-red" /> Test Builder
              </h1>
              <p className="text-sm text-gray-500">Build a standalone test with scored exercises and supporting content.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-roman-parchment px-3 py-2 text-sm font-medium">
                Total: {totalPoints} points
              </div>
              <Button onClick={save} disabled={saving || !title.trim() || !testId.trim() || exercises.length === 0}>
                {saving ? 'Saving...' : 'Save Test'}
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="test-title">Title</Label>
                <Input id="test-title" value={title} onChange={event => setTitle(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-id">ID</Label>
                <Input
                  id="test-id"
                  value={testId}
                  onChange={event => setTestId(event.target.value)}
                  disabled={Boolean(initialTest)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-total-points">Total points</Label>
                <Input id="test-total-points" value={totalPoints} readOnly className="bg-gray-50" />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="test-description">Description</Label>
                <Textarea
                  id="test-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <PageSection
            title="Pages"
            icon={BookOpen}
            pages={currentLesson.pages}
            contentTypes={TEST_CONTENT_TYPES}
            onAddPage={() => dispatch(addPage())}
            onRemovePage={pageIndex => dispatch(removePage({ pageIndex }))}
            onDuplicatePage={pageIndex => dispatch(duplicatePage({ pageIndex }))}
            onUpdatePageTitle={(pageIndex, pageTitle) => dispatch(updatePageTitle({ pageIndex, title: pageTitle }))}
            onAddContent={(pageIndex, content) => dispatch(addContentToPage({ pageIndex, content }))}
            onEditContent={(pageIndex, itemIndex) => dispatch(startEditingContent({ pageIndex, itemIndex }))}
            onRemoveContent={(pageIndex, itemIndex) => dispatch(removeContent({ pageIndex, itemIndex }))}
            renderContentItemMeta={(_, item) =>
              isTestExerciseType(item.type) ? (
                <div className="flex items-center gap-1.5" onPointerDown={event => event.stopPropagation()}>
                  <Label htmlFor={`points-${item.id}`} className="text-xs">Points</Label>
                  <Input
                    id={`points-${item.id}`}
                    type="number"
                    min={1}
                    step={1}
                    className="h-7 w-16 text-xs"
                    value={points[item.id] || 1}
                    onChange={event => setPoints(current => ({
                      ...current,
                      [item.id]: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                    }))}
                  />
                </div>
              ) : null
            }
          />
        </div>

        <div className="min-w-0 overflow-x-hidden overflow-y-auto border-t border-border bg-[#fbfaf7] lg:w-1/2 lg:flex-none lg:border-l lg:border-t-0">
          <div className="sticky top-0 z-10 border-b border-amber-900/10 bg-white/95 px-4 py-3 shadow-[0_1px_0_rgba(120,53,15,0.04)] backdrop-blur md:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-roman-red text-white shadow-sm shadow-red-950/20">
                <Eye className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-serif text-lg font-semibold leading-tight text-gray-900">Live preview</h2>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 ring-1 ring-inset ring-amber-700/15">
                    <Sparkles className="h-2.5 w-2.5" /> Interactive
                  </span>
                </div>
                <p className="truncate text-xs text-roman-stone">Student view · changes update as you edit</p>
              </div>
            </div>
          </div>
          <div className="mx-auto w-full max-w-3xl p-3 pb-8 sm:p-4 md:p-5">
            {items.length > 0 ? (
              <TestRunner key={previewKey} test={previewTest} embedded />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <FileCheck2 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                  <p className="text-gray-500">Add content to see the test preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ContentEditor />
    </ClipboardProvider>
  );
}
