import { Editor } from '@tiptap/react';
import { Mark, Node } from '@tiptap/pm/model';
import {
  AnnotationType,
  DiagramMarkType,
  DiagramSelectionMark,
  DiagramToolKey,
  SentenceWord,
} from '@/src/types/exercises/sentence-diagramming';

type DiagramExclusiveGroup = 'shape' | 'line' | 'case' | 'voice' | 'person' | 'special';
type DiagramSelectionMode = 'word' | 'exact';

export interface DiagramMarkDefinition {
  type: DiagramMarkType;
  markName: string;
  dataAttribute: string;
  className: string;
  title: string;
  exclusiveGroup?: DiagramExclusiveGroup;
  selectionMode?: DiagramSelectionMode;
}

export interface DiagramToolGroup {
  title: string;
  tools: DiagramToolKey[];
}

interface DiagramSelectionRange {
  from: number;
  to: number;
  wordIds: string[];
  startWordIndex: number;
  endWordIndex: number;
  startCharOffset: number;
  endCharOffset: number;
}

interface WordTokenSegment {
  from: number;
  to: number;
  wordId: string;
  wordIndex: number;
  startCharOffset: number;
  endCharOffset: number;
}

const PERSON_MARK_TYPES: DiagramMarkType[] = ['person-1s', 'person-2s', 'person-3s', 'person-1p', 'person-2p', 'person-3p'];
const RESET_COLOR_MARK_TYPES: DiagramMarkType[] = [
  'active',
  'passive',
  'dative-orange',
  'ablative-green',
  'special-plus-dative',
  'special-intransitive',
  'special-plus-ablative',
];

export const WORD_TOKEN_MARK_NAME = 'diagramWordToken';
export const WORD_TOKEN_DATA_ATTRIBUTE = 'data-diagram-word-token';

export const normalizeDiagramToolKey = (tool: DiagramToolKey): DiagramToolKey => tool;

