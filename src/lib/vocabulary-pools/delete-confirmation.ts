import type { VocabularyPoolUsage } from '@/src/types/vocabulary-pool';

const USAGE_LIMIT = 3;
const LABEL_LIMIT = 120;

function shortenLabel(label: string): string {
  return label.length > LABEL_LIMIT ? `${label.slice(0, LABEL_LIMIT - 1)}…` : label;
}

export function buildVocabularyPoolDeleteConfirmation(
  poolName: string,
  usages: VocabularyPoolUsage[],
  usageStatus: 'available' | 'unavailable'
): string {
  const opening = `Are you sure you want to delete "${poolName}"?`;

  if (usageStatus !== 'available') {
    return `${opening}\n\nAssignments could not be checked. Deleting this pool may break lessons or exercises that use it.\n\nThis action cannot be undone.`;
  }

  if (usages.length === 0) return `${opening} This action cannot be undone.`;

  const usageNames = usages
    .slice(0, USAGE_LIMIT)
    .map(usage => `• ${shortenLabel(usage.label)}`)
    .join('\n');
  const remaining = usages.length - USAGE_LIMIT;
  const overflow = remaining > 0 ? `\n• +${remaining} more` : '';
  const assignment = usages.length === 1 ? 'assignment' : 'assignments';

  return `${opening}\n\nThis pool is assigned to ${usages.length} saved ${assignment}:\n${usageNames}${overflow}\n\nDeleting it may break that saved content. This action cannot be undone.`;
}
