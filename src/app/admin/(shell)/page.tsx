'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  LibraryBig,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminIconChip, AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { Button } from '@/src/components/ui/button';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';

interface DashboardCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  children: ReactNode;
}

function DashboardCard({ icon: Icon, title, description, primaryAction, children }: DashboardCardProps) {
  return (
    <RomanCard className="group border-border/80 transition-[transform,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none sm:hover:-translate-y-0.5 sm:hover:border-primary/20 sm:hover:shadow-md">
      <RomanCardContent className="flex h-full flex-col p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <AdminIconChip icon={Icon} />
          <div className="min-w-0">
            <h2 className="font-serif text-lg leading-tight">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-roman-stone">{description}</p>
          </div>
        </div>
        <div className="space-y-1">{children}</div>
        {primaryAction && <div className="mt-auto pt-4">{primaryAction}</div>}
      </RomanCardContent>
    </RomanCard>
  );
}

function DashboardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group/link -mx-3 flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-sm transition-[background-color,color] duration-150 hover:bg-primary/[0.06] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span>{children}</span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-roman-stone transition-transform duration-150 ease-out group-hover/link:translate-x-0.5 group-hover/link:text-primary motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

function DashboardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="shrink-0 font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-roman-stone">
          {title}
        </h2>
        <div className="h-px flex-1 bg-border/80" aria-hidden="true" />
      </div>
      {children}
    </section>
  );
}

function AdministrationPage() {
  return (
    <AdminPage>
      <AdminPageHeader title="Administration" description="Manage lessons, vocabulary, tests and content." />

      <div className="space-y-7">
        <DashboardSection title="Content">
          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardCard
              icon={BookOpen}
              title="Lesson Management"
              description="Create, organize, and publish course lessons."
              primaryAction={
                <Button asChild size="sm">
                  <Link href="/admin/lessons/create">
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Create New Lesson
                  </Link>
                </Button>
              }>
              <DashboardLink href="/admin/lessons/manage">Manage Existing Lessons</DashboardLink>
              <DashboardLink href="/admin/lessons/live">Manage Live Lessons</DashboardLink>
              <DashboardLink href="/admin/practice-categories?lessonType=vocab&status=active">
                Manage Practice Categories
              </DashboardLink>
            </DashboardCard>
            <DashboardCard
              icon={LibraryBig}
              title="Vocabulary"
              description="View, edit, review, and organize Latin words.">
              <DashboardLink href="/admin/vocabulary">All Words</DashboardLink>
              <DashboardLink href="/admin/vocabulary/pending">Pending Review</DashboardLink>
              <DashboardLink href="/admin/vocabulary-pools">Vocabulary Pools</DashboardLink>
            </DashboardCard>
          </div>
        </DashboardSection>

        <DashboardSection title="Assessment">
          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardCard
              icon={FileCheck2}
              title="Tests"
              description="Create scored tests and manage their versions."
              primaryAction={
                <Button asChild size="sm">
                  <Link href="/admin/tests/create">
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Create Test
                  </Link>
                </Button>
              }>
              <DashboardLink href="/admin/tests/manage">Manage Tests</DashboardLink>
            </DashboardCard>
            <DashboardCard icon={ClipboardCheck} title="Mock Tests" description="Manage independent rehearsal cards.">
              <DashboardLink href="/admin/mock-tests">Manage Mock Tests</DashboardLink>
            </DashboardCard>
          </div>
        </DashboardSection>

        <DashboardSection title="System">
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <DashboardCard
              icon={ClipboardList}
              title="Diagramming Audit"
              description="Inspect student submissions and expected answers.">
              <DashboardLink href="/admin/diagramming-attempts">View Diagramming Attempts</DashboardLink>
            </DashboardCard>
          </div>
        </DashboardSection>
      </div>
    </AdminPage>
  );
}

export default withAdminAuth(AdministrationPage);
