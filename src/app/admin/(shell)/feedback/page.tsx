import { Suspense } from 'react';
import { AdminLoadingState } from '@/src/components/admin/shell';
import { ProtectedFeedbackList } from '@/src/components/admin/feedback/FeedbackList';

export default function AdminFeedbackPage() {
  return <Suspense fallback={<AdminLoadingState label="Loading feedback" />}><ProtectedFeedbackList /></Suspense>;
}
