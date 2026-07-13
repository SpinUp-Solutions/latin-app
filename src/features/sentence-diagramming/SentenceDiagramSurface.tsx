import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ANNOTATION_SPECS, AnnotationKind } from './annotation-spec';
import { DiagramAnnotation, DiagramToken, getSpanText } from './model';
import { buildDiagramRenderTree, buildTokenRenderState, DiagramRenderNode } from './rendering';
import { DiagramSelection, getDiagramSelection } from './selection';
import { cn } from '@/src/lib/utils';

interface SentenceDiagramSurfaceProps {
  tokens: DiagramToken[];
  annotations: DiagramAnnotation[];
  selection: DiagramSelection | null;
  onSelectionChange: (selection: DiagramSelection | null) => void;
  message?: string | null;
  disabled?: boolean;
  className?: string;
  resetKey?: number;
}

const segmentOverlapsSelection = (
  tokenIndex: number,
  segmentStart: number,
  segmentEnd: number,
  selection: DiagramSelection | null,
  tokenLength: number
) => {
  if (!selection) {
    return false;
  }

  if (tokenIndex < selection.span.startTokenIndex || tokenIndex > selection.span.endTokenIndex) {
    return false;
  }

  const selectionStart = tokenIndex === selection.span.startTokenIndex ? selection.span.startCharOffset : 0;
  const selectionEnd = tokenIndex === selection.span.endTokenIndex ? selection.span.endCharOffset : tokenLength;

  return selectionStart < segmentEnd && selectionEnd > segmentStart;
};

const wrapperClassByKind: Partial<Record<AnnotationKind, string>> = {
  'subordinate-clause': 'sentence-diagram-shell-boundary',
  'prepositional-phrase': 'sentence-diagram-shell-boundary',
  'participial-phrase': 'sentence-diagram-shell sentence-diagram-shell-box',
  'ablative-absolute': 'sentence-diagram-shell sentence-diagram-shell-box',
  'passive-periphrastic': 'sentence-diagram-shell sentence-diagram-shell-circle',
  verb: 'sentence-diagram-shell sentence-diagram-shell-circle',
  infinitive: 'sentence-diagram-shell sentence-diagram-shell-double-circle',
  participle: 'sentence-diagram-shell sentence-diagram-shell-box',
};

const boundaryToneClassByKind: Partial<Record<AnnotationKind, string>> = {
  'subordinate-clause': 'text-blue-700',
  'prepositional-phrase': 'text-amber-700',
};

const boundarySymbolByKind: Partial<Record<AnnotationKind, [string, string]>> = {
  'subordinate-clause': ['[', ']'],
  'prepositional-phrase': ['(', ')'],
};

const TOKEN_INDEX_ATTR = 'data-diagram-token-index';

const getTokenIndexFromEvent = (event: React.MouseEvent): number | null => {
  const target = event.target as HTMLElement;
  const tokenEl = target.closest?.(`[${TOKEN_INDEX_ATTR}]`);

  if (!tokenEl) {
    return null;
  }

  const index = Number(tokenEl.getAttribute(TOKEN_INDEX_ATTR));
  return Number.isNaN(index) ? null : index;
};

const getTokenTooltip = (annotations: DiagramAnnotation[], tokenIndex: number): string => {
  const labels = annotations
    .filter(a => a.span.startTokenIndex <= tokenIndex && a.span.endTokenIndex >= tokenIndex)
    .map(a => ANNOTATION_SPECS[a.kind].label);

  return labels.length ? labels.join(', ') : '';
};

