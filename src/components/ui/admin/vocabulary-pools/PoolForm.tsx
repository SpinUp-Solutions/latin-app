import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { X, BookOpen } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { WordSelector } from './WordSelector';
import type { CreatePoolRequest, VocabularyPool } from '@/src/types/vocabulary-pool';

interface PoolFormProps {
  initialData?: Partial<VocabularyPool>;
  onSubmit: (data: CreatePoolRequest) => Promise<boolean>;
  onCancel: () => void;
  isLoading: boolean;
  mode: 'create' | 'edit';
}

export const PoolForm: React.FC<PoolFormProps> = ({ initialData, onSubmit, onCancel, isLoading, mode }) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    difficulty: initialData?.metadata?.difficulty || 'beginner',
    tags: initialData?.metadata?.tags || [],
    wordDocIds: initialData?.wordDocIds || [],
  });

  const [newTag, setNewTag] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Name must be less than 100 characters';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitData: CreatePoolRequest = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      difficulty: formData.difficulty as 'beginner' | 'intermediate' | 'advanced',
      tags: formData.tags,
      wordDocIds: formData.wordDocIds,
    };

    await onSubmit(submitData);
  };

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag],
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove),
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <RomanCard>
      <RomanCardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Pool Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter pool name (e.g., Lesson 1 Core Vocabulary)"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the purpose and content of this vocabulary pool"
              rows={3}
              className={errors.description ? 'border-red-500' : ''}
            />
            {errors.description && <p className="text-sm text-red-600">{errors.description}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="difficulty">Difficulty Level</Label>
            <Select
              value={formData.difficulty}
              onValueChange={value =>
                setFormData(prev => ({ ...prev, difficulty: value as 'beginner' | 'intermediate' | 'advanced' }))
              }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Add tag (e.g., nouns, family, animals)"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={handleAddTag} disabled={!newTag.trim()}>
                Add
              </Button>
            </div>

            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Word Selection Section */}
          <div className="space-y-2">
            <Label className="text-base font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Select Words for Pool (Optional)
            </Label>
            <p className="text-sm text-gray-600 mb-4">
              You can add words now or add them later after creating the pool.
            </p>

            <WordSelector
              selectedWordIds={formData.wordDocIds}
              onSelectionChange={wordIds => setFormData(prev => ({ ...prev, wordDocIds: wordIds }))}
            />
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </>
              ) : mode === 'create' ? (
                'Create Pool'
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </RomanCardContent>
    </RomanCard>
  );
};
