import React, { useState } from 'react';
import { Editor, EditorContent } from '@tiptap/react';
import { DiagrammingToolbar } from '../exercises/sentence-diagramming/diagramming-toolbar';
import { useTipTapEditor } from '@/src/hooks/useTipTapEditor';
import { useTooltipManager } from '@/src/hooks/useTooltipManager';
import { TooltipEditorDialog } from './tooltip-editor-dialog';
import { getAdminExtensions, getStudentExtensions } from '@/src/utils/tiptapExtensions';
import { AnnotationType, DiagramSelectionMark, DiagramToolKey } from '@/src/types/exercises/sentence-diagramming';
import {
  handleAnnotationClick,
  handleClearAnnotations,
  extractDiagramMarksFromEditor,
  handleResetTextColors,
} from '@/src/utils/sentenceDiagramming';

export interface DiagrammingEditorProps {
  initialContent: string;
  isStudentMode?: boolean;
  onUpdate?: (marks: DiagramSelectionMark[], htmlContent: string) => void;
  onEditorReady?: (editor: Editor) => void;
  disabled?: boolean;
  className?: string;
  availableTools?: DiagramToolKey[];
}

export const DiagrammingEditor: React.FC<DiagrammingEditorProps> = ({
  initialContent,
  isStudentMode = false,
  onUpdate,
  onEditorReady,
  disabled = false,
  className = 'sentence-diagramming-canvas',
  availableTools,
}) => {
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const editor = useTipTapEditor({
    extensions: isStudentMode ? getStudentExtensions() : getAdminExtensions(),
    initialContent,
    className,
    onUpdate: onUpdate
      ? (editor, html) => {
          setSelectionError(null);
          const marks = extractDiagramMarksFromEditor(editor);
          onUpdate(marks, html);
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
    setSelectionError(null);
  };

  const handleAnnotation = (type: AnnotationType) => {
    if (!editor || disabled) return;
    const error = handleAnnotationClick(editor, type, disabled);
    if (error) {
      setSelectionError(error);
      return;
    }
    setSelectionError(null);
  };

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="sentence-diagramming-editor border border-gray-300 rounded-md">
      <DiagrammingToolbar
        editor={editor}
        onAnnotationClick={handleAnnotation}
        onClearAnnotations={clearAnnotations}
        onResetTextColors={() => handleResetTextColors(editor, disabled)}
        onAddTooltip={tooltipManager.handleAddTooltip}
        disabled={disabled}
        isStudentMode={isStudentMode}
        availableTools={availableTools}
      />

      {selectionError ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{selectionError}</div>
      ) : null}

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