export const SentenceDiagramSurface: React.FC<SentenceDiagramSurfaceProps> = ({
  tokens,
  annotations,
  selection,
  onSelectionChange,
  message,
  disabled = false,
  className,
  resetKey,
}) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const anchorTokenRef = useRef<number | null>(null);
  const tokenStateByIndex = useMemo(
    () => new Map(tokens.map(token => [token.index, buildTokenRenderState(token, annotations)])),
    [annotations, tokens]
  );
  const renderTree = useMemo(() => buildDiagramRenderTree(tokens, annotations), [annotations, tokens]);

  useEffect(() => {
    anchorTokenRef.current = null;
    window.getSelection()?.removeAllRanges();
  }, [resetKey]);

  const selectTokenRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const from = Math.min(startIndex, endIndex);
      const to = Math.max(startIndex, endIndex);
      const startToken = tokens[from];
      const endToken = tokens[to];

      if (!startToken || !endToken) {
        return;
      }

      const span = {
        startTokenIndex: from,
        endTokenIndex: to,
        startCharOffset: 0,
        endCharOffset: endToken.text.length,
      };

      onSelectionChange({
        span,
        text: getSpanText(tokens, span),
      });
    },
    [onSelectionChange, tokens]
  );

  const handleMouseUp = useCallback(
    (event: React.MouseEvent) => {
      if (disabled) {
        return;
      }

      const nativeSelection = window.getSelection();

      if (nativeSelection && !nativeSelection.isCollapsed && surfaceRef.current?.contains(nativeSelection.anchorNode)) {
        requestAnimationFrame(() => {
          onSelectionChange(getDiagramSelection(surfaceRef.current, tokens));
        });

        const anchorEl =
          (nativeSelection.anchorNode as HTMLElement)?.closest?.(`[${TOKEN_INDEX_ATTR}]`) ??
          nativeSelection.anchorNode?.parentElement?.closest?.(`[${TOKEN_INDEX_ATTR}]`);

        if (anchorEl) {
          anchorTokenRef.current = Number(anchorEl.getAttribute(TOKEN_INDEX_ATTR));
        }

        return;
      }

      const clickedIndex = getTokenIndexFromEvent(event);

      if (clickedIndex === null) {
        onSelectionChange(null);
        anchorTokenRef.current = null;
        return;
      }

      if (event.shiftKey && anchorTokenRef.current !== null) {
        selectTokenRange(anchorTokenRef.current, clickedIndex);
      } else {
        anchorTokenRef.current = clickedIndex;
        selectTokenRange(clickedIndex, clickedIndex);
      }

      nativeSelection?.removeAllRanges();
    },
    [disabled, onSelectionChange, selectTokenRange, tokens]
  );

  const renderNode = useCallback(
    (node: DiagramRenderNode): React.ReactNode => {
      if (node.type === 'token') {
        const tokenState = tokenStateByIndex.get(node.tokenIndex);

        if (!tokenState) {
          return null;
        }

        const tooltip = getTokenTooltip(annotations, tokenState.token.index);
        const personAnnotations = tokenState.annotations
          .filter(annotation => annotation.kind.startsWith('person-'))
          .sort((left, right) => left.span.startCharOffset - right.span.startCharOffset);
        let cursor = 0;

        return (
          <span
            key={tokenState.token.id}
            className={cn('sentence-diagram-token', !disabled && 'cursor-pointer')}
            data-diagram-token-index={tokenState.token.index}
            title={tooltip || undefined}>
            <span className={tokenState.className}>
              {tokenState.segments.map(segment => {
                const start = cursor;
                const end = cursor + segment.text.length;
                const isSelected = segmentOverlapsSelection(
                  tokenState.token.index,
                  start,
                  end,
                  selection,
                  tokenState.token.text.length
                );
                cursor = end;

                return (
                  <span
                    key={segment.key}
                    className={cn(
                      'sentence-diagram-token-segment',
                      segment.underlineExact && 'sentence-diagram-exact-underline',
                      isSelected && 'sentence-diagram-selected-segment'
                    )}>
                    {segment.text}
                  </span>
                );
              })}
            </span>
            {personAnnotations.length > 0 ? (
              <span className="ml-1 inline-flex align-super" aria-label="Person labels">
                {personAnnotations.map(annotation => (
                  <span
                    key={`${annotation.id}-label`}
                    className="rounded border border-stone-300 bg-white px-1 py-0.5 text-[9px] font-semibold leading-none text-stone-700"
                    title={ANNOTATION_SPECS[annotation.kind].label}>
                    {ANNOTATION_SPECS[annotation.kind].shortLabel}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        );
      }

      const boundarySymbols = boundarySymbolByKind[node.annotation.kind];
      const wrapperClassName = wrapperClassByKind[node.annotation.kind];
      const wrapperSpec = ANNOTATION_SPECS[node.annotation.kind];

      return (
        <span key={node.annotation.id} className="sentence-diagram-wrapper">
          {boundarySymbols ? (
            <span className={cn('sentence-diagram-boundary', boundaryToneClassByKind[node.annotation.kind])}>
              {boundarySymbols[0]}
            </span>
          ) : null}
          <span
            className={cn(
              'sentence-diagram-wrapper-inner',
              wrapperClassName,
              wrapperSpec.wrapperVisual === 'box' && 'bg-amber-50/75'
            )}>
            {node.children.map(child => renderNode(child))}
          </span>
          {boundarySymbols ? (
            <span className={cn('sentence-diagram-boundary', boundaryToneClassByKind[node.annotation.kind])}>
              {boundarySymbols[1]}
            </span>
          ) : null}
        </span>
      );
    },
    [annotations, disabled, selection, tokenStateByIndex]
  );

  return (
    <div className={cn('rounded-2xl border border-stone-200 bg-stone-50 p-4', className)}>
      <div
        ref={surfaceRef}
        className={cn('sentence-diagram-flow', disabled && 'opacity-80')}
        onMouseUp={handleMouseUp}
        role="presentation">
        {renderTree.map(node => renderNode(node))}
      </div>

      {message ? (
        <div className="mt-2 text-xs">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">{message}</span>
        </div>
      ) : null}
    </div>
  );
};

export default SentenceDiagramSurface;
