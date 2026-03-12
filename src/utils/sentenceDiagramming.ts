import { Editor } from '@tiptap/react';
import { Mark, Node } from '@tiptap/pm/model';
import {
  AnnotationType,
  DiagramMarkType,
  DiagramSelectionMark,
  DiagramToolKey,
  SentenceWord,
} from '@/src/types/exercises/sentence-diagramming';

type DiagramExclusiveGroup = 'shape' | 'line' | 'color';

export interface DiagramMarkDefinition {
  type: DiagramMarkType;
  markName: string;
  dataAttribute: string;
  className: string;
  title: string;
  exclusiveGroup?: DiagramExclusiveGroup;
}

export interface DiagramToolGroup {
  title: string;
  tools: DiagramToolKey[];
}

export const WORD_TOKEN_MARK_NAME = 'diagramWordToken';
export const WORD_TOKEN_DATA_ATTRIBUTE = 'data-diagram-word-token';

export const DIAGRAM_MARK_DEFINITIONS: DiagramMarkDefinition[] = [
  {
    type: 'verb-circle',
    markName: 'verbCircle',
    dataAttribute: 'data-verb-circle',
    className: 'diagram-verb-circle',
    title: 'Verb',
    exclusiveGroup: 'shape',
  },
  {
    type: 'infinitive-double-circle',
    markName: 'infinitiveDoubleCircle',
    dataAttribute: 'data-infinitive-double-circle',
    className: 'diagram-infinitive-double-circle',
    title: 'Infinitive',
    exclusiveGroup: 'shape',
  },
  {
    type: 'participle-box',
    markName: 'participleBox',
    dataAttribute: 'data-participle-box',
    className: 'diagram-participle-box',
    title: 'Participle / Participial Phrase',
    exclusiveGroup: 'shape',
  },
  {
    type: 'nominative-underline',
    markName: 'nominativeUnderline',
    dataAttribute: 'data-nominative-underline',
    className: 'diagram-nominative-underline',
    title: 'Nominative',
    exclusiveGroup: 'line',
  },
  {
    type: 'accusative-double-underline',
    markName: 'accusativeDoubleUnderline',
    dataAttribute: 'data-accusative-double-underline',
    className: 'diagram-accusative-double-underline',
    title: 'Accusative',
    exclusiveGroup: 'line',
  },
  {
    type: 'predicate-nominative-squiggle',
    markName: 'predicateNominativeSquiggle',
    dataAttribute: 'data-predicate-nominative-squiggle',
    className: 'diagram-predicate-nominative-squiggle',
    title: 'Predicate Nominative',
    exclusiveGroup: 'line',
  },
  {
    type: 'predicate-accusative-double-squiggle',
    markName: 'predicateAccusativeDoubleSquiggle',
    dataAttribute: 'data-predicate-accusative-double-squiggle',
    className: 'diagram-predicate-accusative-double-squiggle',
    title: 'Predicate Accusative',
    exclusiveGroup: 'line',
  },
  {
    type: 'genitive-bold',
    markName: 'genitiveBold',
    dataAttribute: 'data-genitive-bold',
    className: 'diagram-genitive-bold',
    title: 'Genitive',
  },
  {
    type: 'shared-italic',
    markName: 'sharedItalic',
    dataAttribute: 'data-shared-italic',
    className: 'diagram-shared-italic',
    title: 'Conjunction / Adverb / Interjection',
  },
  {
    type: 'vocative-v',
    markName: 'vocativeV',
    dataAttribute: 'data-vocative-v',
    className: 'diagram-vocative-v',
    title: 'Vocative',
  },
  {
    type: 'passive',
    markName: 'passive',
    dataAttribute: 'data-passive',
    className: 'diagram-passive',
    title: 'Passive',
    exclusiveGroup: 'color',
  },
  {
    type: 'compound',
    markName: 'compound',
    dataAttribute: 'data-compound',
    className: 'diagram-compound',
    title: 'Compound / Periphrastic',
    exclusiveGroup: 'color',
  },
  {
    type: 'prepositional-parentheses',
    markName: 'prepositionalParentheses',
    dataAttribute: 'data-prepositional-parentheses',
    className: 'diagram-prepositional-parentheses',
    title: 'Prepositional Phrase',
  },
  {
    type: 'subordinate-brackets',
    markName: 'subordinateBrackets',
    dataAttribute: 'data-subordinate-brackets',
    className: 'diagram-subordinate-brackets',
    title: 'Subordinate Clause',
  },
];

