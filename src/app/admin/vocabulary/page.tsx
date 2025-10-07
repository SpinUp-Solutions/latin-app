'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Word } from '@/src/types/admin-vocabulary';
import { useVocabularyData } from '@/src/hooks/useVocabularyData';
import { VocabularyEditModal } from '@/src/components/ui/admin/vocabulary/VocabularyEditModal';
import { VocabularyFiltersComponent } from '@/src/components/ui/admin/vocabulary/VocabularyFilters';
import { VocabularyList } from '@/src/components/ui/admin/vocabulary/VocabularyList';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';

function AdminVocabularyPage() {
  const router = useRouter();

  const {
    words,
    loading,
    loadingMore,
    hasMore,
    wordTypeCounts,
    countsLoading,
    filters,
    loadWords,
    updateWord,
    updateFilters,
    resetFilters,
  } = useVocabularyData();

  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const handleEditWord = (word: Word) => {
    setEditingWord(word);
    setIsEditModalOpen(true);
  };

  const handleUpdateWord = async (updates: Partial<Word>) => {
    if (!editingWord) return false;

    setUpdating(true);
    try {
      const success = await updateWord(editingWord.id, updates);
      return success;
    } finally {
      setUpdating(false);
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
    loadWords(false);
  };

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
          onFiltersChange={updateFilters}
          onSearch={handleSearch}
          onReset={resetFilters}
        />

        <VocabularyList
          words={words}
          loading={loading}
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
