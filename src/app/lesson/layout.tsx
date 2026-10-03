import type { Metadata } from 'next';
import LessonShell from '@/src/components/ui/lesson/lesson-shell';

export const metadata: Metadata = {
  title: 'Lesson',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <LessonShell>{children}</LessonShell>;
}
