import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  usePreviewGeneratedExerciseMutation,
  type GeneratedExercisePreviewRequest,
} from '@/src/store/api/advancedVocabularyApi';
import {
  fingerprintGeneratedExercisePreviewRequest,
  matchingGeneratedPreviewData,
} from '@/src/utils/generated/generatedExercisePreview';

export function useGeneratedExercisePreview(previewRequest: GeneratedExercisePreviewRequest) {
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [previewGeneratedExercise, previewResult] = usePreviewGeneratedExerciseMutation();
  const resetPreview = previewResult.reset;

  const previewFingerprint = useMemo(
    () => fingerprintGeneratedExercisePreviewRequest(previewRequest),
    [previewRequest]
  );
  const previousPreviewFingerprint = useRef(previewFingerprint);

  useEffect(() => {
    if (previousPreviewFingerprint.current === previewFingerprint) return;
    previousPreviewFingerprint.current = previewFingerprint;
    setPreviewOpen(false);
    resetPreview();
  }, [previewFingerprint, resetPreview]);

  const setIsPreviewOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        setPreviewOpen(false);
        resetPreview();
        return;
      }
      setPreviewOpen(true);
      void previewGeneratedExercise(previewRequest);
    },
    [previewGeneratedExercise, previewRequest, resetPreview]
  );

  const previewData = isPreviewOpen
    ? matchingGeneratedPreviewData(previewFingerprint, previewResult.originalArgs, previewResult.data)
    : undefined;

  return {
    isPreviewOpen,
    setIsPreviewOpen,
    previewData,
    isPreviewFetching: isPreviewOpen && previewResult.isLoading,
    previewError: isPreviewOpen ? previewResult.error : undefined,
  };
}
