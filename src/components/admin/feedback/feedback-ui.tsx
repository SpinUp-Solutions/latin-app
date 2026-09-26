import { Bug, Lightbulb, MessageCircle, type LucideIcon } from 'lucide-react';
import {
  FEEDBACK_SEVERITY_LABELS,
  type FeedbackReport,
  type FeedbackSeverity,
  type FeedbackType,
} from '@/shared/student-feedback';
import { AdminStatusBadge, type AdminStatusTone } from '@/src/components/admin/shell';
import { cn } from '@/src/lib/utils';

const TYPE_STYLES: Record<FeedbackType, { icon: LucideIcon; className: string }> = {
  bug_report: { icon: Bug, className: 'bg-primary/10 text-primary' },
  feature_suggestion: { icon: Lightbulb, className: 'bg-roman-gold/20 text-amber-800' },
  general: { icon: MessageCircle, className: 'bg-roman-green/10 text-roman-green' },
};

const SEVERITY_TONES: Record<FeedbackSeverity, AdminStatusTone> = {
  blocking: 'danger',
  major: 'warning',
  minor: 'neutral',
};

export function FeedbackTypeIcon({ type, className }: { type: FeedbackType; className?: string }) {
  const { icon: Icon, className: tone } = TYPE_STYLES[type];
  return (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone, className)}>
      <Icon className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
    </span>
  );
}

export function FeedbackBadges({
  report,
  showOpen = false,
}: {
  report: Pick<FeedbackReport, 'severity' | 'status' | 'archived'>;
  showOpen?: boolean;
}) {
  return (
    <>
      {report.severity && (
        <AdminStatusBadge tone={SEVERITY_TONES[report.severity]}>{FEEDBACK_SEVERITY_LABELS[report.severity]}</AdminStatusBadge>
      )}
      {report.status === 'resolved' ? (
        <AdminStatusBadge tone="success">Resolved</AdminStatusBadge>
      ) : (
        showOpen && <AdminStatusBadge tone="warning">Open</AdminStatusBadge>
      )}
      {report.archived && <AdminStatusBadge tone="neutral">Archived</AdminStatusBadge>}
    </>
  );
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

export function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - nowMs) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function submitterName(submitter: FeedbackReport['submitter']): string {
  return submitter.displayName || submitter.email || submitter.uid;
}
