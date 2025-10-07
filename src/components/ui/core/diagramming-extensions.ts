import { Mark, mergeAttributes } from '@tiptap/core';

export interface DiagrammingExtensionConfig {
  name: string;
  dataAttribute: string;
  className: string;
  style: string;
  title: string;
  customRender?: (HTMLAttributes: Record<string, unknown>) => [string, Record<string, unknown>, number];
}

export interface DiagrammingCommands {
  [key: string]: {
    set: (attributes?: Record<string, unknown>) => boolean;
    unset: () => boolean;
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagramming: {
      setPreposition: (attributes?: Record<string, unknown>) => ReturnType;
      unsetPreposition: () => ReturnType;
      setSubordination: (attributes?: Record<string, unknown>) => ReturnType;
      unsetSubordination: () => ReturnType;
      setVerbCircle: (attributes?: Record<string, unknown>) => ReturnType;
      unsetVerbCircle: () => ReturnType;
      setSubjectUnderline: (attributes?: Record<string, unknown>) => ReturnType;
      unsetSubjectUnderline: () => ReturnType;
      setDirectObjectUnderline: (attributes?: Record<string, unknown>) => ReturnType;
      unsetDirectObjectUnderline: () => ReturnType;
      setIndirectObjectBracket: (attributes?: Record<string, unknown>) => ReturnType;
      unsetIndirectObjectBracket: () => ReturnType;
      setGenitiveArrow: (attributes?: Record<string, unknown>) => ReturnType;
      unsetGenitiveArrow: () => ReturnType;
      setGenitiveArrowTarget: (attributes?: Record<string, unknown>) => ReturnType;
      unsetGenitiveArrowTarget: () => ReturnType;
      setAblativePhrase: (attributes?: Record<string, unknown>) => ReturnType;
      unsetAblativePhrase: () => ReturnType;
    };
  }
}

const baseAttributes = {
  wordIds: {
    default: [],
  },
};

export const createDiagrammingExtension = (config: DiagrammingExtensionConfig) => {
  return Mark.create({
    name: config.name,

    addAttributes() {
      return baseAttributes;
    },

    parseHTML() {
      return [
        {
          tag: `span[${config.dataAttribute}]`,
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      if (config.customRender) {
        return config.customRender(HTMLAttributes);
      }

      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          [config.dataAttribute]: 'true',
          class: config.className,
          style: config.style,
          title: config.title,
        }),
        0,
      ];
    },

    addCommands() {
      const setCommandName = `set${config.name.charAt(0).toUpperCase()}${config.name.slice(1)}`;
      const unsetCommandName = `unset${config.name.charAt(0).toUpperCase()}${config.name.slice(1)}`;

      return {
        [setCommandName]:
          (attributes = {}) =>
          ({
            commands,
            editor,
          }: {
            commands: {
              setMark: (name: string, attrs?: Record<string, unknown>) => boolean;
              unsetMark: (name: string) => boolean;
            };
            editor: { isActive: (name: string) => boolean };
          }) => {
            if (editor.isActive(this.name)) {
              return commands.unsetMark(this.name);
            }
            return commands.setMark(this.name, attributes);
          },
        [unsetCommandName]:
          () =>
          ({ commands }: { commands: { unsetMark: (name: string) => boolean } }) => {
            return commands.unsetMark(this.name);
          },
      };
    },
  });
};

