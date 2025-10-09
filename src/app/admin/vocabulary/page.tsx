'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary-new';
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
import { auth } from '@/src/services/firebase';

function AdminVocabularyPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const filters = useSelector(selectVocabularyFilters);
  const debouncedSearch = useDebounce(filters.search, 150);

  const [lastWordId, setLastWordId] = useState<string | null>(null);
  const [editingWord, setEditingWord] = useState<VocabularyWordWithId | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  const queryArgs = {
    wordType: filters.wordType,
    search: debouncedSearch,
    lastWordId,
  };

  const { data, isLoading, isFetching } = useGetWordsQuery(queryArgs);
  const { data: wordTypeCounts = {}, isLoading: countsLoading } = useGetWordTypeCountsQuery();
  const [updateWord, { isLoading: updating }] = useUpdateWordMutation();

  useEffect(() => {
    setLastWordId(null);
  }, [filters.wordType, debouncedSearch]);

  const handleEditWord = (word: VocabularyWordWithId) => {
    setEditingWord(word);
    setIsEditModalOpen(true);
  };

  const handleUpdateWord = async (updates: Partial<VocabularyWord>) => {
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

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }

      const token = await user.getIdToken();
      const response = await fetch('/api/admin/words/backup', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create backup');
      }

      toast.success(`Backup created: ${data.filename} (${data.totalWords} words)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create backup');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleMigrate = async (dryRun: boolean = true) => {
    setIsMigrating(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }

      const token = await user.getIdToken();
      const response = await fetch('/api/admin/vocabulary/migrate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dryRun }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Migration failed');
      }

      const mode = dryRun ? 'Dry run' : 'Migration';
      const message = `${mode} complete: ${data.stats.successful} successful, ${data.stats.failed} failed (${data.performance.wordsPerSecond.toFixed(2)} words/sec)`;

      if (data.stats.failed > 0) {
        toast.warning(message);
        console.error('Migration errors:', data.errors);
      } else {
        toast.success(message);
      }

      console.log('Migration stats:', data.stats);
      console.log('Sample transformations:', data.sample);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCreateBackup} disabled={isCreatingBackup}>
            <Download className="h-4 w-4 mr-2" />
            {isCreatingBackup ? 'Creating Backup...' : 'Backup'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleMigrate(true)} disabled={isMigrating}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {isMigrating ? 'Running...' : 'Migrate (Dry Run)'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleMigrate(false)} disabled={isMigrating}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {isMigrating ? 'Running...' : 'Migrate (Live)'}
          </Button>
          <div className="text-sm text-roman-stone">
            {words.length} words loaded
            {countsLoading && ' (loading counts...)'}
          </div>
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
