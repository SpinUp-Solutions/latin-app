const MAX_DOCUMENT_NAME_BYTES = 6 * 1024;
const DOCUMENT_OVERHEAD_BYTES = 32;
const CONTAINER_SAFETY_BYTES = 32;
const VALUE_SAFETY_BYTES = 16;

const firestoreStringBytes = (value: string) => Buffer.byteLength(value, 'utf8') + 1;

function estimateValueBytes(value: unknown, ancestors: Set<object>): number {
  if (value === null) return 1;
  if (typeof value === 'boolean') return 1;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Firestore documents cannot contain non-finite numbers');
    return 8;
  }
  if (typeof value === 'string') return firestoreStringBytes(value);
  if (typeof value !== 'object') throw new Error(`Unsupported Firestore value type: ${typeof value}`);
  if (ancestors.has(value)) throw new Error('Firestore documents cannot contain cyclic values');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return (
        CONTAINER_SAFETY_BYTES +
        value.reduce((total, entry) => total + VALUE_SAFETY_BYTES + estimateValueBytes(entry, ancestors), 0)
      );
    }

    return (
      CONTAINER_SAFETY_BYTES +
      Object.entries(value).reduce(
        (total, [field, entry]) =>
          total + firestoreStringBytes(field) + VALUE_SAFETY_BYTES + estimateValueBytes(entry, ancestors),
        0
      )
    );
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Conservative upper bound for the JSON-compatible values used by attempts.
 * It follows Firestore's UTF-8 string and fixed-width numeric sizing, reserves
 * the maximum document-name allowance, and adds padding per value/container.
 */
export function estimateFirestoreDocumentBytes(document: Record<string, unknown>): number {
  return MAX_DOCUMENT_NAME_BYTES + DOCUMENT_OVERHEAD_BYTES + estimateValueBytes(document, new Set());
}
