import type { GeneratedExercisePreviewDiagnostics } from '@/src/lib/tests/generated-preview-schema';

export type GeneratedExercisePreviewFingerprintSource = {
  type: string;
  translationDirection?: string;
  data: unknown;
};

export function fingerprintGeneratedExercisePreviewRequest(
  request: GeneratedExercisePreviewFingerprintSource
): string {
  return JSON.stringify({
    type: request.type,
    translationDirection: request.translationDirection ?? null,
    data: request.data,
  });
}

export function matchingGeneratedPreviewData<T>(
  currentFingerprint: string,
  originalArgs: GeneratedExercisePreviewFingerprintSource | undefined,
  data: T | undefined
): T | undefined {
  if (data === undefined || !originalArgs) return undefined;
  return fingerprintGeneratedExercisePreviewRequest(originalArgs) === currentFingerprint ? data : undefined;
}

export function formatGeneratedPreviewDiagnostics(result: {
  diagnostics: GeneratedExercisePreviewDiagnostics[];
  globalScanLimitReached?: boolean;
}): string {
  const summary = result.diagnostics
    .map(entry => {
      const flags = [entry.exhausted ? 'exhausted' : null, entry.scanLimitReached ? 'scan limit' : null].filter(
        Boolean
      );
      return `${entry.specId}: ${entry.collected} usable (${entry.scanned} scanned${
        flags.length ? `, ${flags.join(', ')}` : ''
      })`;
    })
    .join(' · ');
  return result.globalScanLimitReached ? `${summary} · Global scan budget reached` : summary;
}
