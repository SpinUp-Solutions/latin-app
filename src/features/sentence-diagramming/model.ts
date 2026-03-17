import {
  ANNOTATION_SPECS,
  AnnotationExclusivityGroup,
  AnnotationKind,
  AnnotationSelectionMode,
  COLOR_RESET_KINDS,
  DEFAULT_STUDENT_TOOLS,
  WRAPPER_KINDS,
  normalizeAnnotationTools,
} from './annotation-spec';

export interface DiagramToken {
  id: string;
  text: string;
  index: number;
}

export interface DiagramSpan {
  startTokenIndex: number;
  endTokenIndex: number;
  startCharOffset: number;
  endCharOffset: number;
}

export interface DiagramAnnotation {
  id: string;
  kind: AnnotationKind;
  span: DiagramSpan;
}

export type DiagramDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface SentenceDiagramDocument {
  latin: string;
  translation: string;
  tokens: DiagramToken[];
  solutionAnnotations: DiagramAnnotation[];
  availableStudentTools: AnnotationKind[];
  hints: string[];
  difficulty: DiagramDifficulty;
}

export interface DiagramComparisonResult {
  matched: number;
  expected: number;
  extra: number;
  accuracy: number;
  isComplete: boolean;
  matchedIds: string[];
  missingIds: string[];
  extraIds: string[];
}

export interface ApplyAnnotationResult {
  annotations: DiagramAnnotation[];
  error?: string;
}

const EXCLUSIVE_GROUPS = new Map<AnnotationExclusivityGroup, AnnotationKind[]>();

Object.values(ANNOTATION_SPECS).forEach(spec => {
  if (!spec.exclusivityGroup) {
    return;
  }

  const existing = EXCLUSIVE_GROUPS.get(spec.exclusivityGroup) || [];
  existing.push(spec.kind);
  EXCLUSIVE_GROUPS.set(spec.exclusivityGroup, existing);
});

export const tokenizeDiagramSentence = (latin: string): DiagramToken[] => {
  const matches = latin.match(/\S+/g) || [];

  return matches.map((text, index) => ({
    id: `token-${index}`,
    text,
    index,
  }));
};

export const createEmptySentenceDiagramDocument = (
  latin: string,
  translation: string,
  options?: Partial<Pick<SentenceDiagramDocument, 'difficulty' | 'availableStudentTools' | 'hints'>>
) => {
  const availableStudentTools = normalizeAnnotationTools(options?.availableStudentTools);

  return {
    latin,
    translation,
    tokens: tokenizeDiagramSentence(latin),
    solutionAnnotations: [],
    availableStudentTools: availableStudentTools.length ? availableStudentTools : DEFAULT_STUDENT_TOOLS,
    hints: options?.hints || [],
    difficulty: options?.difficulty || 'beginner',
  };
};

export const getTokenLength = (token: DiagramToken | undefined) => token?.text.length ?? 0;

export const createSpanKey = (span: DiagramSpan) =>
  `${span.startTokenIndex}:${span.startCharOffset}-${span.endTokenIndex}:${span.endCharOffset}`;

export const createAnnotationId = (kind: AnnotationKind, span: DiagramSpan) => `${kind}:${createSpanKey(span)}`;

const comparePoints = (
  first: Pick<DiagramSpan, 'startTokenIndex' | 'startCharOffset'>,
  second: Pick<DiagramSpan, 'startTokenIndex' | 'startCharOffset'>
) => {
  if (first.startTokenIndex !== second.startTokenIndex) {
    return first.startTokenIndex - second.startTokenIndex;
  }

  return first.startCharOffset - second.startCharOffset;
};

