import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { toast } from 'sonner';
import { Word, WordsResponse, VocabularyFilters } from '@/src/types/admin-vocabulary';

const ITEMS_PER_PAGE = 20;

export const useVocabularyData = () => {
  const { user } = useSelector((state: RootState) => state.auth);

  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastWordId, setLastWordId] = useState<string | null>(null);
  const [wordTypeCounts, setWordTypeCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);

  const [filters, setFilters] = useState<VocabularyFilters>({
    wordType: 'all',
    section: 'all',
    search: '',
  });

  const loadWordTypeCounts = async () => {
    try {
      setCountsLoading(true);
      const response = await fetch('/api/admin/words?countsOnly=true');
      const data: WordsResponse = await response.json();

      if (data.success && data.data.wordTypeCounts) {
        setWordTypeCounts(data.data.wordTypeCounts);
      }
    } catch (error) {
      console.error('Error loading word type counts:', error);
    } finally {
      setCountsLoading(false);
    }
  };

  const loadWords = useCallback(
    async (reset = false) => {
      try {
        if (reset) {
          setLoading(true);
          setWords([]);
          setLastWordId(null);
        } else {
          setLoadingMore(true);
        }

        const params = new URLSearchParams({
          limit: ITEMS_PER_PAGE.toString(),
        });

        if (filters.wordType && filters.wordType !== 'all') {
          params.append('wordType', filters.wordType);
        }
        if (filters.section && filters.section !== 'all') {
          params.append('section', filters.section);
        }
        if (filters.search) {
          params.append('search', filters.search);
        }
        if (!reset && lastWordId) {
          params.append('lastWordId', lastWordId);
        }

        const response = await fetch(`/api/admin/words?${params}`);
        const data: WordsResponse = await response.json();

        if (data.success) {
          if (reset) {
            setWords(data.data.words);
          } else {
            setWords(prev => [...prev, ...data.data.words]);
          }
          setHasMore(data.data.hasMore);
          setLastWordId(data.data.lastWordId);
        } else {
          toast.error('Failed to fetch words');
        }
      } catch (error) {
        console.error('Error fetching words:', error);
        toast.error('Error fetching words');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters.wordType, filters.section, filters.search, lastWordId]
  );

  const updateWord = async (wordId: string, updates: Partial<Word>) => {
    try {
      // Clean up the data by removing undefined values and empty strings
      const cleanedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => {
          if (value === undefined || value === null) return false;
          if (typeof value === 'string' && value.trim() === '') return false;
          if (Array.isArray(value) && value.length === 0) return false;
          return true;
        })
      );

      const response = await fetch('/api/admin/words', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wordId,
          updates: cleanedUpdates,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Word updated successfully');
        // Update the word in the local state
        setWords(prev => prev.map(w => (w.id === wordId ? { ...w, ...cleanedUpdates } : w)));
        return true;
      } else {
        toast.error(`Failed to update word: ${data.error || 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      console.error('Error updating word:', error);
      toast.error('Error updating word');
      return false;
    }
  };

  const updateFilters = (newFilters: Partial<VocabularyFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const resetFilters = () => {
    setFilters({
      wordType: 'all',
      section: 'all',
      search: '',
    });
  };

  // Load word type counts when user is admin
  useEffect(() => {
    if (user && user.role === 'admin') {
      loadWordTypeCounts();
    }
  }, [user]);

  // Load words when filters change
  useEffect(() => {
    if (user && user.role === 'admin') {
      loadWords(true);
    }
  }, [user, filters.wordType, filters.section, filters.search]);

  return {
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
  };
};
