'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Plus } from 'lucide-react';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { LessonManager } from '@/src/components/ui/admin/LessonManager';
import { LessonSummary } from '@/src/types/lesson';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';

function ManageLessonsPage() {
  const router = useRouter();

  const handleEditLesson = (lesson: LessonSummary) => {
    router.push(`/admin/lessons/edit/${lesson.id}`);
  };

  const handleCreateNewLesson = () => {
    router.push('/admin/lessons/create');
  };

  const handleContinueDraft = (lessonId: string) => {
    router.push(`/admin/lessons/create?continue=true&lessonId=${lessonId}`);
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="Manage Lessons"
        description="View and edit existing lessons."
        actions={
          <Button onClick={handleCreateNewLesson}>
            <Plus className="mr-2 h-4 w-4" />
            Create New Lesson
          </Button>
        }
      />
      <LessonManager onEditLesson={handleEditLesson} onContinueDraft={handleContinueDraft} />
    </AdminPage>
  );
}

export default withAdminAuth(ManageLessonsPage);
