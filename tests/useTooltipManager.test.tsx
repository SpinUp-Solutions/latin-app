import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { configureStore } from '@reduxjs/toolkit';
import lessonEditorReducer from '@/src/store/slices/lessonEditorSlice';
import { Tooltip } from '@/src/components/ui/core/tooltip-extension';
import { useTooltipManager } from '@/src/hooks/useTooltipManager';

function setup() {
  const editor = new Editor({
    extensions: [Document, Paragraph, Text, Tooltip],
    content: '<p>amo</p>',
  });
  editor.commands.selectAll();
  const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useTooltipManager({ editor }), { wrapper });
  return { editor, result };
}

it('clears tooltip fields the form no longer supplies when re-saving an existing tooltip', () => {
  const { editor, result } = setup();
  act(() => result.current.handleSaveTooltip({ word: 'amo', title: 'Old title', chips: ['verb'] }));
  editor.commands.selectAll();
  act(() => result.current.handleAddTooltip());
  act(() => result.current.handleSaveTooltip({ word: 'amo' }));

  const html = editor.getHTML();
  expect(html).not.toContain('Old title');
  expect(html).not.toContain('chips');
  expect(html).toContain('data-tooltip-id');
});