export const DIAGRAM_TOOL_GROUPS: DiagramToolGroup[] = [
  {
    title: 'Clause Structure',
    tools: ['subordinate-brackets', 'prepositional-parentheses'],
  },
  {
    title: 'Verbal System',
    tools: ['verb-circle', 'infinitive-double-circle', 'participle-box', 'passive', 'compound'],
  },
  {
    title: 'Case Functions',
    tools: [
      'nominative-underline',
      'accusative-double-underline',
      'predicate-nominative-squiggle',
      'predicate-accusative-double-squiggle',
      'genitive-bold',
      'vocative-v',
    ],
  },
  {
    title: 'Function Words',
    tools: ['shared-italic'],
  },
];

export const DEFAULT_STUDENT_DIAGRAM_TOOLS: DiagramToolKey[] = DIAGRAM_TOOL_GROUPS.flatMap(group => group.tools);

export const DIAGRAM_MARK_DEFINITION_BY_TYPE = Object.fromEntries(
  DIAGRAM_MARK_DEFINITIONS.map(definition => [definition.type, definition])
) as Record<DiagramMarkType, DiagramMarkDefinition>;

export const DIAGRAM_MARK_DEFINITION_BY_NAME = Object.fromEntries(
  DIAGRAM_MARK_DEFINITIONS.map(definition => [definition.markName, definition])
) as Record<string, DiagramMarkDefinition>;

