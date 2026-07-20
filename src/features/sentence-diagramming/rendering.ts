import { ANNOTATION_SPECS, AnnotationKind } from './annotation-spec';
import { DiagramAnnotation, DiagramToken } from './model';

export interface DiagramTextSegment {
  key: string;
  text: string;
  underlineExact: boolean;
  italicExact: boolean;
}

export interface DiagramTokenRenderState {
  token: DiagramToken;
  annotations: DiagramAnnotation[];
  segments: DiagramTextSegment[];
  className: string;
}

export interface DiagramTokenNode {
  type: 'token';
  tokenIndex: number;
}

export interface DiagramWrapperNode {
  type: 'wrapper';
  annotation: DiagramAnnotation;
  children: DiagramRenderNode[];
}

export type DiagramRenderNode = DiagramTokenNode | DiagramWrapperNode;

const CASE_UNDERLINE_CLASS_BY_KIND: Partial<Record<AnnotationKind, string>> = {
  nominative: 'sentence-diagram-underline-single',
  accusative: 'sentence-diagram-underline-double',
  'predicate-nominative': 'sentence-diagram-underline-squiggle',
  'predicate-accusative': 'sentence-diagram-underline-double-squiggle',
};

const TOKEN_COLOR_PRIORITY: AnnotationKind[] = [
  'passive-periphrastic',
  'special-plus-dative',
  'special-intransitive',
  'special-plus-ablative',
  'passive',
  'dative',
  'ablative',
];

const TOKEN_COLOR_SET = new Set(TOKEN_COLOR_PRIORITY);

const isMoreSpecific = (a: DiagramAnnotation, b: DiagramAnnotation) => {
  const aLen = a.span.endTokenIndex - a.span.startTokenIndex;
  const bLen = b.span.endTokenIndex - b.span.startTokenIndex;

  if (aLen !== bLen) return aLen < bLen;
  if (a.span.startTokenIndex !== b.span.startTokenIndex) return a.span.startTokenIndex > b.span.startTokenIndex;
  return a.kind < b.kind;
};

const pickMostSpecific = (annotations: DiagramAnnotation[]) =>
  annotations.reduce<DiagramAnnotation | undefined>(
    (best, curr) => (!best || isMoreSpecific(curr, best) ? curr : best),
    undefined
  );

const coversToken = (annotation: DiagramAnnotation, tokenIndex: number) =>
  annotation.span.startTokenIndex <= tokenIndex && annotation.span.endTokenIndex >= tokenIndex;

const isWrapperAnnotation = (annotation: DiagramAnnotation) => ANNOTATION_SPECS[annotation.kind].isWrapper;

const getTokenToneClass = (annotations: DiagramAnnotation[]) => {
  const winner = [...annotations]
    .filter(annotation => TOKEN_COLOR_SET.has(annotation.kind))
    .sort((left, right) => {
      const leftPriority = TOKEN_COLOR_PRIORITY.indexOf(left.kind);
      const rightPriority = TOKEN_COLOR_PRIORITY.indexOf(right.kind);

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftLength = left.span.endTokenIndex - left.span.startTokenIndex;
      const rightLength = right.span.endTokenIndex - right.span.startTokenIndex;

      return leftLength - rightLength;
    })[0];

  if (!winner) {
    return '';
  }

  switch (winner.kind) {
    case 'passive-periphrastic':
    case 'special-plus-dative':
    case 'special-intransitive':
      return 'text-red-600';
    case 'special-plus-ablative':
    case 'passive':
      return 'text-blue-600';
    case 'dative':
      return 'text-orange-600';
    case 'ablative':
      return 'text-emerald-600';
    default:
      return '';
  }
};

const getTokenClassName = (annotations: DiagramAnnotation[], allAnnotations?: DiagramAnnotation[]) => {
  const classNames = ['sentence-diagram-token-text'];
  const underlineAnnotation = pickMostSpecific(
    annotations.filter(annotation => annotation.kind in CASE_UNDERLINE_CLASS_BY_KIND)
  );
  const underlineClass = underlineAnnotation ? CASE_UNDERLINE_CLASS_BY_KIND[underlineAnnotation.kind] : undefined;

  if (underlineClass) {
    classNames.push(underlineClass);
  }

  if (annotations.some(annotation => annotation.kind === 'active' || annotation.kind === 'deponent')) {
    classNames.push('font-bold');
  }

  if (annotations.some(annotation => annotation.kind === 'genitive')) {
    classNames.push('uppercase tracking-[0.08em]');
  }

  if (annotations.some(annotation => annotation.kind === 'locative')) {
    classNames.push('font-semibold');
  }

  if (annotations.some(annotation => annotation.kind === 'vocative')) {
    classNames.push('line-through');
  }

  const toneClass = getTokenToneClass(allAnnotations ?? annotations);

  if (toneClass) {
    classNames.push(toneClass);
  }

  return classNames.join(' ');
};

