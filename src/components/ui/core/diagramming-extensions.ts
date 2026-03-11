import { Mark, mergeAttributes } from '@tiptap/core';
import {
  DIAGRAM_MARK_DEFINITIONS,
  WORD_TOKEN_DATA_ATTRIBUTE,
  WORD_TOKEN_MARK_NAME,
} from '@/src/utils/sentenceDiagramming';

const selectionAttributes = {
  id: {
    default: null,
  },
  wordIds: {
    default: [],
  },
  startWordIndex: {
    default: null,
  },
  endWordIndex: {
    default: null,
  },
};

const createDiagrammingExtension = ({
  markName,
  dataAttribute,
  className,
  title,
}: {
  markName: string;
  dataAttribute: string;
  className: string;
  title: string;
}) =>
  Mark.create({
    name: markName,
    excludes: '',

    addAttributes() {
      return selectionAttributes;
    },

    parseHTML() {
      return [
        {
          tag: `span[${dataAttribute}]`,
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          [dataAttribute]: 'true',
          class: className,
          title,
        }),
        0,
      ];
    },
  });

export const DiagramWordTokenExtension = Mark.create({
  name: WORD_TOKEN_MARK_NAME,
  excludes: '',
  inclusive: false,

  addAttributes() {
    return {
      wordId: {
        default: null,
      },
      wordIndex: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `span[${WORD_TOKEN_DATA_ATTRIBUTE}]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        [WORD_TOKEN_DATA_ATTRIBUTE]: 'true',
        class: 'diagram-word-token',
      }),
      0,
    ];
  },
});

export const DiagrammingExtensions = [
  DiagramWordTokenExtension,
  ...DIAGRAM_MARK_DEFINITIONS.map(definition =>
    createDiagrammingExtension({
      markName: definition.markName,
      dataAttribute: definition.dataAttribute,
      className: definition.className,
      title: definition.title,
    })
  ),
];
