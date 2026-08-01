type TestEditorIdentityField = 'test' | 'version';

const keyFor = (scope: string, field: TestEditorIdentityField) => `test_editor_identity:${scope}:${field}`;

export function getStableTestEditorIdentity(scope: string, field: TestEditorIdentityField, prefix: string) {
  const key = keyFor(scope, field);
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const created = `${prefix}-${randomPart}`;
  sessionStorage.setItem(key, created);
  return created;
}

export function clearStableTestEditorIdentity(scope: string) {
  sessionStorage.removeItem(keyFor(scope, 'test'));
  sessionStorage.removeItem(keyFor(scope, 'version'));
}
