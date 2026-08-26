'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/src/components/ui/sheet';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';

const ADMIN_SIDEBAR_COLLAPSE_KEY = 'admin-sidebar-collapse';

export function AdminShell({ children, appVersion }: { children: ReactNode; appVersion?: string }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      setDesktopSidebarCollapsed(sessionStorage.getItem(ADMIN_SIDEBAR_COLLAPSE_KEY) === 'true');
    } catch {
      // Storage access is optional; keep the expanded default when unavailable.
    }
  }, []);

  const toggleDesktopSidebar = () => {
    setDesktopSidebarCollapsed(current => {
      const next = !current;
      try {
        sessionStorage.setItem(ADMIN_SIDEBAR_COLLAPSE_KEY, String(next));
      } catch {
        // Storage access is optional; the in-memory state still works.
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-roman-marble">
      <div
        className={`relative hidden shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block ${
          desktopSidebarCollapsed ? 'w-16' : 'w-64'
        }`}>
        <AdminSidebar collapsed={desktopSidebarCollapsed} onToggleCollapse={toggleDesktopSidebar} />
      </div>
      <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <SheetContent side="left" className="w-72 max-w-[88vw] p-0 lg:hidden">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <SheetDescription className="sr-only">Navigate between administration tools.</SheetDescription>
          <AdminSidebar onNavigate={() => setMobileNavigationOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AdminTopbar appVersion={appVersion} onOpenMenu={() => setMobileNavigationOpen(true)} />
        {children}
      </div>
    </div>
  );
}
