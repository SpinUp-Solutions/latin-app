import { Suspense } from 'react';
import { ProtectedFeedbackDetail } from '@/src/components/admin/feedback/FeedbackDetail';

export default async function AdminFeedbackDetailPage({ params }: { params: Promise<{ feedbackId: string }> }) {
  const { feedbackId } = await params;
  return <Suspense fallback={<div className="p-8">Loading feedback…</div>}><ProtectedFeedbackDetail feedbackId={feedbackId} /></Suspense>;
}
