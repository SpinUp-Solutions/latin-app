import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PoolList } from '@/src/components/ui/admin/vocabulary-pools/PoolList';

jest.mock('@/src/hooks/useInfiniteScroll', () => ({ useInfiniteScroll: () => ({ current: null }) }));

const pool = {
  id: 'pool-1',
  name: 'Chapter 1 words',
  description: 'Words for chapter 1.',
  metadata: {
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    createdBy: 'admin-1',
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedBy: 'admin-1',
    wordCount: 12,
    isActive: true,
    tags: [],
    difficulty: 'beginner' as const,
  },
};

describe('vocabulary pool list usage status', () => {
  it('shows two usages, expands the remainder, and keeps deletion available while assigned', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn();
    render(
      <PoolList
        pools={[pool]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDelete={onDelete}
        usagesByPoolId={{
          'pool-1': [
            { id: '1', poolId: 'pool-1', kind: 'lesson', label: 'Lesson: One', editorUrl: '/admin/lessons/edit/one' },
            { id: '2', poolId: 'pool-1', kind: 'lesson', label: 'Lesson: Two', editorUrl: '/admin/lessons/edit/two' },
            {
              id: '3',
              poolId: 'pool-1',
              kind: 'lesson',
              label: 'Lesson: Three',
              editorUrl: '/admin/lessons/edit/three',
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Assigned (3)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lesson: One' })).toHaveAttribute('href', '/admin/lessons/edit/one');
    expect(screen.queryByText('Lesson: Three')).not.toBeInTheDocument();
    expect(screen.getByTitle('Delete pool')).toBeEnabled();

    await user.click(screen.getByTitle('Delete pool'));
    expect(onDelete).toHaveBeenCalledWith('pool-1', 'Chapter 1 words');

    await user.click(screen.getByRole('button', { name: '+1 more' }));
    expect(screen.getByText('Lesson: Three')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('renders rich text in assigned usage labels instead of showing HTML tags', () => {
    render(
      <PoolList
        pools={[pool]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        usagesByPoolId={{
          'pool-1': [
            {
              id: 'rich-usage',
              poolId: 'pool-1',
              kind: 'lesson-exercise',
              label: 'Lesson: <p></p> (Copy) → <p><strong>Dictionary Entries</strong></p>',
              editorUrl: '/admin/lessons/edit/one',
            },
          ],
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'Lesson: (Copy) → Dictionary Entries' })).toBeInTheDocument();
    expect(screen.getByText('Dictionary Entries').tagName).toBe('STRONG');
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
  });

  it('renders duplicate button and triggers onDuplicate callback when clicked', async () => {
    const user = userEvent.setup();
    const onDuplicate = jest.fn();
    const { rerender } = render(
      <PoolList
        pools={[pool]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDuplicate={onDuplicate}
        onDelete={jest.fn()}
        usagesByPoolId={{}}
      />
    );

    const duplicateBtn = screen.getByRole('button', { name: /duplicate/i });
    expect(duplicateBtn).toBeInTheDocument();
    expect(duplicateBtn).toBeEnabled();

    await user.click(duplicateBtn);
    expect(onDuplicate).toHaveBeenCalledWith(pool);

    rerender(
      <PoolList
        pools={[pool]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDuplicate={onDuplicate}
        duplicatingPoolIds={new Set(['pool-1'])}
        onDelete={jest.fn()}
        usagesByPoolId={{}}
      />
    );

    expect(screen.getByRole('button', { name: /duplicate/i })).toBeDisabled();
  });

  it('tracks concurrent duplications independently with duplicatingPoolIds set', async () => {
    const poolA = { ...pool, id: 'pool-a', name: 'Pool A' };
    const poolB = { ...pool, id: 'pool-b', name: 'Pool B' };
    const onDuplicate = jest.fn();

    const { rerender } = render(
      <PoolList
        pools={[poolA, poolB]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDuplicate={onDuplicate}
        duplicatingPoolIds={new Set(['pool-a'])}
        onDelete={jest.fn()}
        usagesByPoolId={{}}
      />
    );

    const duplicateButtons = screen.getAllByRole('button', { name: /duplicate/i });
    expect(duplicateButtons[0]).toBeDisabled(); // Pool A is disabled
    expect(duplicateButtons[1]).toBeEnabled(); // Pool B remains enabled

    rerender(
      <PoolList
        pools={[poolA, poolB]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDuplicate={onDuplicate}
        duplicatingPoolIds={new Set(['pool-a', 'pool-b'])}
        onDelete={jest.fn()}
        usagesByPoolId={{}}
      />
    );

    const updatedButtons = screen.getAllByRole('button', { name: /duplicate/i });
    expect(updatedButtons[0]).toBeDisabled();
    expect(updatedButtons[1]).toBeDisabled();
  });

  it('shows assignment skeletons while usages are loading', () => {
    render(
      <PoolList
        pools={[pool]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        usagesByPoolId={{}}
        usagesLoading
      />
    );

    expect(screen.getByLabelText('Loading assignments')).toBeInTheDocument();
    expect(screen.getByText('Loading assigned lessons')).toBeInTheDocument();
    expect(screen.queryByText('Assigned to')).not.toBeInTheDocument();
    expect(screen.queryByText(/Assigned \(/)).not.toBeInTheDocument();
  });

  it('replaces assignment skeletons with assigned lessons once usages load', async () => {
    const { rerender } = render(
      <PoolList
        pools={[pool]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        usagesByPoolId={{}}
        usagesLoading
      />
    );

    expect(screen.getByLabelText('Loading assignments')).toBeInTheDocument();

    rerender(
      <PoolList
        pools={[pool]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        usagesLoading={false}
        usagesByPoolId={{
          'pool-1': [
            { id: '1', poolId: 'pool-1', kind: 'lesson', label: 'Lesson: One', editorUrl: '/admin/lessons/edit/one' },
          ],
        }}
      />
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading assignments')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Assigned (1)')).toBeInTheDocument();
    expect(screen.getByText('Assigned to')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lesson: One' })).toBeInTheDocument();
  });

  it('hides assignment placeholders when loaded usages are empty', async () => {
    const { rerender } = render(
      <PoolList
        pools={[pool]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        usagesByPoolId={{}}
        usagesLoading
      />
    );

    rerender(
      <PoolList
        pools={[pool]}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        usagesByPoolId={{}}
        usagesLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading assignments')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Assigned to')).not.toBeInTheDocument();
    expect(screen.queryByText(/Assigned \(/)).not.toBeInTheDocument();
  });
});
