'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { BookOpen, CheckCircle, Clock, FileCheck2, Filter, Globe, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SortableLearningPathLesson } from '@/src/components/admin/SortableLearningPathLesson';
import { SortableLessonItem } from '@/src/components/admin/SortableLessonItem';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { LessonTypeTabs } from '@/src/components/ui/admin/LessonTypeTabs';
import { PracticeCategoryChips } from '@/src/components/ui/admin/practice-categories/PracticeCategoryChips';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { RomanCard, RomanCardContent, RomanCardHeader } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { Tabs, TabsContent } from '@/src/components/ui/tabs';
import { getApiErrorCode, getApiErrorMessage, hasApiErrorStatus } from '@/src/store/api/baseQuery';
import {
  useGetLearningPathQuery,
  useGetLessonsQuery,
  useReorderLessonsMutation,
  useSaveLearningPathMutation,
  useUpdateLessonsPublishStatusMutation,
} from '@/src/store/api/lessonApi';
import { useGetTestsQuery } from '@/src/store/api/testApi';
import type { LessonSummary } from '@/src/types/lesson';
import type { PracticeLessonType } from '@/src/types/practice-category';
import type { TestUnitSummary } from '@/src/types/test';
import type { LearningPathLessonIssue } from '@/src/types/learning-unit';

type LessonType = 'normal' | PracticeLessonType;
type FilterStatus = 'all' | 'live' | 'draft';
type PathDraft = {
  baseRevision: number;
  baseUnitIds: string[];
  unitIds: string[];
};
type PathConflict = {
  revision: number;
  canonicalUnitIds: string[];
  proposedUnitIds: string[];
  previousBaseUnitIds: string[];
  membershipChoices: Record<string, boolean>;
};

const practiceTypes: PracticeLessonType[] = ['vocab', 'sentence-diagramming', 'listening'];
const UNSAVED_PATH_MESSAGE = 'You have unsaved Learning Path changes. Leave this page and discard them?';
const SWITCH_WITH_UNSAVED_PATH_MESSAGE =
  'You have unsaved Learning Path changes. Switch sections without saving them first?';

const sameOrder = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const resolvePathMembershipConflict = (conflict: PathConflict): string[] => {
  const concurrentRemovals = new Set(
    conflict.previousBaseUnitIds.filter(id => !conflict.canonicalUnitIds.includes(id))
  );
  const concurrentAdditions = conflict.canonicalUnitIds.filter(id => !conflict.previousBaseUnitIds.includes(id));
  const merged = conflict.proposedUnitIds.filter(id => !concurrentRemovals.has(id) || conflict.membershipChoices[id]);

  for (const id of concurrentAdditions) {
    if (!conflict.membershipChoices[id] || merged.includes(id)) continue;
    const canonicalIndex = conflict.canonicalUnitIds.indexOf(id);
    const nextCanonicalId = conflict.canonicalUnitIds
      .slice(canonicalIndex + 1)
      .find(candidate => merged.includes(candidate));
    if (nextCanonicalId) {
      merged.splice(merged.indexOf(nextCanonicalId), 0, id);
      continue;
    }
    const previousCanonicalId = [...conflict.canonicalUnitIds.slice(0, canonicalIndex)]
      .reverse()
      .find(candidate => merged.includes(candidate));
    if (previousCanonicalId) {
      merged.splice(merged.indexOf(previousCanonicalId) + 1, 0, id);
    } else {
      merged.push(id);
    }
  }
  return merged;
};

const liveLessonsForType = (lessons: LessonSummary[], type: LessonType) =>
  lessons
    .filter(lesson => lesson.type === type && lesson.isLive)
    .sort(
      (left, right) =>
        (left.liveOrder ?? Number.MAX_SAFE_INTEGER) - (right.liveOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id)
    );

