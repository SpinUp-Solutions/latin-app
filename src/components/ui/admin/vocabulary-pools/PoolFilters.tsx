import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { Search, Filter, RotateCcw } from 'lucide-react';

interface PoolFiltersProps {
  filters: {
    search: string;
    difficulty: string;
    tags: string[];
    isActive: boolean | null;
    sortBy: 'name' | 'createdAt' | 'wordCount';
    sortOrder: 'asc' | 'desc';
  };
  onFiltersChange: (filters: Partial<PoolFiltersProps['filters']>) => void;
  loading: boolean;
}

export const PoolFilters: React.FC<PoolFiltersProps> = ({ filters, onFiltersChange, loading }) => {
  const hasActiveFilters = filters.search || filters.difficulty || filters.isActive !== null;

  const handleReset = () => {
    onFiltersChange({
      search: '',
      difficulty: '',
      tags: [],
      isActive: null,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  };

  return (
    <RomanCard>
      <RomanCardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4" />
          <h3 className="text-sm font-medium">Filters</h3>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={handleReset} className="ml-auto">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search pools..."
              value={filters.search}
              onChange={e => onFiltersChange({ search: e.target.value })}
              className="pl-10"
              disabled={loading}
            />
          </div>

          {/* Difficulty */}
          <Select
            value={filters.difficulty || 'all'}
            onValueChange={value => onFiltersChange({ difficulty: value === 'all' ? '' : value })}
            disabled={loading}>
            <SelectTrigger>
              <SelectValue placeholder="All Difficulties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Difficulties</SelectItem>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>

          {/* Status */}
          <Select
            value={filters.isActive === null ? 'all' : filters.isActive.toString()}
            onValueChange={value =>
              onFiltersChange({
                isActive: value === 'all' ? null : value === 'true',
              })
            }
            disabled={loading}>
            <SelectTrigger>
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select
            value={`${filters.sortBy}-${filters.sortOrder}`}
            onValueChange={value => {
              const [sortBy, sortOrder] = value.split('-') as ['name' | 'createdAt' | 'wordCount', 'asc' | 'desc'];
              onFiltersChange({ sortBy, sortOrder });
            }}
            disabled={loading}>
            <SelectTrigger>
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt-desc">Newest First</SelectItem>
              <SelectItem value="createdAt-asc">Oldest First</SelectItem>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
              <SelectItem value="name-desc">Name Z-A</SelectItem>
              <SelectItem value="wordCount-desc">Most Words</SelectItem>
              <SelectItem value="wordCount-asc">Fewest Words</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </RomanCardContent>
    </RomanCard>
  );
};
