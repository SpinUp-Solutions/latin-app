import { useMemo } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  MessageSquare,
  Link,
  Parentheses,
  Brackets,
  Circle,
  Underline,
  Equal,
  CornerDownRight,
  ArrowRight,
  Highlighter,
  Eraser,
  Undo,
  Redo,
  ArrowLeft,
} from 'lucide-react';
import { ToolbarConfig, useToolbarFactory } from '@/src/components/ui/core/toolbar-factory';
import { AnnotationType } from '@/src/types/exercises/sentence-diagramming';

interface UseToolbarConfigProps {
  type: 'rich-text' | 'diagramming' | 'diagramming-student';
  editor: Editor | null;
  onAnnotationClick?: (type: AnnotationType) => void;
  onClearAnnotations?: () => void;
  onAddTooltip?: () => void;
  onAddHyperlink?: () => void;
  disabled?: boolean;
}

export const useToolbarConfig = ({
  type,
  editor,
  onAnnotationClick,
  onClearAnnotations,
  onAddTooltip,
  onAddHyperlink,
  disabled = false,
}: UseToolbarConfigProps): ToolbarConfig | null => {
  const { createButton, createSection, createConfig } = useToolbarFactory();

  return useMemo(() => {
    if (!editor) return null;

    if (type === 'rich-text') {
      return createConfig(
        [
          createSection('Format', [
            createButton('bold', Bold, 'Bold', {
              action: () => editor.chain().focus().toggleBold().run(),
            }),
            createButton('italic', Italic, 'Italic', {
              action: () => editor.chain().focus().toggleItalic().run(),
            }),
            createButton('strike', Strikethrough, 'Strikethrough', {
              action: () => editor.chain().focus().toggleStrike().run(),
            }),
          ]),
          createSection('Headings', [
            createButton('heading1', Heading1, 'Heading 1', {
              isActive: editor.isActive('heading', { level: 1 }),
              action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
            }),
            createButton('heading2', Heading2, 'Heading 2', {
              isActive: editor.isActive('heading', { level: 2 }),
              action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            }),
            createButton('heading3', Heading3, 'Heading 3', {
              isActive: editor.isActive('heading', { level: 3 }),
              action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
            }),
          ]),
          createSection('Lists', [
            createButton('bulletList', List, 'Bullet List', {
              action: () => editor.chain().focus().toggleBulletList().run(),
            }),
          ]),
          createSection('Tools', [
            createButton('tooltip', MessageSquare, 'Add Tooltip', {
              action: onAddTooltip,
            }),
            createButton('hyperlink', Link, 'Add Link', {
              action: onAddHyperlink,
            }),
          ]),
        ],
        { disabled }
      );
    }

    if (type === 'diagramming') {
      return createConfig(
        [
          createSection('Prepositions', [
            createButton('preposition', Parentheses, 'Mark Preposition (parentheses)', {
              isActive: editor.isActive('preposition'),
              action: () => onAnnotationClick?.('preposition'),
            }),
          ]),
          createSection('Subordination', [
            createButton('subordination', Brackets, 'Mark Subordinate Clause [brackets]', {
              isActive: editor.isActive('subordination'),
              action: () => onAnnotationClick?.('subordination'),
            }),
          ]),
          createSection('Verbs', [
            createButton('verb-circle', Circle, 'Circle Verb', {
              isActive: editor.isActive('verbCircle'),
              action: () => onAnnotationClick?.('verb-circle'),
            }),
          ]),
          createSection('Objects', [
            createButton('subject-underline', Underline, 'Underline Subject', {
              isActive: editor.isActive('subjectUnderline'),
              action: () => onAnnotationClick?.('subject-underline'),
            }),
            createButton('direct-object-underline', Equal, 'Double Underline Direct Object', {
              isActive: editor.isActive('directObjectUnderline'),
              action: () => onAnnotationClick?.('direct-object-underline'),
            }),
            createButton('indirect-object-bracket', CornerDownRight, 'L-bracket Indirect Object', {
              isActive: editor.isActive('indirectObjectBracket'),
              action: () => onAnnotationClick?.('indirect-object-bracket'),
            }),
          ]),
          createSection('Modifiers', [
            createButton('genitive-arrow', ArrowRight, 'Genitive Arrow', {
              isActive: editor.isActive('genitiveArrow'),
              action: () => onAnnotationClick?.('genitive-arrow'),
            }),
            createButton('genitive-arrow-target', ArrowLeft, 'Genitive Target', {
              isActive: editor.isActive('genitiveArrowTarget'),
              action: () => onAnnotationClick?.('genitive-arrow-target'),
            }),
            createButton('ablative-phrase', Highlighter, 'Ablative Phrase', {
              isActive: editor.isActive('ablativePhrase'),
              action: () => onAnnotationClick?.('ablative-phrase'),
            }),
          ]),
          createSection('Tools', [
            createButton('tooltip', MessageSquare, 'Add Tooltip', {
              isActive: editor.isActive('tooltip'),
              action: onAddTooltip,
            }),
            createButton('undo', Undo, 'Undo', {
              action: () => editor.chain().focus().undo().run(),
              canExecute: () => editor.can().undo(),
            }),
            createButton('redo', Redo, 'Redo', {
              action: () => editor.chain().focus().redo().run(),
              canExecute: () => editor.can().redo(),
            }),
            createButton('clear', Eraser, 'Clear All Annotations', {
              action: onClearAnnotations,
              className: 'text-red-600 hover:bg-red-50',
            }),
          ]),
        ],
        { disabled }
      );
    }

    if (type === 'diagramming-student') {
      return createConfig(
        [
          createSection('Prepositions', [
            createButton('preposition', Parentheses, 'Mark Preposition (parentheses)', {
              isActive: editor.isActive('preposition'),
              action: () => onAnnotationClick?.('preposition'),
            }),
          ]),
          createSection('Subordination', [
            createButton('subordination', Brackets, 'Mark Subordinate Clause [brackets]', {
              isActive: editor.isActive('subordination'),
              action: () => onAnnotationClick?.('subordination'),
            }),
          ]),
          createSection('Verbs', [
            createButton('verb-circle', Circle, 'Circle Verb', {
              isActive: editor.isActive('verbCircle'),
              action: () => onAnnotationClick?.('verb-circle'),
            }),
          ]),
          createSection('Objects', [
            createButton('subject-underline', Underline, 'Underline Subject', {
              isActive: editor.isActive('subjectUnderline'),
              action: () => onAnnotationClick?.('subject-underline'),
            }),
            createButton('direct-object-underline', Equal, 'Double Underline Direct Object', {
              isActive: editor.isActive('directObjectUnderline'),
              action: () => onAnnotationClick?.('direct-object-underline'),
            }),
            createButton('indirect-object-bracket', CornerDownRight, 'L-bracket Indirect Object', {
              isActive: editor.isActive('indirectObjectBracket'),
              action: () => onAnnotationClick?.('indirect-object-bracket'),
            }),
          ]),
          createSection('Modifiers', [
            createButton('genitive-arrow', ArrowRight, 'Genitive Arrow', {
              isActive: editor.isActive('genitiveArrow'),
              action: () => onAnnotationClick?.('genitive-arrow'),
            }),
            createButton('genitive-arrow-target', ArrowLeft, 'Genitive Target', {
              isActive: editor.isActive('genitiveArrowTarget'),
              action: () => onAnnotationClick?.('genitive-arrow-target'),
            }),
            createButton('ablative-phrase', Highlighter, 'Ablative Phrase', {
              isActive: editor.isActive('ablativePhrase'),
              action: () => onAnnotationClick?.('ablative-phrase'),
            }),
          ]),
          createSection('Tools', [
            createButton('undo', Undo, 'Undo', {
              action: () => editor.chain().focus().undo().run(),
              canExecute: () => editor.can().undo(),
            }),
            createButton('redo', Redo, 'Redo', {
              action: () => editor.chain().focus().redo().run(),
              canExecute: () => editor.can().redo(),
            }),
            createButton('clear', Eraser, 'Clear All Annotations', {
              action: onClearAnnotations,
              className: 'text-red-600 hover:bg-red-50',
            }),
          ]),
        ],
        { disabled }
      );
    }

    return null;
  }, [
    type,
    editor,
    onAnnotationClick,
    onClearAnnotations,
    onAddTooltip,
    onAddHyperlink,
    disabled,
    createButton,
    createSection,
    createConfig,
  ]);
};
