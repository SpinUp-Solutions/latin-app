import * as React from 'react';
import { cn } from '@/src/lib/utils';

const RomanCardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-4', className)} {...props} />
);
RomanCardContent.displayName = 'RomanCardContent';

export { RomanCardContent };
