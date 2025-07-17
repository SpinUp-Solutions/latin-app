import React, { useState, useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Tooltip } from '../../core/tooltip-extension';
import { DiagrammingExtensions } from '../../core/diagramming-extensions';
import { DiagrammingToolbar } from '../../exercises/sentence-diagramming/diagramming-toolbar';
import {
  SentenceWord,
  UserAnnotation,
  AnnotationType,
  SentenceDiagrammingExercise,
} from '@/src/types/exercises/sentence-diagramming';
import { TooltipEditorDialog } from '../../core/tooltip-editor-dialog';
import { TooltipData } from '@/src/types/tooltip';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';

export const SentenceDiagrammingEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as SentenceDiagrammingExercise);

  const [isTooltipDialogOpen, setIsTooltipDialogOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [existingTooltipData, setExistingTooltipData] = useState<TooltipData | null>(null);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const handleChange = (updates: Partial<SentenceDiagrammingExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const handleDataChange = (dataUpdates: Partial<SentenceDiagrammingExercise['data']>) => {
    handleChange({
      data: { ...editingContent.data, ...dataUpdates },
    });
  };

  const handleSentenceChange = (sentenceUpdates: Partial<SentenceDiagrammingExercise['data']['sentence']>) => {
    handleDataChange({
      sentence: { ...editingContent.data.sentence, ...sentenceUpdates },
    });
  };

  const handleLatinChange = (latin: string) => {
    const words = tokenizeSentence(latin);
    handleSentenceChange({ latin, words });
  };

  const handleAnnotationsChange = (annotations: UserAnnotation[]) => {
    console.log('handleAnnotationsChange called with:', annotations);

    const solutionAnnotations = {
      prepositions: annotations.filter(a => a.type === 'preposition'),
      subordinations: annotations.filter(a => a.type === 'subordination'),
      verbs: annotations.filter(a => a.type === 'verb-circle'),
      subjects: annotations.filter(a => a.type === 'subject-underline'),
      directObjects: annotations.filter(a => a.type === 'direct-object-underline'),
      indirectObjects: annotations.filter(a => a.type === 'indirect-object-bracket'),
      genitives: annotations.filter(a => a.type === 'genitive-arrow'),
      ablatives: annotations.filter(a => a.type === 'ablative-phrase'),
    };

    console.log('Solution annotations:', solutionAnnotations);
    console.log('Verb annotations:', solutionAnnotations.verbs);

    const updatedSolution = {
      ...editingContent.data.solution,
      annotations: solutionAnnotations,
    };

    console.log('Updated solution:', updatedSolution);

    handleDataChange({
      solution: updatedSolution,
    });
  };

  const tokenizeSentence = (latin: string): SentenceWord[] => {
    const words = latin.split(/\s+/).filter(word => word.trim());
    let currentPosition = 0;

    return words.map((word, index) => {
      const startPosition = currentPosition;
      const endPosition = currentPosition + word.length;
      currentPosition = endPosition + 1;

      return {
        id: `word-${index + 1}`,
        text: word,
        index,
        startPosition,
        endPosition,
      };
    });
  };

  const handleAddTooltip = () => {
    setIsTooltipDialogOpen(true);
  };

  const handleSaveTooltip = (tooltipData: Omit<TooltipData, 'id'>) => {
    setIsTooltipDialogOpen(false);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        hardBreak: false,
        horizontalRule: false,
      }),
      Tooltip,
      ...DiagrammingExtensions,
    ],
    content: `<p>${editingContent.data.sentence.latin}</p>`,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const annotations = extractAnnotationsFromEditor(editor);
      handleAnnotationsChange(annotations);
    },
    editorProps: {
      attributes: {
        class: 'sentence-diagramming-canvas',
      },
    },
  });

  const handleClearAnnotations = () => {
    if (!editor) return;
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

  useEffect(() => {
    if (editor && editingContent) {
      handleClearAnnotations();
      editor.commands.setContent(`<p>${editingContent.data.sentence.latin}</p>`);

      const annotations = Object.values(editingContent.data.solution.annotations).flat();
      annotations.forEach(annotation => {
        const { wordIds, type, ...attrs } = annotation;
        const positions = wordIds
          .map(id => {
            const word = editingContent.data.sentence.words.find(w => w.id === id);
            return word ? { from: word.startPosition + 1, to: word.endPosition + 1 } : null;
          })
          .filter(pos => pos !== null);
        if (positions.length > 0) {
          const { from, to } = positions[0];
          editor.chain().setTextSelection({ from, to }).focus();
          switch (type) {
            case 'preposition':
              editor.commands.setPreposition(attrs);
              break;
            case 'subordination':
              editor.commands.setSubordination(attrs);
              break;
            case 'verb-circle':
              editor.commands.setVerbCircle(attrs);
              break;
            case 'subject-underline':
              editor.commands.setSubjectUnderline(attrs);
              break;
            case 'direct-object-underline':
              editor.commands.setDirectObjectUnderline(attrs);
              break;
            case 'indirect-object-bracket':
              editor.commands.setIndirectObjectBracket(attrs);
              break;
            case 'genitive-arrow':
              editor.commands.setGenitiveArrow(attrs);
              break;
            case 'ablative-phrase':
              editor.commands.setAblativePhrase(attrs);
              break;
          }
        }
      });
    }
  }, [editor, editingContent]);

  const extractAnnotationsFromEditor = useCallback((editor: any): UserAnnotation[] => {
    const annotations: UserAnnotation[] = [];
    const doc = editor.getJSON();

    const traverseNode = (node: any) => {
      if (node.marks) {
        node.marks.forEach((mark: any) => {
          console.log('Found mark:', mark.type, mark.attrs);

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
          if (annotationType) {
            const annotation: UserAnnotation = {
              id: `${annotationType}-${Date.now()}-${Math.random()}`,
              type: annotationType,
              wordIds: mark.attrs?.wordIds || [],
              timestamp: Date.now(),
              ...mark.attrs,
            } as UserAnnotation;

            annotations.push(annotation);
          }
        });
      }

      if (node.content) {
        node.content.forEach(traverseNode);
      }
    };

    traverseNode(doc);
    console.log('Extracted annotations:', annotations);
    return annotations;
  }, []);

  const handleAnnotationClick = (annotationType: AnnotationType) => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (!selectedText.trim()) {
      alert('Please select text to annotate');
      return;
    }

    const selectedWordIds = getWordIdsFromSelection(from, to);
    const attributes = getAttributesForAnnotationType(annotationType, selectedWordIds);

    console.log('Selected text:', selectedText);
    console.log('Selected word IDs:', selectedWordIds);
    console.log('Attributes:', attributes);

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

  const getWordIdsFromSelection = (from: number, to: number): string[] => {
    const selectedText = editor?.state.doc.textBetween(from, to) || '';

    // Simple approach: find words that match the selected text
    const matchingWords = editingContent.data.sentence.words.filter(word => {
      // Check if the word text is contained in the selection
      return selectedText.trim().split(/\s+/).includes(word.text);
    });

    // If no exact matches, try to find the word by index
    if (matchingWords.length === 0) {
      const allText = editingContent.data.sentence.latin.split(/\s+/);
      const selectedWords = selectedText.trim().split(/\s+/);

      selectedWords.forEach(selectedWord => {
        const wordIndex = allText.findIndex(w => w === selectedWord);
        if (wordIndex >= 0) {
          const word = editingContent.data.sentence.words.find(w => w.index === wordIndex);
          if (word) matchingWords.push(word);
        }
      });
    }

    return matchingWords.map(word => word.id);
  };

  const getAttributesForAnnotationType = (type: AnnotationType, wordIds: string[]) => {
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

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="sentence-diagramming-canvas border border-gray-300 rounded-md">
      <DiagrammingToolbar
        editor={editor}
        onAnnotationClick={handleAnnotationClick}
        onClearAnnotations={handleClearAnnotations}
        onAddTooltip={handleAddTooltip}
        disabled={false}
      />

      <div className="p-4 min-h-[150px] bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
