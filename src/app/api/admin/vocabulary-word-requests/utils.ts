import { NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { VocabularyWordSchema, type VocabularyWord } from '@/shared/types/vocabulary/schemas';
import { VOCABULARY_WORD_REQUESTS_COLLECTION, VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import type { VocabularyWordRequest } from '@/shared/types/vocabulary/requests';

export const requestCollection = () => adminDb.collection(VOCABULARY_WORD_REQUESTS_COLLECTION);
export const wordCollection = () => adminDb.collection(VOCABULARY_WORDS_COLLECTION);

type FirestoreTimestampLike = {
  toDate: () => Date;
};

type RequestSnapshotLike = {
  id: string;
  data: () => Record<string, unknown> | undefined;
  createTime?: FirestoreTimestampLike;
  updateTime?: FirestoreTimestampLike;
};

const isFirestoreTimestampLike = (value: unknown): value is FirestoreTimestampLike =>
  !!value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function';

const isValidDateString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value));

const timestampToIso = (value: FirestoreTimestampLike | undefined): string | undefined =>
  value ? value.toDate().toISOString() : undefined;

export const stripMacrons = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0304]/g, '')
    .normalize('NFC')
    .toLowerCase();

export const serializeForJson = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (isFirestoreTimestampLike(value)) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(item => serializeForJson(item));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serializeForJson(entry)])
    );
  }
  return value;
};

export const serializeRequestDoc = (id: string, data: Record<string, unknown>): VocabularyWordRequest =>
  ({
    id,
    ...(serializeForJson(data) as Record<string, unknown>),
  }) as VocabularyWordRequest;

export const serializeRequestSnapshot = (snapshot: RequestSnapshotLike): VocabularyWordRequest => {
  const request = serializeRequestDoc(snapshot.id, snapshot.data() || {}) as VocabularyWordRequest &
    Record<string, unknown>;
  const createdAt = isValidDateString(request.createdAt) ? request.createdAt : timestampToIso(snapshot.createTime);
  const updatedAt = isValidDateString(request.updatedAt)
    ? request.updatedAt
    : timestampToIso(snapshot.updateTime) || createdAt;

  return {
    ...request,
    createdAt: createdAt || '',
    updatedAt: updatedAt || createdAt || '',
  };
};

export const cleanForFirestore = (value: unknown): unknown => {
  if (value instanceof Date || isFirestoreTimestampLike(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => cleanForFirestore(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, cleanForFirestore(entry)])
    );
  }
  return value;
};

export const buildValidatedWordForApproval = (draftWord: VocabularyWord) => {
  const now = new Date();
  const validationResult = VocabularyWordSchema.safeParse({
    ...draftWord,
    sort_key: stripMacrons(draftWord.word),
    random_index: typeof draftWord.random_index === 'number' ? draftWord.random_index : Math.random(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  if (!validationResult.success) {
    const errorMessage = validationResult.error.issues
      .map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    return { success: false as const, error: `Invalid word data: ${errorMessage}` };
  }

  const { createdAt, updatedAt, ...validatedWord } = validationResult.data;
  void createdAt;
  void updatedAt;

  return {
    success: true as const,
    data: {
      validatedWord: validationResult.data,
      firestorePayload: cleanForFirestore({
        ...validatedWord,
        createdAt: now,
        updatedAt: now,
      }) as Record<string, unknown>,
    },
  };
};

export const routeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return NextResponse.json(
      { success: false, error: message, ...('code' in error ? { code: error.code } : {}) },
      { status: error.status }
    );
  }
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ success: false, error: message }, { status });
};
