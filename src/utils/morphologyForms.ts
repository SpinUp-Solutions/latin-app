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
