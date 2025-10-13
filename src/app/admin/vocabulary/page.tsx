'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen, Download } from 'lucide-react';
import { toast } from 'sonner';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/index';
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
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { PartOfSpeechSchema, type PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import { buildEmptyWord, isPlaceholderWord } from '@/src/utils/vocabulary-defaults';

const EMPTY_WORDS: VocabularyWordWithId[] = [];
const PART_OF_SPEECH_OPTIONS = PartOfSpeechSchema.options;

function AdminVocabularyPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const filters = useSelector(selectVocabularyFilters);
  const debouncedSearch = useDebounce(filters.search, 150);

  const [lastWordId, setLastWordId] = useState<string | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [creatingWord, setCreatingWord] = useState<VocabularyWordWithId | null>(null);
  const [deletingWordId, setDeletingWordId] = useState<string | null>(null);
  const TARGET_COLLECTION = 'vocabulary_words_v4';

  const queryArgs = {
    wordType: filters.wordType,
    search: debouncedSearch,
    lastWordId,
    collection: TARGET_COLLECTION,
  };

  const { data, isLoading, isFetching } = useGetWordsQuery(queryArgs);
  const { data: wordTypeCounts = {}, isLoading: countsLoading } = useGetWordTypeCountsQuery({
    collection: TARGET_COLLECTION,
  });
  const [updateWord, { isLoading: updating }] = useUpdateWordMutation();
  const [createWord, { isLoading: creating }] = useCreateWordMutation();
  const [deleteWord] = useDeleteWordMutation();
  const words = data?.words ?? EMPTY_WORDS;

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
    setCreatingWord(null);
    setSelectedWordId(word.id);
  };

  const handleStartCreate = () => {
    setCreatingWord(buildEmptyWord('verb'));
    setSelectedWordId(null);
  };

  const handleUpdateWord = async (updates: Partial<VocabularyWord>) => {
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

      console.debug('VocabularyPage cleaned updates', cleanedUpdates);
      await updateWord({ wordId: selectedWordId, updates: cleanedUpdates, collection: TARGET_COLLECTION }).unwrap();
      toast.success('Word updated successfully');
      return true;
    } catch (error) {
      console.error('Update word error:', error);
      const message = error instanceof Error ? error.message : 'Error updating word';
      toast.error(message);
      return false;
    }
  };

  const handleSaveWord = async (updates: Partial<VocabularyWord>) => {
    if (isPlaceholderWord(creatingWord)) {
      try {
        const cleanedUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, value]) => {
            if (value === undefined) return false;
            return true;
          })
        );

        const { createdAt, updatedAt, ...wordData } = cleanedUpdates as VocabularyWord & {
          createdAt?: VocabularyWord['createdAt'];
          updatedAt?: VocabularyWord['updatedAt'];
        };
        void createdAt;
        void updatedAt;

        const created = await createWord({
          wordData: wordData as Omit<VocabularyWord, 'createdAt' | 'updatedAt'>,
          collection: TARGET_COLLECTION,
        }).unwrap();

        toast.success('Word created successfully');
        setCreatingWord(null);
        setSelectedWordId(created.id);
        return true;
      } catch (error) {
        console.error('Create word error:', error);
        const message = error instanceof Error ? error.message : 'Error creating word';
        toast.error(message);
        return false;
      }
    }

    return handleUpdateWord(updates);
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

  const hasMore = data?.hasMore ?? false;
  const loadingMore = isFetching && lastWordId !== null;
  const selectedWord = creatingWord ?? (selectedWordId ? words.find(w => w.id === selectedWordId) || null : null);

  const handleCreatePartOfSpeechChange = (nextPart: PartOfSpeech) => {
    setCreatingWord(buildEmptyWord(nextPart));
    setSelectedWordId(null);
  };

  const handleDeleteWord = async (word: VocabularyWordWithId) => {
    setDeletingWordId(word.id);
    try {
      await deleteWord(word.id).unwrap();
      toast.success(`Word "${word.word}" deleted successfully`);
      if (selectedWordId === word.id) {
        setSelectedWordId(null);
      }
    } catch (error) {
      console.error('Delete word error:', error);
      const message = error instanceof Error ? error.message : 'Error deleting word';
      toast.error(message);
    } finally {
      setDeletingWordId(null);
    }
  };

  const handleBackup = () => {
    const url = `/api/admin/words/backup?collection=${TARGET_COLLECTION}`;
    window.open(url, '_blank');
    toast.success('Backup download started');
  };

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
        <div className="flex items-center gap-3">
          {isPlaceholderWord(creatingWord) && (
            <Select
              value={creatingWord?.part_of_speech}
              onValueChange={value => handleCreatePartOfSpeechChange(value as PartOfSpeech)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Part of speech" />
              </SelectTrigger>
              <SelectContent>
                {PART_OF_SPEECH_OPTIONS.map(option => (
                  <SelectItem key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={handleStartCreate} disabled={creating || isPlaceholderWord(creatingWord)}>
            {creating ? 'Creating...' : 'Create Word'}
          </Button>
          <Button variant="outline" onClick={handleBackup}>
            <Download className="h-4 w-4 mr-2" />
            Backup
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
              onDeleteWord={handleDeleteWord}
              selectedWordId={selectedWordId}
              deletingWordId={deletingWordId}
            />
          </div>
        </div>

        <WordEditPanel word={selectedWord} onSave={handleSaveWord} updating={updating || creating} />
      </main>
    </div>
  );
}

export default withAdminAuth(AdminVocabularyPage);
