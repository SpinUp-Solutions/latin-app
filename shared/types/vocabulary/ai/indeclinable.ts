import { z } from 'zod';
import { AdverbSchema, PrepositionSchema, ConjunctionSchema, InterjectionSchema } from '../schemas/indeclinable-words';

type IndeclinableSchema = z.ZodObject<{
  translation: z.ZodString;
  definitions: z.ZodArray<z.ZodString>;
  etymology: z.ZodNullable<z.ZodString>;
  pronunciation: z.ZodNullable<z.ZodString>;
  alternate_form: z.ZodNullable<z.ZodString>;
}>;

function buildIndeclinableSchema(schema: IndeclinableSchema) {
  return schema
    .pick({
      translation: true,
      definitions: true,
      etymology: true,
      pronunciation: true,
      alternate_form: true,
    })
    .extend({
      etymology: schema.shape.etymology.nullable(),
      pronunciation: schema.shape.pronunciation.nullable(),
      alternate_form: schema.shape.alternate_form.nullable(),
    })
    .strict();
}
export const AdverbStructuredOutputSchema = buildIndeclinableSchema(AdverbSchema);
export const PrepositionStructuredOutputSchema = buildIndeclinableSchema(PrepositionSchema);
export const ConjunctionStructuredOutputSchema = buildIndeclinableSchema(ConjunctionSchema);
export const InterjectionStructuredOutputSchema = buildIndeclinableSchema(InterjectionSchema);
export type AdverbStructuredOutput = z.infer<typeof AdverbStructuredOutputSchema>;
export type PrepositionStructuredOutput = z.infer<typeof PrepositionStructuredOutputSchema>;
export type ConjunctionStructuredOutput = z.infer<typeof ConjunctionStructuredOutputSchema>;
export type InterjectionStructuredOutput = z.infer<typeof InterjectionStructuredOutputSchema>;
