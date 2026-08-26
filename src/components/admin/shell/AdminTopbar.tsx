'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight, Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { getAdminBreadcrumbItems } from './breadcrumb-utils';

interface AdminTopbarProps {
  onOpenMenu: () => void;
  appVersion?: string;
}

export function AdminTopbar({ onOpenMenu, appVersion }: AdminTopbarProps) {
  const breadcrumbs = getAdminBreadcrumbItems(usePathname());
  const immediateParent = breadcrumbs.at(-2);
  const backDestination = breadcrumbs.length > 2 && immediateParent?.href ? immediateParent : undefined;

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-border/80 bg-white/90 px-4 backdrop-blur-md sm:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mr-2 h-9 w-9 border border-border/70 bg-white shadow-sm hover:bg-roman-parchment lg:hidden"
        aria-label="Open admin navigation"
        onClick={onOpenMenu}>
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>
      {backDestination && (
        <Button asChild type="button" variant="ghost" size="sm" className="mr-2 shrink-0 gap-1.5 px-2 sm:px-3">
          <Link href={backDestination.href!} aria-label={`Back to ${backDestination.label}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back to {backDestination.label}</span>
          </Link>
        </Button>
      )}
      <ol aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 overflow-hidden text-sm">
        {breadcrumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-roman-stone/60" aria-hidden="true" />}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="truncate text-roman-stone underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-foreground">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
      {appVersion ? (
        <p
          className="ml-auto inline-flex h-7 shrink-0 items-center rounded-md border border-border/70 bg-roman-parchment/90 px-2 font-mono text-[11px] leading-none text-roman-stone"
          aria-label={`App version ${appVersion}`}
          title={`App version ${appVersion}`}>
          v{appVersion}
        </p>
      ) : null}
    </header>
  );
}
