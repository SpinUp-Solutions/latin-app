import React, { ReactNode, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Plus, Trash2, GripVertical, Copy } from 'lucide-react';
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
import { reorderPages, updatePageAutoAdvance } from '@/src/store/slices/lessonEditorSlice';
import { PasteZone } from '../../core/clipboard';
import type { PageDocumentEditorKind } from '@/src/lib/page-document-draft';

interface PageSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  pages: Page[];
  contentTypes: readonly { type: string; icon: React.ComponentType<{ className?: string }>; label: string }[];
  onAddPage: () => void;
  onRemovePage: (pageIndex: number) => void;
  onDuplicatePage: (pageIndex: number) => void;
  onUpdatePageTitle: (pageIndex: number, title: string) => void;
  onAddContent: (pageIndex: number, content: RenderableContentItem) => void;
  onEditContent: (pageIndex: number, itemIndex: number) => void;
  onRemoveContent: (pageIndex: number, itemIndex: number) => void;
  renderContentItemMeta?: (pageIndex: number, item: RenderableContentItem, itemIndex: number) => ReactNode;
  editorKind?: PageDocumentEditorKind;
}

interface SortablePageProps {
  page: Page;
  pageIndex: number;
  contentTypes: readonly { type: string; icon: React.ComponentType<{ className?: string }>; label: string }[];
  onRemovePage: (pageIndex: number) => void;
  onDuplicatePage: (pageIndex: number) => void;
  onUpdatePageTitle: (pageIndex: number, title: string) => void;
  onAddContent: (pageIndex: number, content: RenderableContentItem) => void;
  onEditContent: (pageIndex: number, itemIndex: number) => void;
  onRemoveContent: (pageIndex: number, itemIndex: number) => void;
  renderContentItemMeta?: (pageIndex: number, item: RenderableContentItem, itemIndex: number) => ReactNode;
  onUpdatePageAutoAdvance: (pageIndex: number, autoAdvance: { enabled: boolean; delay: number }) => void;
  isAutoAdvanceExpanded: boolean;
  onToggleAutoAdvance: () => void;
  editorKind: PageDocumentEditorKind;
}

const SortablePage: React.FC<SortablePageProps> = ({
  page,
  pageIndex,
  contentTypes,
  onRemovePage,
  onDuplicatePage,
  onUpdatePageTitle,
  onAddContent,
  onEditContent,
  onRemoveContent,
  renderContentItemMeta,
  onUpdatePageAutoAdvance,
  isAutoAdvanceExpanded,
  onToggleAutoAdvance,
  editorKind,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleAddContent = (contentType: string) => {
    const newContent = createNewContent(contentType, editorKind);
    onAddContent(pageIndex, newContent);
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded p-3 space-y-2 bg-white hover:shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="cursor-grab active:cursor-grabbing p-0.5 h-6 w-6 text-gray-400 hover:text-gray-600"
            {...attributes}
            {...listeners}>
            <GripVertical className="h-3.5 w-3.5" />
          </Button>
          <span className="px-1.5 py-0.5 text-xs font-medium bg-roman-red/10 text-roman-red rounded">
            {pageIndex + 1}
          </span>
          <SimpleRichEditor
            content={page.title || ''}
            onChange={value => onUpdatePageTitle(pageIndex, value)}
            className="text-sm font-medium bg-transparent border-none outline-none flex-1"
            placeholder="Page title..."
            singleLine={true}
          />
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onDuplicatePage(pageIndex)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onRemovePage(pageIndex)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <DraggableContentList
        items={page.items}
        pageIndex={pageIndex}
        onEditContent={(itemIndex: number) => onEditContent(pageIndex, itemIndex)}
        onRemoveContent={(itemIndex: number) => onRemoveContent(pageIndex, itemIndex)}
        renderItemMeta={(item, itemIndex) => renderContentItemMeta?.(pageIndex, item, itemIndex)}
      />

      <PageAutoAdvanceEditor
        autoAdvance={page.autoAdvance}
        onChange={config => onUpdatePageAutoAdvance(pageIndex, config)}
        isExpanded={isAutoAdvanceExpanded}
        onToggle={onToggleAutoAdvance}
      />

      <div className="space-y-2 pt-2 border-t">
        <PasteZone pageIndex={pageIndex} />
        <div className="flex flex-wrap gap-1.5">
          {contentTypes.map(({ type, icon: ContentIcon, label }) => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => handleAddContent(type)}>
              <ContentIcon className="h-3 w-3 mr-1" />
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
  onDuplicatePage,
  onUpdatePageTitle,
  onAddContent,
  onEditContent,
  onRemoveContent,
  renderContentItemMeta,
  editorKind = 'lesson',
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
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {title} ({pages.length})
          </span>
          <Button onClick={onAddPage} size="sm" className="h-7 text-xs px-2">
            <Plus className="h-3 w-3 mr-1" />
            Add Page
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-3">
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
                onDuplicatePage={onDuplicatePage}
                onUpdatePageTitle={onUpdatePageTitle}
                onAddContent={onAddContent}
                onEditContent={onEditContent}
                onRemoveContent={onRemoveContent}
                renderContentItemMeta={renderContentItemMeta}
                onUpdatePageAutoAdvance={handleUpdatePageAutoAdvance}
                isAutoAdvanceExpanded={expandedAutoAdvancePageId === page.id}
                onToggleAutoAdvance={() => handleToggleAutoAdvance(page.id)}
                editorKind={editorKind}
              />
            ))}
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  );
};
