import { z } from 'zod';
import type { SchemaNode, ObjectNode } from '@/src/types/schema-introspection';

const schemaCache = new WeakMap<z.ZodTypeAny, SchemaNode>();

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  const current = schema;

  if (current instanceof z.ZodOptional) {
    return unwrap(current.unwrap() as z.ZodTypeAny);
  }

  if (current instanceof z.ZodNullable) {
    return unwrap(current.unwrap() as z.ZodTypeAny);
  }

  return current;
}

function isStringArray(schema: z.ZodTypeAny): boolean {
  const unwrapped = unwrap(schema);
  if (unwrapped instanceof z.ZodArray) {
    const element = unwrap(unwrapped.element as z.ZodTypeAny);
    return element instanceof z.ZodString;
  }
  return false;
}

function allStructurallyEqual(nodes: SchemaNode[]): boolean {
  if (nodes.length <= 1) return true;

  const first = nodes[0];

  if (first.kind === 'leaf') {
    return nodes.every(n => n.kind === 'leaf' && n.leafKind === first.leafKind);
  }

  if (first.kind === 'object') {
    return nodes.every(n => {
      if (n.kind !== 'object') return false;
      const firstKeys = [...first.keys].sort().join(',');
      const nKeys = [...n.keys].sort().join(',');
      return firstKeys === nKeys;
    });
  }

  return false;
}

function buildSchemaNode(schema: z.ZodTypeAny): SchemaNode {
  const unwrapped = unwrap(schema);

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape as Record<string, z.ZodTypeAny>;
    const keys = Object.keys(shape);
    const children: Record<string, SchemaNode> = {};

    for (const key of keys) {
      children[key] = buildSchemaNode(shape[key]);
    }

    const node: ObjectNode = {
      kind: 'object',
      keys,
      children,
      uniform: allStructurallyEqual(Object.values(children)),
    };

    return node;
  }

  if (isStringArray(unwrapped)) {
    return { kind: 'leaf', leafKind: 'string[]' };
  }

  if (unwrapped instanceof z.ZodString) {
    return { kind: 'leaf', leafKind: 'string' };
  }

  return { kind: 'leaf', leafKind: 'unknown' };
}

export function introspectSchema(schema: z.ZodTypeAny): SchemaNode {
  const cached = schemaCache.get(schema);
  if (cached) {
    return cached;
  }

  const node = buildSchemaNode(schema);
  schemaCache.set(schema, node);
  return node;
}
