import { useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';

interface HyperlinkMarkData {
  href: string;
  target?: string;
}

const findHyperlinkMark = (editor: Editor, from: number, to: number): HyperlinkMarkData | null => {
  let hyperlinkMark: HyperlinkMarkData | null = null;

  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText && !hyperlinkMark) {
      const foundMark = node.marks.find(mark => mark.type.name === 'hyperlink');
      if (foundMark && from >= pos && from < pos + node.nodeSize) {
        hyperlinkMark = {
          href: foundMark.attrs.href as string,
          target: foundMark.attrs.target as string | undefined,
        };
      }
    }
  });

  return hyperlinkMark;
};

export const useHyperlinkManager = ({ editor }: { editor: Editor | null }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [existingHref, setExistingHref] = useState('');
  const [selectedText, setSelectedText] = useState('');

  const handleAddHyperlink = useCallback(() => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to);

    if (!text.trim()) {
      alert('Please select text to add a link');
      return;
    }

    const existingLink = findHyperlinkMark(editor, from, to);
    setExistingHref(existingLink ? existingLink.href : '');
    setSelectedText(text);
    setIsDialogOpen(true);
  }, [editor]);

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setExistingHref('');
    setSelectedText('');
  }, []);

  const handleSaveHyperlink = useCallback(
    (href: string, openInNewTab: boolean) => {
      if (!editor) return;

      editor
        .chain()
        .focus()
        .setHyperlink({
          href,
          target: openInNewTab ? '_blank' : '_self',
        })
        .run();

      handleCloseDialog();
    },
    [editor, handleCloseDialog]
  );

  const handleRemoveHyperlink = useCallback(() => {
    if (!editor) return;

    editor.chain().focus().unsetHyperlink().run();
    handleCloseDialog();
  }, [editor, handleCloseDialog]);

  return {
    isDialogOpen,
    existingHref,
    selectedText,
    handleAddHyperlink,
    handleSaveHyperlink,
    handleRemoveHyperlink,
    handleCloseDialog,
  };
};
