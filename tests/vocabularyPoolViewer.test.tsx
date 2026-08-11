import { render, screen } from '@testing-library/react';
import { VocabularyPoolViewer } from '@/src/components/ui/lesson/VocabularyPoolViewer';
import type { VocabularyPoolContent } from '@/src/types/vocabulary';

const mockUseGetStudentPoolQuery = jest.fn();

jest.mock('next/navigation', () => ({ useParams: () => ({ lessonId: 'lesson-1' }) }));
jest.mock('@/src/store/hooks', () => ({ useAppSelector: () => null }));
jest.mock('@/src/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'student-1' } }) }));
jest.mock('@/src/store/api/lessonApi', () => ({
  useGetStudentLessonQuery: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/src/store/api/vocabularyPoolApi', () => ({
  useGetStudentPoolQuery: (...args: unknown[]) => mockUseGetStudentPoolQuery(...args),
}));
jest.mock('@/src/components/ui/lesson/VocabularyStudyView', () => ({
  VocabularyStudyView: ({ title, items }: { title: string; items: Array<{ latin: string }> }) => (
    <div>
      <span>{title}</span>
      <span>{items[0]?.latin}</span>
    </div>
  ),
}));

describe('VocabularyPoolViewer student loading', () => {
  it('uses the student-safe pool query for ordinary lesson playback', () => {
    mockUseGetStudentPoolQuery.mockReturnValue({
      data: {
        id: 'pool-1',
        name: 'Chapter words',
        items: [{ id: 'word-1', latin: 'puella', english: 'girl' }],
      },
      isLoading: false,
      error: undefined,
    });

    render(
      <VocabularyPoolViewer
        content={{ id: 'content-1', type: 'vocabulary-pool', title: '' } as VocabularyPoolContent}
        poolId="pool-1"
      />
    );

    expect(mockUseGetStudentPoolQuery).toHaveBeenCalledWith('pool-1', { skip: false });
    expect(screen.getByText('Chapter words')).toBeInTheDocument();
    expect(screen.getByText('puella')).toBeInTheDocument();
  });
});