const DIAGRAM_EXCLUSIVE_GROUPS: Record<DiagramExclusiveGroup, DiagramMarkDefinition[]> = {
  shape: DIAGRAM_MARK_DEFINITIONS.filter(definition => definition.exclusiveGroup === 'shape'),
  line: DIAGRAM_MARK_DEFINITIONS.filter(definition => definition.exclusiveGroup === 'line'),
  color: DIAGRAM_MARK_DEFINITIONS.filter(definition => definition.exclusiveGroup === 'color'),
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const createDiagramSelectionMarkId = (type: DiagramMarkType, startWordIndex: number, endWordIndex: number) =>
  `${type}:${startWordIndex}:${endWordIndex}`;

export const normalizeDiagramMarks = (marks: DiagramSelectionMark[]): DiagramSelectionMark[] => {
  const deduped = new Map<string, DiagramSelectionMark>();

  marks.forEach(mark => {
    const id = createDiagramSelectionMarkId(mark.type, mark.startWordIndex, mark.endWordIndex);
    deduped.set(id, {
      id,
      type: mark.type,
      startWordIndex: mark.startWordIndex,
      endWordIndex: mark.endWordIndex,
    });
  });

  return Array.from(deduped.values()).sort((left, right) => {
    if (left.startWordIndex !== right.startWordIndex) {
      return left.startWordIndex - right.startWordIndex;
    }

    if (left.endWordIndex !== right.endWordIndex) {
      return left.endWordIndex - right.endWordIndex;
    }

    return left.type.localeCompare(right.type);
  });
};

export const tokenizeSentence = (latin: string): SentenceWord[] => {
  const words = latin.split(/\s+/).filter(word => word.trim());
  let currentPosition = 0;

  return words.map((word, index) => {
    const startPosition = currentPosition;
    const endPosition = currentPosition + word.length;
    currentPosition = endPosition + 1;

    return {
      id: `word-${index}`,
      text: word,
      index,
      startPosition,
      endPosition,
    };
  });
};

export const buildDiagrammingContent = (words: SentenceWord[]) => {
  const content = words
    .map(
      word =>
        `<span ${WORD_TOKEN_DATA_ATTRIBUTE}="true" wordId="${escapeHtml(word.id)}" wordIndex="${word.index}">${escapeHtml(word.text)}</span>`
    )
    .join(' ');

  return `<p>${content}</p>`;
};

export const ensureDiagrammingContent = (htmlContent: string | undefined, words: SentenceWord[]) => {
  if (htmlContent?.includes(`${WORD_TOKEN_DATA_ATTRIBUTE}="true"`)) {
    return htmlContent;
  }

  return buildDiagrammingContent(words);
};

interface DiagramSelectionRange {
  wordIds: string[];
  startWordIndex: number;
  endWordIndex: number;
}

const getWordTokensFromSelection = (
  editor: Editor,
  from: number,
  to: number
): Array<{ wordId: string; wordIndex: number }> => {
  const tokens = new Map<number, { wordId: string; wordIndex: number }>();

  editor.state.doc.nodesBetween(from, to, (node: Node, pos: number) => {
    if (!node.isText) {
      return;
    }

    const overlapsSelection = pos < to && pos + node.nodeSize > from;
    if (!overlapsSelection) {
      return;
    }

    const wordTokenMark = node.marks.find(mark => mark.type.name === WORD_TOKEN_MARK_NAME);
    if (!wordTokenMark) {
      return;
    }

    const wordId = wordTokenMark.attrs.wordId;
    const wordIndex = Number(wordTokenMark.attrs.wordIndex);

    if (!wordId || Number.isNaN(wordIndex)) {
      return;
    }

    tokens.set(wordIndex, { wordId, wordIndex });
  });

  return Array.from(tokens.values()).sort((left, right) => left.wordIndex - right.wordIndex);
};

export const getSelectionWordRange = (editor: Editor): DiagramSelectionRange | null => {
  const { from, to } = editor.state.selection;
  if (from === to) {
    return null;
  }

  const tokens = getWordTokensFromSelection(editor, from, to);
  if (tokens.length === 0) {
    return null;
  }

  return {
    wordIds: tokens.map(token => token.wordId),
    startWordIndex: tokens[0].wordIndex,
    endWordIndex: tokens[tokens.length - 1].wordIndex,
  };
};

export const extractDiagramMarksFromEditor = (editor: Editor): DiagramSelectionMark[] => {
  const extracted: DiagramSelectionMark[] = [];

  editor.state.doc.descendants((node: Node) => {
    if (!node.marks?.length) {
      return;
    }

    node.marks.forEach(mark => {
      const definition = DIAGRAM_MARK_DEFINITION_BY_NAME[mark.type.name];
      if (!definition) {
        return;
      }

      const startWordIndex = Number(mark.attrs.startWordIndex);
      const endWordIndex = Number(mark.attrs.endWordIndex);

      if (Number.isNaN(startWordIndex) || Number.isNaN(endWordIndex)) {
        return;
      }

      extracted.push({
        id: createDiagramSelectionMarkId(definition.type, startWordIndex, endWordIndex),
        type: definition.type,
        startWordIndex,
        endWordIndex,
      });
    });
  });

  return normalizeDiagramMarks(extracted);
};

const hasMarkType = (editor: Editor, markName: string) => Boolean(editor.state.schema.marks[markName]);

const selectionHasExactMark = (editor: Editor, markName: string, markId: string) => {
  const { from, to } = editor.state.selection;
  let foundWordToken = false;
  let exactMarkOnSelection = true;

  editor.state.doc.nodesBetween(from, to, (node: Node, pos: number) => {
    if (!node.isText || pos >= to || pos + node.nodeSize <= from) {
      return;
    }

    const isWordTokenText = node.marks.some(mark => mark.type.name === WORD_TOKEN_MARK_NAME);
    if (!isWordTokenText) {
      return;
    }

    foundWordToken = true;

    const hasExactMark = node.marks.some(mark => mark.type.name === markName && mark.attrs.id === markId);
    if (!hasExactMark) {
      exactMarkOnSelection = false;
      return false;
    }
  });

  return foundWordToken && exactMarkOnSelection;
};

const unsetExactMark = (
  editor: Editor,
  markName: string,
  attrs: {
    id: string;
    wordIds: string[];
    startWordIndex: number;
    endWordIndex: number;
  }
) => {
  const removals: Array<{ from: number; to: number; mark: Mark }> = [];

  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node: Node, pos: number) => {
    if (!node.isText) {
      return;
    }

    node.marks.forEach(mark => {
      if (mark.type.name === markName && mark.attrs.id === attrs.id) {
        removals.push({
          from: pos,
          to: pos + node.nodeSize,
          mark,
        });
      }
    });
  });

  if (removals.length === 0) {
    return;
  }

  const transaction = removals.reduce(
    (tr, removal) => tr.removeMark(removal.from, removal.to, removal.mark),
    editor.state.tr
  );

  editor.view.dispatch(transaction);
  editor.commands.focus();
};

