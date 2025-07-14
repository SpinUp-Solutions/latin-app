import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { TooltipContent } from './tooltip-content';
import { TooltipData, MousePosition } from '@/src/types/tooltip';
import { calculateTooltipPosition } from '@/src/utils/tooltipUtils';
import { RootState } from '@/src/store';

interface TooltipRendererProps {
  content: string;
  className?: string;
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
  const [tooltipHeight, setTooltipHeight] = useState(180); // Start with estimated height
  const [isBelow, setIsBelow] = useState(false);

  // Calculate position whenever elementPosition or tooltipHeight changes
  const position = useMemo(() => {
    const calculatedPosition = calculateTooltipPosition(elementPosition, tooltipHeight);
    setIsBelow(calculatedPosition.isBelow);
    return calculatedPosition;
  }, [elementPosition, tooltipHeight]);

  useEffect(() => {
    if (!tooltipRef.current) return;

    const updateHeight = () => {
      if (tooltipRef.current) {
        const rect = tooltipRef.current.getBoundingClientRect();
        if (rect.height > 0 && rect.height !== tooltipHeight) {
          setTooltipHeight(rect.height);
        }
      }
    };

    // Set up ResizeObserver to track height changes
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(tooltipRef.current);

    // Initial height check
    updateHeight();

    return () => {
      resizeObserver.disconnect();
    };
  }, [tooltipHeight]);

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

export const TooltipRenderer: React.FC<TooltipRendererProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [fixedElementPos, setFixedElementPos] = useState<MousePosition>({ x: 0, y: 0 });
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

      const elementRect = tooltipElement.getBoundingClientRect();
      const elementPos = {
        x: elementRect.left + elementRect.width / 2,
        y: elementRect.top,
      };
      setFixedElementPos(elementPos);

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
          }, 400);
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

      {activeTooltip && <TooltipOverlay elementPosition={fixedElementPos} data={activeTooltip.data} />}
    </>
  );
};

export default TooltipRenderer;
