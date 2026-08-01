import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface AdminEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function AdminEmptyState({ icon: Icon, title, description, action, className }: AdminEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className ?? ''}`.trim()}>
      <Icon className="h-10 w-10 text-roman-stone/50" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-serif">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-roman-stone">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
