import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, List, MessageSquare } from 'lucide-react';
import { Tooltip } from './tooltip-extension';
import { TooltipEditorDialog } from './tooltip-editor-dialog';
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

  return (
    <div className={`border border-gray-300 rounded-md ${className}`}>
      <EditorToolbar editor={editor} onAddTooltip={handleAddTooltip} />
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

const EditorToolbar: React.FC<{ editor: Editor | null; onAddTooltip: () => void }> = ({ editor, onAddTooltip }) => {
  if (!editor) {
    return null;
  }

  const buttonClass = (isActive: boolean) => `p-2 rounded hover:bg-gray-200 ${isActive ? 'bg-gray-200' : ''}`;

  return (
    <div className="border-b border-gray-300 p-1 flex items-center space-x-1 flex-wrap bg-gray-50 rounded-t-md">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={buttonClass(editor.isActive('bold'))}
        title="Bold">
        <Bold className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={buttonClass(editor.isActive('italic'))}
        title="Italic">
        <Italic className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={buttonClass(editor.isActive('strike'))}
        title="Strikethrough">
        <Strikethrough className="w-4 h-4" />
      </button>

      <div className="h-5 border-l border-gray-300 mx-1"></div>

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 1 }))}
        title="Heading 1">
        <Heading1 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 2 }))}
        title="Heading 2">
        <Heading2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 3 }))}
        title="Heading 3">
        <Heading3 className="w-4 h-4" />
      </button>

      <div className="h-5 border-l border-gray-300 mx-1"></div>

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={buttonClass(editor.isActive('bulletList'))}
        title="Bullet List">
        <List className="w-4 h-4" />
      </button>

      <div className="h-5 border-l border-gray-300 mx-1"></div>

      <button
        type="button"
        onClick={onAddTooltip}
        className={buttonClass(editor.isActive('tooltip'))}
        title="Add Tooltip">
        <MessageSquare className="w-4 h-4" />
      </button>
    </div>
  );
};

export default RichTextEditor;