export const normalizeDiagramToolKeys = (tools: DiagramToolKey[] | undefined): DiagramToolKey[] => {
  const seen = new Set<DiagramToolKey>();

  return (tools || []).reduce<DiagramToolKey[]>((normalized, tool) => {
    const nextTool = normalizeDiagramToolKey(tool);
    if (!seen.has(nextTool)) {
      seen.add(nextTool);
      normalized.push(nextTool);
    }
    return normalized;
  }, []);
};

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
    title: 'Participle',
    exclusiveGroup: 'shape',
  },
  {
    type: 'participial-phrase-box',
    markName: 'participialPhraseBox',
    dataAttribute: 'data-participial-phrase-box',
    className: 'diagram-participle-box',
    title: 'Participial Phrase',
    exclusiveGroup: 'shape',
  },
  {
    type: 'ablative-absolute',
    markName: 'ablativeAbsolute',
    dataAttribute: 'data-ablative-absolute',
    className: 'diagram-participle-box',
    title: 'Ablative Absolute',
    exclusiveGroup: 'shape',
  },
  {
    type: 'passive-periphrastic',
    markName: 'passivePeriphrastic',
    dataAttribute: 'data-passive-periphrastic',
    className: 'diagram-passive-periphrastic',
    title: 'Passive Periphrastic',
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
    exclusiveGroup: 'case',
  },
  {
    type: 'dative-orange',
    markName: 'dativeOrange',
    dataAttribute: 'data-dative-orange',
    className: 'diagram-dative-orange',
    title: 'Dative',
    exclusiveGroup: 'case',
  },
  {
    type: 'ablative-green',
    markName: 'ablativeGreen',
    dataAttribute: 'data-ablative-green',
    className: 'diagram-ablative-green',
    title: 'Ablative (green)',
    exclusiveGroup: 'case',
  },
  {
    type: 'locative-bold',
    markName: 'locativeBold',
    dataAttribute: 'data-locative-bold',
    className: 'diagram-genitive-bold',
    title: 'Locative',
    exclusiveGroup: 'case',
  },
  {
    type: 'vocative-uppercase',
    markName: 'vocativeUppercase',
    dataAttribute: 'data-vocative-uppercase',
    className: 'diagram-vocative-uppercase',
    title: 'Vocative',
    exclusiveGroup: 'case',
  },
  {
    type: 'active',
    markName: 'active',
    dataAttribute: 'data-active',
    className: 'diagram-active',
    title: 'Active',
    exclusiveGroup: 'voice',
  },
  {
    type: 'passive',
    markName: 'passive',
    dataAttribute: 'data-passive',
    className: 'diagram-passive',
    title: 'Passive',
    exclusiveGroup: 'voice',
  },
  {
    type: 'person-1s',
    markName: 'person1s',
    dataAttribute: 'data-person-1s',
    className: 'diagram-person-underline',
    title: '1s',
    exclusiveGroup: 'person',
    selectionMode: 'exact',
  },
  {
    type: 'person-2s',
    markName: 'person2s',
    dataAttribute: 'data-person-2s',
    className: 'diagram-person-underline',
    title: '2s',
    exclusiveGroup: 'person',
    selectionMode: 'exact',
  },
  {
    type: 'person-3s',
    markName: 'person3s',
    dataAttribute: 'data-person-3s',
    className: 'diagram-person-underline',
    title: '3s',
    exclusiveGroup: 'person',
    selectionMode: 'exact',
  },
  {
    type: 'person-1p',
    markName: 'person1p',
    dataAttribute: 'data-person-1p',
    className: 'diagram-person-underline',
    title: '1p',
    exclusiveGroup: 'person',
    selectionMode: 'exact',
  },
  {
    type: 'person-2p',
    markName: 'person2p',
    dataAttribute: 'data-person-2p',
    className: 'diagram-person-underline',
    title: '2p',
    exclusiveGroup: 'person',
    selectionMode: 'exact',
  },
  {
    type: 'person-3p',
    markName: 'person3p',
    dataAttribute: 'data-person-3p',
    className: 'diagram-person-underline',
    title: '3p',
    exclusiveGroup: 'person',
    selectionMode: 'exact',
  },
  {
    type: 'special-plus-dative',
    markName: 'specialPlusDative',
    dataAttribute: 'data-special-plus-dative',
    className: 'diagram-special-red',
    title: '+ Dat.',
    exclusiveGroup: 'special',
  },
  {
    type: 'special-intransitive',
    markName: 'specialIntransitive',
    dataAttribute: 'data-special-intransitive',
    className: 'diagram-special-red',
    title: 'Intransitive',
    exclusiveGroup: 'special',
  },
  {
    type: 'special-plus-ablative',
    markName: 'specialPlusAblative',
    dataAttribute: 'data-special-plus-ablative',
    className: 'diagram-special-blue',
    title: '+ Abl.',
    exclusiveGroup: 'special',
  },
  {
    type: 'shared-italic',
    markName: 'sharedItalic',
    dataAttribute: 'data-shared-italic',
    className: 'diagram-shared-italic',
    title: 'Conjunction / Adverb / Interjection',
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
    title: 'Clauses',
    tools: [
      'subordinate-brackets',
      'prepositional-parentheses',
      'participial-phrase-box',
      'ablative-absolute',
      'passive-periphrastic',
    ],
  },
  {
    title: 'Verbal Forms',
    tools: [
      'verb-circle',
      'infinitive-double-circle',
      'participle-box',
      'active',
      'passive',
      'person-1s',
      'person-2s',
      'person-3s',
      'person-1p',
      'person-2p',
      'person-3p',
      'special-plus-dative',
      'special-intransitive',
      'special-plus-ablative',
    ],
  },
  {
    title: 'Cases',
    tools: [
      'nominative-underline',
      'predicate-nominative-squiggle',
      'accusative-double-underline',
      'predicate-accusative-double-squiggle',
      'genitive-bold',
      'dative-orange',
      'ablative-green',
      'vocative-uppercase',
      'locative-bold',
    ],
  },
  {
    title: 'Particles',
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
  case: DIAGRAM_MARK_DEFINITIONS.filter(definition => definition.exclusiveGroup === 'case'),
  voice: DIAGRAM_MARK_DEFINITIONS.filter(definition => definition.exclusiveGroup === 'voice'),
  person: DIAGRAM_MARK_DEFINITIONS.filter(definition => definition.exclusiveGroup === 'person'),
  special: DIAGRAM_MARK_DEFINITIONS.filter(definition => definition.exclusiveGroup === 'special'),
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeDiagramMarkType = (type: DiagramMarkType) => type;

const getWordLengthsByIndex = (words: SentenceWord[]) =>
  words.reduce<Record<number, number>>((accumulator, word) => {
    accumulator[word.index] = word.text.length;
    return accumulator;
  }, {});

const getDefaultEndCharOffset = (
  mark: Pick<DiagramSelectionMark, 'startWordIndex' | 'endWordIndex' | 'endCharOffset'>,
  wordLengths: Record<number, number>
) => {
  if (mark.endCharOffset !== undefined) {
    return mark.endCharOffset;
  }

  return wordLengths[mark.endWordIndex] ?? 0;
};

export const createDiagramSelectionMarkId = (
  type: DiagramMarkType,
  startWordIndex: number,
  endWordIndex: number,
  startCharOffset = 0,
  endCharOffset = 0
) => `${normalizeDiagramMarkType(type)}:${startWordIndex}:${endWordIndex}:${startCharOffset}:${endCharOffset}`;

export const normalizeDiagramMarks = (
  marks: DiagramSelectionMark[],
  words: SentenceWord[] = []
): DiagramSelectionMark[] => {
  const deduped = new Map<string, DiagramSelectionMark>();
  const wordLengths = getWordLengthsByIndex(words);

  marks.forEach(mark => {
    const normalizedType = normalizeDiagramMarkType(mark.type);
    const startCharOffset = mark.startCharOffset ?? 0;
    const endCharOffset = getDefaultEndCharOffset(mark, wordLengths);
    const id = createDiagramSelectionMarkId(
      normalizedType,
      mark.startWordIndex,
      mark.endWordIndex,
      startCharOffset,
      endCharOffset
    );

    deduped.set(id, {
      id,
      type: normalizedType,
      startWordIndex: mark.startWordIndex,
      endWordIndex: mark.endWordIndex,
      startCharOffset,
      endCharOffset,
    });
  });

  return Array.from(deduped.values()).sort((left, right) => {
    if (left.startWordIndex !== right.startWordIndex) {
      return left.startWordIndex - right.startWordIndex;
    }

    if ((left.startCharOffset ?? 0) !== (right.startCharOffset ?? 0)) {
      return (left.startCharOffset ?? 0) - (right.startCharOffset ?? 0);
    }

    if (left.endWordIndex !== right.endWordIndex) {
      return left.endWordIndex - right.endWordIndex;
    }

    if ((left.endCharOffset ?? 0) !== (right.endCharOffset ?? 0)) {
      return (left.endCharOffset ?? 0) - (right.endCharOffset ?? 0);
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

const hasMarkType = (editor: Editor, markName: string) => Boolean(editor.state.schema.marks[markName]);

const getWordTokenSegments = (editor: Editor): WordTokenSegment[] => {
  const segments: WordTokenSegment[] = [];
  const wordOffsets = new Map<number, number>();

  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node: Node, pos: number) => {
    if (!node.isText || !node.text) {
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

    const startCharOffset = wordOffsets.get(wordIndex) ?? 0;
    const endCharOffset = startCharOffset + node.text.length;
    wordOffsets.set(wordIndex, endCharOffset);

    segments.push({
      from: pos,
      to: pos + node.nodeSize,
      wordId,
      wordIndex,
      startCharOffset,
      endCharOffset,
    });
  });

  return segments;
};

const getOverlappingSegments = (segments: WordTokenSegment[], from: number, to: number) =>
  segments.filter(segment => segment.from < to && segment.to > from);

const buildSelectionRange = (
  segments: WordTokenSegment[],
  from: number,
  to: number,
  selectionMode: DiagramSelectionMode
): DiagramSelectionRange | null => {
  if (from === to) {
    return null;
  }

  const overlappingSegments = getOverlappingSegments(segments, from, to);
  if (overlappingSegments.length === 0) {
    return null;
  }

  const firstSegment = overlappingSegments[0];
  const lastSegment = overlappingSegments[overlappingSegments.length - 1];
  const uniqueWordIds = Array.from(new Set(overlappingSegments.map(segment => segment.wordId)));

  if (selectionMode === 'word') {
    return {
      from: firstSegment.from,
      to: lastSegment.to,
      wordIds: uniqueWordIds,
      startWordIndex: firstSegment.wordIndex,
      endWordIndex: lastSegment.wordIndex,
      startCharOffset: 0,
      endCharOffset: lastSegment.endCharOffset,
    };
  }

  const exactStart = Math.max(from, firstSegment.from);
  const exactEnd = Math.min(to, lastSegment.to);

  return {
    from,
    to,
    wordIds: uniqueWordIds,
    startWordIndex: firstSegment.wordIndex,
    endWordIndex: lastSegment.wordIndex,
    startCharOffset: firstSegment.startCharOffset + (exactStart - firstSegment.from),
    endCharOffset: lastSegment.startCharOffset + (exactEnd - lastSegment.from),
  };
};

const getSelectionRange = (editor: Editor, selectionMode: DiagramSelectionMode): DiagramSelectionRange | null => {
  const { from, to } = editor.state.selection;
  const segments = getWordTokenSegments(editor);

  return buildSelectionRange(segments, from, to, selectionMode);
};

const getMarkSpanMatchesSelection = (
  mark: Mark,
  selectionRange: Pick<DiagramSelectionRange, 'startWordIndex' | 'endWordIndex' | 'startCharOffset' | 'endCharOffset'>
) =>
  Number(mark.attrs.startWordIndex) === selectionRange.startWordIndex &&
  Number(mark.attrs.endWordIndex) === selectionRange.endWordIndex &&
  Number(mark.attrs.startCharOffset) === selectionRange.startCharOffset &&
  Number(mark.attrs.endCharOffset) === selectionRange.endCharOffset;

const selectionHasExactMark = (
  editor: Editor,
  markName: string,
  markId: string,
  selectionRange: Pick<DiagramSelectionRange, 'from' | 'to'>
) => {
  let foundWordToken = false;
  let exactMarkOnSelection = true;

  editor.state.doc.nodesBetween(selectionRange.from, selectionRange.to, (node: Node, pos: number) => {
    if (!node.isText || pos >= selectionRange.to || pos + node.nodeSize <= selectionRange.from) {
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
  attrs: Pick<
    DiagramSelectionRange,
    'startWordIndex' | 'endWordIndex' | 'startCharOffset' | 'endCharOffset'
  > & { id: string }
) => {
  const removals: Array<{ from: number; to: number; mark: Mark }> = [];

  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node: Node, pos: number) => {
    if (!node.isText) {
      return;
    }

    node.marks.forEach(mark => {
      if (
        mark.type.name === markName &&
        mark.attrs.id === attrs.id &&
        getMarkSpanMatchesSelection(mark, attrs)
      ) {
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

const unsetExclusiveMarks = (
  editor: Editor,
  definition: DiagramMarkDefinition,
  selectionRange: Pick<DiagramSelectionRange, 'startWordIndex' | 'endWordIndex' | 'startCharOffset' | 'endCharOffset'>
) => {
  const group = definition.exclusiveGroup ? DIAGRAM_EXCLUSIVE_GROUPS[definition.exclusiveGroup] : [];
  if (group.length === 0) {
    return;
  }

  const removals: Array<{ from: number; to: number; mark: Mark }> = [];

  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node: Node, pos: number) => {
    if (!node.isText) {
      return;
    }

    node.marks.forEach(mark => {
      if (mark.type.name === definition.markName) {
        return;
      }

      if (!group.some(groupDefinition => groupDefinition.markName === mark.type.name)) {
        return;
      }

      if (!getMarkSpanMatchesSelection(mark, selectionRange)) {
        return;
      }

      removals.push({
        from: pos,
        to: pos + node.nodeSize,
        mark,
      });
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
};

export const extractDiagramMarksFromEditor = (editor: Editor): DiagramSelectionMark[] => {
  const extracted = new Map<string, DiagramSelectionMark>();
  const wordOffsets = new Map<number, number>();

  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node: Node, pos: number) => {
    if (!node.isText || !node.text) {
      return;
    }

    const wordTokenMark = node.marks.find(mark => mark.type.name === WORD_TOKEN_MARK_NAME);
    if (!wordTokenMark) {
      return;
    }

    const wordIndex = Number(wordTokenMark.attrs.wordIndex);
    if (Number.isNaN(wordIndex)) {
      return;
    }

    const startCharOffset = wordOffsets.get(wordIndex) ?? 0;
    const endCharOffset = startCharOffset + node.text.length;
    wordOffsets.set(wordIndex, endCharOffset);

    node.marks.forEach(mark => {
      const definition = DIAGRAM_MARK_DEFINITION_BY_NAME[mark.type.name];
      if (!definition) {
        return;
      }

      const type = normalizeDiagramMarkType(definition.type);
      const startWordIndex = Number.isNaN(Number(mark.attrs.startWordIndex))
        ? wordIndex
        : Number(mark.attrs.startWordIndex);
      const endWordIndex = Number.isNaN(Number(mark.attrs.endWordIndex))
        ? wordIndex
        : Number(mark.attrs.endWordIndex);
      const normalizedStartCharOffset = Number.isNaN(Number(mark.attrs.startCharOffset))
        ? startCharOffset
        : Number(mark.attrs.startCharOffset);
      const normalizedEndCharOffset = Number.isNaN(Number(mark.attrs.endCharOffset))
        ? endCharOffset
        : Number(mark.attrs.endCharOffset);
      const mapKey = mark.attrs.id || `${type}:${startWordIndex}:${endWordIndex}`;
      const existing = extracted.get(mapKey);

      if (existing) {
        existing.startWordIndex = Math.min(existing.startWordIndex, startWordIndex);
        existing.endWordIndex = Math.max(existing.endWordIndex, endWordIndex);
        existing.startCharOffset = Math.min(existing.startCharOffset ?? normalizedStartCharOffset, normalizedStartCharOffset);
        existing.endCharOffset = Math.max(existing.endCharOffset ?? normalizedEndCharOffset, normalizedEndCharOffset);
        existing.id = createDiagramSelectionMarkId(
          existing.type,
          existing.startWordIndex,
          existing.endWordIndex,
          existing.startCharOffset,
          existing.endCharOffset
        );
        return;
      }

      extracted.set(mapKey, {
        id: createDiagramSelectionMarkId(
          type,
          startWordIndex,
          endWordIndex,
          normalizedStartCharOffset,
          normalizedEndCharOffset
        ),
        type,
        startWordIndex,
        endWordIndex,
        startCharOffset: normalizedStartCharOffset,
        endCharOffset: normalizedEndCharOffset,
      });
    });
  });

  return normalizeDiagramMarks(Array.from(extracted.values()));
};

export const handleAnnotationClick = (
  editor: Editor,
  annotationType: AnnotationType,
  isDisabled?: boolean
): string | undefined => {
  if (!editor || isDisabled) {
    return undefined;
  }

  const normalizedType = normalizeDiagramMarkType(annotationType);
  const definition = DIAGRAM_MARK_DEFINITION_BY_TYPE[normalizedType];
  if (!definition || !hasMarkType(editor, definition.markName)) {
    return undefined;
  }

  const selectionRange = getSelectionRange(editor, definition.selectionMode || 'word');
  if (!selectionRange) {
    return 'Please select one or more words to annotate.';
  }

  if (
    definition.selectionMode === 'exact' &&
    selectionRange.startWordIndex === selectionRange.endWordIndex &&
    selectionRange.startCharOffset === selectionRange.endCharOffset
  ) {
    return 'Please select one or more letters to annotate.';
  }

  const markId = createDiagramSelectionMarkId(
    normalizedType,
    selectionRange.startWordIndex,
    selectionRange.endWordIndex,
    selectionRange.startCharOffset,
    selectionRange.endCharOffset
  );

  const attrs = {
    id: markId,
    wordIds: selectionRange.wordIds,
    startWordIndex: selectionRange.startWordIndex,
    endWordIndex: selectionRange.endWordIndex,
    startCharOffset: selectionRange.startCharOffset,
    endCharOffset: selectionRange.endCharOffset,
  };

  if (selectionHasExactMark(editor, definition.markName, markId, selectionRange)) {
    unsetExactMark(editor, definition.markName, attrs);
    return undefined;
  }

  unsetExclusiveMarks(editor, definition, selectionRange);
  editor
    .chain()
    .focus()
    .setTextSelection({ from: selectionRange.from, to: selectionRange.to })
    .setMark(definition.markName, attrs)
    .run();

  return undefined;
};

export const handleResetTextColors = (editor: Editor, isDisabled?: boolean) => {
  if (!editor || isDisabled) {
    return;
  }

  let chain = editor.chain().focus();

  RESET_COLOR_MARK_TYPES.forEach(type => {
    const definition = DIAGRAM_MARK_DEFINITION_BY_TYPE[type];
    if (definition && hasMarkType(editor, definition.markName)) {
      chain = chain.unsetMark(definition.markName);
    }
  });

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

export const compareDiagramMarks = (
  userMarks: DiagramSelectionMark[],
  solutionMarks: DiagramSelectionMark[],
  words: SentenceWord[] = []
) => {
  const normalizedUserMarks = normalizeDiagramMarks(userMarks, words);
  const normalizedSolutionMarks = normalizeDiagramMarks(solutionMarks, words);

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

export const isPersonDiagramTool = (tool: DiagramToolKey) =>
  PERSON_MARK_TYPES.includes(normalizeDiagramToolKey(tool) as DiagramMarkType);
