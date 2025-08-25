'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { useVocabularyPool } from '@/src/hooks/useVocabularyPool';
import { PoolHeader } from '@/src/components/ui/admin/vocabulary-pools/PoolHeader';
import { PoolNavigation } from '@/src/components/ui/admin/vocabulary-pools/PoolNavigation';
import { WordSelector } from '@/src/components/ui/admin/vocabulary-pools/WordSelector';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';

interface AddWordsPageProps {
  params: {
    poolId: string;
  };
}

export default function AddWordsPage({ params }: AddWordsPageProps) {
  const { poolId } = params;
  const router = useRouter();
  const { pool, loading, error, addWords } = useVocabularyPool(poolId);
  
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="min-h-screen bg-roman-marble">
        <PoolHeader
          title="Pool Not Found"
          navigation={<PoolNavigation currentPage="add-words" poolId={poolId} />}
        />
        <div className="container mx-auto py-6 px-4 text-center">
          <p className="text-red-600 mb-4">{error || 'Pool not found'}</p>
          <Button onClick={() => router.push('/admin/vocabulary-pools')}>
            Back to Pools
          </Button>
        </div>
      </div>
    );
  }

  const handleAddWords = async () => {
    if (selectedWordIds.length === 0) {
      toast.error('Please select at least one word to add');
      return;
    }

    setAdding(true);
    try {
      const success = await addWords(selectedWordIds);
      if (success) {
        toast.success(`Added ${selectedWordIds.length} word(s) to pool`);
        router.push(`/admin/vocabulary-pools/${poolId}/words`);
      } else {
        toast.error('Failed to add words to pool');
      }
    } catch (err) {
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
      <PoolHeader
        title={`Add Words to "${pool.name}"`}
        subtitle="Select words to add to this vocabulary pool"
        navigation={
          <PoolNavigation 
            currentPage="add-words" 
            poolId={poolId} 
            poolName={pool.name}
          />
        }
        actions={
          <Button variant="ghost" onClick={handleCancel}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Words
          </Button>
        }
      />

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
        <WordSelector
          selectedWordIds={selectedWordIds}
          onSelectionChange={setSelectedWordIds}
          excludeWordIds={pool.wordDocIds}
        />

        {/* Action Buttons */}
        <RomanCard>
          <RomanCardContent className="p-4">
            <div className="flex justify-end gap-4">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddWords}
                disabled={adding || selectedWordIds.length === 0}
              >
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