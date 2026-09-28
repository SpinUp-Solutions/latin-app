import { useState, useCallback, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { addTooltip, removeTooltip } from '@/src/store/slices/lessonEditorSlice';
import { TooltipData, TooltipFormData } from '@/src/types/tooltip';
import { findTooltipMark, generateTooltipId } from '@/src/utils/tooltipUtils';
import { TooltipStorage } from '@/src/components/ui/core/tooltip-extension';

interface TooltipManagerOptions {
  editor: Editor | null;
  disabled?: boolean;
}

export const useTooltipManager = ({ editor, disabled = false }: TooltipManagerOptions) => {
  const dispatch = useAppDispatch();
  const tooltips = useAppSelector(state => state.lessonEditor.tooltips);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTooltip, setEditingTooltip] = useState<TooltipData | null>(null);
  const [selectedText, setSelectedText] = useState('');

  const handleAddTooltip = useCallback(() => {
    if (!editor || disabled) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (!selectedText.trim()) {
      alert('Please select text to add a tooltip');
      return;
    }

    const existingTooltip = findTooltipMark(editor, from, to);
    if (existingTooltip) {
      const { tooltipId, ...fields } = existingTooltip.attrs;
      setEditingTooltip(tooltips[tooltipId] ?? { id: tooltipId, ...fields });
    } else {
      setEditingTooltip(null);
      setSelectedText(selectedText);
    }

    setIsDialogOpen(true);
  }, [editor, disabled, tooltips]);

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setEditingTooltip(null);
    setSelectedText('');
  }, []);

  const handleSaveTooltip = useCallback(
    (tooltipData: TooltipFormData) => {
      if (!editor) return;

      const tooltipId = editingTooltip?.id || generateTooltipId(tooltipData.word);
      dispatch(addTooltip({ id: tooltipId, data: tooltipData }));
      editor
        .chain()
        .focus()
        .setTooltip({ tooltipId, ...tooltipData })
        .run();

      handleCloseDialog();
    },
    [editor, editingTooltip, dispatch, handleCloseDialog]
  );

  const handleRemoveTooltip = useCallback(() => {
    if (!editor || !editingTooltip) return;

    dispatch(removeTooltip(editingTooltip.id));

    editor.chain().focus().unsetTooltip().run();
    handleCloseDialog();
  }, [editor, editingTooltip, dispatch, handleCloseDialog]);

  useEffect(() => {
    if (!editor) return;
    const storage = editor.extensionStorage.tooltip as TooltipStorage | undefined;
    if (!storage) return;
    storage.onOpenDialog = handleAddTooltip;
    return () => {
      storage.onOpenDialog = null;
    };
  }, [editor, handleAddTooltip]);

  return {
    isDialogOpen,
    editingTooltip,
    selectedText,
    handleAddTooltip,
    handleSaveTooltip,
    handleRemoveTooltip,
    handleCloseDialog,
  };
};
