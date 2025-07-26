import React from 'react';
import { EditorContent } from '@tiptap/react';
import { TooltipEditorDialog } from './tooltip-editor-dialog';
import { ToolbarFactory } from './toolbar-factory';
import { useToolbarConfig } from '@/src/hooks/useToolbarConfig';
import { useTipTapEditor } from '@/src/hooks/useTipTapEditor';
import { useTooltipManager } from '@/src/hooks/useTooltipManager';
import { getAdminExtensions } from '@/src/utils/tiptapExtensions';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ content, onChange, className }) => {
  const editor = useTipTapEditor({
    extensions: getAdminExtensions({ enableAnnotations: false }),
    initialContent: content,
    className: 'rich-text-editor-content',
    onUpdate: (editor, html) => onChange(html),
  });

  const tooltipManager = useTooltipManager({ editor });


  const toolbarConfig = useToolbarConfig({
    type: 'rich-text',
    editor,
    onAddTooltip: tooltipManager.handleAddTooltip,
  });

  return (
    <div className={`border border-gray-300 rounded-md ${className}`}>
      {toolbarConfig && editor && <ToolbarFactory config={toolbarConfig} editor={editor} />}
      <EditorContent editor={editor} />
      <TooltipEditorDialog
        isOpen={tooltipManager.isDialogOpen}
        onClose={tooltipManager.handleCloseDialog}
        onSave={tooltipManager.handleSaveTooltip}
        onRemove={tooltipManager.editingTooltip ? tooltipManager.handleRemoveTooltip : undefined}
        selectedText={tooltipManager.selectedText}
        initialData={tooltipManager.editingTooltip}
      />
    </div>
  );
};

export default RichTextEditor;
