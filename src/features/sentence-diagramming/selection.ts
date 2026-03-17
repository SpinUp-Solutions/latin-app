import { ANNOTATION_SPECS, AnnotationKind } from './annotation-spec';
import { DiagramSpan, DiagramToken, getSpanText, snapSpanToSelectionMode } from './model';

export interface DiagramSelection {
  span: DiagramSpan;
  text: string;
}

const TOKEN_INDEX_ATTRIBUTE = 'data-diagram-token-index';

const getTokenElement = (node: Node | null, surface: HTMLElement) => {
  if (!node) {
    return null;
  }

  if (node instanceof HTMLElement) {
    return node.closest<HTMLElement>(`[${TOKEN_INDEX_ATTRIBUTE}]`);
  }

  if (node.parentElement) {
    return node.parentElement.closest<HTMLElement>(`[${TOKEN_INDEX_ATTRIBUTE}]`);
  }

  return surface;
};

const getOffsetWithinToken = (tokenElement: HTMLElement, container: Node, offset: number) => {
  const range = document.createRange();
  range.selectNodeContents(tokenElement);
  range.setEnd(container, offset);
  const tokenLength = tokenElement.textContent?.length ?? 0;
  return Math.min(range.toString().length, tokenLength);
};

const normalizeBoundarySpan = (rawSpan: DiagramSpan, tokens: DiagramToken[]) => {
  let startTokenIndex = rawSpan.startTokenIndex;
  let endTokenIndex = rawSpan.endTokenIndex;
  let startCharOffset = rawSpan.startCharOffset;
  let endCharOffset = rawSpan.endCharOffset;

  const startToken = tokens[startTokenIndex];
  const endToken = tokens[endTokenIndex];

  if (!startToken || !endToken) {
    return null;
  }

  if (startCharOffset >= startToken.text.length && startTokenIndex < tokens.length - 1) {
    startTokenIndex += 1;
    startCharOffset = 0;
  }

  if (endCharOffset === 0 && endTokenIndex > 0) {
    endTokenIndex -= 1;
    endCharOffset = tokens[endTokenIndex]?.text.length ?? 0;
  }

  if (startTokenIndex > endTokenIndex) {
    return null;
  }

  if (startTokenIndex === endTokenIndex && endCharOffset <= startCharOffset) {
    return null;
  }

  return {
    startTokenIndex,
    endTokenIndex,
    startCharOffset,
    endCharOffset,
  };
};

export const getDiagramSelection = (surface: HTMLElement | null, tokens: DiagramToken[]): DiagramSelection | null => {
  if (!surface || !tokens.length) {
    return null;
  }

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) {
    return null;
  }

  const startTokenElement = getTokenElement(range.startContainer, surface);
  const endTokenElement = getTokenElement(range.endContainer, surface);

  if (!startTokenElement || !endTokenElement) {
    return null;
  }

  const startTokenIndex = Number(startTokenElement.getAttribute(TOKEN_INDEX_ATTRIBUTE));
  const endTokenIndex = Number(endTokenElement.getAttribute(TOKEN_INDEX_ATTRIBUTE));

  if (Number.isNaN(startTokenIndex) || Number.isNaN(endTokenIndex)) {
    return null;
  }

  const rawSpan = normalizeBoundarySpan(
    {
      startTokenIndex,
      endTokenIndex,
      startCharOffset: getOffsetWithinToken(startTokenElement, range.startContainer, range.startOffset),
      endCharOffset: getOffsetWithinToken(endTokenElement, range.endContainer, range.endOffset),
    },
    tokens
  );

  if (!rawSpan) {
    return null;
  }

  const text = range.toString().replace(/\s+/g, ' ').trim() || getSpanText(tokens, rawSpan);

  if (!text) {
    return null;
  }

  return {
    span: rawSpan,
    text,
  };
};

export const getSelectionSpanForKind = (
  selection: DiagramSelection | null,
  kind: AnnotationKind,
  tokens: DiagramToken[]
): DiagramSpan | null => {
  if (!selection) {
    return null;
  }

  return snapSpanToSelectionMode(selection.span, tokens, ANNOTATION_SPECS[kind].selectionMode);
};

export const describeSelectionForKind = (
  selection: DiagramSelection | null,
  kind: AnnotationKind,
  tokens: DiagramToken[]
) => {
  const span = getSelectionSpanForKind(selection, kind, tokens);

  if (!span) {
    return null;
  }

  return getSpanText(tokens, span);
};
