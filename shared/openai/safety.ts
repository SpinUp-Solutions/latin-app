import { createHash } from 'node:crypto';

/** OpenAI accepts a stable, non-identifying safety identifier of at most 64 characters. */
export function createOpenAISafetyIdentifier(actorId: string): string {
  return createHash('sha256').update(actorId, 'utf8').digest('hex');
}
