import type { Lesson } from '@/src/types/lesson';
import type { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';
import {
  ANNOTATION_SPECS,
  AnnotationKind,
  DEFAULT_STUDENT_TOOLS,
  normalizeAnnotationTools,
  WRAPPER_KINDS,
} from './annotation-spec';
import {
  canonicalizeDiagramAnnotations,
  createAnnotationId,
  createSpanKey,
  DiagramAnnotation,
  SentenceDiagramDocument,
  tokenizeDiagramSentence,
} from './model';

export type SentenceDiagramValidationCode =
  | 'empty-solution'
  | 'invalid-tokens'
  | 'invalid-kind'
  | 'invalid-span'
  | 'malformed-id'
  | 'duplicate-annotation'
  | 'conflicting-annotation'
  | 'crossing-wrapper'
  | 'unavailable-tool';

export interface SentenceDiagramValidationIssue {
  code: SentenceDiagramValidationCode;
  message: string;
  path: string;
  annotationId?: string;
  pageIndex?: number;
  itemIndex?: number;
  exerciseId?: string;
}

const isAnnotationKind = (value: unknown): value is AnnotationKind =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ANNOTATION_SPECS, value);

const validateAnnotationList = (
  annotations: DiagramAnnotation[],
  tokens: SentenceDiagramDocument['tokens'],
  path: string
) => {
  const issues: SentenceDiagramValidationIssue[] = [];
  const ids = new Set<string>();
  const groupBySpan = new Map<string, Map<string, DiagramAnnotation>>();
  const validatedAnnotations: DiagramAnnotation[] = [];

  annotations.forEach((annotation, index) => {
    const annotationPath = `${path}[${index}]`;
    const kind = annotation?.kind;

    if (!isAnnotationKind(kind)) {
      issues.push({ code: 'invalid-kind', message: `Unknown annotation kind: ${String(kind)}`, path: annotationPath });
      return;
    }

    const span = annotation.span;
    const startToken = tokens[span?.startTokenIndex];
    const endToken = tokens[span?.endTokenIndex];
    const integerFields = span
      ? [span.startTokenIndex, span.endTokenIndex, span.startCharOffset, span.endCharOffset]
      : [];
    const spec = ANNOTATION_SPECS[kind];
    const hasValidSpan =
      Boolean(span) &&
      integerFields.every(Number.isInteger) &&
      Boolean(startToken && endToken) &&
      span.startTokenIndex <= span.endTokenIndex &&
      span.startCharOffset >= 0 &&
      span.endCharOffset > span.startCharOffset &&
      span.startCharOffset <= startToken.text.length &&
      span.endCharOffset <= endToken.text.length &&
      (span.startTokenIndex === span.endTokenIndex ||
        (span.startCharOffset === 0 && span.endCharOffset === endToken.text.length)) &&
      (spec.selectionMode !== 'exact' || span.startTokenIndex === span.endTokenIndex);

    if (!hasValidSpan) {
      issues.push({
        code: 'invalid-span',
        message: `${spec.label} has an invalid token or character span.`,
        path: annotationPath,
        annotationId: annotation.id,
      });
      return;
    }

    validatedAnnotations.push(annotation);

    const canonicalId = createAnnotationId(kind, span);
    if (annotation.id !== canonicalId) {
      issues.push({
        code: 'malformed-id',
        message: `${spec.label} has a malformed ID; expected ${canonicalId}.`,
        path: `${annotationPath}.id`,
        annotationId: annotation.id,
      });
    }

    if (ids.has(annotation.id)) {
      issues.push({
        code: 'duplicate-annotation',
        message: `Duplicate annotation ${annotation.id}.`,
        path: annotationPath,
        annotationId: annotation.id,
      });
    }
    ids.add(annotation.id);

    if (spec.exclusivityGroup) {
      const spanKey = createSpanKey(span);
      const groups = groupBySpan.get(spanKey) || new Map<string, DiagramAnnotation>();
      const existing = groups.get(spec.exclusivityGroup);
      if (existing && existing.kind !== kind) {
        issues.push({
          code: 'conflicting-annotation',
          message: `${spec.label} conflicts with ${ANNOTATION_SPECS[existing.kind].label} on the same span.`,
          path: annotationPath,
          annotationId: annotation.id,
        });
      }
      groups.set(spec.exclusivityGroup, annotation);
      groupBySpan.set(spanKey, groups);
    }
  });

  const wrappers = validatedAnnotations.filter(
    annotation => isAnnotationKind(annotation.kind) && WRAPPER_KINDS.includes(annotation.kind)
  );
  wrappers.forEach((annotation, index) => {
    wrappers.slice(index + 1).forEach(other => {
      const startsInside =
        annotation.span.startTokenIndex < other.span.startTokenIndex &&
        annotation.span.endTokenIndex >= other.span.startTokenIndex;
      const endsOutside = annotation.span.endTokenIndex < other.span.endTokenIndex;
      const reverseStartsInside =
        other.span.startTokenIndex < annotation.span.startTokenIndex &&
        other.span.endTokenIndex >= annotation.span.startTokenIndex;
      const reverseEndsOutside = other.span.endTokenIndex < annotation.span.endTokenIndex;
      if ((startsInside && endsOutside) || (reverseStartsInside && reverseEndsOutside)) {
        issues.push({
          code: 'crossing-wrapper',
          message: 'Wrapper annotations cannot cross; they must be disjoint, identical, or nested.',
          path,
          annotationId: annotation.id,
        });
      }
    });
  });

  return issues;
};

