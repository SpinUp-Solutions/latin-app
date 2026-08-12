/** Leaves headroom below Firestore's 500-write transaction ceiling. */
export const MAX_VOCABULARY_POOL_WORD_ADDITIONS = 400;

export function countVocabularyPoolWordAdditions(selectedIds: string[], initialIds: string[]): number {
  const initial = new Set(initialIds);
  return new Set(selectedIds.filter(id => !initial.has(id))).size;
}

export function remainingVocabularyPoolWordAdditions(
  selectedIds: string[],
  initialIds: string[],
  maximum = MAX_VOCABULARY_POOL_WORD_ADDITIONS
): number {
  return Math.max(0, maximum - countVocabularyPoolWordAdditions(selectedIds, initialIds));
}

export function limitVocabularyPoolWordCandidates(
  candidateIds: string[],
  selectedIds: string[],
  initialIds: string[],
  maximum = MAX_VOCABULARY_POOL_WORD_ADDITIONS
): string[] {
  const initial = new Set(initialIds);
  let remaining = remainingVocabularyPoolWordAdditions(selectedIds, initialIds, maximum);
  const accepted: string[] = [];
  for (const id of candidateIds) {
    if (initial.has(id)) accepted.push(id);
    else if (remaining > 0) {
      accepted.push(id);
      remaining -= 1;
    }
  }
  return accepted;
}
