import { createHash } from 'node:crypto';
import type { TranslationGradingProfile } from './model-registry';
import { taskJsonSchema, type TranslationGradingTask } from './translation-grading-tasks';

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

/**
 * Fingerprints every behavior-bearing input used by a grading request. Unlike
 * hand-maintained version strings, prompt or schema edits invalidate cached
 * evaluation results automatically.
 */
export function createTranslationGradingBehaviorFingerprint(
  task: TranslationGradingTask,
  profile: TranslationGradingProfile
): string {
  const promptSamples = (['latin-to-english', 'english-to-latin'] as const).map(direction =>
    task.buildPrompt({
      direction,
      sourceText: '__SOURCE_TEXT__',
      userTranslation: '__STUDENT_TRANSLATION__',
    })
  );
  const behavior = {
    task: {
      mode: task.mode,
      systemPrompt: task.systemPrompt,
      formatName: task.formatName,
      outputSchema: taskJsonSchema(task),
      promptSamples,
      parseImplementation: String(task.parse),
    },
    profile: {
      model: profile.model,
      reasoningEffort: profile.reasoningEffort,
      maxOutputTokens: profile.maxOutputTokens[task.mode],
      promptCacheKey: profile.promptCacheKey,
      promptCacheMode: profile.promptCacheMode,
    },
  };
  return createHash('sha256').update(canonicalJson(behavior), 'utf8').digest('hex');
}
