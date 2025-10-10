'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary-new';
import {
  useGetWordsQuery,
  useGetWordTypeCountsQuery,
  useUpdateWordMutation,
  useCreateWordMutation,
  useDeleteWordMutation,
} from '@/src/store/api/vocabularyApi';
import {
  updateFilters as updateFiltersAction,
  resetFilters as resetFiltersAction,
  selectVocabularyFilters,
} from '@/src/store/slices/vocabularySlice';
import { useDebounce } from '@/src/hooks/useDebounce';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import { VocabularyFiltersComponent } from '@/src/components/ui/admin/vocabulary/VocabularyFilters';
import { VocabularyList } from '@/src/components/ui/admin/vocabulary/VocabularyList';
import { DeleteWordDialog } from '@/src/components/ui/admin/vocabulary/DeleteWordDialog';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';

function AdminVocabularyPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const filters = useSelector(selectVocabularyFilters);
  const debouncedSearch = useDebounce(filters.search, 150);

  const [lastWordId, setLastWordId] = useState<string | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [wordToDelete, setWordToDelete] = useState<VocabularyWordWithId | null>(null);

  const queryArgs = {
    wordType: filters.wordType,
    search: debouncedSearch,
    lastWordId,
  };

  const { data, isLoading, isFetching } = useGetWordsQuery(queryArgs);
  const { data: wordTypeCounts = {}, isLoading: countsLoading } = useGetWordTypeCountsQuery();
  const [updateWord, { isLoading: updating }] = useUpdateWordMutation();
  const [createWord, { isLoading: creating }] = useCreateWordMutation();
  const [deleteWord, { isLoading: deleting }] = useDeleteWordMutation();

  useEffect(() => {
    setLastWordId(null);
  }, [filters.wordType, debouncedSearch]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#word-')) {
      const wordId = hash.substring(6);
      setSelectedWordId(wordId);
    }
  }, []);

  useEffect(() => {
    if (selectedWordId) {
      window.location.hash = `word-${selectedWordId}`;
    } else {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, [selectedWordId]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#word-')) {
        const wordId = hash.substring(6);
        setSelectedWordId(wordId);
      } else {
        setSelectedWordId(null);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectWord = (word: VocabularyWordWithId) => {
    setSelectedWordId(word.id);
    setIsCreating(false);
  };

  const handleSaveOrCreate = async (
    updates: Partial<VocabularyWord> | Omit<VocabularyWord, 'createdAt' | 'updatedAt'>
  ) => {
    if (isCreating) {
      try {
        const newWord = await createWord(updates as Omit<VocabularyWord, 'createdAt' | 'updatedAt'>).unwrap();
        toast.success('Word created successfully');
        setIsCreating(false);
        setSelectedWordId(newWord.id);
        return true;
      } catch (error) {
        toast.error('Error creating word');
        return false;
      }
    } else {
      if (!selectedWordId) return false;

      try {
        const cleanedUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, value]) => {
            if (value === undefined || value === null) return false;
            if (typeof value === 'string' && value.trim() === '') return false;
            if (Array.isArray(value) && value.length === 0) return false;
            return true;
          })
        );

        await updateWord({ wordId: selectedWordId, updates: cleanedUpdates }).unwrap();
        toast.success('Word updated successfully');
        return true;
      } catch (error) {
        toast.error('Error updating word');
        return false;
      }
    }
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setSelectedWordId(null);
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

  const handleDeleteClick = (word: VocabularyWordWithId) => {
    setWordToDelete(word);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!wordToDelete) return;

    try {
      await deleteWord(wordToDelete.id).unwrap();
      toast.success('Word deleted successfully');
      setDeleteDialogOpen(false);
      setWordToDelete(null);
      if (selectedWordId === wordToDelete.id) {
        setSelectedWordId(null);
        setIsCreating(false);
      }
    } catch (error) {
      toast.error('Error deleting word');
    }
  };

  const words = data?.words ?? [];
  const hasMore = data?.hasMore ?? false;
  const loadingMore = isFetching && lastWordId !== null;
  const selectedWord = selectedWordId ? words.find(w => w.id === selectedWordId) || null : null;

  return (
    <div className="h-screen flex flex-col bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
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
        <div className="flex items-center gap-4">
          <div className="text-sm text-roman-stone">
            {words.length} words loaded
            {countsLoading && ' (loading counts...)'}
          </div>
          <Button onClick={handleStartCreate} disabled={isCreating}>
            <Plus className="h-4 w-4 mr-2" />
            Add New Word
          </Button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-[40%_60%] overflow-hidden">
        <div className="flex flex-col overflow-hidden border-r border-gray-200 bg-roman-marble">
          <div className="p-4">
            <VocabularyFiltersComponent
              filters={filters}
              wordTypeCounts={wordTypeCounts}
              countsLoading={countsLoading}
              onFiltersChange={handleUpdateFilters}
              onSearch={handleSearch}
              onReset={handleResetFilters}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <VocabularyList
              words={words}
              loading={isLoading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              onSelectWord={handleSelectWord}
              onDeleteWord={handleDeleteClick}
              selectedWordId={selectedWordId}
            />
          </div>
        </div>

        <WordEditPanel
          word={isCreating ? null : selectedWord}
          onSave={handleSaveOrCreate}
          onDelete={selectedWord ? () => handleDeleteClick(selectedWord) : undefined}
          updating={updating || creating}
          createMode={isCreating}
        />
      </main>

      <DeleteWordDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        wordName={wordToDelete?.word || ''}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleting}
      />
    </div>
  );
}

export default withAdminAuth(AdminVocabularyPage);