function LiveLessonsPage() {
  const router = useRouter();
  const {
    data: serverLessons = [],
    isLoading: lessonsLoading,
    isError: lessonsError,
    refetch: refetchLessons,
  } = useGetLessonsQuery();
  const {
    data: serverTests = [],
    isLoading: testsLoading,
    isError: testsError,
    refetch: refetchTests,
  } = useGetTestsQuery();
  const {
    data: pathView,
    isLoading: pathLoading,
    isError: pathError,
    refetch: refetchPath,
  } = useGetLearningPathQuery();
  const [saveLearningPath, { isLoading: pathSaving }] = useSaveLearningPathMutation();
  const [updatePublishStatus] = useUpdateLessonsPublishStatusMutation();
  const [reorderLessons] = useReorderLessonsMutation();

  const [lessonType, setLessonType] = useState<LessonType>('normal');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('live');
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [selectionKey, setSelectionKey] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [practiceOrderDrafts, setPracticeOrderDrafts] = useState<Partial<Record<PracticeLessonType, string[]>>>({});
  const [pathDraft, setPathDraft] = useState<PathDraft | null>(null);
  const [pathConflict, setPathConflict] = useState<PathConflict | null>(null);
  const [testInsertionIndex, setTestInsertionIndex] = useState<number | null>(null);
  const [testPickerSearch, setTestPickerSearch] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const normalLessons = useMemo(() => serverLessons.filter(lesson => lesson.type === 'normal'), [serverLessons]);
  const pathUnitById = useMemo(
    () =>
      new Map<string, LessonSummary | TestUnitSummary>([
        ...normalLessons.map(lesson => [lesson.id, lesson] as const),
        ...serverTests.map(test => [test.id, test] as const),
      ]),
    [normalLessons, serverTests]
  );
  const canonicalPathIds = useMemo(() => pathView?.effectiveUnitIds ?? [], [pathView?.effectiveUnitIds]);
  const canonicalRevision = pathView?.path?.revision ?? 0;

  useEffect(() => {
    if (!pathView) return;
    setPathDraft(current => {
      if (current && !sameOrder(current.unitIds, current.baseUnitIds)) return current;
      return {
        baseRevision: canonicalRevision,
        baseUnitIds: [...canonicalPathIds],
        unitIds: [...canonicalPathIds],
      };
    });
  }, [canonicalPathIds, canonicalRevision, pathView]);

  const pathUnitIds = pathDraft?.unitIds ?? canonicalPathIds;
  const pathDirty = Boolean(pathDraft && !sameOrder(pathDraft.unitIds, pathDraft.baseUnitIds));
  const navigateFromPathDraft = (href: string) => {
    if (pathDirty && !window.confirm(UNSAVED_PATH_MESSAGE)) return;
    router.push(href);
  };
  const pathUnits = pathUnitIds.map(id => pathUnitById.get(id)).filter(Boolean) as Array<
    LessonSummary | TestUnitSummary
  >;
  const lessonIssuesById: Record<string, LearningPathLessonIssue[]> = pathView?.lessonIssuesById ?? {};
  const affectedPathLessons = pathUnitIds
    .map(id => {
      const unit = pathUnitById.get(id);
      if (!unit || unit.kind === 'test') return null;
      const issues = lessonIssuesById[id] ?? [];
      return issues.length > 0 ? { unit, issues } : null;
    })
    .filter((entry): entry is { unit: LessonSummary; issues: LearningPathLessonIssue[] } => entry !== null);
  const unplacedNormalLessons = normalLessons
    .filter(lesson => !pathUnitIds.includes(lesson.id))
    .sort((left, right) => left.title.localeCompare(right.title));
  const unplacedTests = serverTests
    .filter(test => !pathUnitIds.includes(test.id))
    .filter(test => {
      const search = testPickerSearch.trim().toLocaleLowerCase();
      return (
        !search ||
        test.title.toLocaleLowerCase().includes(search) ||
        test.description.toLocaleLowerCase().includes(search)
      );
    })
    .sort((left, right) => left.title.localeCompare(right.title));

  useEffect(() => {
    if (!pathDirty) return;
    const currentUrl = window.location.href;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const handlePopState = () => {
      if (window.confirm(UNSAVED_PATH_MESSAGE)) return;
      window.history.pushState(null, '', currentUrl);
    };
    const handleDocumentNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (window.confirm(UNSAVED_PATH_MESSAGE)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('click', handleDocumentNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('click', handleDocumentNavigation, true);
    };
  }, [pathDirty]);

  const serverPracticeLive = useMemo(() => {
    const result = {} as Record<PracticeLessonType, LessonSummary[]>;
    practiceTypes.forEach(type => {
      result[type] = liveLessonsForType(serverLessons, type);
    });
    return result;
  }, [serverLessons]);

  const currentPracticeType = lessonType === 'normal' ? null : lessonType;
  const currentServerLiveLessons = useMemo(
    () => (currentPracticeType ? serverPracticeLive[currentPracticeType] : []),
    [currentPracticeType, serverPracticeLive]
  );
  const practiceOrderIds = currentPracticeType
    ? (practiceOrderDrafts[currentPracticeType] ?? currentServerLiveLessons.map(lesson => lesson.id))
    : [];
  const currentLiveLessons = practiceOrderIds
    .map(id => serverLessons.find(lesson => lesson.id === id))
    .filter(Boolean)
    .map((lesson, index) => ({ ...lesson!, liveOrder: index }));
  const currentAvailableLessons = currentPracticeType
    ? serverLessons.filter(lesson => lesson.type === currentPracticeType && !lesson.isLive)
    : [];
  const practiceOrderDirty = currentPracticeType
    ? !sameOrder(
        practiceOrderIds,
        currentServerLiveLessons.map(lesson => lesson.id)
      )
    : false;

  const liveIds = useMemo(() => new Set(currentServerLiveLessons.map(lesson => lesson.id)), [currentServerLiveLessons]);
  const nextSelectionKey = currentPracticeType
    ? JSON.stringify([currentPracticeType, ...Array.from(liveIds).sort()])
    : null;

  useEffect(() => {
    if (nextSelectionKey && nextSelectionKey !== selectionKey) {
      setSelectedLessons(new Set(liveIds));
      setSelectionKey(nextSelectionKey);
    }
  }, [liveIds, nextSelectionKey, selectionKey]);

  const filteredLessons = useMemo(() => {
    if (!currentPracticeType) return [];
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
    return serverLessons
      .filter(lesson => lesson.type === currentPracticeType)
      .filter(lesson => (filterStatus === 'all' ? true : filterStatus === 'live' ? lesson.isLive : !lesson.isLive))
      .filter(
        lesson =>
          !normalizedSearch ||
          lesson.title.toLocaleLowerCase().includes(normalizedSearch) ||
          (lesson.description ?? '').toLocaleLowerCase().includes(normalizedSearch)
      )
      .sort((left, right) => {
        if (left.isLive !== right.isLive) return left.isLive ? -1 : 1;
        if (left.isLive) {
          return (left.liveOrder ?? Number.MAX_SAFE_INTEGER) - (right.liveOrder ?? Number.MAX_SAFE_INTEGER);
        }
        return left.title.localeCompare(right.title);
      });
  }, [currentPracticeType, filterStatus, searchQuery, serverLessons]);

  const publishDirty =
    Boolean(currentPracticeType && nextSelectionKey === selectionKey) &&
    (liveIds.size !== selectedLessons.size || Array.from(liveIds).some(id => !selectedLessons.has(id)));
  const wouldLeaveTypeEmpty = liveIds.size > 0 && selectedLessons.size === 0;

  const handlePathDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !pathView?.canEdit) return;
    setPathDraft(current => {
      if (!current) return current;
      const from = current.unitIds.indexOf(String(active.id));
      const to = current.unitIds.indexOf(String(over.id));
      if (from < 0 || to < 0) return current;
      return { ...current, unitIds: arrayMove(current.unitIds, from, to) };
    });
  };

  const savePath = async () => {
    if (!pathDraft || !pathView?.canEdit || !pathDirty) return;
    try {
      const result = await saveLearningPath({
        expectedRevision: pathDraft.baseRevision,
        unitIds: pathDraft.unitIds,
      }).unwrap();
      setPathDraft({
        baseRevision: result.path.revision,
        baseUnitIds: [...result.path.unitIds],
        unitIds: [...result.path.unitIds],
      });
      setPathConflict(null);
      await refetchPath();
      toast.success('Learning Path saved');
    } catch (error) {
      if (hasApiErrorStatus(error, 409) && getApiErrorCode(error) === 'STALE_LEARNING_PATH_REVISION') {
        const refreshed = await refetchPath();
        if (refreshed.data?.path && pathDraft) {
          const canonicalUnitIds = [...refreshed.data.path.unitIds];
          const membershipChoices = Object.fromEntries([
            ...canonicalUnitIds.filter(id => !pathDraft.baseUnitIds.includes(id)).map(id => [id, true] as const),
            ...pathDraft.baseUnitIds.filter(id => !canonicalUnitIds.includes(id)).map(id => [id, false] as const),
          ]);
          setPathConflict({
            revision: refreshed.data.path.revision,
            canonicalUnitIds,
            proposedUnitIds: [...pathDraft.unitIds],
            previousBaseUnitIds: [...pathDraft.baseUnitIds],
            membershipChoices,
          });
        }
        toast.error(
          'The Learning Path changed elsewhere. Your proposal is preserved; review it against the refreshed path.'
        );
        return;
      }
      if (hasApiErrorStatus(error, 409)) await refetchPath();
      toast.error(getApiErrorMessage(error, 'Failed to save Learning Path'));
    }
  };

  const handlePracticeDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !currentPracticeType) return;
    const from = practiceOrderIds.indexOf(String(active.id));
    const to = practiceOrderIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setPracticeOrderDrafts(current => ({
      ...current,
      [currentPracticeType]: arrayMove(practiceOrderIds, from, to),
    }));
  };

  const savePracticeOrder = async () => {
    if (!currentPracticeType || !practiceOrderDirty) return;
    try {
      await reorderLessons(
        currentLiveLessons.map((lesson, index) => ({
          lessonId: lesson.id,
          liveOrder: index,
        }))
      ).unwrap();
      setPracticeOrderDrafts(current => {
        const next = { ...current };
        delete next[currentPracticeType];
        return next;
      });
      await refetchLessons();
      toast.success('Lesson order saved successfully');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save lesson order'));
    }
  };

  const applyPublishChanges = async () => {
    if (!currentPracticeType || !publishDirty || isPublishing) return;
    if (wouldLeaveTypeEmpty) {
      toast.error('At least one lesson of this type must remain live.');
      return;
    }
    const toPublish = Array.from(selectedLessons).filter(id => !liveIds.has(id));
    const toUnpublish = Array.from(liveIds).filter(id => !selectedLessons.has(id));
    const expectedLiveLessonIds = Array.from(liveIds);
    setIsPublishing(true);
    try {
      if (toPublish.length) {
        await updatePublishStatus({
          lessonIds: toPublish,
          isLive: true,
          lessonType: currentPracticeType,
          expectedLiveLessonIds,
        }).unwrap();
      }
      if (toUnpublish.length) {
        try {
          await updatePublishStatus({
            lessonIds: toUnpublish,
            isLive: false,
            lessonType: currentPracticeType,
            expectedLiveLessonIds: [...expectedLiveLessonIds, ...toPublish],
          }).unwrap();
        } catch (error) {
          if (toPublish.length) {
            try {
              await updatePublishStatus({
                lessonIds: toPublish,
                isLive: false,
                lessonType: currentPracticeType,
                expectedLiveLessonIds: [...expectedLiveLessonIds, ...toPublish],
              }).unwrap();
              throw new Error('Unpublish failed; newly published lessons were rolled back');
            } catch (rollbackError) {
              if (
                rollbackError instanceof Error &&
                rollbackError.message === 'Unpublish failed; newly published lessons were rolled back'
              ) {
                throw rollbackError;
              }
              throw new Error('Unpublish failed and the publish rollback also failed. Review this practice list.');
            }
          }
          throw error;
        }
      }
      setPracticeOrderDrafts(current => {
        const next = { ...current };
        delete next[currentPracticeType];
        return next;
      });
      setSelectionKey(null);
      await refetchLessons();
      toast.success('Practice publication changes applied');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update published lessons'));
    } finally {
      setIsPublishing(false);
    }
  };

  const openTestPicker = (index: number) => {
    if (!pathView?.canEdit || pathSaving) return;
    setTestPickerSearch('');
    setTestInsertionIndex(index);
  };

  const insertTest = (testId: string) => {
    if (testInsertionIndex === null) return;
    setPathDraft(current => {
      if (!current || current.unitIds.includes(testId)) return current;
      const next = [...current.unitIds];
      next.splice(Math.min(testInsertionIndex, next.length), 0, testId);
      return { ...current, unitIds: next };
    });
    setTestInsertionIndex(null);
    setTestPickerSearch('');
  };

  const renderTestInsertionControl = (index: number) => (
    <div className="flex items-center gap-3 py-1" key={`insert-${index}`}>
      <div className="h-px flex-1 bg-roman-gold/25" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 rounded-full border border-dashed border-roman-gold/50 bg-white/70 px-3 text-xs font-medium text-foreground hover:border-roman-gold hover:bg-roman-gold/10"
        aria-label={`Insert a test at position ${index + 1}`}
        disabled={!pathView?.canEdit || pathSaving}
        onClick={() => openTestPicker(index)}>
        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Insert test
      </Button>
      <div className="h-px flex-1 bg-roman-gold/25" />
    </div>
  );

  if (lessonsLoading || testsLoading || pathLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-roman-red" />
      </div>
    );
  }

  if (lessonsError || testsError || pathError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble p-6">
        <RomanCard className="w-full max-w-lg">
          <RomanCardContent className="space-y-4 p-8 text-center">
            <h1 className="font-serif text-2xl text-gray-900">Unable to load the Learning Path inventory</h1>
            <p className="text-sm text-gray-600">
              Editing is disabled until the lesson, test, and path inventories all load successfully.
            </p>
            <Button
              type="button"
              onClick={() => {
                void Promise.all([refetchLessons(), refetchTests(), refetchPath()]);
              }}>
              Retry
            </Button>
          </RomanCardContent>
        </RomanCard>
      </div>
    );
  }

  const counts = {
    normal: normalLessons.length,
    vocab: serverLessons.filter(lesson => lesson.type === 'vocab').length,
    'sentence-diagramming': serverLessons.filter(lesson => lesson.type === 'sentence-diagramming').length,
    listening: serverLessons.filter(lesson => lesson.type === 'listening').length,
  };

  return (
    <>
      <AdminPage>
        <AdminPageHeader
          title="Manage Learning Delivery"
          description="Organize the student learning path and practice publication."
          actions={
            <>
              {lessonType === 'normal' && pathDirty && (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPathDraft(current => (current ? { ...current, unitIds: [...current.baseUnitIds] } : current))
                    }>
                    Discard
                  </Button>
                  <Button onClick={savePath} disabled={!pathView?.canEdit || pathSaving}>
                    Save Learning Path
                  </Button>
                </>
              )}
              {lessonType !== 'normal' && publishDirty && (
                <Button
                  onClick={applyPublishChanges}
                  disabled={isPublishing || wouldLeaveTypeEmpty}
                  className="bg-roman-green hover:bg-roman-green/90">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Apply Publication Changes
                </Button>
              )}
            </>
          }
        />
        <Tabs
          value={lessonType}
          onValueChange={value => {
            if (value !== lessonType && pathDirty && !window.confirm(SWITCH_WITH_UNSAVED_PATH_MESSAGE)) return;
            setLessonType(value as LessonType);
            setFilterStatus('live');
            setSearchQuery('');
          }}>
          <LessonTypeTabs
            value={lessonType}
            onValueChange={value => {
              if (value !== lessonType && pathDirty && !window.confirm(SWITCH_WITH_UNSAVED_PATH_MESSAGE)) return;
              setLessonType(value);
              setFilterStatus('live');
              setSearchQuery('');
            }}
            counts={counts}
          />

          <TabsContent value="normal" className="mt-5">
            <RomanCard className="mb-6">
              <RomanCardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-serif">Learning Path</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      The ordered sequence of normal lessons and tests. Array position is the delivery order.
                    </p>
                  </div>
                  <Badge variant="default">Learning Path source</Badge>
                </div>
                {pathView?.editBlockedReason && (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {pathView.editBlockedReason}
                  </p>
                )}
                {affectedPathLessons.length > 0 && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-medium">
                      {affectedPathLessons.length} lesson{affectedPathLessons.length === 1 ? '' : 's'} need
                      {affectedPathLessons.length === 1 ? 's' : ''} attention
                    </p>
                    <p className="mt-1">
                      These warnings do not block Learning Path changes, but the affected lessons should be repaired
                      before students use them.
                    </p>
                    <ul className="mt-2 space-y-2">
                      {affectedPathLessons.map(({ unit, issues }) => (
                        <li key={unit.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex min-w-0 flex-wrap items-center gap-1">
                            <span className="font-semibold text-gray-900">
                              <SimpleRichDisplay content={unit.title} className="inline not-prose" />
                            </span>
                            <span>
                              ({issues.length} {issues.length === 1 ? 'issue' : 'issues'})
                            </span>
                          </span>
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              href={`/admin/lessons/edit/${unit.id}`}
                              onClick={event => {
                                event.preventDefault();
                                navigateFromPathDraft(`/admin/lessons/edit/${unit.id}`);
                              }}>
                              Fix lesson
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pathConflict && (
                  <div className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-950">
                    <p className="font-medium">A newer canonical Learning Path is available.</p>
                    <p className="mt-1">
                      Compare both complete sequences and resolve every membership change before adopting revision{' '}
                      {pathConflict.revision} as the new base.
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded border border-orange-200 bg-white/70 p-3">
                        <p className="font-medium">Canonical revision {pathConflict.revision}</p>
                        <ol className="mt-2 list-inside list-decimal space-y-1">
                          {pathConflict.canonicalUnitIds.map(id => (
                            <li key={id}>
                              <SimpleRichDisplay content={pathUnitById.get(id)?.title ?? id} />
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="rounded border border-orange-200 bg-white/70 p-3">
                        <p className="font-medium">Your proposal</p>
                        <ol className="mt-2 list-inside list-decimal space-y-1">
                          {pathConflict.proposedUnitIds.map(id => (
                            <li key={id}>
                              <SimpleRichDisplay content={pathUnitById.get(id)?.title ?? id} />
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                    {Object.keys(pathConflict.membershipChoices).length > 0 && (
                      <fieldset className="mt-3 space-y-2">
                        <legend className="font-medium">Resolve concurrent membership changes</legend>
                        {Object.entries(pathConflict.membershipChoices).map(([id, included]) => {
                          const addedElsewhere = !pathConflict.previousBaseUnitIds.includes(id);
                          return (
                            <label key={id} className="flex items-start gap-2">
                              <Checkbox
                                checked={included}
                                onCheckedChange={checked =>
                                  setPathConflict(current =>
                                    current
                                      ? {
                                          ...current,
                                          membershipChoices: {
                                            ...current.membershipChoices,
                                            [id]: checked === true,
                                          },
                                        }
                                      : current
                                  )
                                }
                              />
                              <span className="flex flex-wrap items-center gap-1">
                                <span className="font-medium">{included ? 'Include' : 'Exclude'}</span>
                                <span className="font-semibold">
                                  <SimpleRichDisplay
                                    content={pathUnitById.get(id)?.title ?? id}
                                    className="inline not-prose"
                                  />
                                </span>
                                <span>
                                  ({addedElsewhere ? 'added in the canonical path' : 'removed from the canonical path'})
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </fieldset>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => {
                        const resolvedUnitIds = resolvePathMembershipConflict(pathConflict);
                        setPathDraft({
                          baseRevision: pathConflict.revision,
                          baseUnitIds: [...pathConflict.canonicalUnitIds],
                          unitIds: resolvedUnitIds,
                        });
                        setPathConflict(null);
                      }}>
                      Apply conflict resolutions
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-2 mt-3"
                      onClick={() => {
                        setPathDraft({
                          baseRevision: pathConflict.revision,
                          baseUnitIds: [...pathConflict.canonicalUnitIds],
                          unitIds: [...pathConflict.canonicalUnitIds],
                        });
                        setPathConflict(null);
                      }}>
                      Use canonical path
                    </Button>
                  </div>
                )}
              </RomanCardHeader>
              <RomanCardContent className="p-4">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePathDragEnd}>
                  <SortableContext items={pathUnits.map(unit => unit.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {renderTestInsertionControl(0)}
                      {pathUnitIds.length === 0 && (
                        <div className="py-6 text-center text-gray-500">No learning units are currently placed.</div>
                      )}
                      {pathUnitIds.map((id, index) => {
                        const unit = pathUnitById.get(id);
                        return (
                          <React.Fragment key={id}>
                            {!unit ? (
                              <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                <span>Referenced unit {id} is missing from the learning-unit inventory.</span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  aria-label={`Remove missing unit ${id} from Learning Path`}
                                  disabled={!pathView?.canEdit || pathSaving}
                                  onClick={() =>
                                    setPathDraft(current =>
                                      current
                                        ? {
                                            ...current,
                                            unitIds: current.unitIds.filter(unitId => unitId !== id),
                                          }
                                        : current
                                    )
                                  }>
                                  Remove reference
                                </Button>
                              </div>
                            ) : (
                              <SortableLearningPathLesson
                                unit={unit}
                                index={index}
                                issues={unit.kind === 'test' ? [] : (lessonIssuesById[unit.id] ?? [])}
                                disabled={!pathView?.canEdit || pathSaving}
                                onNavigate={navigateFromPathDraft}
                                onRemove={() =>
                                  setPathDraft(current =>
                                    current
                                      ? {
                                          ...current,
                                          unitIds: current.unitIds.filter(unitId => unitId !== unit.id),
                                        }
                                      : current
                                  )
                                }
                              />
                            )}
                            {renderTestInsertionControl(index + 1)}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </RomanCardContent>
            </RomanCard>

            <RomanCard>
              <RomanCardHeader>
                <h2 className="text-lg font-serif">Unplaced normal lessons ({unplacedNormalLessons.length})</h2>
              </RomanCardHeader>
              <RomanCardContent className="space-y-3 p-4">
                {unplacedNormalLessons.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-500">Every normal lesson is placed.</p>
                ) : (
                  unplacedNormalLessons.map(lesson => (
                    <div key={lesson.id} className="flex min-w-0 flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          <SimpleRichDisplay content={lesson.title} className="break-words [&_p]:break-words" />
                        </div>
                        <p className="text-xs text-gray-500">{lesson.totalPages} pages</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Add ${lesson.title} to Learning Path`}
                        disabled={!pathView?.canEdit || pathSaving}
                        onClick={() =>
                          setPathDraft(current =>
                            current ? { ...current, unitIds: [...current.unitIds, lesson.id] } : current
                          )
                        }>
                        <Plus className="mr-2 h-4 w-4" />
                        Add to path
                      </Button>
                    </div>
                  ))
                )}
              </RomanCardContent>
            </RomanCard>
          </TabsContent>

          {practiceTypes.map(type => (
            <TabsContent key={type} value={type} className="mt-5">
              <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  {
                    label: 'Total Lessons',
                    value: currentLiveLessons.length + currentAvailableLessons.length,
                    icon: BookOpen,
                  },
                  { label: 'Live Lessons', value: currentLiveLessons.length, icon: Globe },
                  { label: 'Draft Lessons', value: currentAvailableLessons.length, icon: Clock },
                ].map(item => (
                  <RomanCard key={item.label}>
                    <RomanCardContent className="flex items-center gap-3 p-4">
                      <item.icon className="h-5 w-5 text-roman-red" />
                      <div>
                        <div className="text-2xl font-bold">{item.value}</div>
                        <div className="text-sm text-gray-600">{item.label}</div>
                      </div>
                    </RomanCardContent>
                  </RomanCard>
                ))}
              </div>

              <RomanCard className="mb-6">
                <RomanCardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search lessons by title or description..."
                      value={searchQuery}
                      onChange={event => setSearchQuery(event.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div
                    className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-white/80 p-1.5 shadow-sm"
                    role="group"
                    aria-label="Lesson status">
                    <Filter className="ml-1 h-4 w-4 text-roman-stone" aria-hidden="true" />
                    {(['all', 'live', 'draft'] as FilterStatus[]).map(status => (
                      <Button
                        key={status}
                        variant={filterStatus === status ? 'default' : 'ghost'}
                        size="sm"
                        aria-pressed={filterStatus === status}
                        className={
                          filterStatus === status
                            ? 'h-9 rounded-lg px-3.5 text-xs font-semibold shadow-[0_2px_6px_hsl(var(--primary)/0.22)]'
                            : 'h-9 rounded-lg px-3.5 text-xs font-medium text-roman-stone hover:bg-roman-parchment hover:text-foreground'
                        }
                        onClick={() => setFilterStatus(status)}>
                        {status[0].toUpperCase() + status.slice(1)}
                      </Button>
                    ))}
                  </div>
                </RomanCardContent>
              </RomanCard>

              {filterStatus === 'live' ? (
                <RomanCard>
                  <RomanCardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <h2 className="text-lg font-serif">Live lesson order ({currentLiveLessons.length})</h2>
                      <p className="text-sm text-gray-600">
                        Practice visibility and type-scoped order remain unchanged.
                      </p>
                    </div>
                    {practiceOrderDirty && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPracticeOrderDrafts(current => {
                              const next = { ...current };
                              delete next[type];
                              return next;
                            })
                          }>
                          Discard
                        </Button>
                        <Button size="sm" onClick={savePracticeOrder}>
                          Save order
                        </Button>
                      </div>
                    )}
                  </RomanCardHeader>
                  <RomanCardContent className="p-4">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePracticeDragEnd}>
                      <SortableContext
                        items={currentLiveLessons.map(lesson => lesson.id)}
                        strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {currentLiveLessons.map(lesson => (
                            <SortableLessonItem
                              key={lesson.id}
                              id={lesson.id}
                              lesson={lesson}
                              onNavigate={navigateFromPathDraft}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </RomanCardContent>
                </RomanCard>
              ) : (
                <RomanCard>
                  <RomanCardHeader>
                    <h2 className="text-lg font-serif">Lessons ({filteredLessons.length})</h2>
                  </RomanCardHeader>
                  <RomanCardContent className="divide-y p-0">
                    {filteredLessons.map(lesson => (
                      <div key={lesson.id} className="flex items-start gap-4 p-4">
                        <Checkbox
                          checked={selectedLessons.has(lesson.id)}
                          onCheckedChange={() =>
                            setSelectedLessons(current => {
                              const next = new Set(current);
                              if (next.has(lesson.id)) next.delete(lesson.id);
                              else next.add(lesson.id);
                              return next;
                            })
                          }
                          disabled={isPublishing}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <SimpleRichDisplay content={lesson.title} />
                            <Badge variant={lesson.isLive ? 'default' : 'secondary'}>
                              {lesson.isLive ? 'Live' : 'Draft'}
                            </Badge>
                          </div>
                          {lesson.practiceCategories?.length ? (
                            <PracticeCategoryChips
                              categories={lesson.practiceCategories}
                              maxVisible={2}
                              className="mt-2"
                            />
                          ) : null}
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            href={`/admin/lessons/edit/${lesson.id}`}
                            onClick={event => {
                              event.preventDefault();
                              navigateFromPathDraft(`/admin/lessons/edit/${lesson.id}`);
                            }}>
                            Edit
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </RomanCardContent>
                </RomanCard>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </AdminPage>

      <Dialog
        open={testInsertionIndex !== null}
        onOpenChange={open => {
          if (!open) {
            setTestInsertionIndex(null);
            setTestPickerSearch('');
          }
        }}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Insert a normal test</DialogTitle>
            <DialogDescription>
              Choose a test container. Its rotation version is selected only when a student starts an attempt.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              autoFocus
              value={testPickerSearch}
              onChange={event => setTestPickerSearch(event.target.value)}
              placeholder="Search tests by title or description"
              className="pl-10"
            />
          </div>
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {unplacedTests.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-500">
                {serverTests.every(test => pathUnitIds.includes(test.id))
                  ? 'Every normal test is already in the Learning Path.'
                  : 'No tests match this search.'}
              </p>
            ) : (
              unplacedTests.map(test => {
                const eligible = test.rotationVersionCount > 0;
                const points =
                  test.minTotalPoints === test.maxTotalPoints
                    ? `${test.minTotalPoints} points`
                    : `${test.minTotalPoints}–${test.maxTotalPoints} points`;
                return (
                  <div
                    key={test.id}
                    className={`flex items-start gap-4 rounded-lg border p-4 ${
                      eligible ? 'border-indigo-200 bg-indigo-50/70' : 'border-amber-200 bg-amber-50'
                    }`}>
                    <div className="mt-0.5 rounded-md bg-indigo-100 p-2 text-indigo-700">
                      <FileCheck2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900">
                        <SimpleRichDisplay content={test.title} />
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        {test.rotationVersionCount}{' '}
                        {test.rotationVersionCount === 1 ? 'rotation version' : 'rotation versions'}
                        {' · '}
                        {points}
                        {' · '}
                        {test.passingPercentage === null ? 'Score only' : `Pass ≥ ${test.passingPercentage}%`}
                      </p>
                      {!eligible && (
                        <p className="mt-2 text-xs font-medium text-amber-800">
                          Add a valid rotation version before placing this test.
                        </p>
                      )}
                    </div>
                    <Button type="button" size="sm" disabled={!eligible} onClick={() => insertTest(test.id)}>
                      Insert
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default withAdminAuth(LiveLessonsPage);