export const extensionConfigs: DiagrammingExtensionConfig[] = [
  {
    name: 'preposition',
    dataAttribute: 'data-preposition',
    className: 'preposition-annotation',
    style:
      'background-color: #fef3c7; border: 1px solid #f59e0b; padding: 1px 2px; border-radius: 3px; position: relative;',
    title: 'Preposition',
  },
  {
    name: 'subordination',
    dataAttribute: 'data-subordination',
    className: 'subordination-annotation',
    style:
      'background-color: #dbeafe; border: 2px dashed #3b82f6; padding: 1px 2px; border-radius: 3px; position: relative;',
    title: 'Subordinate Clause',
  },
  {
    name: 'verbCircle',
    dataAttribute: 'data-verb-circle',
    className: 'verb-circle-annotation',
    style: '', // Will be overridden by customRender
    title: 'Verb',
    customRender: HTMLAttributes => {
      const voice = HTMLAttributes.voice || 'active';
      const isActive = voice === 'active';

      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          'data-verb-circle': 'true',
          class: `verb-circle-annotation ${isActive ? 'active' : 'passive'}`,
          style: `border: 2px solid ${isActive ? '#dc2626' : '#7c3aed'}; border-radius: 50%; padding: 2px 4px; background-color: ${isActive ? '#fef2f2' : '#f3e8ff'};`,
          title: `${voice} voice`,
        }),
        0,
      ];
    },
  },
  {
    name: 'subjectUnderline',
    dataAttribute: 'data-subject-underline',
    className: 'subject-underline-annotation',
    style: 'border-bottom: 2px solid #1f2937; padding-bottom: 1px;',
    title: 'Subject (Nominative)',
  },
  {
    name: 'directObjectUnderline',
    dataAttribute: 'data-direct-object-underline',
    className: 'direct-object-underline-annotation',
    style: 'border-bottom: 4px double #1f2937; padding-bottom: 1px;',
    title: 'Direct Object (Accusative)',
  },
  {
    name: 'indirectObjectBracket',
    dataAttribute: 'data-indirect-object-bracket',
    className: 'indirect-object-bracket-annotation',
    style: 'border-left: 3px solid #059669; padding-left: 3px; background-color: #f0fdf4; position: relative;',
    title: 'Indirect Object (Dative)',
  },
  {
    name: 'genitiveArrow',
    dataAttribute: 'data-genitive-arrow',
    className: 'genitive-arrow-annotation',
    style:
      'background-color: #fdf4ff; border: 1px solid #a855f7; padding: 1px 2px; border-radius: 3px; position: relative;',
    title: 'Genitive (shows possession/relationship)',
  },
  {
    name: 'genitiveArrowTarget',
    dataAttribute: 'data-genitive-arrow-target',
    className: 'genitive-arrow-target-annotation',
    style:
      'background-color: #fef2f2; border: 1px solid #ef4444; padding: 1px 2px; border-radius: 3px; position: relative;',
    title: 'Genitive Target (what is possessed/modified)',
  },
  {
    name: 'ablativePhrase',
    dataAttribute: 'data-ablative-phrase',
    className: 'ablative-phrase-annotation',
    style: '', // Will be overridden by customRender
    title: 'Ablative Phrase',
    customRender: HTMLAttributes => {
      const ablativeType = HTMLAttributes.ablativeType || 'means';
      const typeColors = {
        agent: '#ef4444',
        means: '#06b6d4',
        manner: '#8b5cf6',
        place: '#10b981',
        time: '#f59e0b',
        accompaniment: '#ec4899',
        separation: '#6b7280',
      };

      const color = typeColors[ablativeType as keyof typeof typeColors] || '#06b6d4';

      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          'data-ablative-phrase': 'true',
          class: 'ablative-phrase-annotation',
          style: `background-color: ${color}20; border: 1px solid ${color}; padding: 1px 3px; border-radius: 3px;`,
          title: `Ablative of ${ablativeType}`,
        }),
        0,
      ];
    },
  },
];

export const PrepositionExtension = createDiagrammingExtension(extensionConfigs[0]);
export const SubordinationExtension = createDiagrammingExtension(extensionConfigs[1]);
export const VerbCircleExtension = createDiagrammingExtension(extensionConfigs[2]);
export const SubjectUnderlineExtension = createDiagrammingExtension(extensionConfigs[3]);
export const DirectObjectUnderlineExtension = createDiagrammingExtension(extensionConfigs[4]);
export const IndirectObjectBracketExtension = createDiagrammingExtension(extensionConfigs[5]);
export const GenitiveArrowExtension = createDiagrammingExtension(extensionConfigs[6]);
export const GenitiveArrowTargetExtension = createDiagrammingExtension(extensionConfigs[7]);
export const AblativePhraseExtension = createDiagrammingExtension(extensionConfigs[8]);

export const DiagrammingExtensions = [
  PrepositionExtension,
  SubordinationExtension,
  VerbCircleExtension,
  SubjectUnderlineExtension,
  DirectObjectUnderlineExtension,
  IndirectObjectBracketExtension,
  GenitiveArrowExtension,
  GenitiveArrowTargetExtension,
  AblativePhraseExtension,
];
