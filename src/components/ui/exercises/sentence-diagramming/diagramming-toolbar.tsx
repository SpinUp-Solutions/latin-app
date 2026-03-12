import React from 'react';
import { Editor } from '@tiptap/react';
import { MessageSquare, Redo, RotateCcw, Undo } from 'lucide-react';
import { DiagramToolKey } from '@/src/types/exercises/sentence-diagramming';
import { DIAGRAM_TOOL_GROUPS } from '@/src/utils/sentenceDiagramming';

interface DiagrammingToolbarProps {
  editor: Editor;
  onAnnotationClick: (type: DiagramToolKey) => void;
  onClearAnnotations: () => void;
  onResetTextColors: () => void;
  onAddTooltip?: () => void;
  disabled?: boolean;
  isStudentMode?: boolean;
  availableTools?: DiagramToolKey[];
}

interface DiagramToolbarItem {
  type: DiagramToolKey;
  label: string;
  markName: string;
  className?: string;
  swatchClassName?: string;
  title?: string;
}

type DiagramToolbarMetadata = Omit<DiagramToolbarItem, 'type'>;

const TOOL_METADATA: Record<DiagramToolKey, DiagramToolbarMetadata> = {
  'subordinate-brackets': {
    label: 'Subord. Clause',
    markName: 'subordinateBrackets',
    title: 'Subordinate clause (brackets)',
  },
  'prepositional-parentheses': {
    label: 'Prep. Phrase',
    markName: 'prepositionalParentheses',
    title: 'Prepositional phrase (parentheses)',
  },
  'verb-circle': {
    label: 'Verb',
    markName: 'verbCircle',
    title: 'Verb (single yellow circle)',
  },
  'infinitive-double-circle': {
    label: 'Infinitive',
    markName: 'infinitiveDoubleCircle',
    title: 'Infinitive (double yellow circle)',
  },
  'participle-box': {
    label: 'Participle',
    markName: 'participleBox',
    title: 'Participle / participial phrase (yellow box)',
  },
  passive: {
    label: 'Passive',
    markName: 'passive',
    className: 'border-blue-300 bg-blue-50 text-blue-800',
    swatchClassName: 'bg-blue-600',
    title: 'Passive (blue text)',
  },
  compound: {
    label: 'Compound',
    markName: 'compound',
    className: 'border-red-300 bg-red-50 text-red-800',
    swatchClassName: 'bg-red-600',
    title: 'Compound / periphrastic (red text)',
  },
  'nominative-underline': {
    label: 'Nominative',
    markName: 'nominativeUnderline',
    title: 'Nominative (single underline)',
  },
  'accusative-double-underline': {
    label: 'Accusative',
    markName: 'accusativeDoubleUnderline',
    title: 'Accusative (double underline)',
  },
  'predicate-nominative-squiggle': {
    label: 'Predicate Nom.',
    markName: 'predicateNominativeSquiggle',
    title: 'Predicate nominative (single squiggle)',
  },
  'predicate-accusative-double-squiggle': {
    label: 'Predicate Acc.',
    markName: 'predicateAccusativeDoubleSquiggle',
    title: 'Predicate accusative (double squiggle)',
  },
  'genitive-bold': {
    label: 'Genitive',
    markName: 'genitiveBold',
    title: 'Genitive (bold)',
  },
  'vocative-v': {
    label: 'Vocative',
    markName: 'vocativeV',
    title: 'Vocative (superimposed V)',
  },
  'shared-italic': {
    label: 'Conj./Adv./Interj.',
    markName: 'sharedItalic',
    title: 'Conjunction / adverb / interjection (italic)',
  },
};

const buttonClass = (isActive: boolean, disabled: boolean, customClass?: string) => {
  const baseClass = [
    'rounded border px-2 py-1 text-xs font-medium transition-colors',
    isActive ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
  ];

  if (customClass) {
    baseClass.push(customClass);
  }

  return baseClass.join(' ');
};

export const DiagrammingToolbar: React.FC<DiagrammingToolbarProps> = ({
  editor,
  onAnnotationClick,
  onClearAnnotations,
  onResetTextColors,
  onAddTooltip,
  disabled = false,
  isStudentMode = false,
  availableTools,
}) => {
  const visibleTools = new Set(availableTools);
  const visibleGroups = DIAGRAM_TOOL_GROUPS.map(group => ({
    ...group,
    items: (availableTools ? group.tools.filter(tool => visibleTools.has(tool)) : group.tools).map(tool => ({
      type: tool,
      ...TOOL_METADATA[tool],
    })),
  })).filter(group => group.items.length > 0);

  return (
    <div className="border-b border-gray-300 bg-gray-50 p-3 space-y-3">
      {visibleGroups.map(group => (
        <div key={group.title} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-32 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.title}</div>
          <div className="flex flex-wrap gap-2">
            {group.items.map(item => (
              <button
                key={item.type}
                type="button"
                disabled={disabled}
                onClick={() => onAnnotationClick(item.type)}
                className={buttonClass(editor.isActive(item.markName), disabled, item.className)}
                title={item.title || item.label}>
                <span className="flex items-center gap-1.5">
                  {item.swatchClassName ? (
                    <span className={`h-2.5 w-2.5 rounded-full ${item.swatchClassName}`} />
                  ) : null}
                  <span>{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="w-32 text-xs font-semibold uppercase tracking-wide text-gray-500">Tools</div>
        <div className="flex flex-wrap gap-2">
          {visibleTools.has('passive') || visibleTools.has('compound') || !availableTools ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onResetTextColors}
              className={buttonClass(false, disabled)}
              title="Reset passive / compound color">
              Reset Color
            </button>
          ) : null}

          {!isStudentMode && onAddTooltip ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onAddTooltip}
              className={buttonClass(editor.isActive('tooltip'), disabled)}
              title="Add tooltip">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                Tooltip
              </span>
            </button>
          ) : null}

          <button
            type="button"
            disabled={disabled || !editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
            className={buttonClass(false, disabled || !editor.can().undo())}
            title="Undo">
            <span className="flex items-center gap-1">
              <Undo className="h-3.5 w-3.5" />
              Undo
            </span>
          </button>

          <button
            type="button"
            disabled={disabled || !editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
            className={buttonClass(false, disabled || !editor.can().redo())}
            title="Redo">
            <span className="flex items-center gap-1">
              <Redo className="h-3.5 w-3.5" />
              Redo
            </span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={onClearAnnotations}
            className={buttonClass(false, disabled, 'text-red-700')}
            title="Clear annotations">
            <span className="flex items-center gap-1">
              <RotateCcw className="h-3.5 w-3.5" />
              Clear
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
