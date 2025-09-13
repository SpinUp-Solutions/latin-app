'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/src/store';
import { 
  loadLessons, 
  batchPublishLessons, 
  batchUnpublishLessons,
  selectLiveLessons,
  selectAvailableLessons 
} from '@/src/store/slices/lessonSlice';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { RomanCard, RomanCardContent, RomanCardHeader } from '@/src/components/ui/core/roman-card';
import { Badge } from '@/src/components/ui/badge';
import { Checkbox } from '@/src/components/ui/checkbox';
import { ArrowLeft, Globe, Search, Filter, BookOpen, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Lesson } from '@/src/types/lesson';

export default function LiveLessonsPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { loading } = useSelector((state: RootState) => state.lesson);
  const liveLessons = useSelector((state: RootState) => selectLiveLessons(state));
  const availableLessons = useSelector((state: RootState) => selectAvailableLessons(state));

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'draft'>('all');
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [isPublishing, setIsPublishing] = useState(false);
  const [originalLiveIds, setOriginalLiveIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    dispatch(loadLessons());
  }, [dispatch, user, router]);

  useEffect(() => {
    if (liveLessons.length > 0 && !initialized) {
      const liveIds = new Set(liveLessons.map(l => l.id));
      setOriginalLiveIds(liveIds);
      setSelectedLessons(liveIds);
      setInitialized(true);
    }
  }, [liveLessons, initialized]);

  const getFilteredLessons = (): Array<(Lesson & { isLive: true }) | (Lesson & { isLive: false })> => {
    const lessons: Array<(Lesson & { isLive: true }) | (Lesson & { isLive: false })> = [];

    if (filterStatus === 'all' || filterStatus === 'live') {
      for (const lesson of liveLessons) {
        const matchesSearch =
          !searchQuery ||
          lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lesson.description?.toLowerCase().includes(searchQuery.toLowerCase());

        if (matchesSearch) {
          lessons.push({ ...lesson, isLive: true as const });
        }
      }
    }

    if (filterStatus === 'all' || filterStatus === 'draft') {
      for (const lesson of availableLessons) {
        const matchesSearch =
          !searchQuery ||
          lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lesson.description?.toLowerCase().includes(searchQuery.toLowerCase());

        if (matchesSearch) {
          lessons.push({ ...lesson, isLive: false as const });
        }
      }
    }

    return lessons;
  };

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
    for (const id of Array.from(selectedLessons)) {
      if (!originalLiveIds.has(id)) return true;
    }

    return false;
  }, [originalLiveIds, selectedLessons]);

  const handleApplyChanges = async () => {
    const toPublish = Array.from(selectedLessons).filter(id => !originalLiveIds.has(id));
    const toUnpublish = Array.from(originalLiveIds).filter(id => !selectedLessons.has(id));

    setIsPublishing(true);

    try {
      if (toUnpublish.length > 0) {
        await dispatch(batchUnpublishLessons(toUnpublish)).unwrap();
      }

      if (toPublish.length > 0) {
        await dispatch(batchPublishLessons(toPublish)).unwrap();
      }

      toast.success('Changes applied successfully');
      dispatch(loadLessons());
    } catch (error) {
      toast.error('Failed to apply changes');
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
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <RomanCard>
            <RomanCardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{liveLessons.length + availableLessons.length}</div>
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
                  <div className="text-2xl font-bold">{liveLessons.length}</div>
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
                  <div className="text-2xl font-bold">{availableLessons.length}</div>
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

        {/* Lessons List */}
        <RomanCard>
          <RomanCardHeader>
            <h2 className="text-lg font-serif">Lessons ({getFilteredLessons().length})</h2>
          </RomanCardHeader>
          <RomanCardContent className="p-0">
            <div className="divide-y divide-border">
              {getFilteredLessons().length === 0 ? (
                <div className="p-8 text-center text-gray-500">No lessons found matching your criteria</div>
              ) : (
                getFilteredLessons().map(lesson => {
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
                                <span>{lesson.introduction?.length || 0} intro pages</span>
                                <span>{lesson.exercises?.length || 0} exercise pages</span>
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
      </main>
    </div>
  );
}
