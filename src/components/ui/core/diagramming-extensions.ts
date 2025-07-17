import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagramming: {
      setPreposition: (attributes?: Record<string, any>) => ReturnType;
      unsetPreposition: () => ReturnType;
      setSubordination: (attributes?: Record<string, any>) => ReturnType;
      unsetSubordination: () => ReturnType;
      setVerbCircle: (attributes?: Record<string, any>) => ReturnType;
      unsetVerbCircle: () => ReturnType;
      setSubjectUnderline: (attributes?: Record<string, any>) => ReturnType;
      unsetSubjectUnderline: () => ReturnType;
      setDirectObjectUnderline: (attributes?: Record<string, any>) => ReturnType;
      unsetDirectObjectUnderline: () => ReturnType;
      setIndirectObjectBracket: (attributes?: Record<string, any>) => ReturnType;
      unsetIndirectObjectBracket: () => ReturnType;
      setGenitiveArrow: (attributes?: Record<string, any>) => ReturnType;
      unsetGenitiveArrow: () => ReturnType;
      setAblativePhrase: (attributes?: Record<string, any>) => ReturnType;
      unsetAblativePhrase: () => ReturnType;
    };
  }
}

export const PrepositionExtension = Mark.create({
  name: 'preposition',
  
  addAttributes() {
    return {
      wordIds: {
        default: [],
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-preposition]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-preposition': 'true',
        class: 'preposition-annotation',
        style: 'background-color: #fef3c7; border: 1px solid #f59e0b; padding: 1px 2px; border-radius: 3px; position: relative;',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setPreposition: (attributes = {}) => ({ commands, editor }) => {
        if (editor.isActive(this.name)) {
          return commands.unsetMark(this.name);
        }
        return commands.setMark(this.name, attributes);
      },
      unsetPreposition: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

export const SubordinationExtension = Mark.create({
  name: 'subordination',
  
  addAttributes() {
    return {
      wordIds: {
        default: [],
      },
      clauseType: {
        default: 'relative',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-subordination]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-subordination': 'true',
        class: 'subordination-annotation',
        style: 'background-color: #dbeafe; border: 2px dashed #3b82f6; padding: 1px 2px; border-radius: 3px; position: relative;',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setSubordination: (attributes = {}) => ({ commands, editor }) => {
        if (editor.isActive(this.name)) {
          return commands.unsetMark(this.name);
        }
        return commands.setMark(this.name, attributes);
      },
      unsetSubordination: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

export const VerbCircleExtension = Mark.create({
  name: 'verbCircle',
  
  addAttributes() {
    return {
      wordIds: {
        default: [],
      },
      voice: {
        default: 'active',
      },
      expectsDirectObject: {
        default: true,
      },
      expectsAgent: {
        default: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-verb-circle]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
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

  addCommands() {
    return {
      setVerbCircle: (attributes = {}) => ({ commands, editor }) => {
        if (editor.isActive(this.name)) {
          return commands.unsetMark(this.name);
        }
        return commands.setMark(this.name, attributes);
      },
      unsetVerbCircle: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

export const SubjectUnderlineExtension = Mark.create({
  name: 'subjectUnderline',
  
  addAttributes() {
    return {
      wordIds: {
        default: [],
      },
      person: {
        default: '3rd',
      },
      number: {
        default: 'singular',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-subject-underline]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-subject-underline': 'true',
        class: 'subject-underline-annotation',
        style: 'border-bottom: 2px solid #1f2937; padding-bottom: 1px;',
        title: 'Subject (Nominative)',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setSubjectUnderline: (attributes = {}) => ({ commands, editor }) => {
        if (editor.isActive(this.name)) {
          return commands.unsetMark(this.name);
        }
        return commands.setMark(this.name, attributes);
      },
      unsetSubjectUnderline: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

export const DirectObjectUnderlineExtension = Mark.create({
  name: 'directObjectUnderline',
  
  addAttributes() {
    return {
      wordIds: {
        default: [],
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-direct-object-underline]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-direct-object-underline': 'true',
        class: 'direct-object-underline-annotation',
        style: 'border-bottom: 4px double #1f2937; padding-bottom: 1px;',
        title: 'Direct Object (Accusative)',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setDirectObjectUnderline: (attributes = {}) => ({ commands, editor }) => {
        if (editor.isActive(this.name)) {
          return commands.unsetMark(this.name);
        }
        return commands.setMark(this.name, attributes);
      },
      unsetDirectObjectUnderline: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

export const IndirectObjectBracketExtension = Mark.create({
  name: 'indirectObjectBracket',
  
  addAttributes() {
    return {
      wordIds: {
        default: [],
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-indirect-object-bracket]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-indirect-object-bracket': 'true',
        class: 'indirect-object-bracket-annotation',
        style: 'border-left: 3px solid #059669; padding-left: 3px; background-color: #f0fdf4; position: relative;',
        title: 'Indirect Object (Dative)',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setIndirectObjectBracket: (attributes = {}) => ({ commands, editor }) => {
        if (editor.isActive(this.name)) {
          return commands.unsetMark(this.name);
        }
        return commands.setMark(this.name, attributes);
      },
      unsetIndirectObjectBracket: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

export const GenitiveArrowExtension = Mark.create({
  name: 'genitiveArrow',
  
  addAttributes() {
    return {
      wordIds: {
        default: [],
      },
      genitiveWordId: {
        default: '',
      },
      modifiedWordId: {
        default: '',
      },
      relationshipType: {
        default: 'possession',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-genitive-arrow]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-genitive-arrow': 'true',
        class: 'genitive-arrow-annotation',
        style: 'background-color: #fdf4ff; border: 1px solid #a855f7; padding: 1px 2px; border-radius: 3px; position: relative;',
        title: 'Genitive (shows possession/relationship)',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setGenitiveArrow: (attributes = {}) => ({ commands, editor }) => {
        if (editor.isActive(this.name)) {
          return commands.unsetMark(this.name);
        }
        return commands.setMark(this.name, attributes);
      },
      unsetGenitiveArrow: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

export const AblativePhraseExtension = Mark.create({
  name: 'ablativePhrase',
  
  addAttributes() {
    return {
      wordIds: {
        default: [],
      },
      ablativeType: {
        default: 'means',
      },
      hasPreposition: {
        default: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-ablative-phrase]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
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

  addCommands() {
    return {
      setAblativePhrase: (attributes = {}) => ({ commands, editor }) => {
        if (editor.isActive(this.name)) {
          return commands.unsetMark(this.name);
        }
        return commands.setMark(this.name, attributes);
      },
      unsetAblativePhrase: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});

export const DiagrammingExtensions = [
  PrepositionExtension,
  SubordinationExtension,
  VerbCircleExtension,
  SubjectUnderlineExtension,
  DirectObjectUnderlineExtension,
  IndirectObjectBracketExtension,
  GenitiveArrowExtension,
  AblativePhraseExtension,
];