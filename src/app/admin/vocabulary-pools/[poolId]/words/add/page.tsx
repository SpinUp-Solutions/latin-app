'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, Library } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useGetPoolQuery, useAddWordsToPoolMutation } from '@/src/store/api/vocabularyPoolApi';
import { WordSelector } from '@/src/components/ui/admin/vocabulary-pools/WordSelector';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { PoolNotFoundPage } from '@/src/components/ui/admin/vocabulary-pools/PoolNotFoundPage';
import { AdminLoadingPage } from '@/src/components/ui/admin/AdminLoadingPage';

interface AddWordsPageProps {
  params: {
    poolId: string;
  };
}

export default function AddWordsPage({ params }: AddWordsPageProps) {
  const { poolId } = params;
  const router = useRouter();
  const { data: pool, isLoading: loading, error } = useGetPoolQuery(poolId);
  const [addWordsMutation] = useAddWordsToPoolMutation();

  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  if (loading) {
    return <AdminLoadingPage />;
  }

  if (error || !pool) {
    return (
      <PoolNotFoundPage
        poolId={poolId}
        backHref={`/admin/vocabulary-pools/${poolId}/words`}
        backLabel="Back to Words"
        error={error ? String(error) : null}
      />
    );
  }

  const handleAddWords = async () => {
    if (selectedWordIds.length === 0) {
      toast.error('Please select at least one word to add');
      return;
    }

    setAdding(true);
    try {
      await addWordsMutation({ poolId, wordDocIds: selectedWordIds }).unwrap();
      toast.success(`Added ${selectedWordIds.length} word(s) to pool`);
      router.push(`/admin/vocabulary-pools/${poolId}/words`);
    } catch {
      toast.error('Failed to add words to pool');
    } finally {
      setAdding(false);
    }
  };

  const handleCancel = () => {
    router.push(`/admin/vocabulary-pools/${poolId}/words`);
  };

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost">
            <Link href={`/admin/vocabulary-pools/${poolId}/words`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Words
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Add Words to &ldquo;{pool.name}&rdquo;</h1>
              <p className="text-sm text-roman-stone">Select words to add to this vocabulary pool</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-6 px-4 space-y-6">
        {/* Instructions */}
        <RomanCard>
          <RomanCardContent className="p-4">
            <div className="space-y-2">
              <h3 className="font-medium">Instructions</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Search and filter words using the controls below</li>
                <li>• Click on words to select them for addition to the pool</li>
                <li>• Words already in this pool are automatically excluded</li>
                <li>• Use the action buttons at the bottom to add selected words</li>
              </ul>
            </div>
          </RomanCardContent>
        </RomanCard>

        {/* Word Selector */}
        <WordSelector selectedWordIds={selectedWordIds} onSelectionChange={setSelectedWordIds} />

        {/* Action Buttons */}
        <RomanCard>
          <RomanCardContent className="p-4">
            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={handleCancel} disabled={adding}>
                Cancel
              </Button>
              <Button onClick={handleAddWords} disabled={adding || selectedWordIds.length === 0}>
                {adding ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Adding...
                  </>
                ) : (
                  `Add ${selectedWordIds.length} Word${selectedWordIds.length !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </RomanCardContent>
        </RomanCard>
      </main>
    </div>
  );
}
