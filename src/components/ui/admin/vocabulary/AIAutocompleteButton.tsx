'use client';

import { Button } from '@/src/components/ui/button';
import { useAIAutocomplete } from '@/src/hooks/useAIAutocomplete';
import { VocabularyWord } from '@/src/types/vocabulary/schemas';
import { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useToast } from '@/src/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { useState } from 'react';

interface AIAutocompleteButtonProps {
  word: string;
  partOfSpeech: PartOfSpeech;
  existingData?: Partial<VocabularyWord>;
  onAutocomplete: (data: Partial<VocabularyWord>, fieldStatus?: Record<string, 'filled' | 'missing'>) => void;
  disabled?: boolean;
}

export function AIAutocompleteButton({
  word,
  partOfSpeech,
  existingData,
  onAutocomplete,
  disabled = false,
}: AIAutocompleteButtonProps) {
  const { toast } = useToast();
  const [aiNotes, setAiNotes] = useState<string | undefined>(undefined);

  const { autocomplete, isLoading, cost } = useAIAutocomplete({
    onSuccess: (data, costInfo, fieldStatus, notes) => {
      onAutocomplete(data, fieldStatus);
      setAiNotes(notes);
      const costMessage = costInfo
        ? `Cost: $${costInfo.totalCost.toFixed(4)} (${costInfo.tokens.totalTokens.toLocaleString()} tokens)`
        : '';
      toast({
        title: 'AI Autocomplete Successful',
        description: `Form fields have been populated. Review and apply changes. ${costMessage}`,
      });
    },
    onError: error => {
      toast({
        title: 'AI Autocomplete Failed',
        description: error,
        variant: 'destructive',
      });
    },
  });

  const handleAutocomplete = async () => {
    if (!word || !partOfSpeech) {
      toast({
        title: 'Missing Information',
        description: 'Word and part of speech are required for AI autocomplete.',
        variant: 'destructive',
      });
      return;
    }

    await autocomplete({
      word,
      part_of_speech: partOfSpeech,
      existingData,
      overwriteExisting: false,
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAutocomplete}
          disabled={disabled || isLoading || !word}
          className="gap-2">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              AI Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              AI Autocomplete
            </>
          )}
        </Button>
        {aiNotes && !isLoading && (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                <AlertCircle className="h-4 w-4 text-amber-600" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-60 overflow-y-auto bg-white">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">AI Notes</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiNotes}</p>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {cost && !isLoading && (
        <span className="text-xs text-gray-500">
          ${cost.totalCost.toFixed(4)} ({cost.tokens.totalTokens.toLocaleString()} tokens)
        </span>
      )}
    </div>
  );
}
