import * as React from 'react';
import { cn } from '@/src/lib/utils';

const RomanCardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('roman-card-header', className)} {...props} />
);
RomanCardHeader.displayName = 'RomanCardHeader';

export { RomanCardHeader };
