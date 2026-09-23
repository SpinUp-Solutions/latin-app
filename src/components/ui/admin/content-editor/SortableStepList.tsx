import React from 'react';
import { Button } from '@/src/components/ui/button';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  KeyboardSensor,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { GripVertical } from 'lucide-react';

interface SortableStepListProps {
  availableSteps: readonly FormIdentificationStep[];
  selectedSteps: FormIdentificationStep[];
  onChange: (steps: FormIdentificationStep[]) => void;
  formatLabel?: (step: FormIdentificationStep) => string;
}

const SortableStepItem: React.FC<{ step: FormIdentificationStep; label: string }> = ({ step, label }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded border bg-white p-2 text-sm">
      <div {...attributes} {...listeners} className="cursor-move">
        <GripVertical className="h-4 w-4 text-gray-500" />
      </div>
      <span className="flex-1 capitalize">{label}</span>
    </div>
  );
};

export const SortableStepList: React.FC<SortableStepListProps> = ({
  availableSteps,
  selectedSteps,
  onChange,
  formatLabel = step => step,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleStepToggle = (step: FormIdentificationStep) => {
    const nextSteps = selectedSteps.includes(step)
      ? selectedSteps.filter(selected => selected !== step)
      : [...selectedSteps, step];
    onChange(nextSteps);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || selectedSteps.length === 0) return;

    const oldIndex = selectedSteps.indexOf(active.id as FormIdentificationStep);
    const newIndex = selectedSteps.indexOf(over.id as FormIdentificationStep);
    onChange(arrayMove(selectedSteps, oldIndex, newIndex));
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-3">Steps to Identify (in order)</label>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {availableSteps.map(step => (
            <Button
              key={step}
              type="button"
              variant={selectedSteps.includes(step) ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleStepToggle(step)}
              className="capitalize">
              {formatLabel(step)}
            </Button>
          ))}
        </div>

        {selectedSteps.length > 0 && (
          <div>
            <p className="text-sm text-gray-600 mb-2">Selected steps (drag to reorder):</p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
              <SortableContext items={selectedSteps} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {selectedSteps.map(step => (
                    <SortableStepItem key={step} step={step} label={formatLabel(step)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
};
