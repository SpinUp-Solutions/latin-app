import React from 'react';
import { Editor } from '@tiptap/react';
import { AnnotationType } from '@/src/types/exercises/sentence-diagramming';
import { ToolbarFactory } from '@/src/components/ui/core/toolbar-factory';
import { useToolbarConfig } from '@/src/hooks/useToolbarConfig';

interface DiagrammingToolbarProps {
  editor: Editor;
  onAnnotationClick: (type: AnnotationType) => void;
  onClearAnnotations: () => void;
  onAddTooltip?: () => void;
  disabled?: boolean;
  isStudentMode?: boolean;
}

export const DiagrammingToolbar: React.FC<DiagrammingToolbarProps> = ({
  editor,
  onAnnotationClick,
  onClearAnnotations,
  onAddTooltip,
  disabled = false,
  isStudentMode = false,
}) => {
  const toolbarConfig = useToolbarConfig({
    type: isStudentMode ? 'diagramming-student' : 'diagramming',
    editor,
    onAnnotationClick,
    onClearAnnotations,
    onAddTooltip,
    disabled,
  });

  if (!toolbarConfig) return null;

  return <ToolbarFactory config={toolbarConfig} editor={editor} />;
};
