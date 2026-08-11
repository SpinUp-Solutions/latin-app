'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Card, CardContent } from '@/src/components/ui/card';
import { Tabs, TabsContent } from '@/src/components/ui/tabs';
import {
  BookOpen,
  Edit,
  Trash2,
  Calendar,
  Eye,
  FileText,
  Clock,
  AlertTriangle,
  RotateCcw,
  ClipboardList,
  Headphones,
  Pencil,
  type LucideIcon,
} from 'lucide-react';
import { LessonSummary } from '@/src/types/lesson';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  useGetLessonsQuery,
  useDeleteLessonMutation,
  useGetRecoveryItemsQuery,
  useRetryFromRecoveryMutation,
  useDeleteRecoveryItemMutation,
} from '@/src/store/api/lessonApi';
import { clearDraft, loadDrafts } from '@/src/store/slices/lessonEditorSlice';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { isExerciseType } from '@/src/utils/lessonUtils';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { useDebounce } from '@/src/hooks/useDebounce';
import { PracticeCategoryChips } from './practice-categories/PracticeCategoryChips';
import { useGetPracticeCategoriesQuery } from '@/src/store/api/practiceCategoryApi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import {
  isPracticeLessonType,
  lessonMatchesPracticeCategory,
  lessonMatchesTextSearch,
  type PracticeCategoryFilter,
} from '@/src/utils/practiceCategoryLessons';
import { LessonTypeTabs } from './LessonTypeTabs';
import {
  AdminIconChip,
  AdminLoadingState,
  AdminMetric,
  AdminSearchInput,
  AdminStatusBadge,
} from '@/src/components/admin/shell';
import { cn } from '@/src/lib/utils';

type LessonTab = LessonSummary['type'];
type LessonType = LessonSummary['type'];

const lessonTypeConfig: Record<LessonType, { label: string; icon: LucideIcon; badge: string; iconChip: string }> = {
  normal: {
    label: 'Normal lesson',
    icon: BookOpen,
    badge: 'border-primary/20 bg-primary/[0.08] text-primary',
    iconChip:
      'border-primary/15 bg-gradient-to-br from-primary/[0.16] via-primary/[0.09] to-roman-gold/20 !text-primary',
  },
  vocab: {
    label: 'Vocabulary',
    icon: BookOpen,
    badge: 'border-amber-300 bg-amber-100 text-amber-950',
    iconChip: 'border-amber-300 bg-gradient-to-br from-amber-200 via-amber-100 to-white !text-amber-700',
  },
  'sentence-diagramming': {
    label: 'Diagramming',
    icon: Pencil,
    badge: 'border-sky-300 bg-sky-100 text-sky-950',
    iconChip: 'border-sky-300 bg-gradient-to-br from-sky-200 via-sky-100 to-white !text-sky-700',
  },
  listening: {
    label: 'Listening',
    icon: Headphones,
    badge: 'border-violet-300 bg-violet-100 text-violet-950',
    iconChip: 'border-violet-300 bg-gradient-to-br from-violet-200 via-violet-100 to-white !text-violet-700',
  },
};

interface LessonManagerProps {
  onEditLesson: (lesson: LessonSummary) => void;
  onContinueDraft: (lessonId: string) => void;
}

function LessonMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
  return (
    <AdminMetric
      icon={Icon}
      label={label}
      value={value}
      className="gap-2.5 border-r border-border/70 px-4 py-3.5 last:border-r-0 sm:px-5"
    />
  );
}

