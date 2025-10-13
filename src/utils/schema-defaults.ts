import { z } from 'zod';
import { introspectSchema } from '@/src/utils/schema-introspector';
import type { SchemaNode } from '@/src/types/schema-introspection';

const buildEmptyValue = (node: SchemaNode): unknown => {
  if (node.kind === 'object') {
    const result: Record<string, unknown> = {};
    node.keys.forEach(key => {
      result[key] = buildEmptyValue(node.children[key]);
    });
    return result;
  }
  return null;
};

export const buildEmptyFromSchema = <T = unknown>(schema: z.ZodTypeAny): T => {
  const schemaNode = introspectSchema(schema);
  return buildEmptyValue(schemaNode) as T;
};
