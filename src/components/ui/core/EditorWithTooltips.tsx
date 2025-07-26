import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import { useSelector } from 'react-redux';
import { TooltipContent } from './tooltip-content';
import { TooltipData, MousePosition } from '@/src/types/tooltip';
import { calculateTooltipPosition } from '@/src/utils/tooltipUtils';
import { RootState } from '@/src/store';

interface EditorWithTooltipsProps {
  editor: Editor | null;
  className?: string;
  children?: React.ReactNode; // For toolbars, etc.
  onTooltipShow?: (tooltipData: TooltipData) => void;
  onTooltipHide?: () => void;
}

interface ActiveTooltip {
  id: string;
  data: Omit<TooltipData, 'id'>;
}

interface TooltipOverlayProps {
  elementPosition: MousePosition;
  data: Omit<TooltipData, 'id'>;
}

const TooltipOverlay: React.FC<TooltipOverlayProps> = ({ elementPosition, data }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => calculateTooltipPosition(elementPosition, 180));
  const [isBelow, setIsBelow] = useState(false);

  useEffect(() => {
    if (!tooltipRef.current) return;

    const updatePosition = () => {
      const rect = tooltipRef.current?.getBoundingClientRect();
      if (rect?.height) {
        const newPosition = calculateTooltipPosition(elementPosition, rect.height);
        setPosition(newPosition);
        setIsBelow(newPosition.isBelow);
      }
    };

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(tooltipRef.current);
    updatePosition();

    return () => resizeObserver.disconnect();
  }, [elementPosition]);

  return (
    <div
      ref={tooltipRef}
      className="tooltip-overlay fixed z-50 animate-in fade-in-0 zoom-in-95 duration-200 pointer-events-auto"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: isBelow ? 'translateX(-50%)' : 'translateX(-50%) translateY(-100%)',
      }}>
      <TooltipContent {...data} className="bg-white shadow-lg" />

      <div
        className={`absolute w-2 h-2 bg-white border rotate-45 shadow left-1/2 transform -translate-x-1/2 ${
          isBelow ? 'top-0 -translate-y-1/2 border-l border-t' : 'top-full -translate-y-1/2 border-b border-r'
        }`}
      />
    </div>
  );
};

export const EditorWithTooltips: React.FC<EditorWithTooltipsProps> = ({
  editor,
  className,
  children,
  onTooltipShow,
  onTooltipHide,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [fixedElementPos, setFixedElementPos] = useState<MousePosition>({ x: 0, y: 0 });
  const hideTimeoutRef = useRef<NodeJS.Timeout>();
  const tooltips = useSelector((state: RootState) => state.lesson.tooltips);

  const handleMouseOver = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tooltipElement = target.closest('[data-tooltip="true"]');

      if (tooltipElement) {
        const tooltipId = tooltipElement.getAttribute('data-tooltip-id');
        if (!tooltipId || activeTooltip?.id === tooltipId) return;

        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = undefined;
        }

        // Try Redux store first, then fall back to element attributes
        let tooltipData = tooltips[tooltipId];
        if (!tooltipData) {
          // Read data directly from element attributes
          const examples = tooltipElement.getAttribute('examples');
          const principalParts = tooltipElement.getAttribute('principalParts');

          tooltipData = {
            id: tooltipId,
            word: tooltipElement.getAttribute('word') || '',
            translation: tooltipElement.getAttribute('translation') || '',
            pronunciation: tooltipElement.getAttribute('pronunciation') || '',
            partOfSpeech: tooltipElement.getAttribute('partOfSpeech') || '',
            wordType: tooltipElement.getAttribute('wordtype') || '',
            definition: tooltipElement.getAttribute('definition') || '',
            examples: examples ? examples.split(',') : [],
            etymology: tooltipElement.getAttribute('etymology') || '',
            gender: tooltipElement.getAttribute('gender') || '',
            declensionClass: tooltipElement.getAttribute('declensionClass') || '',
            conjugationClass: tooltipElement.getAttribute('conjugationClass') || '',
            grammaticalInfo: tooltipElement.getAttribute('grammaticalInfo') || '',
            principalParts: principalParts ? principalParts.split(',') : [],
          };
        }

        if (tooltipData && (tooltipData.word || tooltipData.translation)) {
          const rect = tooltipElement.getBoundingClientRect();
          setFixedElementPos({
            x: rect.left + rect.width / 2,
            y: rect.top,
          });
          setActiveTooltip({ id: tooltipId, data: tooltipData });
          onTooltipShow?.(tooltipData);
        }
      }
    },
    [activeTooltip?.id, tooltips, onTooltipShow]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!activeTooltip) return;

      const target = event.target as HTMLElement;
      const isOverTooltip = target.closest('[data-tooltip="true"], .tooltip-overlay');

      if (isOverTooltip) {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = undefined;
        }
      } else if (!hideTimeoutRef.current) {
        hideTimeoutRef.current = setTimeout(() => {
          setActiveTooltip(null);
          onTooltipHide?.();
        }, 400);
      }
    },
    [activeTooltip, onTooltipHide]
  );

  const handleMouseOut = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tooltipElement = target.closest('[data-tooltip="true"]');
      if (tooltipElement && !hideTimeoutRef.current) {
        hideTimeoutRef.current = setTimeout(() => {
          setActiveTooltip(null);
          onTooltipHide?.();
        }, 400);
      }
    },
    [onTooltipHide]
  );

  const handleClick = useCallback(
    (e: MouseEvent) => {
      // Always pass click events to the editor, regardless of tooltip
      const editorElement = editorRef.current?.querySelector('.ProseMirror');
      if (editorElement && e.target !== editorElement) {
        // Create a new click event and dispatch it to the editor
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          view: window,
        });
        editorElement.dispatchEvent(clickEvent);
      }
    },
    []
  );

  // Event handler that intercepts all events and routes them appropriately
  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    container.addEventListener('click', handleClick);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      container.removeEventListener('click', handleClick);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseOver, handleMouseOut, handleClick, handleMouseMove, editor]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <>
      {children}
      <div ref={editorRef} className={`relative [&_[data-tooltip='true']]:cursor-help ${className || ''}`}>
        <EditorContent editor={editor} />
      </div>

      {activeTooltip && <TooltipOverlay elementPosition={fixedElementPos} data={activeTooltip.data} />}
    </>
  );
};

export default EditorWithTooltips;