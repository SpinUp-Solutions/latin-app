import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TooltipContent } from './tooltip-content';
import { TooltipData, MousePosition } from '@/src/types/tooltip';
import { calculateTooltipPosition, extractTooltipDataFromElement } from '@/src/utils/tooltipUtils';

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
      <TooltipContent {...data} className="shadow-lg" />

      <div
        className={`absolute w-2 h-2 rotate-45 left-1/2 transform -translate-x-1/2 ${
          isBelow
            ? 'top-0 -translate-y-1/2 bg-roman-parchment border-l border-t border-roman-terracotta/20'
            : 'top-full -translate-y-1/2 bg-white border-b border-r border-roman-terracotta/20'
        }`}
      />
    </div>
  );
};

interface TooltipContainerProps {
  children: React.ReactNode;
  className?: string;
  onTooltipShow?: (tooltipData: TooltipData) => void;
  onTooltipHide?: () => void;
  onMouseClick?: (e: MouseEvent) => void;
}

export const TooltipContainer: React.FC<TooltipContainerProps> = ({
  children,
  className,
  onTooltipShow,
  onTooltipHide,
  onMouseClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [fixedElementPos, setFixedElementPos] = useState<MousePosition>({ x: 0, y: 0 });
  const hideTimeoutRef = useRef<NodeJS.Timeout>(null);

  const handleMouseOver = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tooltipElement = target.closest('[data-tooltip="true"]');

      if (tooltipElement) {
        const tooltipId = tooltipElement.getAttribute('data-tooltip-id');
        if (!tooltipId || activeTooltip?.id === tooltipId) return;

        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }

        const tooltipData = extractTooltipDataFromElement(tooltipElement);
        if (tooltipData) {
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
    [activeTooltip?.id, onTooltipShow]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!activeTooltip) return;

      const target = event.target as HTMLElement;
      const isOverTooltip = target.closest('[data-tooltip="true"], .tooltip-overlay');

      if (isOverTooltip) {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
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
      onMouseClick?.(e);
    },
    [onMouseClick]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    if (onMouseClick) {
      container.addEventListener('click', handleClick);
    }
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      if (onMouseClick) {
        container.removeEventListener('click', handleClick);
      }
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseOver, handleMouseOut, handleClick, handleMouseMove, onMouseClick]);

  return (
    <>
      <div ref={containerRef} className={className}>
        {children}
      </div>

      {activeTooltip && <TooltipOverlay elementPosition={fixedElementPos} data={activeTooltip.data} />}
    </>
  );
};

export default TooltipContainer;
