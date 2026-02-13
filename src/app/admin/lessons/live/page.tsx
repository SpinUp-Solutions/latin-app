'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/src/store';
import { Lesson } from '@/src/types/lesson';
import { syncLessonsFromRTQ, localReorderLiveLessons, selectHasUnsavedChanges } from '@/src/store/slices/lessonSlice';
import {
  useGetLessonsQuery,
  useUpdateLessonsPublishStatusMutation,
  useReorderLessonsMutation,
} from '@/src/store/api/lessonApi';
import { selectLiveLessons, selectAvailableLessons, selectFilteredLessons } from '@/src/store/slices/lessonSlice';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/src/components/ui/tabs';
import { RomanCard, RomanCardContent, RomanCardHeader } from '@/src/components/ui/core/roman-card';
import { Badge } from '@/src/components/ui/badge';
import { Checkbox } from '@/src/components/ui/checkbox';
import { ArrowLeft, Globe, Search, Filter, BookOpen, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { SortableLessonItem } from '@/src/components/admin/SortableLessonItem';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';

function LiveLessonsPage() {
  const dispatch = useDispatch();
  const { data: serverLessons, isLoading: loading } = useGetLessonsQuery();
  const [updatePublishStatus] = useUpdateLessonsPublishStatusMutation();
  const [reorderLessons] = useReorderLessonsMutation();
  const liveLessons = useSelector(selectLiveLessons);
  const availableLessons = useSelector(selectAvailableLessons);
  const hasUnsavedChanges = useSelector(selectHasUnsavedChanges);

  const [lessonType, setLessonType] = useState<'normal' | 'vocab'>('normal');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'draft'>('live');
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [isPublishing, setIsPublishing] = useState(false);

  const normalLiveLessons = liveLessons.filter(l => l.type === 'normal');
  const vocabLiveLessons = liveLessons.filter(l => l.type === 'vocab');
  const normalAvailableLessons = availableLessons.filter(l => l.type === 'normal');
  const vocabAvailableLessons = availableLessons.filter(l => l.type === 'vocab');

  const currentLiveLessons = lessonType === 'normal' ? normalLiveLessons : vocabLiveLessons;
  const currentAvailableLessons = lessonType === 'normal' ? normalAvailableLessons : vocabAvailableLessons;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sync RTK Query data to lessonSlice
  useEffect(() => {
    if (serverLessons) {
      dispatch(syncLessonsFromRTQ(serverLessons));
    }
  }, [serverLessons, dispatch]);

  const originalLiveIds = useMemo(() => new Set(currentLiveLessons.map(l => l.id)), [currentLiveLessons]);

  useEffect(() => {
    setSelectedLessons(new Set());
  }, [lessonType]);

  useEffect(() => {
    if (currentLiveLessons.length > 0 && selectedLessons.size === 0) {
      setSelectedLessons(originalLiveIds);
    }
  }, [currentLiveLessons.length, selectedLessons.size, originalLiveIds]);

  // Use the new parameterized selector for efficient filtering
  const filteredLessons = useSelector((state: RootState) => selectFilteredLessons(state, filterStatus, searchQuery));

  const handleSelectLesson = (lessonId: string) => {
    setSelectedLessons(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lessonId)) {
        newSet.delete(lessonId);
      } else {
        newSet.add(lessonId);
      }
      return newSet;
    });
  };

  const hasChanges = useMemo(() => {
    if (originalLiveIds.size !== selectedLessons.size) return true;
    for (const id of Array.from(originalLiveIds)) {
      if (!selectedLessons.has(id)) return true;
    }
    return false;
  }, [originalLiveIds, selectedLessons]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = currentLiveLessons.findIndex(item => item.id === active.id);
    const newIndex = currentLiveLessons.findIndex(item => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    dispatch(localReorderLiveLessons({ fromIndex: oldIndex, toIndex: newIndex, lessonType }));
  };

  const handleApplyLessonOrder = async () => {
    try {
      const updates = currentLiveLessons.map((lesson, index) => ({
        lessonId: lesson.id,
        liveOrder: index,
      }));

      await reorderLessons(updates).unwrap();
      toast.success('Lesson order saved successfully');
    } catch (error) {
      toast.error('Failed to save lesson order');
    }
  };

  const handleCancelLessonOrder = () => {
    if (serverLessons) {
      dispatch(syncLessonsFromRTQ(serverLessons));
      toast.info('Changes discarded');
    }
  };

  const handleApplyChanges = async () => {
    const toPublish = Array.from(selectedLessons).filter(id => !originalLiveIds.has(id));
    const toUnpublish = Array.from(originalLiveIds).filter(id => !selectedLessons.has(id));

    setIsPublishing(true);

    try {
      if (toPublish.length > 0) {
        await updatePublishStatus({
          lessonIds: toPublish,
          isLive: true,
        }).unwrap();
      }

      if (toUnpublish.length > 0) {
        try {
          await updatePublishStatus({
            lessonIds: toUnpublish,
            isLive: false,
          }).unwrap();
        } catch {
          if (toPublish.length > 0) {
            try {
              await updatePublishStatus({
                lessonIds: toPublish,
                isLive: false,
              }).unwrap();
              toast.error('Failed to unpublish lessons. New publish changes have been rolled back.');
            } catch {
              toast.error('Failed to unpublish lessons and rollback failed. Some lessons may need manual review.');
            }
          } else {
            toast.error('Failed to unpublish lessons');
          }
          setIsPublishing(false);
          return;
        }
      }

      toast.success('Changes applied successfully');
    } catch (error) {
      toast.error('Failed to publish lessons');
    }

    setIsPublishing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost">
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-roman-red" />
              <h1 className="text-xl font-serif tracking-wide">Manage Live Lessons</h1>
            </div>
          </div>

          {hasChanges && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-roman-stone">{selectedLessons.size} lessons selected</span>
              <Button
                onClick={handleApplyChanges}
                disabled={isPublishing}
                className="bg-roman-green hover:bg-roman-green/90">
                <CheckCircle className="h-4 w-4 mr-2" />
                Apply Changes
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 max-w-6xl">
        <Tabs value={lessonType} onValueChange={value => setLessonType(value as 'normal' | 'vocab')} className="mb-6">
          <TabsList>
            <TabsTrigger value="normal">
              Normal Lessons ({normalLiveLessons.length + normalAvailableLessons.length})
            </TabsTrigger>
            <TabsTrigger value="vocab">
              Vocab Lessons ({vocabLiveLessons.length + vocabAvailableLessons.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={lessonType}>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <RomanCard>
                <RomanCardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {currentLiveLessons.length + currentAvailableLessons.length}
                      </div>
                      <div className="text-sm text-gray-600">Total Lessons</div>
                    </div>
                  </div>
                </RomanCardContent>
              </RomanCard>

              <RomanCard>
                <RomanCardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-roman-green/20 flex items-center justify-center">
                      <Globe className="h-5 w-5 text-roman-green" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{currentLiveLessons.length}</div>
                      <div className="text-sm text-gray-600">Live Lessons</div>
                    </div>
                  </div>
                </RomanCardContent>
              </RomanCard>

              <RomanCard>
                <RomanCardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{currentAvailableLessons.length}</div>
                      <div className="text-sm text-gray-600">Draft Lessons</div>
                    </div>
                  </div>
                </RomanCardContent>
              </RomanCard>
            </div>

            {/* Filters */}
            <RomanCard className="mb-6">
              <RomanCardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search lessons by title or description..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-600" />
                    <Button
                      variant={filterStatus === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterStatus('all')}>
                      All
                    </Button>
                    <Button
                      variant={filterStatus === 'live' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterStatus('live')}>
                      Live
                    </Button>
                    <Button
                      variant={filterStatus === 'draft' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterStatus('draft')}>
                      Draft
                    </Button>
                  </div>
                </div>
              </RomanCardContent>
            </RomanCard>

            {filterStatus === 'live' && (
              <RomanCard className="mb-6">
                <RomanCardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <h2 className="text-lg font-serif">Live Lessons Order ({currentLiveLessons.length})</h2>
                    <p className="text-sm text-gray-600">
                      Drag lessons to reorder. Click Apply to save changes.
                      {hasUnsavedChanges && <span className="text-orange-600 font-medium ml-2">• Unsaved changes</span>}
                    </p>
                  </div>
                  {hasUnsavedChanges && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleCancelLessonOrder}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleApplyLessonOrder}>
                        Apply Changes
                      </Button>
                    </div>
                  )}
                </RomanCardHeader>
                <RomanCardContent className="p-4">
                  {currentLiveLessons.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No live lessons found. Publish some lessons to start ordering them.
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={currentLiveLessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {currentLiveLessons.map(lesson => (
                            <SortableLessonItem key={lesson.id} id={lesson.id} lesson={lesson} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </RomanCardContent>
              </RomanCard>
            )}

            {filterStatus !== 'live' && (
              <RomanCard>
                <RomanCardHeader>
                  <h2 className="text-lg font-serif">
                    Lessons ({filteredLessons.filter(l => l.type === lessonType).length})
                  </h2>
                </RomanCardHeader>
                <RomanCardContent className="p-0">
                  <div className="divide-y divide-border">
                    {filteredLessons.filter(l => l.type === lessonType).length === 0 ? (
                      <div className="p-8 text-center text-gray-500">No lessons found matching your criteria</div>
                    ) : (
                      filteredLessons
                        .filter(l => l.type === lessonType)
                        .map((lesson: Lesson) => {
                          return (
                            <div key={lesson.id} className="p-4 hover:bg-gray-50 transition-colors">
                              <div className="flex items-start gap-4">
                                <Checkbox
                                  checked={selectedLessons.has(lesson.id)}
                                  onCheckedChange={() => handleSelectLesson(lesson.id)}
                                  className="mt-1"
                                />

                                <div className="flex-1">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-serif text-lg">{lesson.title}</h3>
                                        <Badge variant={lesson.isLive ? 'default' : 'secondary'}>
                                          {lesson.isLive ? 'Live' : 'Draft'}
                                        </Badge>
                                      </div>
                                      {lesson.description && (
                                        <p className="text-sm text-gray-600 mb-2">{lesson.description}</p>
                                      )}
                                      <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span>{lesson.pages?.length || 0} pages</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Button size="sm" variant="outline" asChild>
                                        <Link href={`/admin/lessons/edit/${lesson.id}`}>Edit</Link>
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </RomanCardContent>
              </RomanCard>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default withAdminAuth(LiveLessonsPage);
