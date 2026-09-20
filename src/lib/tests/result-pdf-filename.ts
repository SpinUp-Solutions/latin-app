const MAX_TOKEN_LENGTH = 60;

export function sanitizePdfFilenameToken(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TOKEN_LENGTH)
    .replace(/-+$/g, '');
}

export function submittedDateToken(submittedAt: string): string {
  const parsed = new Date(submittedAt);
  if (!Number.isFinite(parsed.getTime())) return 'undated';
  return parsed.toISOString().slice(0, 10);
}

export function buildTestResultPdfFilename(input: {
  studentName: string;
  testTitle: string;
  submittedAt: string;
}): string {
  const student = sanitizePdfFilenameToken(input.studentName) || 'student';
  const test = sanitizePdfFilenameToken(input.testTitle) || 'test';
  return `${student}-${test}-${submittedDateToken(input.submittedAt)}.pdf`;
}
