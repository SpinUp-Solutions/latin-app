import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Trash2 } from 'lucide-react';
import { SimpleInput, SimpleTextarea } from '@/src/components/ui/form-components';
import { AudioUploadSection } from '@/src/components/ui/admin/content-editor/AudioUploadSection';

interface VocabularyItem {
  id: string;
  latin: string;
  english: string;
  pronunciation?: string;
  partOfSpeech?: string;
  example?: string;
  notes?: string;
  audioPath?: string | null;
}

interface VocabularyItemCardProps {
  item: VocabularyItem;
  index: number;
  onUpdate: (field: string, value: string) => void;
  onRemove: () => void;
  contentItemId: string;
}

export const VocabularyItemCard: React.FC<VocabularyItemCardProps> = ({
  item,
  index,
  onUpdate,
  onRemove,
  contentItemId,
}) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h4 className="font-medium">Word {index + 1}</h4>
          <Button onClick={onRemove} size="sm" variant="ghost">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SimpleInput
            label="Latin"
            value={item.latin}
            onChange={value => onUpdate('latin', value)}
            placeholder="Latin word..."
            id={`latin-${item.id}`}
          />
          <SimpleInput
            label="English"
            value={item.english}
            onChange={value => onUpdate('english', value)}
            placeholder="English translation..."
            id={`english-${item.id}`}
          />
          <SimpleInput
            label="Pronunciation"
            value={item.pronunciation || ''}
            onChange={value => onUpdate('pronunciation', value)}
            placeholder="Pronunciation..."
            id={`pronunciation-${item.id}`}
          />
          <SimpleInput
            label="Part of Speech"
            value={item.partOfSpeech || ''}
            onChange={value => onUpdate('partOfSpeech', value)}
            placeholder="noun, verb, etc..."
            id={`partOfSpeech-${item.id}`}
          />
          <div className="col-span-2">
            <SimpleInput
              label="Example"
              value={item.example || ''}
              onChange={value => onUpdate('example', value)}
              placeholder="Example sentence..."
              id={`example-${item.id}`}
            />
          </div>
          <div className="col-span-2">
            <SimpleTextarea
              label="Notes"
              value={item.notes || ''}
              onChange={value => onUpdate('notes', value)}
              placeholder="Additional notes..."
              rows={2}
              id={`notes-${item.id}`}
            />
          </div>
          <div className="col-span-2">
            <AudioUploadSection
              audioPath={item.audioPath}
              onAudioPathChange={audioPath => onUpdate('audioPath', audioPath || '')}
              contentItemId={contentItemId}
              className="mt-2"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
