import { z } from 'zod';

/**
 * Browser/server-safe contracts for vocabulary-pool authoring requests.
 * These intentionally contain only client-controlled fields. Audit fields and
 * operation ownership are derived by the server.
 */

const vocabularyPoolIdSchema = z
  .string()
  .trim()
  .min(1, 'Pool IDs must be non-empty strings')
  .max(200, 'Pool IDs are too long')
  .refine(id => id !== '.' && id !== '..' && !id.includes('/'), 'Pool IDs must be Firestore document IDs');

const requestIdSchema = vocabularyPoolIdSchema.max(200, 'Request ID is too long');

const difficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);

const tagsSchema = z.array(z.string().trim().min(1).max(100)).max(100).default([]);

/**
 * A repeated source ID is accepted and canonicalized by the service. The UI
 * never emits duplicates, but accepting them makes retries and older clients
 * deterministic instead of turning a harmless duplicate click into a 400.
 */
export const createVocabularyPoolFromPoolsRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
    description: z
      .string()
      .trim()
      .min(1, 'Description is required')
      .max(500, 'Description must be less than 500 characters'),
    difficulty: difficultySchema.default('beginner'),
    tags: tagsSchema,
    sourcePoolIds: z.array(vocabularyPoolIdSchema).min(1, 'Select at least one source pool'),
    wordDocIds: z.array(vocabularyPoolIdSchema).default([]),
    requestId: requestIdSchema,
  })
  .strict()
  .transform(value => ({
    ...value,
    sourcePoolIds: [...new Set(value.sourcePoolIds)],
    wordDocIds: [...new Set(value.wordDocIds)],
    tags: [...new Set(value.tags.map(tag => tag.toLowerCase().trim()).filter(Boolean))],
  }));

export type CreateVocabularyPoolFromPoolsRequest = z.infer<typeof createVocabularyPoolFromPoolsRequestSchema>;
