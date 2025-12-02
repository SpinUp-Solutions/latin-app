import { z } from 'zod';
import { DeclensionTableSchema } from '@/shared/types/vocabulary/schemas/declension';
import { DegreesTableSchema } from '@/shared/types/vocabulary/schemas/adjective';
import { ConjugationTableSchema } from '@/shared/types/vocabulary/schemas/verb-conjugation';
import type { DeclensionTable } from '@/shared/types/vocabulary/schemas/declension';
import type { ConjugationTable } from '@/shared/types/vocabulary/schemas/verb-conjugation';

type DegreesTable = z.infer<typeof DegreesTableSchema>;

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional) {
    return unwrapSchema(schema.unwrap() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodNullable) {
    return unwrapSchema(schema.unwrap() as z.ZodTypeAny);
  }
  return schema;
}

function generateEmptyFromSchema(schema: z.ZodTypeAny): unknown {
  const unwrapped = unwrapSchema(schema);

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape as Record<string, z.ZodTypeAny>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(shape)) {
      result[key] = generateEmptyFromSchema(shape[key]);
    }

    return result;
  }

  if (unwrapped instanceof z.ZodArray) {
    return null;
  }

  if (unwrapped instanceof z.ZodString) {
    return null;
  }

  if (unwrapped instanceof z.ZodBoolean) {
    return null;
  }

  if (unwrapped instanceof z.ZodLiteral) {
    return null;
  }

  return null;
}

export function createEmptyDeclensionTable(): DeclensionTable {
  return generateEmptyFromSchema(DeclensionTableSchema) as DeclensionTable;
}

export function createEmptyDegreesTable(): DegreesTable {
  return generateEmptyFromSchema(DegreesTableSchema) as DegreesTable;
}

export function createEmptyConjugationTable(): ConjugationTable {
  return generateEmptyFromSchema(ConjugationTableSchema) as ConjugationTable;
}
