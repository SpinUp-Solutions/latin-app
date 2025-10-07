'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Word } from '@/src/types/admin-vocabulary';
import { useGetWordsQuery, useGetWordTypeCountsQuery, useUpdateWordMutation } from '@/src/store/api/vocabularyApi';
import {
  updateFilters as updateFiltersAction,
  resetFilters as resetFiltersAction,
  selectVocabularyFilters,
} from '@/src/store/slices/vocabularySlice';
import { useDebounce } from '@/src/hooks/useDebounce';
import { VocabularyEditModal } from '@/src/components/ui/admin/vocabulary/VocabularyEditModal';
import { VocabularyFiltersComponent } from '@/src/components/ui/admin/vocabulary/VocabularyFilters';
import { VocabularyList } from '@/src/components/ui/admin/vocabulary/VocabularyList';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';

function AdminVocabularyPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const filters = useSelector(selectVocabularyFilters);
  const debouncedSearch = useDebounce(filters.search, 150);

  const [lastWordId, setLastWordId] = useState<string | null>(null);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const queryArgs = {
    wordType: filters.wordType,
    section: filters.section,
    search: debouncedSearch,
    lastWordId,
  };

  const { data, isLoading, isFetching } = useGetWordsQuery(queryArgs);
  const { data: wordTypeCounts = {}, isLoading: countsLoading } = useGetWordTypeCountsQuery();
  const [updateWord, { isLoading: updating }] = useUpdateWordMutation();

  useEffect(() => {
    setLastWordId(null);
  }, [filters.wordType, filters.section, debouncedSearch]);

  const handleEditWord = (word: Word) => {
    setEditingWord(word);
    setIsEditModalOpen(true);
  };

  const handleUpdateWord = async (updates: Partial<Word>) => {
    if (!editingWord) return false;

    try {
      const cleanedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => {
          if (value === undefined || value === null) return false;
          if (typeof value === 'string' && value.trim() === '') return false;
          if (Array.isArray(value) && value.length === 0) return false;
          return true;
        })
      );

      await updateWord({ wordId: editingWord.id, updates: cleanedUpdates }).unwrap();
      toast.success('Word updated successfully');
      return true;
    } catch (error) {
      toast.error('Error updating word');
      return false;
    }
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingWord(null);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleLoadMore = () => {
    if (data?.lastWordId) {
      setLastWordId(data.lastWordId);
    }
  };

  const handleUpdateFilters = (newFilters: Partial<typeof filters>) => {
    dispatch(updateFiltersAction(newFilters));
  };

  const handleResetFilters = () => {
    dispatch(resetFiltersAction());
  };

  const words = data?.words ?? [];
  const hasMore = data?.hasMore ?? false;
  const loadingMore = isFetching && lastWordId !== null;

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Vocabulary Viewer</h1>
              <p className="text-sm text-roman-stone">View and edit Latin words</p>
            </div>
          </div>
        </div>
        <div className="text-sm text-roman-stone">
          {words.length} words loaded
          {countsLoading && ' (loading counts...)'}
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        <VocabularyFiltersComponent
          filters={filters}
          wordTypeCounts={wordTypeCounts}
          countsLoading={countsLoading}
          onFiltersChange={handleUpdateFilters}
          onSearch={handleSearch}
          onReset={handleResetFilters}
        />

        <VocabularyList
          words={words}
          loading={isLoading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onEditWord={handleEditWord}
        />
      </main>

      <VocabularyEditModal
        word={editingWord}
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleUpdateWord}
        updating={updating}
      />
    </div>
  );
}

export default withAdminAuth(AdminVocabularyPage);