function LessonTypeBadge({ type }: { type: LessonType }) {
  if (type === 'normal') return null;

  const config = lessonTypeConfig[type];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`gap-1.5 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] ${config.badge}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}

function LessonDescription({ content }: { content?: string }) {
  return (
    <div className="relative h-6 min-w-0">
      <div className="h-6 overflow-hidden whitespace-nowrap pr-9 text-sm leading-6 text-muted-foreground">
        <SimpleRichDisplay content={content || 'No description provided'} className="!block whitespace-nowrap" />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white via-white/95 to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}

function LessonTitle({ content }: { content: string }) {
  return (
    <h3 className="relative min-w-0 flex-1 pr-10 font-serif text-xl leading-5 tracking-tight text-foreground">
      <SimpleRichDisplay content={content} className="!block break-words whitespace-normal" />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white via-white/95 to-transparent"
        aria-hidden="true"
      />
    </h3>
  );
}

export const LessonManager: React.FC<LessonManagerProps> = ({ onEditLesson, onContinueDraft }) => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: lessons = [], isLoading: loading, error } = useGetLessonsQuery();
  const { data: recoveryItems = [] } = useGetRecoveryItemsQuery();
  const [deleteLesson] = useDeleteLessonMutation();
  const [retryFromRecovery, { isLoading: retryingRecovery }] = useRetryFromRecoveryMutation();
  const [deleteRecoveryItem] = useDeleteRecoveryItemMutation();
  const { drafts } = useAppSelector(state => state.lessonEditor);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 200);
  const [activeTab, setActiveTab] = useState<LessonTab>('normal');
  const [categoryFilter, setCategoryFilter] = useState<PracticeCategoryFilter>('all');
  const practiceTab = isPracticeLessonType(activeTab);
  const {
    data: activeCategories = [],
    isLoading: loadingCategories,
    isFetching: fetchingCategories,
    isError: categoriesError,
    isSuccess: categoriesLoaded,
    refetch: refetchCategories,
  } = useGetPracticeCategoriesQuery(
    { lessonType: practiceTab ? activeTab : 'vocab', status: 'active' },
    { skip: !practiceTab }
  );

  const filteredLessons = useMemo(() => {
    const lessonOnly = lessons.filter(lesson => isLessonDocumentData(lesson));
    if (!debouncedSearchQuery) return lessonOnly;
    return lessonOnly.filter(lesson => lessonMatchesTextSearch(lesson, debouncedSearchQuery));
  }, [lessons, debouncedSearchQuery]);

  const filteredDrafts = useMemo(() => {
    const draftEntries = Object.entries(drafts).filter(([, draft]) => draft.document.editorKind === 'lesson');
    if (!debouncedSearchQuery) return draftEntries;
    const query = debouncedSearchQuery.toLowerCase();
    return draftEntries.filter(([, draft]) => {
      return (
        draft.document.title.toLowerCase().includes(query) ||
        (draft.document.description && draft.document.description.toLowerCase().includes(query))
      );
    });
  }, [drafts, debouncedSearchQuery]);

  const filteredRecoveryItems = useMemo(() => {
    if (!debouncedSearchQuery) return recoveryItems;
    const query = debouncedSearchQuery.toLowerCase();
    return recoveryItems.filter(
      item =>
        item.lessonTitle.toLowerCase().includes(query) ||
        (item.rawLessonData.description && item.rawLessonData.description.toLowerCase().includes(query))
    );
  }, [recoveryItems, debouncedSearchQuery]);

  const normalLessons = filteredLessons.filter(l => l.type === 'normal');
  const vocabLessons = filteredLessons.filter(
    l => l.type === 'vocab' && (activeTab !== 'vocab' || lessonMatchesPracticeCategory(l, categoryFilter))
  );
  const diagrammingLessons = filteredLessons.filter(
    l =>
      l.type === 'sentence-diagramming' &&
      (activeTab !== 'sentence-diagramming' || lessonMatchesPracticeCategory(l, categoryFilter))
  );
  const listeningLessons = filteredLessons.filter(
    l => l.type === 'listening' && (activeTab !== 'listening' || lessonMatchesPracticeCategory(l, categoryFilter))
  );

  useEffect(() => {
    dispatch(loadDrafts());
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      const errorMessage =
        'data' in error
          ? (error.data as { error?: string })?.error || 'Failed to load lessons'
          : 'error' in error
            ? error.error || 'Failed to load lessons'
            : 'Failed to load lessons';
      toast.error(errorMessage);
    }
  }, [error]);

  useEffect(() => {
    if (
      categoriesLoaded &&
      categoryFilter !== 'all' &&
      categoryFilter !== 'uncategorized' &&
      !activeCategories.some(category => category.id === categoryFilter)
    ) {
      setCategoryFilter('all');
    }
  }, [activeCategories, categoriesLoaded, categoryFilter]);

  const handleDeleteLesson = (lessonId: string, lessonTitle: string) => {
    setDialogState({
      isOpen: true,
      title: `Delete Lesson: "${lessonTitle}"?`,
      description: 'This action cannot be undone. This will permanently delete the lesson and all of its content.',
      onConfirm: async () => {
        try {
          await deleteLesson(lessonId).unwrap();
          toast.success('Lesson deleted successfully');
        } catch (error) {
          console.error('Error deleting lesson:', error);
        }
      },
    });
  };

  const handleDeleteDraft = (lessonId: string, lessonTitle: string) => {
    setDialogState({
      isOpen: true,
      title: `Delete Draft: "${lessonTitle}"?`,
      description: 'This will permanently discard your unsaved draft. This action cannot be undone.',
      onConfirm: () => {
        dispatch(clearDraft(lessonId));
        toast.success('Draft deleted successfully');
      },
    });
  };

  const handleRetryRecovery = async (recoveryId: string) => {
    setRetryingId(recoveryId);
    try {
      const result = await retryFromRecovery(recoveryId).unwrap();
      toast.success('Lesson recovered successfully!');
      router.push(`/admin/lessons/edit/${result.lesson.id}`);
    } catch (error) {
      console.error('Failed to retry from recovery:', error);
      toast.error('Failed to recover lesson. Please try again.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDiscardRecovery = (recoveryId: string, lessonTitle: string) => {
    setDialogState({
      isOpen: true,
      title: `Discard Recovery: "${lessonTitle}"?`,
      description: 'This will permanently discard this recovery item. The lesson data will be lost.',
      onConfirm: async () => {
        try {
          await deleteRecoveryItem(recoveryId).unwrap();
          toast.success('Recovery item discarded');
        } catch (error) {
          console.error('Failed to discard recovery:', error);
          toast.error('Failed to discard recovery item');
        }
      },
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderLessonGrid = (lessonsList: LessonSummary[]) => {
    if (lessonsList.length === 0) {
      return <div className="text-center text-gray-500 py-8">No lessons found in this category.</div>;
    }

    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {lessonsList.map(lesson => (
          <Card
            key={lesson.id}
            className="group overflow-hidden border-border/80 bg-white/95 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg motion-reduce:transition-none">
            <CardContent className="!p-0">
              <div className="relative flex flex-col gap-5 p-5 sm:p-6">
                {lesson.isLive && (
                  <div className="absolute right-5 top-5 z-10 sm:right-6 sm:top-6">
                    <AdminStatusBadge tone="success">Live</AdminStatusBadge>
                  </div>
                )}
                <div className={cn('flex items-start gap-3', lesson.isLive && 'pr-20 sm:pr-24')}>
                  <AdminIconChip
                    icon={lessonTypeConfig[lesson.type].icon}
                    className={lessonTypeConfig[lesson.type].iconChip}
                  />
                  <div className="min-w-0 flex-1">
                    <LessonTitle content={lesson.title} />
                  </div>
                </div>

                <LessonDescription content={lesson.description} />

                {lesson.type !== 'normal' && (
                  <PracticeCategoryChips
                    categories={lesson.practiceCategories}
                    maxVisible={3}
                    emptyLabel="Uncategorized"
                  />
                )}

                <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-xs text-roman-stone">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">Updated {formatDate(lesson.updatedAt || lesson.createdAt)}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-medium">v{lesson.version || 1}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 border-t bg-muted/30">
                <LessonMetric icon={BookOpen} label="Pages" value={lesson.totalPages} />
                <LessonMetric icon={ClipboardList} label="Exercises" value={lesson.totalExercises} />
                <LessonMetric icon={FileText} label="Items" value={lesson.totalItems} />
              </div>

              <div className="flex items-center gap-3 border-t px-5 py-3 sm:px-6">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => router.push(`/admin/lessons/preview/${lesson.id}`)}
                  className="flex-1 border border-border bg-white font-sans text-foreground hover:bg-roman-parchment hover:text-foreground sm:w-40 sm:flex-none">
                  <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Preview
                </Button>
                <Button
                  size="sm"
                  onClick={() => onEditLesson(lesson)}
                  className="flex-1 font-sans sm:w-40 sm:flex-none">
                  <Edit className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Edit lesson
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDeleteLesson(lesson.id, lesson.title)}
                  className="h-9 w-9 shrink-0 border border-border bg-white font-sans text-roman-stone hover:bg-primary/10 hover:text-primary"
                  aria-label={`Delete ${lesson.title}`}
                  title="Delete lesson">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderCategoryFilter = () => {
    if (!practiceTab) return null;

    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3">
        <label htmlFor="lesson-category-filter" className="text-sm font-medium text-gray-700">
          Category
        </label>
        <Select value={categoryFilter} onValueChange={setCategoryFilter} disabled={loadingCategories}>
          <SelectTrigger id="lesson-category-filter" className="h-9 w-full sm:w-72" aria-label="Filter by category">
            <SelectValue placeholder={loadingCategories ? 'Loading categories…' : 'All categories'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {activeCategories.map(category => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
            <SelectItem value="uncategorized">Uncategorized</SelectItem>
          </SelectContent>
        </Select>
        {fetchingCategories && !loadingCategories && (
          <span className="text-xs text-gray-500" aria-live="polite">
            Refreshing categories…
          </span>
        )}
        {categoriesError && (
          <div className="flex items-center gap-2 text-xs text-red-700">
            <span>Categories could not be loaded.</span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void refetchCategories()}>
              Retry
            </Button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <AdminLoadingState label="Loading lessons" className="min-h-64 p-0" />;
  }

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      {(lessons.length > 0 || Object.keys(drafts).length > 0 || recoveryItems.length > 0) && (
        <RomanCard className="mb-6">
          <RomanCardContent className="p-4">
            <AdminSearchInput
              value={searchQuery}
              onValueChange={setSearchQuery}
              label="Search lessons"
              clearLabel="Clear lesson search"
              placeholder="Search lessons by title or description..."
              inputClassName="border-gray-200 bg-white transition-colors duration-300 focus:border-roman-red focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </RomanCardContent>
        </RomanCard>
      )}

      {/* Recovery Section */}
      {filteredRecoveryItems.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-primary" aria-hidden="true" />
            <h2 className="font-serif text-xl text-foreground">Recovery items ({filteredRecoveryItems.length})</h2>
          </div>
          <div className="mb-4 rounded-xl border border-primary/15 bg-primary/[0.05] p-4">
            <p className="text-sm leading-relaxed text-primary">
              These lessons failed to save previously. You can retry saving them or discard them if no longer needed.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredRecoveryItems.map(item => (
              <Card
                key={item.id}
                className="group overflow-hidden border-primary/15 bg-white/95 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none">
                <CardContent className="!p-0">
                  <div className="flex flex-col gap-5 p-5 sm:p-6">
                    <div className="flex items-start gap-3">
                      <AdminIconChip
                        icon={AlertTriangle}
                        className="border-primary/20 bg-gradient-to-br from-primary/[0.18] via-primary/[0.1] to-primary/[0.04]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <LessonTypeBadge type={item.rawLessonData.type} />
                          <AdminStatusBadge tone="danger">Recovery</AdminStatusBadge>
                        </div>
                        <LessonTitle content={item.lessonTitle} />
                      </div>
                    </div>

                    <div className="rounded-lg border border-primary/15 bg-primary/[0.05] p-3 text-sm leading-relaxed text-primary">
                      <span className="font-semibold">Error:</span> {item.errorMessage}
                    </div>

                    <div className="flex items-center gap-1.5 border-t border-border/70 pt-3 text-xs text-roman-stone">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Failed at {formatDate(item.createdAt)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 border-t bg-muted/30">
                    <LessonMetric icon={BookOpen} label="Pages" value={item.rawLessonData.pages?.length || 0} />
                    <LessonMetric
                      icon={ClipboardList}
                      label="Exercises"
                      value={
                        item.rawLessonData.pages?.reduce(
                          (count, page) => count + page.items.filter(i => isExerciseType(i.type)).length,
                          0
                        ) || 0
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2 border-t px-5 py-3 sm:px-6">
                    <Button
                      size="sm"
                      onClick={() => handleRetryRecovery(item.id)}
                      disabled={retryingRecovery && retryingId === item.id}
                      className="flex-1 font-sans">
                      {retryingRecovery && retryingId === item.id ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                          Retrying...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          Retry Save
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDiscardRecovery(item.id, item.lessonTitle)}
                      disabled={retryingRecovery && retryingId === item.id}
                      className="h-9 w-9 shrink-0 p-0 font-sans text-roman-stone hover:bg-primary/10 hover:text-primary"
                      aria-label={`Discard recovery for ${item.lessonTitle}`}
                      title="Discard recovery item">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Drafts Section */}
      {filteredDrafts.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-roman-gold" aria-hidden="true" />
            <h2 className="font-serif text-xl text-foreground">Drafts ({filteredDrafts.length})</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredDrafts
              .sort(([, a], [, b]) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
              .map(([draftKey, draft]) => {
                const lessonId = draft.document.ownerId;
                const draftType = draft.document.sourceLesson?.type ?? 'normal';
                return (
                  <Card
                    key={draftKey}
                    className="group overflow-hidden border-roman-gold/30 bg-white/95 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-roman-gold/50 hover:shadow-lg motion-reduce:transition-none">
                    <CardContent className="!p-0">
                      <div className="flex flex-col gap-5 p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                          <AdminIconChip
                            icon={lessonTypeConfig[draftType].icon}
                            className={`${lessonTypeConfig[draftType].iconChip} border-roman-gold/35 opacity-90`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <LessonTypeBadge type={draftType} />
                              <AdminStatusBadge tone="warning">Draft</AdminStatusBadge>
                            </div>
                            <LessonTitle content={draft.document.title} />
                          </div>
                        </div>

                        <LessonDescription content={draft.document.description} />

                        <div className="flex items-center gap-1.5 border-t border-border/70 pt-3 text-xs text-roman-stone">
                          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          Last saved {formatDate(draft.lastModified)}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 border-t bg-muted/30">
                        <LessonMetric icon={BookOpen} label="Pages" value={draft.document.pages.length} />
                        <LessonMetric
                          icon={ClipboardList}
                          label="Exercises"
                          value={draft.document.pages.reduce(
                            (count, page) => count + page.items.filter(item => isExerciseType(item.type)).length,
                            0
                          )}
                        />
                        <LessonMetric
                          icon={FileText}
                          label="Items"
                          value={draft.document.pages.reduce((count, page) => count + page.items.length, 0)}
                        />
                      </div>

                      <div className="flex items-center gap-2 border-t px-5 py-3 sm:px-6">
                        <Button
                          size="sm"
                          onClick={() => onContinueDraft(lessonId)}
                          className="flex-1 bg-roman-gold font-sans text-foreground hover:bg-roman-gold/90">
                          <Edit className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          Continue
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteDraft(lessonId, draft.document.title)}
                          className="h-9 w-9 shrink-0 p-0 font-sans text-roman-stone hover:bg-primary/10 hover:text-primary"
                          aria-label={`Delete draft ${draft.document.title}`}
                          title="Delete draft">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-primary" aria-hidden="true" />
          <h2 className="font-serif text-xl text-foreground">Saved lessons ({filteredLessons.length})</h2>
        </div>
        {lessons.length === 0 && Object.keys(drafts).length === 0 && recoveryItems.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">No Lessons Found</h3>
              <p className="text-gray-600 mb-4">Create your first lesson to get started.</p>
            </CardContent>
          </Card>
        ) : filteredLessons.length === 0 && filteredDrafts.length === 0 && filteredRecoveryItems.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">No Matches Found</h3>
              <p className="text-gray-600 mb-4">No lessons or drafts match &ldquo;{searchQuery}&rdquo;.</p>
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            </CardContent>
          </Card>
        ) : filteredLessons.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {searchQuery ? (
              <>No saved lessons match &ldquo;{searchQuery}&rdquo;. Matching drafts or recovery items appear above.</>
            ) : (
              <>No saved lessons yet. Continue with the work above or create a new lesson.</>
            )}
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={value => {
              setActiveTab(value as LessonTab);
              if (categoryFilter !== 'all' && categoryFilter !== 'uncategorized') {
                setCategoryFilter('all');
              }
            }}
            className="w-full">
            <LessonTypeTabs
              counts={{
                normal: normalLessons.length,
                vocab: vocabLessons.length,
                'sentence-diagramming': diagrammingLessons.length,
                listening: listeningLessons.length,
              }}
            />
            <TabsContent value="normal" className="mt-5">
              {renderLessonGrid(normalLessons)}
            </TabsContent>
            <TabsContent value="vocab" className="mt-5">
              {renderCategoryFilter()}
              {renderLessonGrid(vocabLessons)}
            </TabsContent>
            <TabsContent value="sentence-diagramming" className="mt-5">
              {renderCategoryFilter()}
              {renderLessonGrid(diagrammingLessons)}
            </TabsContent>
            <TabsContent value="listening" className="mt-5">
              {renderCategoryFilter()}
              {renderLessonGrid(listeningLessons)}
            </TabsContent>
          </Tabs>
        )}
      </section>
      <ConfirmationDialog
        isOpen={dialogState?.isOpen || false}
        onClose={() => setDialogState(null)}
        onConfirm={() => dialogState?.onConfirm()}
        title={dialogState?.title || ''}
        description={dialogState?.description || ''}
        confirmText="Delete"
      />
    </div>
  );
};
