import React from 'react';
import { EditorContent } from '@tiptap/react';
import { useTipTapEditor } from '@/src/hooks/useTipTapEditor';
import { useTooltipManager } from '@/src/hooks/useTooltipManager';
import { TooltipContainer } from './TooltipContainer';
import { TooltipEditorDialog } from './tooltip-editor-dialog';
import { getSimpleExtensions } from '@/src/utils/tiptapExtensions';
import { cn } from '@/src/lib/utils';

interface SimpleRichEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  singleLine?: boolean;
  rows?: number;
  onSubmit?: () => void;
}

export const SimpleRichEditor: React.FC<SimpleRichEditorProps> = ({
  content,
  onChange,
  placeholder,
  className = '',
  disabled = false,
  singleLine = false,
  rows,
  onSubmit,
}) => {
  const editor = useTipTapEditor({
    extensions: getSimpleExtensions({ enableTooltips: true }),
    initialContent: content,
    onUpdate: (editor, html) => onChange(html),
    editable: !disabled,
  });

  const tooltipManager = useTooltipManager({
    editor,
    disabled,
  });

  React.useEffect(() => {
    if (!editor) return;

    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        handleKeyDown: (view, event) => {
          if (event.altKey && event.key === 't') {
            event.preventDefault();
            tooltipManager.handleAddTooltip();
            return true;
          }

          if (singleLine && event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit?.();
            return true;
          }

          return false;
        },
      },
    });
  }, [editor, singleLine, tooltipManager, onSubmit]);

  if (!editor) {
    const loadingClasses = singleLine
      ? 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
      : `flex ${rows ? `min-h-[${rows * 20 + 40}px]` : 'min-h-[80px]'} w-full rounded-md border border-input bg-background px-3 py-2 text-sm`;

    return <div className={cn(loadingClasses, 'opacity-50', className)}>Loading...</div>;
  }

  const baseClasses = singleLine
    ? 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
    : `flex ${rows ? `min-h-[${rows * 20 + 40}px]` : 'min-h-[80px]'} w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`;

  return (
    <>
      <div className={cn(baseClasses, className)}>
        <TooltipContainer className="w-full h-full [&_[data-tooltip='true']]:cursor-help">
          <EditorContent
            editor={editor}
            className={cn(
              'w-full h-full flex',
              '[&_.ProseMirror]:w-full [&_.ProseMirror]:h-full',
              '[&_.ProseMirror]:outline-none [&_.ProseMirror]:border-none',
              '[&_.ProseMirror]:bg-transparent [&_.ProseMirror]:resize-none',
              '[&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-normal',
              '[&_.ProseMirror]:m-0 [&_.ProseMirror]:p-0',
              singleLine && '[&_.ProseMirror]:overflow-hidden [&_.ProseMirror]:whitespace-nowrap',
              placeholder &&
                !content &&
                `[&_.ProseMirror]:empty:before:content-['${placeholder}'] [&_.ProseMirror]:empty:before:text-muted-foreground [&_.ProseMirror]:empty:before:pointer-events-none`,
              disabled && '[&_.ProseMirror]:cursor-not-allowed'
            )}
          />
        </TooltipContainer>
      </div>

      <TooltipEditorDialog
        isOpen={tooltipManager.isDialogOpen}
        onClose={tooltipManager.handleCloseDialog}
        onSave={tooltipManager.handleSaveTooltip}
        onRemove={tooltipManager.handleRemoveTooltip}
        initialData={tooltipManager.editingTooltip}
        selectedText={tooltipManager.selectedText}
      />
    </>
  );
};

export default SimpleRichEditor;
