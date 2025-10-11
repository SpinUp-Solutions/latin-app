'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen, Play, Beaker } from 'lucide-react';
import { toast } from 'sonner';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/vocabulary-new';
import { useGetWordsQuery, useGetWordTypeCountsQuery, useUpdateWordMutation } from '@/src/store/api/vocabularyApi';
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
import { auth } from '@/src/services/firebase';

function AdminVocabularyPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const filters = useSelector(selectVocabularyFilters);
  const debouncedSearch = useDebounce(filters.search, 150);

  const [lastWordId, setLastWordId] = useState<string | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const TARGET_COLLECTION = 'vocabulary_words_v2';

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

      await updateWord({ wordId: selectedWordId, updates: cleanedUpdates, collection: TARGET_COLLECTION }).unwrap();
      toast.success('Word updated successfully');
      return true;
    } catch (error) {
      toast.error('Error updating word');
      return false;
    }
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

  const [migrating, setMigrating] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);

  const callMigration = async (dryRun: boolean) => {
    try {
      if (!dryRun) {
        const ok = window.confirm('Migrate to new collection (vocabulary_words_v2)?');
        if (!ok) return;
      }
      dryRun ? setDryRunning(true) : setMigrating(true);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/migrate-vocabulary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ dryRun, targetCollection: TARGET_COLLECTION }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Migration failed');
      const d = json.data;

      console.log('=== MIGRATION RESULTS ===');
      console.log('Full Response:', JSON.stringify(json, null, 2));
      console.log('========================');

      const summary = d.summary || {};
      const warningCount = summary.warningsCount || 0;
      const errorCount = summary.errorsCount || 0;

      let message = `${dryRun ? 'Dry run' : 'Migration'} complete: ${d.migrated} migrated, ${d.skipped} skipped of ${d.total}`;
      if (summary.successRate) message += ` (${summary.successRate} success)`;
      if (warningCount > 0) message += ` - ${warningCount} warnings`;
      if (errorCount > 0) message += ` - ${errorCount} errors`;

      toast.success(message, { duration: 5000 });

      setLastWordId(null);
      setSelectedWordId(null);

      if (d.byPartOfSpeech) {
        console.log('By Part of Speech:', d.byPartOfSpeech);
      }
      if (d.warnings && d.warnings.length > 0) {
        console.warn('Warnings:', d.warnings);
      }
      if (d.errors && d.errors.length > 0) {
        console.error('Errors:', d.errors);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Migration error';
      toast.error(msg);
    } finally {
      dryRun ? setDryRunning(false) : setMigrating(false);
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
        <div className="flex items-center gap-3">
          <div className="text-sm text-roman-stone">
            {words.length} words loaded
            {countsLoading && ' (loading counts...)'}
          </div>
          <Button size="sm" variant="outline" onClick={() => callMigration(true)} disabled={dryRunning || migrating}>
            <Beaker className="h-4 w-4 mr-2" /> Dry run
          </Button>
          <Button size="sm" onClick={() => callMigration(false)} disabled={migrating || dryRunning}>
            <Play className="h-4 w-4 mr-2" /> Migrate
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
              selectedWordId={selectedWordId}
            />
          </div>
        </div>

        <WordEditPanel word={selectedWord} onSave={handleUpdateWord} updating={updating} />
      </main>
    </div>
  );
}

export default withAdminAuth(AdminVocabularyPage);
