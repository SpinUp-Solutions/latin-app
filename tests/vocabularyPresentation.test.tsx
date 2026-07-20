import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VocabularyViewer } from '@/src/components/ui/lesson/VocabularyViewer';
import type { VocabularyContent } from '@/src/types/vocabulary';

describe('vocabulary presentation', () => {
  it('ignores legacy studyMode and opens in Flashcards while retaining the student tabs', async () => {
    const legacyContent = {
      id: 'vocabulary-1',
      type: 'vocabulary',
      title: '',
      studyMode: 'list',
      vocabularyItems: [{ id: 'word-1', latin: 'puella', english: 'girl' }],
    } as unknown as VocabularyContent;

    const user = userEvent.setup();
    render(<VocabularyViewer content={legacyContent} />);

    expect(screen.getByText('Special Vocabulary')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Flashcards' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Click to reveal meaning')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'List View' }));

    expect(screen.getByRole('tab', { name: 'List View' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('girl')).toBeInTheDocument();
  });
});
