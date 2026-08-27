import type { ReactNode } from 'react';
import { AdminShell } from '@/src/components/admin/shell';
import { version as appVersion } from '@/package.json';

export default function AdminShellLayout({ children }: { children: ReactNode }) {
  return <AdminShell appVersion={appVersion}>{children}</AdminShell>;
}
