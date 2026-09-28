import React from 'react';
import { TooltipContainer } from './TooltipContainer';

export const TooltipRenderer: React.FC<{ content: string; className?: string }> = ({ content, className }) => (
  <TooltipContainer className={className}>
    <div dangerouslySetInnerHTML={{ __html: content }} />
  </TooltipContainer>
);
