const APP_CHECK_PROTECTED_API_ENDPOINTS = new Set(['gradeTestTranslation', 'confirmTestSection']);

export const apiEndpointRequiresAppCheck = (endpoint: string): boolean =>
  APP_CHECK_PROTECTED_API_ENDPOINTS.has(endpoint);
