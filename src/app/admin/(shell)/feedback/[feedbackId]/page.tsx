import { Suspense } from 'react';
import { AdminLoadingState } from '@/src/components/admin/shell';
import { ProtectedFeedbackDetail } from '@/src/components/admin/feedback/FeedbackDetail';

export default async function AdminFeedbackDetailPage({ params }: { params: Promise<{ feedbackId: string }> }) {
  const { feedbackId } = await params;
  return <Suspense fallback={<AdminLoadingState label="Loading feedback" />}><ProtectedFeedbackDetail feedbackId={feedbackId} /></Suspense>;
}
