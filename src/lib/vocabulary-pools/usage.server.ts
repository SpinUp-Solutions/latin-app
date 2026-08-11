import type { Firestore } from 'firebase-admin/firestore';
import {
  LEARNING_UNITS_COLLECTION,
  MOCK_TESTS_COLLECTION,
  TEST_VERSION_DRAFTS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
} from '@/shared/constants/firestore';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import type { VocabularyPoolUsage, VocabularyPoolUsageKind } from '@/src/types/vocabulary-pool';

const MAX_AUTHORING_DOCUMENTS = 500;

const SCAN_COLLECTIONS = [
  {
    name: LEARNING_UNITS_COLLECTION,
    fields: ['title', 'kind', 'vocabulary_pool', 'pages', 'rotationVersions'],
  },
  {
    name: TEST_VERSIONS_COLLECTION,
    fields: ['name', 'vocabularyPoolId', 'pages'],
  },
  {
    name: TEST_VERSION_DRAFTS_COLLECTION,
    fields: ['name', 'testId', 'vocabularyPoolId', 'pages'],
  },
  {
    name: MOCK_TESTS_COLLECTION,
    fields: ['title', 'versionId', 'parent', 'status'],
  },
] as const;

type RecordData = Record<string, unknown>;

export type VocabularyPoolReference = {
  poolId: string;
  kind: 'direct' | 'exercise';
  pageIndex?: number;
  pageId?: string;
  pageTitle?: string;
  itemIndex?: number;
  itemId?: string;
  itemTitle?: string;
};

export type VocabularyPoolUsageScan =
  | { status: 'available'; usages: VocabularyPoolUsage[]; documentCount: number }
  | { status: 'unavailable'; message: string; documentCount?: number };

