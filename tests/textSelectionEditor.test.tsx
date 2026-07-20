import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';

jest.mock('@/src/components/ui/admin/content-editor/AudioUploadSection', () => ({
  AudioUploadSection: () => null,
}));

jest.mock('@/src/components/ui/admin/content-editor/ExerciseFeedbackSection', () => ({
  ExerciseFeedbackSection: () => null,
}));

jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({
  SimpleRichEditor: ({
    content,
    onChange,
    placeholder,
  }: {
    content: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={placeholder}
      value={content}
      onChange={event => onChange(event.target.value)}
    />
  ),
}));
import userEvent from '@testing-library/user-event';
import { TextSelectionEditor } from '@/src/components/ui/admin/content-editor/TextSelectionEditor';
import lessonEditorReducer, {
  setLesson,
  startEditingContent,
} from '@/src/store/slices/lessonEditorSlice';
import { createNewContent } from '@/src/utils/contentFactory';
import type { Lesson } from '@/src/types/lesson';

describe('TextSelectionEditor', () => {
  it('keeps question editors mounted and focused while editable fields change', async () => {
    const content = createNewContent('text-selection');
    const lesson: Lesson = {
      id: 'lesson-1',
      title: 'Lesson',
      description: '',
      type: 'normal',
      pages: [{ id: 'page-1', title: 'Page', items: [content] }],
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
    };
    const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
    store.dispatch(setLesson(lesson));
    store.dispatch(startEditingContent({ pageIndex: 0, itemIndex: 0 }));
    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <TextSelectionEditor />
      </Provider>
    );

    const questionIdEditor = screen.getByLabelText('Unique identifier for this question');
    await user.click(questionIdEditor);
    await user.keyboard('x');
    expect(document.activeElement).toBe(questionIdEditor);
    expect(screen.getByLabelText('Unique identifier for this question')).toBe(questionIdEditor);

    const questionTextEditor = screen.getByLabelText(
      "What should students look for? e.g., 'Click on the unnecessary pronoun in the passage.'"
    );
    await user.click(questionTextEditor);
    await user.keyboard('y');
    expect(document.activeElement).toBe(questionTextEditor);
    expect(
      screen.getByLabelText("What should students look for? e.g., 'Click on the unnecessary pronoun in the passage.'")
    ).toBe(questionTextEditor);
  });
});
