import LessonShell from '@/src/components/ui/lesson/lesson-shell';

// Sits above the `[lessonId]` segment so the header and sidebars stay mounted
// when the student moves between lessons.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <LessonShell>{children}</LessonShell>;
}
