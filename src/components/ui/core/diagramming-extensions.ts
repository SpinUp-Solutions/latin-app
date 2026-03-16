import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
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
  startCharOffset: {
    default: null,
  },
  endCharOffset: {
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

const GROUPING_WIDGETS = {
  prepositionalParentheses: {
    startText: '(',
    endText: ')',
    className: 'diagram-group-boundary diagram-group-boundary-parentheses',
  },
  subordinateBrackets: {
    startText: '[',
    endText: ']',
    className: 'diagram-group-boundary diagram-group-boundary-brackets',
  },
} as const;

const groupingDecorationPluginKey = new PluginKey('diagramGroupingDecorations');

const buildBoundaryWidget = (text: string, className: string) => () => {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  span.contentEditable = 'false';
  return span;
};

const DiagramGroupingDecorationsExtension = Extension.create({
  name: 'diagramGroupingDecorations',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: groupingDecorationPluginKey,
        props: {
          decorations: state => {
            const groups = new Map<
              string,
              {
                id: string;
                markName: keyof typeof GROUPING_WIDGETS;
                start: number;
                end: number;
                startWordIndex: number;
                endWordIndex: number;
              }
            >();

            state.doc.nodesBetween(0, state.doc.content.size, (node, pos) => {
              if (!node.isText) {
                return;
              }

              node.marks.forEach(mark => {
                if (!(mark.type.name in GROUPING_WIDGETS) || !mark.attrs.id) {
                  return;
                }

                const markName = mark.type.name as keyof typeof GROUPING_WIDGETS;
                const startWordIndex = Number(mark.attrs.startWordIndex);
                const endWordIndex = Number(mark.attrs.endWordIndex);
                const existing = groups.get(mark.attrs.id);
                const nextEnd = pos + node.nodeSize;

                if (existing) {
                  existing.start = Math.min(existing.start, pos);
                  existing.end = Math.max(existing.end, nextEnd);
                  if (!Number.isNaN(startWordIndex)) {
                    existing.startWordIndex = Math.min(existing.startWordIndex, startWordIndex);
                  }
                  if (!Number.isNaN(endWordIndex)) {
                    existing.endWordIndex = Math.max(existing.endWordIndex, endWordIndex);
                  }
                  return;
                }

                groups.set(mark.attrs.id, {
                  id: mark.attrs.id,
                  markName,
                  start: pos,
                  end: nextEnd,
                  startWordIndex: Number.isNaN(startWordIndex) ? 0 : startWordIndex,
                  endWordIndex: Number.isNaN(endWordIndex) ? 0 : endWordIndex,
                });
              });
            });

            const groupValues = Array.from(groups.values());
            const decorations = [
              ...groupValues
                .slice()
                .sort((left, right) => {
                  if (left.start !== right.start) {
                    return left.start - right.start;
                  }

                  return right.endWordIndex - left.endWordIndex;
                })
                .map(group =>
                  Decoration.widget(
                    group.start,
                    buildBoundaryWidget(
                      GROUPING_WIDGETS[group.markName].startText,
                      GROUPING_WIDGETS[group.markName].className
                    ),
                    {
                      key: `${group.id}:start`,
                      side: -1,
                    }
                  )
                ),
              ...groupValues
                .slice()
                .sort((left, right) => {
                  if (left.end !== right.end) {
                    return left.end - right.end;
                  }

                  return right.startWordIndex - left.startWordIndex;
                })
                .map(group =>
                  Decoration.widget(
                    group.end,
                    buildBoundaryWidget(
                      GROUPING_WIDGETS[group.markName].endText,
                      GROUPING_WIDGETS[group.markName].className
                    ),
                    {
                      key: `${group.id}:end`,
                      side: 1,
                    }
                  )
                ),
            ];

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

export const DiagrammingExtensions = [
  ...DIAGRAM_MARK_DEFINITIONS.map(definition =>
    createDiagrammingExtension({
      markName: definition.markName,
      dataAttribute: definition.dataAttribute,
      className: definition.className,
      title: definition.title,
    })
  ),
  DiagramWordTokenExtension,
  DiagramGroupingDecorationsExtension,
];
