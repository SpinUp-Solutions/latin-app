import type { TestAttemptOrigin } from '@/src/types/test';

export type ResultPdfKindLabel = 'Test' | 'Mock test';

export interface ResultPdfSource {
  kindLabel: ResultPdfKindLabel;
  title: string;
}

export interface ResultPdfStudentIdentity {
  name: string;
  username: string | null;
  email: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const trimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function sourceTitleFromDocument(origin: TestAttemptOrigin, data: unknown): ResultPdfSource {
  const kindLabel: ResultPdfKindLabel = origin.kind === 'mock-test' ? 'Mock test' : 'Test';
  const fallback = kindLabel;
  const title = trimmedString(isRecord(data) ? data.title : undefined);
  return { kindLabel, title: title || fallback };
}

export function studentIdentityFromProfile(data: unknown, fallbackEmail?: string | null): ResultPdfStudentIdentity {
  const record = isRecord(data) ? data : {};
  const firstName = trimmedString(record.firstName);
  const lastName = trimmedString(record.lastName);
  const username = trimmedString(record.username);
  const email = trimmedString(record.email) || trimmedString(fallbackEmail);
  const name = [firstName, lastName].filter(Boolean).join(' ') || username || email.split('@')[0] || 'Student';
  return {
    name,
    username: username || null,
    email: email || null,
  };
}
