import React, { useRef, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { TooltipContent } from './tooltip-content';
import { TooltipData } from '@/src/store/slices/lessonSlice';
import { RootState } from '@/src/store';

interface MousePosition {
  x: number;
  y: number;
}

interface TooltipRendererProps {
  content: string;
  className?: string;
}

interface ActiveTooltip {
  id: string;
  data: Omit<TooltipData, 'id'>;
}

interface TooltipOverlayProps {
  mousePosition: MousePosition;
  data: Omit<TooltipData, 'id'>;
}

const TooltipOverlay: React.FC<TooltipOverlayProps> = ({ mousePosition, data }) => {
  const tooltipWidth = 288;
  const tooltipHeight = 180;
  const offset = 2;
  const margin = 16;

  let x = mousePosition.x;
  let y = mousePosition.y - tooltipHeight - offset;

  if (x + tooltipWidth / 2 > window.innerWidth - margin) {
    x = window.innerWidth - tooltipWidth / 2 - margin;
  }
  if (x - tooltipWidth / 2 < margin) {
    x = tooltipWidth / 2 + margin;
  }
  if (y < margin) {
    y = mousePosition.y + offset;
  }

  return (
    <div
      className="tooltip-overlay fixed z-50 animate-in fade-in-0 zoom-in-95 duration-200 pointer-events-auto"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translateX(-50%)',
      }}>
      <TooltipContent {...data} className="bg-white" />

      <div className="absolute w-2 h-2 bg-white border rotate-45 shadow top-full left-1/2 transform -translate-x-1/2 -translate-y-1/2 border-b border-r" />
    </div>
  );
};

export const TooltipRenderer: React.FC<TooltipRendererProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [fixedMousePos, setFixedMousePos] = useState<MousePosition>({ x: 0, y: 0 });
  const hideTimeoutRef = useRef<NodeJS.Timeout>();
  const tooltips = useSelector((state: RootState) => state.lesson.tooltips);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseEnter = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = undefined;
      }

      const tooltipElement = target.closest('[data-tooltip="true"]') as HTMLElement;
      if (!tooltipElement) return;

      const tooltipId = tooltipElement.getAttribute('data-tooltip-id');
      if (!tooltipId) return;

      if (activeTooltip && activeTooltip.id === tooltipId) {
        return;
      }

      const mousePos = { x: event.clientX, y: event.clientY };
      setFixedMousePos(mousePos);

      const tooltipData = tooltips[tooltipId];
      if (!tooltipData) return;

      setActiveTooltip({ id: tooltipId, data: tooltipData });
    };

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const tooltipElement = target.closest('[data-tooltip="true"]') as HTMLElement;
      const tooltipOverlay = target.closest('.tooltip-overlay') as HTMLElement;

      if ((tooltipElement || tooltipOverlay) && activeTooltip) {
        // Clear any pending hide timeout since we're still over a tooltip element or overlay
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = undefined;
        }
      } else if (activeTooltip && !tooltipElement && !tooltipOverlay) {
        // We're no longer over a tooltip element or overlay, start hide timer
        if (!hideTimeoutRef.current) {
          hideTimeoutRef.current = setTimeout(() => {
            setActiveTooltip(null);
          }, 1000);
        }
      }
    };

    // Use event delegation on container for mouseenter
    container.addEventListener('mouseenter', handleMouseEnter, true);

    // Use global mousemove to detect when we leave tooltip areas
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      container.removeEventListener('mouseenter', handleMouseEnter, true);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [activeTooltip, tooltips]);

  return (
    <>
      <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: content }} />

      {activeTooltip && <TooltipOverlay mousePosition={fixedMousePos} data={activeTooltip.data} />}
    </>
  );
};

export default TooltipRenderer;
