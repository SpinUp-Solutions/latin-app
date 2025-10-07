import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Card, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Search, Plus, X } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import type { Word } from '@/src/types/admin-vocabulary';

interface WordSelectorProps {
  selectedWordIds: string[];
  onSelectionChange: (wordIds: string[]) => void;
  excludeWordIds?: string[];
  maxSelection?: number;
}

export const WordSelector: React.FC<WordSelectorProps> = ({
  selectedWordIds,
  onSelectionChange,
  excludeWordIds = [],
  maxSelection,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [wordTypeFilter, setWordTypeFilter] = useState('all');
  const [availableWords, setAvailableWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchWords = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: '100' });

      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }

      if (wordTypeFilter && wordTypeFilter !== 'all') {
        params.append('wordType', wordTypeFilter);
      }

      const response = await fetch(`/api/admin/words?${params}`);
      const data = await response.json();

      if (data.success) {
        setAvailableWords(data.data.words);
      } else {
        setError(data.error || 'Failed to load words');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    searchWords();
  }, [searchQuery, wordTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredWords = useMemo(() => {
    return availableWords.filter(word => !excludeWordIds.includes(word.id) && !selectedWordIds.includes(word.id));
  }, [availableWords, excludeWordIds, selectedWordIds]);

  const selectedWords = useMemo(() => {
    return availableWords.filter(word => selectedWordIds.includes(word.id));
  }, [availableWords, selectedWordIds]);

  const handleAddWord = (wordId: string) => {
    if (maxSelection && selectedWordIds.length >= maxSelection) {
      return;
    }
    onSelectionChange([...selectedWordIds, wordId]);
  };

  const handleRemoveWord = (wordId: string) => {
    onSelectionChange(selectedWordIds.filter(id => id !== wordId));
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <RomanCard>
        <RomanCardContent className="p-4">
          <div className="space-y-4">
            <Label className="text-base font-medium">Search Words</Label>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                  <Input
                    placeholder="Search by word or translation..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
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
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
          </div>
        </RomanCardContent>
      </RomanCard>

      {/* Available Words */}
      <RomanCard>
        <RomanCardContent className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Available Words</Label>
              {maxSelection && (
                <Badge variant="outline">
                  {selectedWordIds.length} / {maxSelection} selected
                </Badge>
              )}
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-roman-red mx-auto mb-2" />
                <p className="text-sm text-gray-600">Loading words...</p>
              </div>
            ) : filteredWords.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No words found matching your criteria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                {filteredWords.map(word => (
                  <Card
                    key={word.id}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleAddWord(word.id)}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{word.word}</div>
                          <div className="text-xs text-gray-600 truncate">{word.translation}</div>
                          <Badge variant="outline" className="text-xs mt-1">
                            {word.wordType}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={e => {
                            e.stopPropagation();
                            handleAddWord(word.id);
                          }}
                          disabled={maxSelection ? selectedWordIds.length >= maxSelection : false}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </RomanCardContent>
      </RomanCard>

      {/* Selected Words */}
      {selectedWordIds.length > 0 && (
        <RomanCard>
          <RomanCardContent className="p-4">
            <div className="space-y-4">
              <Label className="text-base font-medium">Selected Words ({selectedWordIds.length})</Label>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto">
                {selectedWords.map(word => (
                  <Card key={word.id} className="bg-blue-50 border-blue-200">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{word.word}</div>
                          <div className="text-xs text-gray-600 truncate">{word.translation}</div>
                          <Badge variant="secondary" className="text-xs mt-1">
                            {word.wordType}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveWord(word.id)}
                          className="text-red-600 hover:text-red-700">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </RomanCardContent>
        </RomanCard>
      )}
    </div>
  );
};