const buildSegmentsForToken = (token: DiagramToken, annotations: DiagramAnnotation[]) => {
  const personAnnotations = annotations.filter(
    annotation => annotation.kind.startsWith('person-') && annotation.span.startTokenIndex === token.index
  );
  const particleAnnotations = annotations.filter(
    annotation => annotation.kind === 'particle' && annotation.span.startTokenIndex === token.index
  );
  const exactAnnotations = [...personAnnotations, ...particleAnnotations];

  if (!exactAnnotations.length) {
    return [
      {
        key: `${token.id}-segment-0`,
        text: token.text,
        underlineExact: false,
        italicExact: false,
      },
    ];
  }

  const breakpoints = new Set<number>([0, token.text.length]);
  exactAnnotations.forEach(annotation => {
    breakpoints.add(annotation.span.startCharOffset);
    breakpoints.add(annotation.span.endCharOffset);
  });

  const orderedBreakpoints = [...breakpoints].sort((left, right) => left - right);
  const segments: DiagramTextSegment[] = [];

  for (let index = 0; index < orderedBreakpoints.length - 1; index += 1) {
    const start = orderedBreakpoints[index];
    const end = orderedBreakpoints[index + 1];
    const text = token.text.slice(start, end);

    if (!text) {
      continue;
    }

    const underlineExact = personAnnotations.some(
      annotation => annotation.span.startCharOffset <= start && annotation.span.endCharOffset >= end
    );
    const italicExact = particleAnnotations.some(
      annotation => annotation.span.startCharOffset <= start && annotation.span.endCharOffset >= end
    );

    segments.push({
      key: `${token.id}-segment-${start}-${end}`,
      text,
      underlineExact,
      italicExact,
    });
  }

  return segments;
};

export const buildTokenRenderState = (
  token: DiagramToken,
  annotations: DiagramAnnotation[]
): DiagramTokenRenderState => {
  const tokenAnnotations: DiagramAnnotation[] = [];
  const allCoveringAnnotations: DiagramAnnotation[] = [];

  for (const annotation of annotations) {
    if (coversToken(annotation, token.index)) {
      allCoveringAnnotations.push(annotation);

      if (!isWrapperAnnotation(annotation)) {
        tokenAnnotations.push(annotation);
      }
    }
  }

  return {
    token,
    annotations: tokenAnnotations,
    segments: buildSegmentsForToken(token, tokenAnnotations),
    className: getTokenClassName(tokenAnnotations, allCoveringAnnotations),
  };
};

const sortWrappers = (annotations: DiagramAnnotation[]) =>
  [...annotations].sort((left, right) => {
    if (left.span.startTokenIndex !== right.span.startTokenIndex) {
      return left.span.startTokenIndex - right.span.startTokenIndex;
    }

    if (left.span.endTokenIndex !== right.span.endTokenIndex) {
      return right.span.endTokenIndex - left.span.endTokenIndex;
    }

    return (ANNOTATION_SPECS[left.kind].wrapperPriority || 0) - (ANNOTATION_SPECS[right.kind].wrapperPriority || 0);
  });

const nestWrappers = (annotations: DiagramAnnotation[], children: DiagramRenderNode[]) =>
  sortWrappers(annotations)
    .reverse()
    .reduce<DiagramRenderNode[]>(
      (currentChildren, annotation) => [
        {
          type: 'wrapper',
          annotation,
          children: currentChildren,
        },
      ],
      children
    );

const buildNodesForRange = (
  startTokenIndex: number,
  endTokenIndex: number,
  wrappers: DiagramAnnotation[]
): DiagramRenderNode[] => {
  const nodes: DiagramRenderNode[] = [];
  let cursor = startTokenIndex;

  while (cursor <= endTokenIndex) {
    const startingWrappers = wrappers.filter(annotation => annotation.span.startTokenIndex === cursor);

    if (!startingWrappers.length) {
      nodes.push({
        type: 'token',
        tokenIndex: cursor,
      });
      cursor += 1;
      continue;
    }

    const outerEnd = Math.max(...startingWrappers.map(annotation => annotation.span.endTokenIndex));
    const sameSpanWrappers = startingWrappers.filter(annotation => annotation.span.endTokenIndex === outerEnd);
    const nestedWrappers = wrappers.filter(
      annotation =>
        !sameSpanWrappers.includes(annotation) &&
        annotation.span.startTokenIndex >= cursor &&
        annotation.span.endTokenIndex <= outerEnd
    );
    const innerNodes = buildNodesForRange(cursor, outerEnd, nestedWrappers);
    nodes.push(...nestWrappers(sameSpanWrappers, innerNodes));
    cursor = outerEnd + 1;
  }

  return nodes;
};

export const buildDiagramRenderTree = (tokens: DiagramToken[], annotations: DiagramAnnotation[]) => {
  if (!tokens.length) {
    return [] as DiagramRenderNode[];
  }

  const wrappers = sortWrappers(annotations.filter(isWrapperAnnotation));
  return buildNodesForRange(0, tokens.length - 1, wrappers);
};
