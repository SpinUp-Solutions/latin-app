import { Suspense } from 'react';
import { ProtectedFeedbackList } from '@/src/components/admin/feedback/FeedbackList';

export default function AdminFeedbackPage() {
  return <Suspense fallback={<div className="p-8">Loading feedback…</div>}><ProtectedFeedbackList /></Suspense>;
}
