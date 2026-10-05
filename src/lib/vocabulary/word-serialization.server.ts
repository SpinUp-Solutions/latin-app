const serializeTimestamp = (value: unknown): string | undefined => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
};

/** Converts a stored word's Firestore timestamps to ISO strings for JSON responses. */
export const serializeVocabularyWord = (data: Record<string, unknown>): Record<string, unknown> => {
  const serialized = { ...data };
  const createdAt = serializeTimestamp(serialized.createdAt);
  const updatedAt = serializeTimestamp(serialized.updatedAt);
  if (createdAt) serialized.createdAt = createdAt;
  if (updatedAt) serialized.updatedAt = updatedAt;
  return serialized;
};
