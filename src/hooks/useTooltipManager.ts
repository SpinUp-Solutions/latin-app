import { useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { addTooltip, removeTooltip } from '@/src/store/slices/lessonEditorSlice';
import { TooltipData, TooltipFormData } from '@/src/types/tooltip';
import { findTooltipMarkWithData, generateTooltipId } from '@/src/utils/tooltipUtils';

export interface TooltipManagerOptions {
  editor: Editor | null;
  disabled?: boolean;
}

export const useTooltipManager = ({ editor, disabled = false }: TooltipManagerOptions) => {
  const dispatch = useAppDispatch();
  const tooltips = useAppSelector(state => state.lessonEditor.tooltips);

  const [activeTooltip, setActiveTooltip] = useState<TooltipData | null>(null);
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

    // Check if there's already a tooltip on this selection
    const existingTooltip = findTooltipMarkWithData(editor, from, to);
    if (existingTooltip) {
      const tooltipId = existingTooltip.attrs.tooltipId;
      const tooltipData = tooltips[tooltipId];
      if (tooltipData) {
        setEditingTooltip(tooltipData);
      } else {
        // Fallback to mark data if not in global state
        setEditingTooltip({
          id: tooltipId,
          word: existingTooltip.attrs.word,
          translation: existingTooltip.attrs.translation,
          pronunciation: existingTooltip.attrs.pronunciation,
          partOfSpeech: existingTooltip.attrs.partOfSpeech,
          wordType: existingTooltip.attrs.wordType,
          definition: existingTooltip.attrs.definition,
          examples: existingTooltip.attrs.examples,
          etymology: existingTooltip.attrs.etymology,
          gender: existingTooltip.attrs.gender,
          declensionClass: existingTooltip.attrs.declensionClass,
          conjugationClass: existingTooltip.attrs.conjugationClass,
          grammaticalInfo: existingTooltip.attrs.grammaticalInfo,
          principalParts: existingTooltip.attrs.principalParts,
        });
      }
    } else {
      setEditingTooltip(null);
      setSelectedText(selectedText);
    }

    setIsDialogOpen(true);
  }, [editor, disabled, tooltips]);

  const handleSaveTooltip = useCallback(
    (tooltipData: TooltipFormData) => {
      if (!editor) return;

      const tooltipId = editingTooltip?.id || generateTooltipId(tooltipData.word);

      // Save to global state
      dispatch(
        addTooltip({
          id: tooltipId,
          data: {
            word: tooltipData.word,
            translation: tooltipData.translation,
            pronunciation: tooltipData.pronunciation,
            partOfSpeech: tooltipData.partOfSpeech,
            wordType: tooltipData.wordType,
            definition: tooltipData.definition,
            examples: tooltipData.examples,
            etymology: tooltipData.etymology,
            gender: tooltipData.gender,
            declensionClass: tooltipData.declensionClass,
            conjugationClass: tooltipData.conjugationClass,
            grammaticalInfo: tooltipData.grammaticalInfo,
            principalParts: tooltipData.principalParts,
          },
        })
      );

      // Apply to editor
      editor
        .chain()
        .focus()
        .setTooltip({
          tooltipId,
          word: tooltipData.word,
          translation: tooltipData.translation,
          pronunciation: tooltipData.pronunciation,
          partOfSpeech: tooltipData.partOfSpeech,
          wordType: tooltipData.wordType,
          definition: tooltipData.definition,
          examples: tooltipData.examples,
          etymology: tooltipData.etymology,
          gender: tooltipData.gender,
          declensionClass: tooltipData.declensionClass,
          conjugationClass: tooltipData.conjugationClass,
          grammaticalInfo: tooltipData.grammaticalInfo,
          principalParts: tooltipData.principalParts,
        })
        .run();

      handleCloseDialog();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, editingTooltip, dispatch]
  );

  const handleRemoveTooltip = useCallback(
    () => {
      if (!editor || !editingTooltip) return;

      // Remove from global state
      dispatch(removeTooltip(editingTooltip.id));

      // Remove from editor
      editor.chain().focus().unsetTooltip().run();
      handleCloseDialog();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, editingTooltip, dispatch]
  );

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setEditingTooltip(null);
    setSelectedText('');
  }, []);

  const handleTooltipHover = useCallback(
    (tooltipElement: HTMLElement) => {
      const tooltipId = tooltipElement.getAttribute('data-tooltip-id');
      if (tooltipId && tooltips[tooltipId]) {
        setActiveTooltip(tooltips[tooltipId]);
      }
    },
    [tooltips]
  );

  const handleTooltipLeave = useCallback(() => {
    setActiveTooltip(null);
  }, []);

  return {
    // State
    isDialogOpen,
    editingTooltip,
    selectedText,
    activeTooltip,
    tooltips,

    // Actions
    handleAddTooltip,
    handleSaveTooltip,
    handleRemoveTooltip,
    handleCloseDialog,
    handleTooltipHover,
    handleTooltipLeave,
  };
};