export const validateSentenceDiagramDocument = (document: SentenceDiagramDocument) => {
  const issues: SentenceDiagramValidationIssue[] = [];
  const expectedTokens = tokenizeDiagramSentence(document.latin || '');
  const tokensAreValid =
    Array.isArray(document.tokens) &&
    document.tokens.length === expectedTokens.length &&
    document.tokens.every(
      (token, index) => token.id === `token-${index}` && token.index === index && token.text === expectedTokens[index]?.text
    );

  if (!tokensAreValid) {
    issues.push({
      code: 'invalid-tokens',
      message: 'Stored tokens do not match the Latin sentence. Retokenize the sentence before saving.',
      path: 'data.tokens',
    });
  }

  if (!Array.isArray(document.solutionAnnotations) || document.solutionAnnotations.length === 0) {
    issues.push({ code: 'empty-solution', message: 'Add at least one solution annotation.', path: 'data.solutionAnnotations' });
  } else {
    issues.push(...validateAnnotationList(document.solutionAnnotations, document.tokens || [], 'data.solutionAnnotations'));
  }

  const normalizedTools = normalizeAnnotationTools(document.availableStudentTools);
  const availableTools = new Set(normalizedTools.length ? normalizedTools : DEFAULT_STUDENT_TOOLS);
  document.solutionAnnotations?.forEach((annotation, index) => {
    if (isAnnotationKind(annotation.kind) && !availableTools.has(annotation.kind)) {
      issues.push({
        code: 'unavailable-tool',
        message: `${ANNOTATION_SPECS[annotation.kind].label} is required by the solution but unavailable to students.`,
        path: `data.availableStudentTools`,
        annotationId: annotation.id || `solution-${index}`,
      });
    }
  });

  const hint = document.hint;
  if (hint?.annotations?.length) {
    issues.push(...validateAnnotationList(hint.annotations, hint.tokens || [], 'data.hint.annotations'));
  }
  const explanation = document.explanation;
  if (explanation?.annotations?.length) {
    issues.push(...validateAnnotationList(explanation.annotations, explanation.tokens || [], 'data.explanation.annotations'));
  }

  return issues;
};

export const getSentenceDiagramAnnotationCounts = (document: SentenceDiagramDocument) => ({
  authored: document.solutionAnnotations.length,
  canonical: canonicalizeDiagramAnnotations(document.solutionAnnotations, document.tokens).length,
});

export const validateSentenceDiagramExercise = (exercise: SentenceDiagrammingExercise) =>
  validateSentenceDiagramDocument(exercise.data);

export const validateSentenceDiagramLesson = (lesson: Lesson) =>
  lesson.pages.flatMap((page, pageIndex) =>
    page.items.flatMap((item, itemIndex) => {
      if (item.type !== 'sentence-diagramming') {
        return [];
      }

      return validateSentenceDiagramExercise(item).map(issue => ({
        ...issue,
        path: `pages[${pageIndex}].items[${itemIndex}].${issue.path}`,
        pageIndex,
        itemIndex,
        exerciseId: item.id,
      }));
    })
  );
