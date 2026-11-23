const EMPTY_MORPHOLOGY_FORM_PLACEHOLDER = '—';

/**
 * Returns whether a persisted morphology-table value can be shown as a form.
 * Empty cells are canonically null, but older records may contain blank strings
 * or the admin grid's visual em-dash placeholder.
 */
export function isSelectableMorphologyForm(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== EMPTY_MORPHOLOGY_FORM_PLACEHOLDER;
}

/** Every selectable form anywhere in a table or table fragment, trimmed. */
export function collectSelectableForms(node: unknown): string[] {
  if (typeof node === 'string') return isSelectableMorphologyForm(node) ? [node.trim()] : [];
  if (Array.isArray(node)) return node.flatMap(collectSelectableForms);
  if (node && typeof node === 'object') return Object.values(node).flatMap(collectSelectableForms);
  return [];
}

/**
 * Returns whether a case-keyed inflection table (a noun's declension table, or one degree of an adjective's)
 * has forms in at least two cases and every form in it has the same spelling.
 *
 * Two cases, not two cells: forms that agree within one case (fēlīx in all three genders, diēs in both
 * numbers) are ordinary syncretism. The vocative must still match but does not count as a case, because it
 * repeats the nominative in nearly every paradigm (puella, puella).
 */
export function isUniformTable(table: unknown): boolean {
  if (!table || typeof table !== 'object' || Array.isArray(table)) return false;

  let sharedForm: string | null = null;
  const casesWithForms = new Set<string>();
  for (const [caseName, row] of Object.entries(table)) {
    for (const form of collectSelectableForms(row)) {
      if (sharedForm === null) sharedForm = form;
      else if (form !== sharedForm) return false;
      if (caseName !== 'vocative') casesWithForms.add(caseName);
    }
  }
  return casesWithForms.size >= 2;
}
