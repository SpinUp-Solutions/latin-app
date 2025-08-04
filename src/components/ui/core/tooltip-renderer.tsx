import React from 'react';
import { TooltipContainer } from './TooltipContainer';
import { TooltipData } from '@/src/types/tooltip';

interface TooltipRendererProps {
  content: string;
  className?: string;
  onTooltipShow?: (tooltipData: TooltipData) => void;
  onTooltipHide?: () => void;
}

export const TooltipRenderer: React.FC<TooltipRendererProps> = ({
  content,
  className,
  onTooltipShow,
  onTooltipHide,
}) => {
  return (
    <TooltipContainer className={className} onTooltipShow={onTooltipShow} onTooltipHide={onTooltipHide}>
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </TooltipContainer>
  );
};

export default TooltipRenderer;
