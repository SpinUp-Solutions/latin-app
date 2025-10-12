import { z } from 'zod';

type ZodEnumSchema = z.ZodEnum<Record<string, string | number>>;

export function getEnumValues(schema: ZodEnumSchema): readonly string[] {
  return schema.options as readonly string[];
}
