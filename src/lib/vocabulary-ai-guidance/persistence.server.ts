import type { Firestore } from 'firebase-admin/firestore';
import {
  VOCABULARY_AI_GUIDANCE_COLLECTION,
  VOCABULARY_AI_GUIDANCE_DOCUMENT,
} from '../../../shared/constants/firestore';
import {
  SaveVocabularyAIGuidanceSchema,
  VocabularyAIGuidanceSettingsSchema,
  type VocabularyAIGuidanceSettings,
} from '../../../shared/types/vocabulary/ai-guidance-settings';
import { DomainError } from '../domain-error';

/** Shared by Next.js admin routes and the Firebase callable; no client import. */
export class VocabularyAIGuidanceError extends DomainError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'VocabularyAIGuidanceError';
  }
}

const reference = (db: Firestore) =>
  db.collection(VOCABULARY_AI_GUIDANCE_COLLECTION).doc(VOCABULARY_AI_GUIDANCE_DOCUMENT);

function decode(exists: boolean, data: unknown): VocabularyAIGuidanceSettings {
  if (!exists) return { revision: 0, rules: [], updatedAt: null, updatedBy: null };
  if (data && typeof data === 'object' && '_deletionPending' in data && data._deletionPending) {
    throw new VocabularyAIGuidanceError(
      409,
      'VOCABULARY_AI_GUIDANCE_UNAVAILABLE',
      'AI guidance is being removed. Try again later.'
    );
  }
  const result = VocabularyAIGuidanceSettingsSchema.safeParse(data);
  if (!result.success) {
    throw new VocabularyAIGuidanceError(
      409,
      'INVALID_VOCABULARY_AI_GUIDANCE',
      'Saved AI guidance has an invalid format.'
    );
  }
  return result.data;
}

export async function readVocabularyAIGuidance(db: Firestore): Promise<VocabularyAIGuidanceSettings> {
  const snapshot = await reference(db).get();
  return decode(snapshot.exists, snapshot.data());
}

/** One bounded document, with a revision check to prevent lost admin edits. */
export async function saveVocabularyAIGuidance(
  db: Firestore,
  actorUid: string,
  input: unknown
): Promise<VocabularyAIGuidanceSettings> {
  const request = SaveVocabularyAIGuidanceSchema.parse(input);
  const ref = reference(db);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const current = decode(snapshot.exists, snapshot.data());
    if (request.revision !== current.revision) {
      throw new VocabularyAIGuidanceError(
        409,
        'VOCABULARY_AI_GUIDANCE_CHANGED',
        'Global guidance changed. Reload it before saving your changes.'
      );
    }
    const next = {
      revision: current.revision + 1,
      rules: request.rules,
      updatedAt: new Date().toISOString(),
      updatedBy: actorUid,
    };
    transaction.set(ref, next);
    return next;
  });
}
