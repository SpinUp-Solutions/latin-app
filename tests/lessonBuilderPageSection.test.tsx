import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { PageSection } from '@/src/components/ui/admin/lesson-builder/PageSection';
import lessonEditorReducer from '@/src/store/slices/lessonEditorSlice';
import { ALL_CONTENT_TYPES } from '@/src/utils/contentTypeConstants';
import type { Page } from '@/src/types/page';
import { BookOpen } from 'lucide-react';

jest.mock('@/src/components/ui/core/clipboard', () => ({
  PasteZone: () => null,
}));

jest.mock('@/src/components/ui/admin/lesson-builder/DraggableContentList', () => ({
  DraggableContentList: () => <div>items</div>,
}));

jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({
  SimpleRichEditor: () => <span>Title editor</span>,
}));

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => children,
  closestCenter: jest.fn(),
  KeyboardSensor: class {},
  PointerSensor: class {},
  useSensor: jest.fn(),
  useSensors: () => [],
}));

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

jest.mock('@dnd-kit/modifiers', () => ({
  restrictToVerticalAxis: jest.fn(),
  restrictToParentElement: jest.fn(),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

const page = (index: number): Page =>
  ({
    id: `page-${index}`,
    title: `Page ${index}`,
    items: [{ id: `item-${index}`, type: 'text', title: 'Note', content: 'Salve' }],
  }) as Page;

describe('lesson builder page section', () => {
  it('mounts add-content controls for the expanded page only', () => {
    const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
    const pages = Array.from({ length: 23 }, (_, index) => page(index + 1));

    render(
      <Provider store={store}>
        <PageSection
          title="Pages"
          icon={BookOpen}
          pages={pages}
          contentTypes={ALL_CONTENT_TYPES}
          onAddPage={jest.fn()}
          onRemovePage={jest.fn()}
          onDuplicatePage={jest.fn()}
          onUpdatePageTitle={jest.fn()}
          onAddContent={jest.fn()}
          onEditContent={jest.fn()}
          onRemoveContent={jest.fn()}
        />
      </Provider>
    );

    expect(screen.getAllByRole('button', { name: /^Expand page / })).toHaveLength(22);
    expect(screen.getByRole('button', { name: 'Collapse page 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Text Block' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Expand page 12' }));
    expect(screen.getByRole('button', { name: 'Collapse page 12' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse page 1' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Text Block' })).toHaveLength(1);
  });
});
