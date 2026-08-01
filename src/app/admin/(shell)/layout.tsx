import type { ReactNode } from 'react';
import { AdminShell } from '@/src/components/admin/shell';

export default function AdminShellLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
