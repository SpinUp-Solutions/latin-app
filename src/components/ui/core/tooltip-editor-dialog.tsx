import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { Badge } from '@/src/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { TooltipData } from '@/src/store/slices/lessonSlice';

interface TooltipFormData {
  word: string;
  translation?: string;
  pronunciation?: string;
  partOfSpeech?: string;
  wordType?: string;
  definition?: string;
  examples?: string[];
  etymology?: string;
}

interface TooltipEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TooltipFormData) => void;
  onRemove?: () => void;
  initialData?: TooltipData | null;
  selectedText?: string;
}

export const TooltipEditorDialog: React.FC<TooltipEditorDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  onRemove,
  initialData = null,
  selectedText = '',
}) => {
  const [formData, setFormData] = useState<TooltipFormData>({
    word: initialData?.word || selectedText,
    translation: initialData?.translation || '',
    pronunciation: initialData?.pronunciation || '',
    partOfSpeech: initialData?.partOfSpeech || '',
    wordType: initialData?.wordType || '',
    definition: initialData?.definition || '',
    examples: initialData?.examples || [],
    etymology: initialData?.etymology || '',
  });

  const [newExample, setNewExample] = useState('');

  // Update form data when initialData changes
  useEffect(() => {
    setFormData({
      word: initialData?.word || selectedText,
      translation: initialData?.translation || '',
      pronunciation: initialData?.pronunciation || '',
      partOfSpeech: initialData?.partOfSpeech || '',
      wordType: initialData?.wordType || '',
      definition: initialData?.definition || '',
      examples: initialData?.examples || [],
      etymology: initialData?.etymology || '',
    });
  }, [initialData, selectedText]);

  const handleInputChange = (field: keyof TooltipFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addExample = () => {
    if (newExample.trim()) {
      setFormData(prev => ({
        ...prev,
        examples: [...(prev.examples || []), newExample.trim()],
      }));
      setNewExample('');
    }
  };

  const removeExample = (index: number) => {
    setFormData(prev => ({
      ...prev,
      examples: prev.examples?.filter((_, i) => i !== index) || [],
    }));
  };

  const handleSave = () => {
    // Filter out empty fields
    const cleanedData: Partial<TooltipFormData> = {};
    Object.entries(formData).forEach(([key, value]) => {
      if (value && (typeof value === 'string' ? value.trim() : true)) {
        if (key === 'examples' && Array.isArray(value)) {
          const filteredExamples = value.filter(ex => ex.trim());
          if (filteredExamples.length > 0) {
            cleanedData.examples = filteredExamples;
          }
        } else if (typeof value === 'string' && value.trim()) {
          switch (key) {
            case 'word':
              cleanedData.word = value;
              break;
            case 'translation':
              cleanedData.translation = value;
              break;
            case 'pronunciation':
              cleanedData.pronunciation = value;
              break;
            case 'partOfSpeech':
              cleanedData.partOfSpeech = value;
              break;
            case 'wordType':
              cleanedData.wordType = value;
              break;
            case 'definition':
              cleanedData.definition = value;
              break;
            case 'etymology':
              cleanedData.etymology = value;
              break;
          }
        }
      }
    });

    onSave(cleanedData as TooltipFormData);
    onClose();
  };

  const handleClose = () => {
    setFormData({
      word: '',
      translation: '',
      pronunciation: '',
      partOfSpeech: '',
      wordType: '',
      definition: '',
      examples: [],
      etymology: '',
    });
    setNewExample('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Tooltip Information' : 'Add Tooltip Information'}</DialogTitle>
          <DialogDescription>
            {initialData
              ? 'Edit the tooltip information for this word.'
              : 'Add detailed information for the selected word to create an interactive tooltip.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="word">Word *</Label>
              <Input
                id="word"
                value={formData.word}
                onChange={e => handleInputChange('word', e.target.value)}
                placeholder="Enter the word"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="translation">Translation</Label>
              <Input
                id="translation"
                value={formData.translation}
                onChange={e => handleInputChange('translation', e.target.value)}
                placeholder="English translation"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pronunciation">Pronunciation</Label>
              <Input
                id="pronunciation"
                value={formData.pronunciation}
                onChange={e => handleInputChange('pronunciation', e.target.value)}
                placeholder="IPA pronunciation"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="partOfSpeech">Part of Speech</Label>
              <Input
                id="partOfSpeech"
                value={formData.partOfSpeech}
                onChange={e => handleInputChange('partOfSpeech', e.target.value)}
                placeholder="noun, verb, adjective..."
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="wordType">Word Type</Label>
            <Input
              id="wordType"
              value={formData.wordType}
              onChange={e => handleInputChange('wordType', e.target.value)}
              placeholder="declension, conjugation..."
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="definition">Definition</Label>
            <Textarea
              id="definition"
              value={formData.definition}
              onChange={e => handleInputChange('definition', e.target.value)}
              placeholder="Detailed definition"
              className="mt-1"
              rows={3}
            />
          </div>

          <div>
            <Label>Examples</Label>
            <div className="mt-1 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newExample}
                  onChange={e => setNewExample(e.target.value)}
                  placeholder="Add an example sentence"
                  onKeyPress={e => e.key === 'Enter' && addExample()}
                />
                <Button type="button" onClick={addExample} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {formData.examples && formData.examples.length > 0 && (
                <div className="space-y-1">
                  {formData.examples.map((example, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Badge variant="secondary" className="flex-1 justify-between">
                        <span className="text-sm">{example}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeExample(index)}
                          className="h-4 w-4 p-0 hover:bg-transparent">
                          <X className="w-3 h-3" />
                        </Button>
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="etymology">Etymology</Label>
            <Textarea
              id="etymology"
              value={formData.etymology}
              onChange={e => handleInputChange('etymology', e.target.value)}
              placeholder="Word origin and history"
              className="mt-1"
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <div>
            {initialData && onRemove && (
              <Button variant="destructive" onClick={onRemove}>
                Remove Tooltip
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.word.trim()}>
              {initialData ? 'Update Tooltip' : 'Save Tooltip'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
