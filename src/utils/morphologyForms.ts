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

/**
 * Returns whether an inflection table has at least two filled cells and every
 * selectable form across those cells has the same spelling.
 */
export function isUniformTable(table: unknown): boolean {
  if (!table || typeof table !== 'object' || Array.isArray(table)) return false;

  let filledCells = 0;
  let sharedForm: string | null = null;

  const visit = (node: unknown): boolean => {
    if (node === null || node === undefined) return true;
    if (typeof node === 'string') {
      if (!isSelectableMorphologyForm(node)) return true;
      const form = node.trim();
      if (sharedForm === null) {
        sharedForm = form;
      } else if (sharedForm !== form) {
        return false;
      }
      filledCells += 1;
      return true;
    }
    if (Array.isArray(node)) {
      const forms = node.filter(isSelectableMorphologyForm).map(entry => entry.trim());
      if (forms.length === 0) return true;
      for (const form of forms) {
        if (sharedForm === null) {
          sharedForm = form;
        } else if (sharedForm !== form) {
          return false;
        }
      }
      filledCells += 1;
      return true;
    }
    if (typeof node === 'object') {
      for (const value of Object.values(node)) {
        if (!visit(value)) return false;
      }
    }
    return true;
  };

  return visit(table) && filledCells >= 2;
}
