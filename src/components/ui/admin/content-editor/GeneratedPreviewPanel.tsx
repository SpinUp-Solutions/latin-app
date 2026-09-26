import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { formatGeneratedPreviewDiagnostics } from '@/src/utils/generated/generatedExercisePreview';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import type { GeneratedExercisePreviewDiagnostics } from '@/src/lib/tests/generated-preview-schema';

interface GeneratedPreviewData<T> {
  words: T[];
  diagnostics: GeneratedExercisePreviewDiagnostics[];
  uniqueWords?: number;
  globalScanLimitReached?: boolean;
}

interface GeneratedPreviewPanelProps<T> {
  isFetching: boolean;
  isOpen: boolean;
  previewError: unknown;
  previewData: GeneratedPreviewData<T> | undefined;
  idleLabel: string;
  onPreview: () => void;
  renderItems: (words: T[]) => React.ReactNode;
}

export function GeneratedPreviewPanel<T>({
  isFetching,
  isOpen,
  previewError,
  previewData,
  idleLabel,
  onPreview,
  renderItems,
}: GeneratedPreviewPanelProps<T>) {
  const words = isOpen ? previewData?.words : undefined;

  return (
    <div>
      <label className="block text-sm font-medium mb-3">Preview</label>
      <Card>
        <CardContent className="p-4 space-y-4">
          <Button type="button" onClick={onPreview} disabled={isFetching}>
            {isFetching ? 'Loading Preview...' : idleLabel}
          </Button>

          {isOpen && previewError ? (
            <div className="text-sm text-red-600 mt-4">
              {getApiErrorMessage(previewError, 'Failed to load preview')}
            </div>
          ) : null}

          {isOpen && previewData?.diagnostics?.length ? (
            <p className="text-xs text-gray-500 mt-2">{formatGeneratedPreviewDiagnostics(previewData)}</p>
          ) : null}

          {words && words.length > 0 && (
            <div className="space-y-2 mt-4">
              <label className="block text-sm font-medium">
                Preview ({words.length} items
                {previewData?.uniqueWords !== undefined ? ` from ${previewData.uniqueWords} unique words` : ''})
              </label>
              {renderItems(words)}
            </div>
          )}

          {words && words.length === 0 && (
            <div className="text-sm text-amber-600 mt-4">
              No words match the current filters. Try adjusting your filter criteria.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
