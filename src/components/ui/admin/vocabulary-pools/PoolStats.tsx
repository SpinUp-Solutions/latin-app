import React from 'react';
import { Badge } from '@/src/components/ui/badge';
import { Card, CardContent } from '@/src/components/ui/card';
import { BookOpen, Calendar, User, Tag } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import type { VocabularyPoolWithWords } from '@/src/types/vocabulary-pool';

interface PoolStatsProps {
  pool: VocabularyPoolWithWords;
}

export const PoolStats: React.FC<PoolStatsProps> = ({ pool }) => {
  const wordTypeBreakdown = pool.words.reduce((acc, word) => {
    acc[word.wordType] = (acc[word.wordType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const mostCommonTypes = Object.entries(wordTypeBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Basic Stats */}
      <RomanCard>
        <RomanCardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-serif font-semibold">{pool.words.length}</p>
              <p className="text-sm text-gray-600">Total Words</p>
            </div>
          </div>
        </RomanCardContent>
      </RomanCard>

      {/* Difficulty Level */}
      <RomanCard>
        <RomanCardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Tag className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <Badge 
                variant={
                  pool.metadata.difficulty === 'beginner' ? 'secondary' :
                  pool.metadata.difficulty === 'intermediate' ? 'default' : 'destructive'
                }
                className="mb-1"
              >
                {pool.metadata.difficulty}
              </Badge>
              <p className="text-sm text-gray-600">Difficulty</p>
            </div>
          </div>
        </RomanCardContent>
      </RomanCard>

      {/* Created Info */}
      <RomanCard>
        <RomanCardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {pool.metadata.createdAt.toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600">Created</p>
            </div>
          </div>
        </RomanCardContent>
      </RomanCard>

      {/* Status */}
      <RomanCard>
        <RomanCardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              pool.metadata.isActive ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <User className={`h-5 w-5 ${
                pool.metadata.isActive ? 'text-green-600' : 'text-gray-600'
              }`} />
            </div>
            <div>
              <Badge variant={pool.metadata.isActive ? 'default' : 'secondary'}>
                {pool.metadata.isActive ? 'Active' : 'Inactive'}
              </Badge>
              <p className="text-sm text-gray-600">Status</p>
            </div>
          </div>
        </RomanCardContent>
      </RomanCard>

      {/* Tags */}
      {pool.metadata.tags.length > 0 && (
        <RomanCard className="md:col-span-2">
          <RomanCardContent className="p-4">
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tags
              </h4>
              <div className="flex flex-wrap gap-2">
                {pool.metadata.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </RomanCardContent>
        </RomanCard>
      )}

      {/* Word Type Breakdown */}
      {mostCommonTypes.length > 0 && (
        <RomanCard className="md:col-span-2">
          <RomanCardContent className="p-4">
            <div className="space-y-3">
              <h4 className="font-medium">Word Types</h4>
              <div className="space-y-2">
                {mostCommonTypes.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-roman-red h-2 rounded-full"
                          style={{ 
                            width: `${Math.max(10, (count / pool.words.length) * 100)}%` 
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </RomanCardContent>
        </RomanCard>
      )}
    </div>
  );
};