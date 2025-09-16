import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Page } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';
import { createNewContent } from '@/src/utils/contentFactory';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { DraggableContentList } from './DraggableContentList';
import { PageAutoAdvanceEditor } from './PageAutoAdvanceEditor';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { useDispatch } from 'react-redux';
import { reorderPages, updatePageAutoAdvance } from '@/src/store/slices/lessonSlice';
import { PasteZone } from '../../core/clipboard';

interface PageSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  pages: Page[];
  contentTypes: readonly { type: string; icon: React.ComponentType<{ className?: string }>; label: string }[];
  onAddPage: () => void;
  onRemovePage: (pageIndex: number) => void;
  onUpdatePageTitle: (pageIndex: number, title: string) => void;
  onAddContent: (pageIndex: number, content: RenderableContentItem) => void;
  onEditContent: (pageIndex: number, itemIndex: number) => void;
  onRemoveContent: (pageIndex: number, itemIndex: number) => void;
}

interface SortablePageProps {
  page: Page;
  pageIndex: number;
  contentTypes: readonly { type: string; icon: React.ComponentType<{ className?: string }>; label: string }[];
  onRemovePage: (pageIndex: number) => void;
  onUpdatePageTitle: (pageIndex: number, title: string) => void;
  onAddContent: (pageIndex: number, content: RenderableContentItem) => void;
  onEditContent: (pageIndex: number, itemIndex: number) => void;
  onRemoveContent: (pageIndex: number, itemIndex: number) => void;
  onUpdatePageAutoAdvance: (pageIndex: number, autoAdvance: { enabled: boolean; delay: number }) => void;
  isAutoAdvanceExpanded: boolean;
  onToggleAutoAdvance: () => void;
}

const SortablePage: React.FC<SortablePageProps> = ({
  page,
  pageIndex,
  contentTypes,
  onRemovePage,
  onUpdatePageTitle,
  onAddContent,
  onEditContent,
  onRemoveContent,
  onUpdatePageAutoAdvance,
  isAutoAdvanceExpanded,
  onToggleAutoAdvance,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleAddContent = (contentType: string) => {
    const newContent = createNewContent(contentType);
    onAddContent(pageIndex, newContent);
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg p-4 space-y-3 bg-white hover:shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600"
            {...attributes}
            {...listeners}>
            <GripVertical className="h-4 w-4" />
          </Button>
          <SimpleRichEditor
            content={page.title || ''}
            onChange={value => onUpdatePageTitle(pageIndex, value)}
            className="text-lg font-medium bg-transparent border-none outline-none flex-1"
            placeholder="Page title..."
            singleLine={true}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => onRemovePage(pageIndex)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <DraggableContentList
        items={page.items}
        pageIndex={pageIndex}
        onEditContent={(itemIndex: number) => onEditContent(pageIndex, itemIndex)}
        onRemoveContent={(itemIndex: number) => onRemoveContent(pageIndex, itemIndex)}
      />

      <PageAutoAdvanceEditor
        autoAdvance={page.autoAdvance}
        onChange={config => onUpdatePageAutoAdvance(pageIndex, config)}
        isExpanded={isAutoAdvanceExpanded}
        onToggle={onToggleAutoAdvance}
      />

      <div className="space-y-3 pt-2 border-t">
        <PasteZone pageIndex={pageIndex} />
        <div className="flex flex-wrap gap-2">
          {contentTypes.map(({ type, icon: ContentIcon, label }) => (
            <Button key={type} variant="outline" size="sm" onClick={() => handleAddContent(type)}>
              <ContentIcon className="h-4 w-4 mr-1" />
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PageSection: React.FC<PageSectionProps> = ({
  title,
  icon: Icon,
  pages,
  contentTypes,
  onAddPage,
  onRemovePage,
  onUpdatePageTitle,
  onAddContent,
  onEditContent,
  onRemoveContent,
}) => {
  const dispatch = useDispatch();
  const [expandedAutoAdvancePageId, setExpandedAutoAdvancePageId] = useState<string | null>(null);

  const handleUpdatePageAutoAdvance = (pageIndex: number, autoAdvance: { enabled: boolean; delay: number }) => {
    dispatch(updatePageAutoAdvance({ pageIndex, autoAdvance }));
  };

  const handleToggleAutoAdvance = (pageId: string) => {
    setExpandedAutoAdvancePageId(current => (current === pageId ? null : pageId));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const activeIndex = pages.findIndex(page => page.id === active.id);
      const overIndex = pages.findIndex(page => page.id === over?.id);

      dispatch(
        reorderPages({
          fromIndex: activeIndex,
          toIndex: overIndex,
        })
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title} ({pages.length})
          </span>
          <Button onClick={onAddPage} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Page
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
          <SortableContext items={pages.map(page => page.id)} strategy={verticalListSortingStrategy}>
            {pages.map((page, pageIndex) => (
              <SortablePage
                key={page.id}
                page={page}
                pageIndex={pageIndex}
                contentTypes={contentTypes}
                onRemovePage={onRemovePage}
                onUpdatePageTitle={onUpdatePageTitle}
                onAddContent={onAddContent}
                onEditContent={onEditContent}
                onRemoveContent={onRemoveContent}
                onUpdatePageAutoAdvance={handleUpdatePageAutoAdvance}
                isAutoAdvanceExpanded={expandedAutoAdvancePageId === page.id}
                onToggleAutoAdvance={() => handleToggleAutoAdvance(page.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  );
};