const unsetExclusiveMarks = (editor: Editor, definition: DiagramMarkDefinition) => {
  const group = definition.exclusiveGroup ? DIAGRAM_EXCLUSIVE_GROUPS[definition.exclusiveGroup] : [];
  let chain = editor.chain().focus();

  group.forEach(groupDefinition => {
    if (groupDefinition.markName !== definition.markName && hasMarkType(editor, groupDefinition.markName)) {
      chain = chain.unsetMark(groupDefinition.markName);
    }
  });

  return chain;
};

export const handleAnnotationClick = (editor: Editor, annotationType: AnnotationType, isDisabled?: boolean) => {
  if (!editor || isDisabled) {
    return;
  }

  if (!hasMarkType(editor, DIAGRAM_MARK_DEFINITION_BY_TYPE[annotationType].markName)) {
    return;
  }

  const selectionRange = getSelectionWordRange(editor);
  if (!selectionRange) {
    alert('Please select one or more words to annotate');
    return;
  }

  const definition = DIAGRAM_MARK_DEFINITION_BY_TYPE[annotationType];
  const markId = createDiagramSelectionMarkId(
    annotationType,
    selectionRange.startWordIndex,
    selectionRange.endWordIndex
  );
  const attrs = {
    id: markId,
    wordIds: selectionRange.wordIds,
    startWordIndex: selectionRange.startWordIndex,
    endWordIndex: selectionRange.endWordIndex,
  };

  if (selectionHasExactMark(editor, definition.markName, markId)) {
    unsetExactMark(editor, definition.markName, attrs);
    return;
  }

  unsetExclusiveMarks(editor, definition).setMark(definition.markName, attrs).run();
};

export const handleResetTextColors = (editor: Editor, isDisabled?: boolean) => {
  if (!editor || isDisabled) {
    return;
  }

  let chain = editor.chain().focus();

  if (hasMarkType(editor, 'passive')) {
    chain = chain.unsetMark('passive');
  }

  if (hasMarkType(editor, 'compound')) {
    chain = chain.unsetMark('compound');
  }

  chain.run();
};

export const handleClearAnnotations = (editor: Editor) => {
  if (!editor) {
    return;
  }

  let chain = editor.chain().focus().selectAll();

  DIAGRAM_MARK_DEFINITIONS.forEach(definition => {
    if (hasMarkType(editor, definition.markName)) {
      chain = chain.unsetMark(definition.markName);
    }
  });

  chain.run();
};

export const compareDiagramMarks = (userMarks: DiagramSelectionMark[], solutionMarks: DiagramSelectionMark[]) => {
  const normalizedUserMarks = normalizeDiagramMarks(userMarks);
  const normalizedSolutionMarks = normalizeDiagramMarks(solutionMarks);

  const userSet = new Set(normalizedUserMarks.map(mark => mark.id));
  const solutionSet = new Set(normalizedSolutionMarks.map(mark => mark.id));

  let totalCorrect = 0;
  solutionSet.forEach(markId => {
    if (userSet.has(markId)) {
      totalCorrect++;
    }
  });

  return {
    isComplete: totalCorrect === solutionSet.size && userSet.size === solutionSet.size,
    accuracy: solutionSet.size > 0 ? (totalCorrect / solutionSet.size) * 100 : userSet.size === 0 ? 100 : 0,
    totalCorrect,
    totalExpected: solutionSet.size,
  };
};
