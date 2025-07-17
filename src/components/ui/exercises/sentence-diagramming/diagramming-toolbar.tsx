import React from 'react';
import { Editor } from '@tiptap/react';
import { 
  Parentheses, 
  Brackets, 
  Circle, 
  Underline, 
  Equal, 
  CornerDownRight,
  ArrowRight,
  Highlighter,
  Eraser,
  MessageSquare,
  Undo,
  Redo
} from 'lucide-react';
import { AnnotationType } from '@/src/types/exercises/sentence-diagramming';

interface DiagrammingToolbarProps {
  editor: Editor;
  onAnnotationClick: (type: AnnotationType) => void;
  onClearAnnotations: () => void;
  onAddTooltip: () => void;
  disabled?: boolean;
}

export const DiagrammingToolbar: React.FC<DiagrammingToolbarProps> = ({
  editor,
  onAnnotationClick,
  onClearAnnotations,
  onAddTooltip,
  disabled = false,
}) => {
  const buttonClass = (isActive: boolean) => `
    p-2 rounded hover:bg-gray-200 transition-colors
    ${isActive ? 'bg-blue-200 border-blue-400' : 'bg-white border-gray-300'}
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    border text-sm font-medium
  `;

  const toolbarSections = [
    {
      title: 'Step 2: Prepositions',
      items: [
        {
          type: 'preposition' as AnnotationType,
          icon: Parentheses,
          title: 'Mark Preposition (parentheses)',
          isActive: editor.isActive('preposition'),
        },
      ],
    },
    {
      title: 'Step 3: Subordination',
      items: [
        {
          type: 'subordination' as AnnotationType,
          icon: Brackets,
          title: 'Mark Subordinate Clause [brackets]',
          isActive: editor.isActive('subordination'),
        },
      ],
    },
    {
      title: 'Step 4: Verbs',
      items: [
        {
          type: 'verb-circle' as AnnotationType,
          icon: Circle,
          title: 'Circle Verb',
          isActive: editor.isActive('verbCircle'),
        },
      ],
    },
    {
      title: 'Step 5-6: Objects',
      items: [
        {
          type: 'subject-underline' as AnnotationType,
          icon: Underline,
          title: 'Underline Subject',
          isActive: editor.isActive('subjectUnderline'),
        },
        {
          type: 'direct-object-underline' as AnnotationType,
          icon: Equal,
          title: 'Double Underline Direct Object',
          isActive: editor.isActive('directObjectUnderline'),
        },
        {
          type: 'indirect-object-bracket' as AnnotationType,
          icon: CornerDownRight,
          title: 'L-bracket Indirect Object',
          isActive: editor.isActive('indirectObjectBracket'),
        },
      ],
    },
    {
      title: 'Step 7-8: Modifiers',
      items: [
        {
          type: 'genitive-arrow' as AnnotationType,
          icon: ArrowRight,
          title: 'Genitive Arrow',
          isActive: editor.isActive('genitiveArrow'),
        },
        {
          type: 'ablative-phrase' as AnnotationType,
          icon: Highlighter,
          title: 'Ablative Phrase',
          isActive: editor.isActive('ablativePhrase'),
        },
      ],
    },
  ];

  const handleClick = (type: AnnotationType) => {
    if (disabled) return;
    onAnnotationClick(type);
  };

  return (
    <div className="border-b border-gray-300 p-2 bg-gray-50 space-y-2">
      {toolbarSections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 min-w-[120px]">
            {section.title}:
          </span>
          <div className="flex items-center gap-1">
            {section.items.map((item, itemIndex) => (
              <button
                key={itemIndex}
                type="button"
                onClick={() => handleClick(item.type)}
                className={buttonClass(item.isActive)}
                title={item.title}
                disabled={disabled}
              >
                <item.icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      ))}
      
      <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
        <span className="text-xs font-medium text-gray-600 min-w-[120px]">
          Tools:
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAddTooltip}
            className={buttonClass(editor.isActive('tooltip'))}
            title="Add Tooltip"
            disabled={disabled}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            className={buttonClass(false)}
            title="Undo"
            disabled={disabled || !editor.can().undo()}
          >
            <Undo className="w-4 h-4" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            className={buttonClass(false)}
            title="Redo"
            disabled={disabled || !editor.can().redo()}
          >
            <Redo className="w-4 h-4" />
          </button>
          
          <button
            type="button"
            onClick={onClearAnnotations}
            className={`${buttonClass(false)} text-red-600 hover:bg-red-50`}
            title="Clear All Annotations"
            disabled={disabled}
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};