import { AnnotationType, SentenceWord } from '@/src/types/exercises/sentence-diagramming';
import { Editor } from '@tiptap/react';

interface TipTapMark {
  type: string;
  attrs?: {
    wordIds?: string[];
    [key: string]: unknown;
  };
}

interface TipTapNode {
  type?: string;
  text?: string;
  marks?: TipTapMark[];
  content?: TipTapNode[];
}

export const extractAnnotationsFromEditor = (editor: Editor): Record<string, AnnotationType> => {
  const annotations: Record<string, AnnotationType> = {};
  const doc = editor.getJSON();

  const traverseNode = (node: unknown) => {
    if (node && typeof node === 'object' && 'marks' in node && Array.isArray((node as TipTapNode).marks)) {
      (node as TipTapNode).marks!.forEach(mark => {
        // Map TipTap extension names to annotation types
        const typeMap: Record<string, AnnotationType> = {
          preposition: 'preposition',
          subordination: 'subordination',
          verbCircle: 'verb-circle',
          subjectUnderline: 'subject-underline',
          directObjectUnderline: 'direct-object-underline',
          indirectObjectBracket: 'indirect-object-bracket',
          genitiveArrow: 'genitive-arrow',
          ablativePhrase: 'ablative-phrase',
        };

        const annotationType = typeMap[mark.type];
        if (annotationType && mark.attrs?.wordIds) {
          // For each word in the annotation, map wordId -> annotationType
          mark.attrs.wordIds.forEach(wordId => {
            annotations[wordId] = annotationType;
          });
        }
      });
    }

    if (node && typeof node === 'object' && 'content' in node && Array.isArray((node as TipTapNode).content)) {
      (node as TipTapNode).content!.forEach(traverseNode);
    }
  };

  traverseNode(doc);
  return annotations;
};

export const getAttributesForAnnotationType = (type: AnnotationType, wordIds: string[]) => {
  const baseAttributes = { wordIds };

  switch (type) {
    case 'verb-circle':
      return { ...baseAttributes, voice: 'active', expectsDirectObject: true, expectsAgent: false };
    case 'subordination':
      return { ...baseAttributes, clauseType: 'relative' };
    case 'subject-underline':
      return { ...baseAttributes, person: '3rd', number: 'singular' };
    case 'genitive-arrow':
      return {
        ...baseAttributes,
        relationshipType: 'possession',
        genitiveWordId: wordIds[0],
        modifiedWordId: wordIds[1],
      };
    case 'ablative-phrase':
      return { ...baseAttributes, ablativeType: 'means', hasPreposition: false };
    default:
      return baseAttributes;
  }
};

/**
 * Gets word IDs from TipTap editor selection
 */
export const getWordIdsFromSelection = (
  editor: Editor,
  from: number,
  to: number,
  words: SentenceWord[],
  sentence: string
): string[] => {
  const selectedText = editor?.state.doc.textBetween(from, to) || '';

  // Simple approach: find words that match the selected text
  const matchingWords = words.filter(word => {
    // Check if the word text is contained in the selection
    return selectedText.trim().split(/\s+/).includes(word.text);
  });

  // If no exact matches, try to find the word by index
  if (matchingWords.length === 0) {
    const allText = sentence.split(/\s+/);
    const selectedWords = selectedText.trim().split(/\s+/);

    selectedWords.forEach(selectedWord => {
      const wordIndex = allText.findIndex(w => w === selectedWord);
      if (wordIndex >= 0) {
        const word = words.find(w => w.index === wordIndex);
        if (word) matchingWords.push(word);
      }
    });
  }

  return matchingWords.map(word => word.id);
};

/**
 * Handles annotation click by applying the appropriate TipTap command
 */
export const handleAnnotationClick = (
  editor: Editor,
  annotationType: AnnotationType,
  words: SentenceWord[],
  sentence: string,
  isDisabled?: boolean
) => {
  if (!editor || isDisabled) return;

  const { from, to } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to);

  if (!selectedText.trim()) {
    alert('Please select text to annotate');
    return;
  }

  const selectedWordIds = getWordIdsFromSelection(editor, from, to, words, sentence);
  const attributes = getAttributesForAnnotationType(annotationType, selectedWordIds);

  switch (annotationType) {
    case 'preposition':
      editor.chain().focus().setPreposition(attributes).run();
      break;
    case 'subordination':
      editor.chain().focus().setSubordination(attributes).run();
      break;
    case 'verb-circle':
      editor.chain().focus().setVerbCircle(attributes).run();
      break;
    case 'subject-underline':
      editor.chain().focus().setSubjectUnderline(attributes).run();
      break;
    case 'direct-object-underline':
      editor.chain().focus().setDirectObjectUnderline(attributes).run();
      break;
    case 'indirect-object-bracket':
      editor.chain().focus().setIndirectObjectBracket(attributes).run();
      break;
    case 'genitive-arrow':
      editor.chain().focus().setGenitiveArrow(attributes).run();
      break;
    case 'ablative-phrase':
      editor.chain().focus().setAblativePhrase(attributes).run();
      break;
  }
};

/**
 * Clears all diagramming annotations from TipTap editor
 */
export const handleClearAnnotations = (editor: Editor) => {
  if (!editor) return;

  // Clear all diagramming annotations explicitly
  editor
    .chain()
    .focus()
    .unsetPreposition()
    .unsetSubordination()
    .unsetVerbCircle()
    .unsetSubjectUnderline()
    .unsetDirectObjectUnderline()
    .unsetIndirectObjectBracket()
    .unsetGenitiveArrow()
    .unsetAblativePhrase()
    .run();
};
