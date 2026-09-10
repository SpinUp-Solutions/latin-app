import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { X, BookOpen } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { WordSelector } from '@/src/components/ui/admin/vocabulary-pools/WordSelector';
import { VocabularyPoolImportSelector } from '@/src/components/ui/admin/vocabulary-pools/VocabularyPoolImportSelector';
import { MAX_VOCABULARY_POOL_WORD_ADDITIONS } from '@/src/lib/vocabulary-pools/limits';
import { useWordSelection } from '@/src/hooks/useWordSelection';
import type { CreatePoolRequest, VocabularyPool, VocabularyPoolWithWords } from '@/src/types/vocabulary-pool';

interface PoolFormProps {
  initialData?: Partial<VocabularyPool> | VocabularyPoolWithWords;
  onSubmit: (data: CreatePoolRequest) => Promise<boolean>;
  onCancel: () => void;
  isLoading: boolean;
  mode: 'create' | 'edit';
  copyRequestResetVersion?: number;
}

const newCopyRequestId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `pool-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const PoolForm: React.FC<PoolFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
  mode,
  copyRequestResetVersion,
}) => {
  const { selectedIds, clear } = useWordSelection();
  const [sourcePoolIds, setSourcePoolIds] = useState<string[]>([]);
  const requestIdRef = useRef<string>(newCopyRequestId());
  const previousCopyRequestResetVersionRef = useRef(copyRequestResetVersion);
  const submittedFingerprintRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (
      mode === 'create' &&
      copyRequestResetVersion !== undefined &&
      previousCopyRequestResetVersionRef.current !== copyRequestResetVersion
    ) {
      requestIdRef.current = newCopyRequestId();
      submittedFingerprintRef.current = null;
      previousCopyRequestResetVersionRef.current = copyRequestResetVersion;
    }
  }, [copyRequestResetVersion, mode]);

  useEffect(() => {
    return () => {
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    difficulty: initialData?.metadata?.difficulty || 'beginner',
    tags: initialData?.metadata?.tags || [],
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

    if (isLoading || isSubmitting || submittingRef.current) return;

    if (!validateForm()) {
      return;
    }

    const submitData: CreatePoolRequest = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      difficulty: formData.difficulty as 'beginner' | 'intermediate' | 'advanced',
      tags: formData.tags,
      wordDocIds: selectedIds,
    };

    if (mode === 'create' && sourcePoolIds.length > 0) {
      const fingerprint = JSON.stringify({
        name: submitData.name,
        description: submitData.description,
        difficulty: submitData.difficulty,
        tags: submitData.tags,
        sourcePoolIds,
        wordDocIds: selectedIds,
      });
      if (submittedFingerprintRef.current !== fingerprint) {
        requestIdRef.current = newCopyRequestId();
        submittedFingerprintRef.current = fingerprint;
      }
      submitData.sourcePoolIds = sourcePoolIds;
      submitData.requestId = requestIdRef.current;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const success = await onSubmit(submitData);
      if (success) {
        clear();
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
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
          <fieldset disabled={isLoading || isSubmitting} className="space-y-6">
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

            {mode === 'create' && (
              <VocabularyPoolImportSelector
                selectedPoolIds={sourcePoolIds}
                onSelectionChange={setSourcePoolIds}
                disabled={isLoading || isSubmitting}
              />
            )}

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
                maxSelection={MAX_VOCABULARY_POOL_WORD_ADDITIONS}
                initialSelectedWords={initialData && 'words' in initialData ? initialData.words : undefined}
                initialSelectedIds={initialData?.wordDocIds}
              />
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading || isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || isSubmitting}>
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
          </fieldset>
        </form>
      </RomanCardContent>
    </RomanCard>
  );
};
