'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Search, Trash2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { useVocabularyPool } from '@/src/hooks/useVocabularyPool';
import { PoolHeader } from '@/src/components/ui/admin/vocabulary-pools/PoolHeader';
import { PoolNavigation } from '@/src/components/ui/admin/vocabulary-pools/PoolNavigation';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import type { Word } from '@/src/types/admin-vocabulary';

interface WordsPageProps {
  params: {
    poolId: string;
  };
}

export default function WordsPage({ params }: WordsPageProps) {
  const { poolId } = params;
  const router = useRouter();
  const { pool, loading, error, removeWords } = useVocabularyPool(poolId);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [wordTypeFilter, setWordTypeFilter] = useState('all');
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [removing, setRemoving] = useState(false);

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
          navigation={<PoolNavigation currentPage="words" poolId={poolId} />}
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

  const filteredWords = pool.words.filter(word => {
    const matchesSearch = !searchQuery || 
      word.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
      word.translation.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = wordTypeFilter === 'all' || word.wordType === wordTypeFilter;
    
    return matchesSearch && matchesType;
  });

  const handleSelectWord = (wordId: string, selected: boolean) => {
    if (selected) {
      setSelectedWordIds(prev => [...prev, wordId]);
    } else {
      setSelectedWordIds(prev => prev.filter(id => id !== wordId));
    }
  };

  const handleSelectAll = () => {
    if (selectedWordIds.length === filteredWords.length) {
      setSelectedWordIds([]);
    } else {
      setSelectedWordIds(filteredWords.map(word => word.id));
    }
  };

  const handleRemoveSelected = async () => {
    if (selectedWordIds.length === 0) return;
    
    const confirmed = confirm(`Remove ${selectedWordIds.length} word(s) from this pool?`);
    if (!confirmed) return;

    setRemoving(true);
    try {
      const success = await removeWords(selectedWordIds);
      if (success) {
        toast.success(`Removed ${selectedWordIds.length} word(s) from pool`);
        setSelectedWordIds([]);
      } else {
        toast.error('Failed to remove words from pool');
      }
    } catch (err) {
      toast.error('Failed to remove words from pool');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="min-h-screen bg-roman-marble">
      <PoolHeader
        title={`Manage Words - ${pool.name}`}
        subtitle={`${pool.words.length} words in this pool`}
        navigation={
          <PoolNavigation 
            currentPage="words" 
            poolId={poolId} 
            poolName={pool.name}
          />
        }
        actions={
          <Button asChild>
            <Link href={`/admin/vocabulary-pools/${poolId}/words/add`}>
              <Plus className="h-4 w-4 mr-2" />
              Add Words
            </Link>
          </Button>
        }
      />

      <main className="container mx-auto py-6 px-4 space-y-6">
        {/* Search and Filters */}
        <RomanCard>
          <RomanCardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search words..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={wordTypeFilter} onValueChange={setWordTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="noun">Noun</SelectItem>
                  <SelectItem value="verb">Verb</SelectItem>
                  <SelectItem value="adjective">Adjective</SelectItem>
                  <SelectItem value="adverb">Adverb</SelectItem>
                  <SelectItem value="preposition">Preposition</SelectItem>
                  <SelectItem value="pronoun">Pronoun</SelectItem>
                  <SelectItem value="conjunction">Conjunction</SelectItem>
                  <SelectItem value="interjection">Interjection</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </RomanCardContent>
        </RomanCard>

        {/* Bulk Actions */}
        {filteredWords.length > 0 && (
          <RomanCard>
            <RomanCardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {selectedWordIds.length === filteredWords.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  
                  <span className="text-sm text-gray-600">
                    {selectedWordIds.length > 0 && `${selectedWordIds.length} selected`}
                  </span>
                </div>

                {selectedWordIds.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveSelected}
                    disabled={removing}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {removing ? 'Removing...' : `Remove Selected (${selectedWordIds.length})`}
                  </Button>
                )}
              </div>
            </RomanCardContent>
          </RomanCard>
        )}

        {/* Words List */}
        <RomanCard>
          <RomanCardContent className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-serif">
                  Words ({filteredWords.length})
                </h3>
              </div>

              {filteredWords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <BookOpen className="h-8 w-8 mx-auto mb-2" />
                  <p>No words found matching your criteria.</p>
                  {pool.words.length === 0 && (
                    <Button asChild className="mt-4">
                      <Link href={`/admin/vocabulary-pools/${poolId}/words/add`}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Words
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredWords.map(word => (
                    <WordCard
                      key={word.id}
                      word={word}
                      selected={selectedWordIds.includes(word.id)}
                      onSelect={(selected) => handleSelectWord(word.id, selected)}
                    />
                  ))}
                </div>
              )}
            </div>
          </RomanCardContent>
        </RomanCard>
      </main>
    </div>
  );
}

interface WordCardProps {
  word: Word;
  selected: boolean;
  onSelect: (selected: boolean) => void;
}

const WordCard: React.FC<WordCardProps> = ({ word, selected, onSelect }) => {
  return (
    <Card 
      className={`cursor-pointer transition-colors ${
        selected ? 'ring-2 ring-roman-red bg-blue-50' : 'hover:bg-gray-50'
      }`}
      onClick={() => onSelect(!selected)}
    >
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium truncate">{word.word}</h4>
              <p className="text-sm text-gray-600 truncate">{word.translation}</p>
            </div>
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {word.wordType}
            </Badge>
            {word.grammaticalInfo && (
              <Badge variant="secondary" className="text-xs">
                {word.grammaticalInfo}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};