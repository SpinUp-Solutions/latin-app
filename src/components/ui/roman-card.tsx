import * as React from 'react';
import { cn } from '@/src/lib/utils';

const RomanCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('roman-card', className)} {...props} />
);
RomanCard.displayName = 'RomanCard';

const RomanCardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('roman-card-header', className)} {...props} />
);
RomanCardHeader.displayName = 'RomanCardHeader';

const RomanCardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-4', className)} {...props} />
);
RomanCardContent.displayName = 'RomanCardContent';

export { RomanCard, RomanCardHeader, RomanCardContent };
