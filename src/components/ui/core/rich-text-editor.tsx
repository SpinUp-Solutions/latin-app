import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Tooltip } from './tooltip-extension';
import { TooltipEditorDialog } from './tooltip-editor-dialog';
import { ToolbarFactory } from './toolbar-factory';
import { useToolbarConfig } from '@/src/hooks/useToolbarConfig';
import { addTooltip, removeTooltip } from '@/src/store/slices/lessonSlice';
import { TooltipData } from '@/src/types/tooltip';
import { findTooltipMark, generateTooltipId } from '@/src/utils/tooltipUtils';
import { RootState } from '@/src/store';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ content, onChange, className }) => {
  const [isTooltipDialogOpen, setIsTooltipDialogOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [existingTooltipData, setExistingTooltipData] = useState<TooltipData | null>(null);
  const dispatch = useDispatch();
  const tooltips = useSelector((state: RootState) => state.lesson.tooltips);

  const editor = useEditor({
    extensions: [StarterKit, Tooltip],
    content: content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to);
      setSelectedText(text);
    },
    editorProps: {
      attributes: {
        class: 'rich-text-editor-content',
      },
    },
  });

  const handleAddTooltip = () => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (!selectedText.trim()) {
      alert('Please select text to add a tooltip');
      return;
    }

    const tooltipMark = findTooltipMark(editor, from, to);

    if (tooltipMark && tooltipMark.attrs) {
      // Get existing tooltip data
      const tooltipId = tooltipMark.attrs.tooltipId;
      const existingData = tooltips[tooltipId];
      if (existingData) {
        setExistingTooltipData(existingData);
        setSelectedText(tooltipMark.attrs.word || selectedText);
      }
    } else {
      setExistingTooltipData(null);
      setSelectedText(selectedText);
    }

    setIsTooltipDialogOpen(true);
  };

  const handleSaveTooltip = (tooltipData: Omit<TooltipData, 'id'>) => {
    if (!editor) return;

    let tooltipId: string;

    if (existingTooltipData) {
      // Update existing tooltip
      tooltipId = existingTooltipData.id;
      dispatch(addTooltip({ id: tooltipId, data: tooltipData }));
    } else {
      // Create new tooltip
      tooltipId = generateTooltipId(tooltipData.word);
      dispatch(addTooltip({ id: tooltipId, data: tooltipData }));
    }

    // Add/update tooltip mark to editor with the ID
    editor
      .chain()
      .focus()
      .setTooltip({ ...tooltipData, tooltipId })
      .run();

    setIsTooltipDialogOpen(false);
    setExistingTooltipData(null);
  };

  const handleRemoveTooltip = () => {
    if (!editor || !existingTooltipData) return;

    // Remove tooltip from Redux
    dispatch(removeTooltip(existingTooltipData.id));

    // Remove tooltip mark from editor
    editor.chain().focus().unsetTooltip().run();

    setIsTooltipDialogOpen(false);
    setExistingTooltipData(null);
  };

  const toolbarConfig = useToolbarConfig({
    type: 'rich-text',
    editor,
    onAddTooltip: handleAddTooltip,
  });

  return (
    <div className={`border border-gray-300 rounded-md ${className}`}>
      {toolbarConfig && <ToolbarFactory config={toolbarConfig} editor={editor} />}
      <EditorContent editor={editor} />
      <TooltipEditorDialog
        isOpen={isTooltipDialogOpen}
        onClose={() => {
          setIsTooltipDialogOpen(false);
          setExistingTooltipData(null);
        }}
        onSave={handleSaveTooltip}
        onRemove={handleRemoveTooltip}
        selectedText={selectedText}
        initialData={existingTooltipData}
      />
    </div>
  );
};


export default RichTextEditor;
