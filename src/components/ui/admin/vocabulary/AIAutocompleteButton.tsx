'use client';

import { Button } from '@/src/components/ui/button';
import { useFirebaseAutocomplete, ErrorInfo } from '@/src/hooks/useFirebaseAutocomplete';
import { VocabularyWord } from '@/shared/types/vocabulary/schemas';
import { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import { Loader2, Sparkles, XCircle, Copy, RotateCcw, Info } from 'lucide-react';
import { useToast } from '@/src/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { useState } from 'react';

interface AIAutocompleteButtonProps {
  wordId: string;
  word: string;
  partOfSpeech: PartOfSpeech;
  existingData?: Partial<VocabularyWord>;
  onAutocomplete: (
    data: Partial<VocabularyWord>,
    fieldStatus?: Record<string, 'filled' | 'missing'>,
    wordId?: string
  ) => void;
  disabled?: boolean;
}

export function AIAutocompleteButton({
  wordId,
  word,
  partOfSpeech,
  existingData,
  onAutocomplete,
  disabled = false,
}: AIAutocompleteButtonProps) {
  const { toast } = useToast();
  const [errorDetails, setErrorDetails] = useState<ErrorInfo | null>(null);
  const [notesContent, setNotesContent] = useState<string | null>(null);
  const [notesTimestamp, setNotesTimestamp] = useState<string | null>(null);

  const { autocomplete, isLoading, cost } = useFirebaseAutocomplete({
    onSuccess: (data, costInfo, fieldStatus, notes) => {
      onAutocomplete(data, fieldStatus, wordId);
      setErrorDetails(null);
      setNotesContent(notes || null);
      setNotesTimestamp(notes ? new Date().toISOString() : null);
      const costMessage = costInfo
        ? `Cost: $${costInfo.totalCost.toFixed(4)} (${costInfo.tokens.totalTokens.toLocaleString()} tokens)`
        : '';
      toast({
        title: 'AI Autocomplete Successful',
        description: `Form fields have been populated. Review and apply changes. ${costMessage}`,
      });
    },
    onError: (error, errorInfo) => {
      setErrorDetails(errorInfo || null);
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

    setErrorDetails(null);
    setNotesContent(null);
    setNotesTimestamp(null);
    await autocomplete({
      word,
      part_of_speech: partOfSpeech,
      existingData,
      overwriteExisting: false,
    });
  };

  const handleCopyError = () => {
    if (!errorDetails) return;

    const errorText = `AI Autocomplete Error
Time: ${new Date(errorDetails.timestamp).toLocaleString()}
Word: ${errorDetails.requestData?.word}
Part of Speech: ${errorDetails.requestData?.part_of_speech}

Error Message:
${errorDetails.message}

${
  errorDetails.details
    ? `
Technical Details:
Type: ${errorDetails.details.type || 'Unknown'}
${errorDetails.details.details || ''}
${errorDetails.details.stack ? `\nStack Trace:\n${errorDetails.details.stack}` : ''}
`
    : ''
}`;

    navigator.clipboard.writeText(errorText);
    toast({
      title: 'Error Copied',
      description: 'Error details copied to clipboard',
    });
  };

  const handleRetry = () => {
    setErrorDetails(null);
    handleAutocomplete();
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
        {errorDetails && !isLoading && (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                <XCircle className="h-4 w-4 text-red-600" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 max-h-80 overflow-y-auto bg-white">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <h4 className="font-medium text-sm text-red-600">Error Details</h4>
                  <span className="text-xs text-gray-500">{new Date(errorDetails.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Error Message:</p>
                    <p className="text-sm text-gray-900 mt-1">{errorDetails.message}</p>
                  </div>
                  {errorDetails.requestData && (
                    <div>
                      <p className="text-xs font-medium text-gray-500">Request:</p>
                      <p className="text-xs text-gray-700 mt-1">
                        Word: {errorDetails.requestData.word} ({errorDetails.requestData.part_of_speech})
                      </p>
                    </div>
                  )}
                  {errorDetails.details && (
                    <div>
                      <p className="text-xs font-medium text-gray-500">Technical Details:</p>
                      <div className="text-xs text-gray-700 mt-1 space-y-1">
                        {errorDetails.details.type && <p>Type: {errorDetails.details.type}</p>}
                        {errorDetails.details.details && (
                          <p className="whitespace-pre-wrap break-words">{errorDetails.details.details}</p>
                        )}
                        {errorDetails.details.stack && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-medium text-gray-500">Stack Trace</summary>
                            <pre className="text-xs mt-1 overflow-x-auto bg-gray-50 p-2 rounded">
                              {errorDetails.details.stack}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <Button type="button" variant="outline" size="sm" onClick={handleCopyError} className="flex-1 gap-2">
                    <Copy className="h-3 w-3" />
                    Copy Details
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleRetry} className="flex-1 gap-2">
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
        {notesContent && !isLoading && (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Info className="h-4 w-4 text-blue-600" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 max-h-80 overflow-y-auto bg-white">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <h4 className="font-medium text-sm text-blue-600">AI Notes</h4>
                  <span className="text-xs text-gray-500">
                    {notesTimestamp ? new Date(notesTimestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{notesContent}</p>
                </div>
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
