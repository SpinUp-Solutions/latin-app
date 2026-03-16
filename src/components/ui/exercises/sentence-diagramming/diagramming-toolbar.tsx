import React from 'react';
import { Editor } from '@tiptap/react';
import { MessageSquare, Redo, RotateCcw, Undo } from 'lucide-react';
import { DiagramToolKey } from '@/src/types/exercises/sentence-diagramming';
import {
  DIAGRAM_MARK_DEFINITION_BY_TYPE,
  DIAGRAM_TOOL_GROUPS,
  normalizeDiagramToolKeys,
} from '@/src/utils/sentenceDiagramming';

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

type DiagramToolbarMetadata = Omit<DiagramToolbarItem, 'type' | 'markName'>;

const TOOL_METADATA: Partial<Record<DiagramToolKey, DiagramToolbarMetadata>> = {
  'subordinate-brackets': {
    label: 'Subord. Cl.',
    title: 'Subordinate clause',
  },
  'prepositional-parentheses': {
    label: 'Prep. Phr.',
    title: 'Prepositional phrase',
  },
  'ablative-absolute': {
    label: 'Abl. Absolute',
    title: 'Ablative absolute',
  },
  'passive-periphrastic': {
    label: 'Passive Periphrastic',
    title: 'Passive periphrastic',
  },
  'verb-circle': {
    label: 'Verb',
    title: 'Verb',
  },
  'infinitive-double-circle': {
    label: 'Infinitive',
    title: 'Infinitive',
  },
  'participle-box': {
    label: 'Participle',
    title: 'Participle',
  },
  'participial-phrase-box': {
    label: 'Participial Phrase',
    title: 'Participial phrase',
  },
  active: {
    label: 'Active',
    title: 'Active voice',
  },
  passive: {
    label: 'Passive',
    className: 'border-blue-300 bg-blue-50 text-blue-800',
    swatchClassName: 'bg-blue-600',
    title: 'Passive voice',
  },
  'person-1s': {
    label: '1s',
    title: 'First person singular',
  },
  'person-2s': {
    label: '2s',
    title: 'Second person singular',
  },
  'person-3s': {
    label: '3s',
    title: 'Third person singular',
  },
  'person-1p': {
    label: '1p',
    title: 'First person plural',
  },
  'person-2p': {
    label: '2p',
    title: 'Second person plural',
  },
  'person-3p': {
    label: '3p',
    title: 'Third person plural',
  },
  'special-plus-dative': {
    label: '+ Dat.',
    className: 'border-red-300 bg-red-50 text-red-800',
    swatchClassName: 'bg-red-600',
    title: 'Takes a dative',
  },
  'special-intransitive': {
    label: 'Intransitive',
    className: 'border-red-300 bg-red-50 text-red-800',
    swatchClassName: 'bg-red-600',
    title: 'Intransitive',
  },
  'special-plus-ablative': {
    label: '+ Abl.',
    className: 'border-blue-300 bg-blue-50 text-blue-800',
    swatchClassName: 'bg-blue-600',
    title: 'Takes an ablative',
  },
  'nominative-underline': {
    label: 'Nominative',
    title: 'Nominative',
  },
  'predicate-nominative-squiggle': {
    label: 'Pred. Nom.',
    title: 'Predicate nominative',
  },
  'accusative-double-underline': {
    label: 'Accusative',
    title: 'Accusative',
  },
  'predicate-accusative-double-squiggle': {
    label: 'Pred. Acc.',
    title: 'Predicate accusative',
  },
  'genitive-bold': {
    label: 'Genitive',
    title: 'Genitive',
  },
  'dative-orange': {
    label: 'Dative',
    className: 'border-orange-300 bg-orange-50 text-orange-800',
    swatchClassName: 'bg-orange-500',
    title: 'Dative',
  },
  'ablative-green': {
    label: 'Ablative (green)',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    swatchClassName: 'bg-emerald-600',
    title: 'Ablative (green)',
  },
  'vocative-uppercase': {
    label: 'Vocative',
    title: 'Vocative',
  },
  'locative-bold': {
    label: 'Locative',
    title: 'Locative',
  },
  'shared-italic': {
    label: 'Conj./Adv./Interj.',
    title: 'Conjunction / adverb / interjection',
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
  const normalizedTools = availableTools ? normalizeDiagramToolKeys(availableTools) : undefined;
  const visibleTools = new Set(normalizedTools);
  const visibleGroups = DIAGRAM_TOOL_GROUPS.map(group => ({
    ...group,
    items: (normalizedTools ? group.tools.filter(tool => visibleTools.has(tool)) : group.tools).reduce<DiagramToolbarItem[]>(
      (items, tool) => {
        const definition = DIAGRAM_MARK_DEFINITION_BY_TYPE[tool];
        const metadata = TOOL_METADATA[tool];

        if (!definition || !metadata) {
          return items;
        }

        items.push({
          type: tool,
          label: metadata.label,
          markName: definition.markName,
          className: metadata.className,
          swatchClassName: metadata.swatchClassName,
          title: metadata.title || definition.title,
        });

        return items;
      },
      []
    ),
  })).filter(group => group.items.length > 0);

  return (
    <div className="border-b border-gray-300 bg-gray-50 p-3 space-y-3">
      {visibleGroups.map(group => (
        <div key={group.title} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="w-32 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.title}</div>
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
          <button
            type="button"
            disabled={disabled}
            onClick={onResetTextColors}
            className={buttonClass(false, disabled)}
            title="Reset color-based annotations">
            Reset Color
          </button>

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