const normalizePointOrder = (span: DiagramSpan): DiagramSpan => {
  const start = { startTokenIndex: span.startTokenIndex, startCharOffset: span.startCharOffset };
  const end = { startTokenIndex: span.endTokenIndex, startCharOffset: span.endCharOffset };

  if (comparePoints(start, end) <= 0) {
    return span;
  }

  return {
    startTokenIndex: span.endTokenIndex,
    endTokenIndex: span.startTokenIndex,
    startCharOffset: span.endCharOffset,
    endCharOffset: span.startCharOffset,
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const spansEqual = (first: DiagramSpan, second: DiagramSpan) => createSpanKey(first) === createSpanKey(second);

export const spanContainsSpan = (outer: DiagramSpan, inner: DiagramSpan) => {
  const outerStart = [outer.startTokenIndex, outer.startCharOffset];
  const outerEnd = [outer.endTokenIndex, outer.endCharOffset];
  const innerStart = [inner.startTokenIndex, inner.startCharOffset];
  const innerEnd = [inner.endTokenIndex, inner.endCharOffset];

  return (
    (outerStart[0] < innerStart[0] || (outerStart[0] === innerStart[0] && outerStart[1] <= innerStart[1])) &&
    (outerEnd[0] > innerEnd[0] || (outerEnd[0] === innerEnd[0] && outerEnd[1] >= innerEnd[1]))
  );
};

export const isPartiallyOverlappingSpan = (first: DiagramSpan, second: DiagramSpan) => {
  if (spansEqual(first, second) || spanContainsSpan(first, second) || spanContainsSpan(second, first)) {
    return false;
  }

  const firstStartsBeforeSecond =
    first.startTokenIndex < second.startTokenIndex ||
    (first.startTokenIndex === second.startTokenIndex && first.startCharOffset < second.startCharOffset);
  const firstEndsAfterSecondStarts =
    first.endTokenIndex > second.startTokenIndex ||
    (first.endTokenIndex === second.startTokenIndex && first.endCharOffset > second.startCharOffset);

  const secondStartsBeforeFirst =
    second.startTokenIndex < first.startTokenIndex ||
    (second.startTokenIndex === first.startTokenIndex && second.startCharOffset < first.startCharOffset);
  const secondEndsAfterFirstStarts =
    second.endTokenIndex > first.startTokenIndex ||
    (second.endTokenIndex === first.startTokenIndex && second.endCharOffset > first.startCharOffset);

  return (
    (firstStartsBeforeSecond && firstEndsAfterSecondStarts) || (secondStartsBeforeFirst && secondEndsAfterFirstStarts)
  );
};

export const snapSpanToSelectionMode = (
  span: DiagramSpan,
  tokens: DiagramToken[],
  selectionMode: AnnotationSelectionMode
): DiagramSpan | null => {
  if (!tokens.length) {
    return null;
  }

  const normalized = normalizePointOrder(span);
  const startToken = tokens[normalized.startTokenIndex];
  const endToken = tokens[normalized.endTokenIndex];

  if (!startToken || !endToken) {
    return null;
  }

  const startCharOffset = clamp(normalized.startCharOffset, 0, startToken.text.length);
  const endCharOffset = clamp(normalized.endCharOffset, 0, endToken.text.length);
  const clamped = {
    ...normalized,
    startCharOffset,
    endCharOffset,
  };

  if (selectionMode === 'exact') {
    if (clamped.startTokenIndex !== clamped.endTokenIndex) {
      return null;
    }

    if (clamped.endCharOffset <= clamped.startCharOffset) {
      return null;
    }

    return clamped;
  }

  if (clamped.startTokenIndex > clamped.endTokenIndex) {
    return null;
  }

  return {
    startTokenIndex: clamped.startTokenIndex,
    endTokenIndex: clamped.endTokenIndex,
    startCharOffset: 0,
    endCharOffset: getTokenLength(endToken),
  };
};

export const normalizeDiagramAnnotation = (
  annotation: Omit<DiagramAnnotation, 'id'> | DiagramAnnotation,
  tokens: DiagramToken[]
): DiagramAnnotation | null => {
  const spec = ANNOTATION_SPECS[annotation.kind];

  if (!spec) {
    return null;
  }

  const span = snapSpanToSelectionMode(annotation.span, tokens, spec.selectionMode);

  if (!span) {
    return null;
  }

  return {
    id: createAnnotationId(annotation.kind, span),
    kind: annotation.kind,
    span,
  };
};

export const sortDiagramAnnotations = (annotations: DiagramAnnotation[]) =>
  [...annotations].sort((left, right) => {
    if (left.span.startTokenIndex !== right.span.startTokenIndex) {
      return left.span.startTokenIndex - right.span.startTokenIndex;
    }

    if (left.span.endTokenIndex !== right.span.endTokenIndex) {
      return right.span.endTokenIndex - left.span.endTokenIndex;
    }

    if (left.span.startCharOffset !== right.span.startCharOffset) {
      return left.span.startCharOffset - right.span.startCharOffset;
    }

    if (left.span.endCharOffset !== right.span.endCharOffset) {
      return left.span.endCharOffset - right.span.endCharOffset;
    }

    return left.kind.localeCompare(right.kind);
  });

export const normalizeDiagramAnnotations = (annotations: DiagramAnnotation[], tokens: DiagramToken[]) => {
  const deduped = new Map<string, DiagramAnnotation>();

  annotations.forEach(annotation => {
    const normalized = normalizeDiagramAnnotation(annotation, tokens);

    if (normalized) {
      deduped.set(normalized.id, normalized);
    }
  });

  return sortDiagramAnnotations([...deduped.values()]);
};

export const getSpanText = (tokens: DiagramToken[], span: DiagramSpan) => {
  if (!tokens.length) {
    return '';
  }

  const parts: string[] = [];

  for (let index = span.startTokenIndex; index <= span.endTokenIndex; index += 1) {
    const token = tokens[index];

    if (!token) {
      continue;
    }

    if (index === span.startTokenIndex && index === span.endTokenIndex) {
      parts.push(token.text.slice(span.startCharOffset, span.endCharOffset));
      continue;
    }

    if (index === span.startTokenIndex) {
      parts.push(token.text.slice(span.startCharOffset));
      continue;
    }

    if (index === span.endTokenIndex) {
      parts.push(token.text.slice(0, span.endCharOffset));
      continue;
    }

    parts.push(token.text);
  }

  return parts.join(' ');
};

const annotationMatchesKindGroup = (annotation: DiagramAnnotation, group: AnnotationExclusivityGroup) => {
  const kinds = EXCLUSIVE_GROUPS.get(group) || [];
  return kinds.includes(annotation.kind);
};

const isWrapperAnnotation = (annotation: DiagramAnnotation) => WRAPPER_KINDS.includes(annotation.kind);

export const applyDiagramAnnotation = ({
  annotations,
  kind,
  span,
  tokens,
}: {
  annotations: DiagramAnnotation[];
  kind: AnnotationKind;
  span: DiagramSpan;
  tokens: DiagramToken[];
}): ApplyAnnotationResult => {
  const spec = ANNOTATION_SPECS[kind];

  if (!spec) {
    return {
      annotations,
      error: 'This annotation tool is not available.',
    };
  }

  const candidate = normalizeDiagramAnnotation(
    {
      id: '',
      kind,
      span,
    },
    tokens
  );

  if (!candidate) {
    return {
      annotations,
      error:
        spec.selectionMode === 'exact'
          ? 'Select exact ending letters inside a single token for this tool.'
          : 'Select one or more tokens before applying this annotation.',
    };
  }

  const existingSameAnnotation = annotations.find(annotation => annotation.id === candidate.id);

  if (existingSameAnnotation) {
    return {
      annotations: normalizeDiagramAnnotations(
        annotations.filter(annotation => annotation.id !== candidate.id),
        tokens
      ),
    };
  }

  if (spec.isWrapper) {
    const overlappingWrapper = annotations.find(
      annotation => isWrapperAnnotation(annotation) && isPartiallyOverlappingSpan(annotation.span, candidate.span)
    );

    if (overlappingWrapper) {
      return {
        annotations,
        error: 'Wrappers can be disjoint, identical, or nested. Crossing spans are not allowed.',
      };
    }
  }

  const nextAnnotations = annotations.filter(annotation => {
    if (!spec.exclusivityGroup) {
      return true;
    }

    if (!annotationMatchesKindGroup(annotation, spec.exclusivityGroup)) {
      return true;
    }

    return !spansEqual(annotation.span, candidate.span);
  });

  return {
    annotations: normalizeDiagramAnnotations([...nextAnnotations, candidate], tokens),
  };
};

export const clearDiagramAnnotations = () => [] as DiagramAnnotation[];

export const resetDiagramColorAnnotations = (annotations: DiagramAnnotation[], tokens: DiagramToken[]) =>
  normalizeDiagramAnnotations(
    annotations.filter(annotation => !COLOR_RESET_KINDS.includes(annotation.kind)),
    tokens
  );

export const compareDiagramAnnotationSets = (
  studentAnnotations: DiagramAnnotation[],
  solutionAnnotations: DiagramAnnotation[],
  tokens: DiagramToken[]
): DiagramComparisonResult => {
  const normalizedStudent = normalizeDiagramAnnotations(studentAnnotations, tokens);
  const normalizedSolution = normalizeDiagramAnnotations(solutionAnnotations, tokens);
  const solutionIds = new Set(normalizedSolution.map(annotation => annotation.id));
  const studentIds = new Set(normalizedStudent.map(annotation => annotation.id));
  const matchedIds = normalizedStudent
    .filter(annotation => solutionIds.has(annotation.id))
    .map(annotation => annotation.id);
  const missingIds = normalizedSolution
    .filter(annotation => !studentIds.has(annotation.id))
    .map(annotation => annotation.id);
  const extraIds = normalizedStudent
    .filter(annotation => !solutionIds.has(annotation.id))
    .map(annotation => annotation.id);
  const matched = matchedIds.length;
  const expected = normalizedSolution.length;
  const extra = extraIds.length;

  return {
    matched,
    expected,
    extra,
    accuracy: expected === 0 ? (extra === 0 ? 100 : 0) : (matched / expected) * 100,
    isComplete: matched === expected && extra === 0,
    matchedIds,
    missingIds,
    extraIds,
  };
};
