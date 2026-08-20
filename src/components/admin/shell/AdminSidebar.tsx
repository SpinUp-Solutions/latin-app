'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Globe,
  Layers3,
  LayoutDashboard,
  LibraryBig,
  Sparkles,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getActiveAdminNavigationHref, type AdminNavigationItem } from './navigation-utils';

interface NavigationEntry extends AdminNavigationItem {
  icon: LucideIcon;
}

interface NavigationGroup {
  label: string;
  items: NavigationEntry[];
}

const navigationGroups: NavigationGroup[] = [
  { label: 'Overview', items: [{ href: '/admin', label: 'Overview', icon: LayoutDashboard }] },
  {
    label: 'Content',
    items: [
      { href: '/admin/lessons/manage', label: 'Lessons', icon: BookOpen },
      { href: '/admin/lessons/live', label: 'Live Lessons', icon: Globe },
      { href: '/admin/practice-categories', label: 'Practice Categories', icon: Tags },
    ],
  },
  {
    label: 'Assessment',
    items: [
      { href: '/admin/tests/manage', label: 'Tests', icon: FileCheck2 },
      { href: '/admin/mock-tests', label: 'Mock Tests', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Vocabulary',
    items: [
      { href: '/admin/vocabulary', label: 'All Words', icon: LibraryBig },
      { href: '/admin/vocabulary/pending', label: 'Pending Review', icon: ClipboardCheck },
      { href: '/admin/vocabulary-pools', label: 'Vocabulary Pools', icon: Layers3 },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/ai-evaluations', label: 'AI Evaluations', icon: Sparkles },
      { href: '/admin/diagramming-attempts', label: 'Diagramming Attempts', icon: ClipboardList },
    ],
  },
];

interface AdminSidebarProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export function AdminSidebar({ onNavigate, collapsed = false, onToggleCollapse, className }: AdminSidebarProps) {
  const pathname = usePathname();
  const allItems = navigationGroups.flatMap(group => group.items);
  const activeHref = getActiveAdminNavigationHref(pathname, allItems);

  return (
    <aside className={cn('relative flex h-full min-h-0 flex-col border-r border-border/80 bg-white', className)}>
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2 border-b border-border/80 px-3',
          collapsed && 'justify-center px-2'
        )}>
        <div
          aria-hidden={collapsed}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden transition-[max-width,opacity,transform] duration-150 ease-out motion-reduce:transition-none',
            collapsed ? 'max-w-0 -translate-x-1 opacity-0' : 'max-w-52 translate-x-0 opacity-100'
          )}>
          <Image
            src="/assets/logos/wakeforest.png"
            alt="Wake Forest University"
            width={64}
            height={40}
            className="h-auto w-11 shrink-0"
            priority
          />
          <div className="min-w-0 whitespace-nowrap">
            <p className="truncate font-serif text-base leading-tight">Administration</p>
            <p className="mt-0.5 truncate text-xs text-roman-stone">Wake Forest Latin</p>
          </div>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar'}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-roman-stone transition-[background-color,color] duration-150 hover:bg-primary/[0.08] hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60">
            <ChevronLeft
              className="h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none"
              style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      <nav
        aria-label="Admin"
        className={cn(
          'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2 [scrollbar-width:thin]',
          collapsed && 'px-2'
        )}>
        {navigationGroups.map(group => (
          <div key={group.label} className="mb-2 last:mb-0">
            <p
              aria-hidden={collapsed}
              className={cn(
                'mb-1 max-h-5 overflow-hidden whitespace-nowrap px-3 font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-roman-stone transition-[max-height,margin,opacity] duration-150 motion-reduce:transition-none',
                collapsed && 'mb-0 max-h-0 opacity-0'
              )}>
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;
                return (
                  <li key={item.href}>
                    {item.disabled ? (
                      <div
                        aria-disabled="true"
                        title={collapsed ? `${item.label} (WIP)` : undefined}
                        className={cn(
                          'group/link flex min-h-9 cursor-not-allowed items-center gap-2 rounded-r-lg border-l-2 border-transparent px-3 py-1.5 text-sm text-foreground/35',
                          collapsed && 'justify-center gap-0 rounded-lg border-l-0 px-2'
                        )}>
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate whitespace-nowrap transition-[max-width,opacity,transform] duration-150 ease-out motion-reduce:transition-none',
                            collapsed ? 'max-w-0 -translate-x-1 opacity-0' : 'max-w-48 translate-x-0 opacity-100'
                          )}>
                          {item.label}
                        </span>
                        {!collapsed && (
                          <span className="shrink-0 rounded-full bg-foreground/[0.07] px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-foreground/45">
                            WIP
                          </span>
                        )}
                      </div>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={isActive ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'group/link flex min-h-9 items-center gap-2 rounded-r-lg border-l-2 px-3 py-1.5 text-sm transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          collapsed && 'justify-center gap-0 rounded-lg border-l-0 px-2',
                          isActive
                            ? 'border-primary bg-primary/[0.09] font-medium text-primary'
                            : 'border-transparent text-foreground/70 hover:bg-roman-parchment/80 hover:text-foreground'
                        )}>
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate whitespace-nowrap transition-[max-width,opacity,transform] duration-150 ease-out motion-reduce:transition-none',
                            collapsed ? 'max-w-0 -translate-x-1 opacity-0' : 'max-w-48 translate-x-0 opacity-100'
                          )}>
                          {item.label}
                        </span>
                        {isActive && !collapsed && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-border/80 p-2.5', collapsed && 'p-2')}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          title={collapsed ? 'Back to Dashboard' : undefined}
          className={cn(
            'flex min-h-10 items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-sm text-foreground/70 transition-[background-color,color] duration-150 hover:bg-roman-parchment/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'justify-center gap-0 px-2'
          )}>
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span
            className={cn(
              'min-w-0 flex-1 truncate whitespace-nowrap transition-[max-width,opacity,transform] duration-150 ease-out motion-reduce:transition-none',
              collapsed ? 'max-w-0 -translate-x-1 opacity-0' : 'max-w-48 translate-x-0 opacity-100'
            )}>
            Back to Dashboard
          </span>
        </Link>
      </div>
    </aside>
  );
}
