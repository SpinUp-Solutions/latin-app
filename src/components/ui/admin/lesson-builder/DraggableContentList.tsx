import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { useDispatch } from 'react-redux';
import { RenderableContentItem } from '@/src/types/page';
import { reorderContentItems } from '@/src/store/slices/lessonSlice';
import { ContentItem } from './ContentItem';

interface DraggableContentListProps {
  items: RenderableContentItem[];
  pageIndex: number;
  onEditContent: (itemIndex: number) => void;
  onRemoveContent: (itemIndex: number) => void;
}

export const DraggableContentList: React.FC<DraggableContentListProps> = ({
  items,
  pageIndex,
  onEditContent,
  onRemoveContent,
}) => {
  const dispatch = useDispatch();
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
      const activeIndex = items.findIndex(item => item.id === active.id);
      const overIndex = items.findIndex(item => item.id === over?.id);

      dispatch(
        reorderContentItems({
          pageIndex,
          fromIndex: activeIndex,
          toIndex: overIndex,
        })
      );
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
      <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item, itemIndex) => (
            <ContentItem
              key={item.id}
              item={item}
              onEdit={() => onEditContent(itemIndex)}
              onRemove={() => onRemoveContent(itemIndex)}
              isDraggable={true}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
