import { z } from 'zod';

const pageId = z
  .string()
  .min(1)
  .max(1500)
  .refine(value => !value.includes('/'));
export const sectionWriteSchema = z
  .object({
    pageId,
    expectedRevision: z.number().int().nonnegative(),
    mutationId: z.string().uuid(),
  })
  .strict();
export const sectionPhaseInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    phase: z.enum(['answering', 'review']),
  })
  .strict();
export const confirmSectionInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    acknowledgeIncomplete: z.boolean(),
  })
  .strict();
const timestamp = z.string().datetime();
export const sectionStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    phase: z.enum(['answering', 'review', 'confirming', 'confirmed']),
    confirmedAt: timestamp.optional(),
    confirmation: z
      .object({
        requestId: z.string().uuid(),
        fingerprint: z.string().length(64),
        token: z.string().uuid(),
        expiresAt: timestamp,
      })
      .strict()
      .optional(),
    saveMutations: z
      .record(
        z.string().uuid(),
        z
          .object({
            fingerprint: z.string().length(64),
            expectedRevision: z.number().int().nonnegative(),
          })
          .strict()
      )
      .optional(),
  })
  .strict();
export type SectionState = z.infer<typeof sectionStateSchema>;
export type SectionWrite = z.infer<typeof sectionWriteSchema>;
export type SectionPhaseInput = z.infer<typeof sectionPhaseInputSchema>;
export type ConfirmSectionInput = z.infer<typeof confirmSectionInputSchema>;
