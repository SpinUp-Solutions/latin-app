'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
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
  Search,
  X,
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
import { Input } from '@/src/components/ui/input';
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

type LessonTab = LessonSummary['type'];

interface LessonManagerProps {
  onEditLesson: (lesson: LessonSummary) => void;
  onContinueDraft: (lessonId: string) => void;
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {lessonsList.map(lesson => (
          <Card key={lesson.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <BookOpen className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div className="truncate min-w-0">
                    <SimpleRichDisplay content={lesson.title} className="truncate" />
                  </div>
                </div>
                {lesson.isLive && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded flex-shrink-0">Live</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-600 line-clamp-3">
                <SimpleRichDisplay content={lesson.description || 'No description provided'} />
              </div>

              {lesson.type !== 'normal' && (
                <PracticeCategoryChips
                  categories={lesson.practiceCategories}
                  maxVisible={3}
                  emptyLabel="Uncategorized"
                />
              )}

              <div className="text-xs text-gray-500 space-y-1">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(lesson.updatedAt || lesson.createdAt)}
                </div>
                <div>v{lesson.version || 1}</div>
              </div>

              <div className="flex justify-between text-xs text-gray-600">
                <span>{lesson.totalPages} total pages</span>
                <span>{lesson.totalExercises} exercises</span>
                <span>{lesson.totalItems} items</span>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/admin/lessons/preview/${lesson.id}`)}
                  className="flex-1">
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
                <Button size="sm" onClick={() => onEditLesson(lesson)} className="flex-1">
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDeleteLesson(lesson.id, lesson.title)}>
                  <Trash2 className="h-4 w-4" />
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
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      {(lessons.length > 0 || Object.keys(drafts).length > 0) && (
        <RomanCard className="mb-6">
          <RomanCardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search lessons by title or description..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 bg-white transition-colors duration-300 border-gray-200 focus:border-roman-red focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1 h-8 w-8 p-0 text-gray-500 hover:text-gray-900"
                  title="Clear search">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </RomanCardContent>
        </RomanCard>
      )}

      {/* Recovery Section */}
      {filteredRecoveryItems.length > 0 && (
        <section>
          <h2 className="text-xl font-serif text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">Recovery Items ({filteredRecoveryItems.length})</span>
          </h2>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-700">
              These lessons failed to save previously. You can retry saving them or discard them if no longer needed.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecoveryItems.map(item => (
              <Card key={item.id} className="hover:shadow-lg transition-shadow border-red-300 bg-red-50/50">
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                      <div className="truncate min-w-0">
                        <SimpleRichDisplay content={item.lessonTitle} className="truncate" />
                      </div>
                    </div>
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full flex-shrink-0">
                      Recovery
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-red-700 bg-red-100 p-2 rounded border border-red-200">
                    <strong>Error:</strong> {item.errorMessage}
                  </div>

                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Failed at: {formatDate(item.createdAt)}
                    </div>
                  </div>

                  <div className="flex justify-between text-xs text-gray-600">
                    <span>{item.rawLessonData.pages?.length || 0} total pages</span>
                    <span>
                      {item.rawLessonData.pages?.reduce(
                        (count, page) => count + page.items.filter(i => isExerciseType(i.type)).length,
                        0
                      ) || 0}{' '}
                      exercises
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => handleRetryRecovery(item.id)}
                      disabled={retryingRecovery && retryingId === item.id}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                      {retryingRecovery && retryingId === item.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Retrying...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Retry Save
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDiscardRecovery(item.id, item.lessonTitle)}
                      disabled={retryingRecovery && retryingId === item.id}>
                      <Trash2 className="h-4 w-4" />
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
          <h2 className="text-xl font-serif text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-600" />
            <span>Drafts ({filteredDrafts.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDrafts
              .sort(([, a], [, b]) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
              .map(([draftKey, draft]) => {
                const lessonId = draft.document.ownerId;
                return (
                <Card key={draftKey} className="hover:shadow-lg transition-shadow border-amber-300 bg-amber-50/50">
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="h-5 w-5 text-amber-600 flex-shrink-0" />
                        <div className="truncate min-w-0">
                           <SimpleRichDisplay content={draft.document.title} className="truncate" />
                        </div>
                      </div>
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full flex-shrink-0">
                        Draft
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-gray-600 line-clamp-3">
                       <SimpleRichDisplay content={draft.document.description || 'No description provided'} />
                    </div>

                    <div className="text-xs text-gray-500 space-y-1">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last saved: {formatDate(draft.lastModified)}
                      </div>
                    </div>

                    <div className="flex justify-between text-xs text-gray-600">
                       <span>{draft.document.pages.length} total pages</span>
                      <span>
                         {draft.document.pages.reduce(
                          (count, page) => count + page.items.filter(item => isExerciseType(item.type)).length,
                          0
                        )}{' '}
                        exercises
                      </span>
                       <span>{draft.document.pages.reduce((count, page) => count + page.items.length, 0)} items</span>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => onContinueDraft(lessonId)}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                        <Edit className="h-4 w-4 mr-1" />
                        Continue
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                         onClick={() => handleDeleteDraft(lessonId, draft.document.title)}>
                        <Trash2 className="h-4 w-4" />
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
        <h2 className="text-xl font-serif text-gray-800 border-b pb-2 mb-4">
          Saved Lessons ({filteredLessons.length})
        </h2>
        {lessons.length === 0 && Object.keys(drafts).length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">No Lessons Found</h3>
              <p className="text-gray-600 mb-4">Create your first lesson to get started.</p>
            </CardContent>
          </Card>
        ) : filteredLessons.length === 0 && filteredDrafts.length === 0 ? (
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
        ) : filteredLessons.length === 0 && filteredDrafts.length > 0 ? (
          <div className="text-center text-gray-500 py-8">
            {searchQuery ? (
              <>No saved lessons match &ldquo;{searchQuery}&rdquo;. Continue with matching drafts above.</>
            ) : (
              <>No saved lessons yet. Continue with your drafts or create a new lesson.</>
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
            <TabsContent value="normal" className="mt-5">{renderLessonGrid(normalLessons)}</TabsContent>
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