function isRecord(value: unknown): value is RecordData {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function displayName(value: unknown, fallback: string): string {
  return nonBlankString(value) ?? fallback;
}

/**
 * Reads pool references from the actual saved authoring shape. This deliberately
 * does not trust a derived index, so stale copies, recovery writes, and old docs
 * remain visible in the management UI.
 */
export function extractVocabularyPoolReferences(value: unknown): VocabularyPoolReference[] {
  if (!isRecord(value)) return [];

  const references: VocabularyPoolReference[] = [];
  const directPoolIds = new Set(
    [nonBlankString(value.vocabulary_pool), nonBlankString(value.vocabularyPoolId)].filter((poolId): poolId is string =>
      Boolean(poolId)
    )
  );
  directPoolIds.forEach(poolId => references.push({ poolId, kind: 'direct' }));

  if (!Array.isArray(value.pages)) return references;
  value.pages.forEach((page, pageIndex) => {
    if (!isRecord(page) || !Array.isArray(page.items)) return;
    page.items.forEach((item, itemIndex) => {
      if (!isRecord(item) || !isRecord(item.data) || !isRecord(item.data.generatorConfig)) return;
      const generatorConfig = item.data.generatorConfig;
      const poolId = nonBlankString(generatorConfig.poolId);
      if (generatorConfig.wordSource !== 'pool' || !poolId) return;
      references.push({
        poolId,
        kind: 'exercise',
        pageIndex,
        pageId: nonBlankString(page.id),
        pageTitle: nonBlankString(page.title),
        itemIndex,
        itemId: nonBlankString(item.id),
        itemTitle: nonBlankString(item.title),
      });
    });
  });
  return references;
}

function exerciseLabel(reference: VocabularyPoolReference): string {
  const page = reference.pageTitle ?? (reference.pageIndex === undefined ? 'Page' : `Page ${reference.pageIndex + 1}`);
  const exercise =
    reference.itemTitle ?? (reference.itemIndex === undefined ? 'exercise' : `exercise ${reference.itemIndex + 1}`);
  return `${page} → ${exercise}`;
}

function usage(
  poolId: string,
  kind: VocabularyPoolUsageKind,
  sourceId: string,
  reference: VocabularyPoolReference,
  label: string,
  editorUrl?: string
): VocabularyPoolUsage {
  const location =
    reference.kind === 'direct'
      ? 'direct'
      : `${reference.pageId ?? reference.pageIndex}-${reference.itemId ?? reference.itemIndex}`;
  return {
    id: `${kind}:${sourceId}:${location}:${poolId}`,
    poolId,
    kind,
    label,
    ...(editorUrl ? { editorUrl } : {}),
  };
}

type AuthoringDocument = { id: string; data: RecordData };

type ActiveVersionOwner =
  | { kind: 'mock'; title: string; editorUrl: string }
  | { kind: 'test'; title: string; editorUrl: string }
  | { kind: 'orphan'; title: string };

function isTestDocument(document: AuthoringDocument): boolean {
  return document.data.kind === 'test';
}

function rotationContains(document: AuthoringDocument, versionId: string): boolean {
  const rotations = document.data.rotationVersions;
  return (
    Array.isArray(rotations) &&
    rotations.some(reference => isRecord(reference) && nonBlankString(reference.versionId) === versionId)
  );
}

function parentKind(document: AuthoringDocument): string | undefined {
  return isRecord(document.data.parent) ? nonBlankString(document.data.parent.kind) : undefined;
}

function activeVersionOwner(
  version: AuthoringDocument,
  tests: AuthoringDocument[],
  mocks: AuthoringDocument[]
): ActiveVersionOwner {
  const orderedMocks = [...mocks].sort((left, right) => left.id.localeCompare(right.id));
  const activeMock = orderedMocks.find(
    mock => nonBlankString(mock.data.versionId) === version.id && mock.data.status === 'active'
  );
  if (activeMock) {
    return {
      kind: 'mock',
      title: displayName(activeMock.data.title, `Mock ${activeMock.id}`),
      editorUrl: `/admin/mock-tests/${activeMock.id}`,
    };
  }

  const rotationOwner = [...tests]
    .sort((left, right) => left.id.localeCompare(right.id))
    .find(test => rotationContains(test, version.id));
  if (rotationOwner) {
    return {
      kind: 'test',
      title: displayName(rotationOwner.data.title, `Test ${rotationOwner.id}`),
      editorUrl: `/admin/tests/edit/${rotationOwner.id}/versions/${version.id}/edit`,
    };
  }

  const archivedStandaloneMock = orderedMocks.find(
    mock =>
      nonBlankString(mock.data.versionId) === version.id &&
      mock.data.status === 'archived' &&
      parentKind(mock) === 'standalone'
  );
  if (archivedStandaloneMock) {
    return {
      kind: 'mock',
      title: displayName(archivedStandaloneMock.data.title, `Mock ${archivedStandaloneMock.id}`),
      editorUrl: `/admin/mock-tests/${archivedStandaloneMock.id}`,
    };
  }

  return { kind: 'orphan', title: 'Orphaned version' };
}

function appendReferences(
  usages: VocabularyPoolUsage[],
  source: AuthoringDocument,
  references: VocabularyPoolReference[],
  directKind: VocabularyPoolUsageKind,
  exerciseKind: VocabularyPoolUsageKind,
  directLabel: string,
  exerciseLabelPrefix: string,
  editorUrl?: string
) {
  references.forEach(reference => {
    usages.push(
      usage(
        reference.poolId,
        reference.kind === 'direct' ? directKind : exerciseKind,
        source.id,
        reference,
        reference.kind === 'direct' ? directLabel : `${exerciseLabelPrefix} → ${exerciseLabel(reference)}`,
        editorUrl
      )
    );
  });
}

/** Projects the canonical documents into display-safe, per-assignment usages. */
export function projectVocabularyPoolUsages(input: {
  learningUnits: AuthoringDocument[];
  versions: AuthoringDocument[];
  drafts: AuthoringDocument[];
  mocks: AuthoringDocument[];
}): VocabularyPoolUsage[] {
  const usages: VocabularyPoolUsage[] = [];
  const lessons = input.learningUnits.filter(document => isLessonDocumentData(document.data));
  const tests = input.learningUnits.filter(isTestDocument);

  lessons.forEach(lesson => {
    const title = displayName(lesson.data.title, `Lesson ${lesson.id}`);
    appendReferences(
      usages,
      lesson,
      extractVocabularyPoolReferences(lesson.data),
      'lesson',
      'lesson-exercise',
      `Lesson: ${title}`,
      `Lesson: ${title}`,
      `/admin/lessons/edit/${lesson.id}`
    );
  });

  input.versions.forEach(version => {
    const owner = activeVersionOwner(version, tests, input.mocks);
    const versionName = displayName(version.data.name, `Version ${version.id}`);
    const ownerLabel = owner.kind === 'test' ? `Test: ${owner.title}` : `Mock test: ${owner.title}`;
    const prefix = owner.kind === 'orphan' ? `${owner.title}: ${versionName}` : `${ownerLabel} → ${versionName}`;
    appendReferences(
      usages,
      version,
      extractVocabularyPoolReferences(version.data),
      'test-version',
      'test-version-exercise',
      prefix,
      prefix,
      owner.kind === 'orphan' ? undefined : owner.editorUrl
    );
  });

  const testById = new Map(tests.map(test => [test.id, test]));
  input.drafts.forEach(draft => {
    const testId = nonBlankString(draft.data.testId);
    const parent = testId ? testById.get(testId) : undefined;
    const testLabel = parent ? displayName(parent.data.title, `Test ${parent.id}`) : 'Orphaned test';
    const versionName = displayName(draft.data.name, `Draft ${draft.id}`);
    const prefix = `Test draft: ${testLabel} → ${versionName}`;
    appendReferences(
      usages,
      draft,
      extractVocabularyPoolReferences(draft.data),
      'test-version-draft',
      'test-version-draft-exercise',
      prefix,
      prefix,
      parent && testId ? `/admin/tests/edit/${testId}/versions/${draft.id}/edit` : undefined
    );
  });

  return usages.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
}

function countFromSnapshot(snapshot: { data: () => { count?: unknown } }): number {
  const count = snapshot.data().count;
  if (!Number.isSafeInteger(count) || (count as number) < 0) throw new Error('Invalid authoring document count');
  return count as number;
}

async function loadUsageDocuments(
  db: Firestore
): Promise<
  { documents: AuthoringDocument[][]; documentCount: number } | { unavailable: string; documentCount?: number }
> {
  const queries = SCAN_COLLECTIONS.map(collection => db.collection(collection.name));
  const countSnapshots = await Promise.all(queries.map(query => query.count().get()));
  const documentCount = countSnapshots.reduce((total, snapshot) => total + countFromSnapshot(snapshot), 0);
  if (documentCount > MAX_AUTHORING_DOCUMENTS) {
    return {
      unavailable: `Assignment checks are unavailable because there are more than ${MAX_AUTHORING_DOCUMENTS} authoring documents.`,
      documentCount,
    };
  }
  const snapshots = await Promise.all(
    queries.map((query, index) => query.select(...SCAN_COLLECTIONS[index].fields).get())
  );
  const documents = snapshots.map(snapshot =>
    snapshot.docs.map(document => ({ id: document.id, data: document.data() }))
  );
  const loadedDocumentCount = documents.reduce((total, collection) => total + collection.length, 0);
  if (loadedDocumentCount > MAX_AUTHORING_DOCUMENTS) {
    return {
      unavailable: `Assignment checks are unavailable because more than ${MAX_AUTHORING_DOCUMENTS} authoring documents were loaded.`,
      documentCount: loadedDocumentCount,
    };
  }
  return {
    documentCount: loadedDocumentCount,
    documents,
  };
}

function logScan(status: VocabularyPoolUsageScan['status'], durationMs: number, documentCount?: number) {
  console.info('[vocabulary-pool-usage-scan]', { context: 'management', status, documentCount, durationMs });
}

/** Scans the four canonical authoring collections with an explicit size guard. */
export async function scanVocabularyPoolUsages(db: Firestore): Promise<VocabularyPoolUsageScan> {
  const startedAt = Date.now();
  try {
    const loaded = await loadUsageDocuments(db);
    if ('unavailable' in loaded) {
      const result: VocabularyPoolUsageScan = {
        status: 'unavailable',
        message: loaded.unavailable,
        ...(loaded.documentCount === undefined ? {} : { documentCount: loaded.documentCount }),
      };
      logScan(result.status, Date.now() - startedAt, result.documentCount);
      return result;
    }
    const [learningUnits, versions, drafts, mocks] = loaded.documents;
    const result: VocabularyPoolUsageScan = {
      status: 'available',
      documentCount: loaded.documentCount,
      usages: projectVocabularyPoolUsages({ learningUnits, versions, drafts, mocks }),
    };
    logScan(result.status, Date.now() - startedAt, result.documentCount);
    return result;
  } catch (error) {
    console.error('[vocabulary-pool-usage-scan] failed', error);
    const result: VocabularyPoolUsageScan = {
      status: 'unavailable',
      message: 'Assignment checks are temporarily unavailable. Try again shortly.',
    };
    logScan(result.status, Date.now() - startedAt);
    return result;
  }
}
