import React from 'react';
import { EditorContent } from '@tiptap/react';
import { useTipTapEditor, TipTapEditorOptions } from '@/src/hooks/useTipTapEditor';
import { useTooltipManager } from '@/src/hooks/useTooltipManager';
import { TooltipEditorDialog } from './tooltip-editor-dialog';
import { EditorMode } from '@/src/utils/tiptapExtensions';

export interface TipTapEditorProps extends Omit<TipTapEditorOptions, 'extensions'> {
  mode?: EditorMode;
  enableTooltips?: boolean;
  enableAnnotations?: boolean;
  extensions?: TipTapEditorOptions['extensions'];
  children?: React.ReactNode;
  showTooltipDialog?: boolean;
}

export const TipTapEditor: React.FC<TipTapEditorProps> = ({
  mode = 'admin',
  enableTooltips = true,
  enableAnnotations = true,
  extensions,
  children,
  showTooltipDialog = true,
  ...editorOptions
}) => {
  const editor = useTipTapEditor({
    ...editorOptions,
    extensions: extensions || [],
  });

  const tooltipManager = useTooltipManager({
    editor,
    disabled: mode === 'readonly',
  });

  return (
    <div className="tiptap-editor">
      {children}
      <EditorContent editor={editor} />

      {showTooltipDialog && enableTooltips && (
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
