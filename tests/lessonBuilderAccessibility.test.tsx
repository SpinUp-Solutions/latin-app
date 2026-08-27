import { render, screen } from '@testing-library/react';
import { ContentItem } from '@/src/components/ui/admin/lesson-builder/ContentItem';
import type { RenderableContentItem } from '@/src/types/page';

jest.mock('@/src/components/ui/core/clipboard', () => ({
  useClipboard: () => ({ copyItem: jest.fn() }),
}));

describe('lesson builder icon controls', () => {
  it('gives every repeated content action an accessible name', () => {
    const item = {
      id: 'content-1',
      type: 'text',
      title: '<p>Opening note</p>',
      content: '<p>Salve</p>',
    } as RenderableContentItem;

    render(<ContentItem item={item} onEdit={jest.fn()} onRemove={jest.fn()} isDraggable />);

    expect(screen.getByRole('button', { name: 'Reorder Opening note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Opening note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Opening note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Opening note' })).toBeInTheDocument();
  });
});
