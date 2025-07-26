import React from 'react';
import { EditorContent } from '@tiptap/react';
import { DiagrammingToolbar } from '../exercises/sentence-diagramming/diagramming-toolbar';
import { useTipTapEditor } from '@/src/hooks/useTipTapEditor';
import { useTooltipManager } from '@/src/hooks/useTooltipManager';
import { TooltipEditorDialog } from './tooltip-editor-dialog';
import { getAdminExtensions, getStudentExtensions } from '@/src/utils/tiptapExtensions';
import { SentenceWord, AnnotationType } from '@/src/types/exercises/sentence-diagramming';
import { handleAnnotationClick, handleClearAnnotations } from '@/src/utils/sentenceDiagramming';

export interface DiagrammingEditorProps {
  initialContent: string;
  isStudentMode?: boolean;
  words?: SentenceWord[];
  sentence?: string;
  onUpdate?: (annotations: Record<string, AnnotationType>, htmlContent: string) => void;
  onEditorReady?: (editor: any) => void;
  disabled?: boolean;
  className?: string;
}

export const DiagrammingEditor: React.FC<DiagrammingEditorProps> = ({
  initialContent,
  isStudentMode = false,
  words = [],
  sentence = '',
  onUpdate,
  onEditorReady,
  disabled = false,
  className = 'sentence-diagramming-canvas',
}) => {
  const editor = useTipTapEditor({
    extensions: isStudentMode ? getStudentExtensions() : getAdminExtensions(),
    initialContent,
    className,
    onUpdate: onUpdate
      ? (editor, html) => {
          const { extractAnnotationsFromEditor } = require('@/src/utils/sentenceDiagramming');
          const annotations = extractAnnotationsFromEditor(editor);
          onUpdate(annotations, html);
        }
      : undefined,
    onEditorReady,
  });

  const tooltipManager = useTooltipManager({
    editor,
    disabled: disabled || isStudentMode,
  });

  const clearAnnotations = () => {
    if (!editor || disabled) return;
    handleClearAnnotations(editor);
  };

  const handleAnnotation = (type: AnnotationType) => {
    if (!editor || disabled) return;
    handleAnnotationClick(editor, type, words, sentence, disabled);
  };

  return (
    <div className="sentence-diagramming-editor border border-gray-300 rounded-md">
      <DiagrammingToolbar
        editor={editor}
        onAnnotationClick={handleAnnotation}
        onClearAnnotations={clearAnnotations}
        onAddTooltip={tooltipManager.handleAddTooltip}
        disabled={disabled}
        isStudentMode={isStudentMode}
      />

      <div className="p-4 min-h-[150px] bg-white">
        <EditorContent editor={editor} />
      </div>

      {!isStudentMode && (
        <TooltipEditorDialog
          isOpen={tooltipManager.isDialogOpen}
          onClose={tooltipManager.handleCloseDialog}
          onSave={tooltipManager.handleSaveTooltip}
          onRemove={tooltipManager.editingTooltip ? tooltipManager.handleRemoveTooltip : undefined}
          selectedText={tooltipManager.selectedText}
          initialData={tooltipManager.editingTooltip}
        />
      )}
    </div>
  );
};
