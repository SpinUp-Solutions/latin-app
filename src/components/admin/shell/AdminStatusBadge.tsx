import type { ReactNode } from 'react';
import { Badge } from '@/src/components/ui/badge';
import { cn } from '@/src/lib/utils';

export type AdminStatusTone = 'neutral' | 'success' | 'warning' | 'danger';

interface AdminStatusBadgeProps {
  tone: AdminStatusTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<AdminStatusTone, string> = {
  neutral: 'border-border bg-roman-parchment text-foreground',
  success: 'border-roman-green/25 bg-roman-green/10 text-roman-green',
  warning: 'border-roman-gold/35 bg-roman-gold/15 text-foreground',
  danger: 'border-primary/25 bg-primary/10 text-primary',
};

export function AdminStatusBadge({ tone, children, className }: AdminStatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(toneClasses[tone], className)}>
      {children}
    </Badge>
  );
}
