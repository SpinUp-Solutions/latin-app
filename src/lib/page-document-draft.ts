import type { Lesson } from '@/src/types/lesson';
import type { Page } from '@/src/types/page';
import type { TestVersion } from '@/src/types/test';
import type { TooltipData } from '@/src/types/tooltip';

export type PageDocumentEditorKind = 'lesson' | 'test-version';

export interface PageDocumentDraft {
  editorKind: PageDocumentEditorKind;
  ownerId: string;
  title: string;
  description: string;
  pages: Page[];
  tooltips: Record<string, TooltipData>;
  sourceLesson?: Lesson;
  sourceVersion?: TestVersion;
}

export function getPageDocumentDraftKey(editorKind: PageDocumentEditorKind, ownerId: string) {
  return `${editorKind}:${ownerId}`;
}

export function lessonToPageDocumentDraft(
  lesson: Lesson,
  tooltips: Record<string, TooltipData> = {}
): PageDocumentDraft {
  return {
    editorKind: 'lesson',
    ownerId: lesson.id,
    title: lesson.title,
    description: lesson.description ?? '',
    pages: lesson.pages,
    tooltips,
    sourceLesson: lesson,
  };
}

export function testVersionToPageDocumentDraft(
  version: TestVersion,
  tooltips: Record<string, TooltipData> = {}
): PageDocumentDraft {
  return {
    editorKind: 'test-version',
    ownerId: version.id,
    title: version.name,
    description: '',
    pages: version.pages,
    tooltips,
    sourceVersion: version,
  };
}

export function pageDocumentDraftToTestVersion(
  draft: PageDocumentDraft,
  summary: Pick<TestVersion, 'totalPages' | 'totalItems' | 'totalExercises' | 'totalPoints'>,
  existing?: Partial<TestVersion>
): TestVersion {
  if (draft.editorKind !== 'test-version') throw new Error('Expected a test-version draft');

  return {
    id: draft.ownerId,
    name: draft.title,
    pages: draft.pages,
    ...summary,
    createdAt: existing?.createdAt,
    createdBy: existing?.createdBy,
    updatedAt: existing?.updatedAt,
    updatedBy: existing?.updatedBy,
  };
}
