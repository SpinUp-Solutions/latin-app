import React, { useRef, useEffect, useState, useCallback } from 'react';
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

export const TooltipRenderer: React.FC<TooltipRendererProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [fixedElementPos, setFixedElementPos] = useState<MousePosition>({ x: 0, y: 0 });
  const hideTimeoutRef = useRef<NodeJS.Timeout>();
  const tooltips = useSelector((state: RootState) => state.lesson.tooltips);

  const handleMouseEnter = useCallback(
    (event: MouseEvent) => {
      const tooltipElement = (event.target as HTMLElement).closest('[data-tooltip="true"]') as HTMLElement;
      if (!tooltipElement) return;

      const tooltipId = tooltipElement.getAttribute('data-tooltip-id');
      if (!tooltipId || activeTooltip?.id === tooltipId) return;

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = undefined;
      }

      const tooltipData = tooltips[tooltipId];
      if (!tooltipData) return;

      const rect = tooltipElement.getBoundingClientRect();
      setFixedElementPos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      setActiveTooltip({ id: tooltipId, data: tooltipData });
    },
    [activeTooltip?.id, tooltips]
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
        hideTimeoutRef.current = setTimeout(() => setActiveTooltip(null), 400);
      }
    },
    [activeTooltip]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mouseenter', handleMouseEnter, true);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      container.removeEventListener('mouseenter', handleMouseEnter, true);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseEnter, handleMouseMove]);

  return (
    <>
      <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: content }} />

      {activeTooltip && <TooltipOverlay elementPosition={fixedElementPos} data={activeTooltip.data} />}
    </>
  );
};

export default TooltipRenderer;
