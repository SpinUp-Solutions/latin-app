import * as React from 'react';
import { cn } from '@/src/lib/utils';
import { RomanCardContent } from './roman-card-content';
import { RomanCardHeader } from './roman-card-header';

const RomanCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('roman-card', className)} {...props} />
);
RomanCard.displayName = 'RomanCard';

export { RomanCard, RomanCardHeader, RomanCardContent };
