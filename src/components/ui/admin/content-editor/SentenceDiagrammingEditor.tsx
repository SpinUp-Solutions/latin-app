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

    const updatedSolution = {
      ...editingContent.data.solution,
      annotations: solutionAnnotations,
    };

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
        id: `word-${index}`,
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

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={editingContent.title || ''}
          onChange={e => handleChange({ title: e.target.value })}
          className="w-full p-2 border rounded-md"
          placeholder="Enter exercise title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Instructions</label>
        <textarea
          value={editingContent.instructions || ''}
          onChange={e => handleChange({ instructions: e.target.value })}
          className="w-full p-2 border rounded-md h-24"
          placeholder="Enter instructions for students..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Latin Sentence</label>
        <input
          type="text"
          value={editingContent.data.sentence.latin}
          onChange={e => handleLatinChange(e.target.value)}
          className="w-full p-2 border rounded-md"
          placeholder="Enter Latin sentence..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">English Translation</label>
        <input
          type="text"
          value={editingContent.data.sentence.translation}
          onChange={e => handleSentenceChange({ translation: e.target.value })}
          className="w-full p-2 border rounded-md"
          placeholder="Enter English translation..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Difficulty</label>
        <select
          value={editingContent.data.difficulty}
          onChange={e => handleDataChange({ difficulty: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
          className="w-full p-2 border rounded-md">
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Solution Diagram</label>
        <div className="text-sm text-gray-600 mb-2">
          Create the correct annotation solution by selecting text and using the toolbar below:
        </div>

        <SentenceDiagrammingCanvas
          sentence={editingContent.data.sentence.latin}
          words={editingContent.data.sentence.words}
          initialContent={editingContent.data.sentence.content}
          onChange={handleAnnotationsChange}
          onContentChange={handleSentenceChange}
          onAddTooltip={handleAddTooltip}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Hints</label>
        <textarea
          value={editingContent.data.hints?.join('\n') || ''}
          onChange={e => handleDataChange({ hints: e.target.value.split('\n').filter(h => h.trim()) })}
          className="w-full p-2 border rounded-md h-24"
          placeholder="Enter hints (one per line)..."
        />
      </div>

      <AudioUploadSection
        contentItemId={editingContent.id}
        audioPath={editingContent.audioPath}
        onAudioPathChange={audioPath => handleChange({ audioPath })}
      />

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => handleChange({ feedbackConfig })}
      />

      <TooltipEditorDialog
        isOpen={isTooltipDialogOpen}
        onClose={() => setIsTooltipDialogOpen(false)}
        onSave={handleSaveTooltip}
        onRemove={() => {}}
        selectedText={selectedText}
        initialData={null}
      />
    </div>
  );
};

interface SentenceDiagrammingCanvasProps {
  sentence: string;
  words: SentenceWord[];
  initialContent?: string;
  onChange: (annotations: UserAnnotation[]) => void;
  onContentChange: (updates: Partial<SentenceDiagrammingExercise['data']['sentence']>) => void;
  onAddTooltip: () => void;
}

const SentenceDiagrammingCanvas: React.FC<SentenceDiagrammingCanvasProps> = ({
  sentence,
  words,
  initialContent,
  onChange,
  onContentChange,
  onAddTooltip,
}) => {
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as SentenceDiagrammingExercise);

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
    content: initialContent || sentence,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const annotations = extractAnnotationsFromEditor(editor);
      onChange(annotations);

      // Save the HTML content with annotations to Redux
      const htmlContent = editor.getHTML();
      onContentChange({ content: htmlContent });
    },
    editorProps: {
      attributes: {
        class: 'sentence-diagramming-canvas',
      },
    },
  });

  // Generate initial content with annotations if no saved content exists
  useEffect(() => {
    if (editor && editingContent && !initialContent) {
      // Create HTML with embedded annotations
      const generateAnnotatedHTML = () => {
        const solutionAnnotations = editingContent.data.solution.annotations;
        const htmlParts: string[] = [];

        words.forEach((word, index) => {
          // Check which annotations apply to this word
          const annotations = [];

          // Check each annotation type
          if (solutionAnnotations.verbs?.some(a => a.wordIds.includes(word.id))) {
            const verbAnnotation = solutionAnnotations.verbs.find(a => a.wordIds.includes(word.id));
            annotations.push({
              type: 'verbCircle',
              attrs: {
                wordIds: verbAnnotation?.wordIds || [word.id],
                voice: verbAnnotation?.voice || 'active',
                expectsDirectObject: verbAnnotation?.expectsDirectObject || true,
                expectsAgent: verbAnnotation?.expectsAgent || false,
              },
            });
          }

          if (solutionAnnotations.subjects?.some(a => a.wordIds.includes(word.id))) {
            const subjectAnnotation = solutionAnnotations.subjects.find(a => a.wordIds.includes(word.id));
            annotations.push({
              type: 'subjectUnderline',
              attrs: {
                wordIds: subjectAnnotation?.wordIds || [word.id],
                person: subjectAnnotation?.person || '3rd',
                number: subjectAnnotation?.number || 'singular',
              },
            });
          }

          if (solutionAnnotations.directObjects?.some(a => a.wordIds.includes(word.id))) {
            const directObjectAnnotation = solutionAnnotations.directObjects.find(a => a.wordIds.includes(word.id));
            annotations.push({
              type: 'directObjectUnderline',
              attrs: {
                wordIds: directObjectAnnotation?.wordIds || [word.id],
              },
            });
          }

          // Create the word HTML
          let wordHtml = word.text;

          // Apply annotations by wrapping the word
          if (annotations.length > 0) {
            annotations.forEach(annotation => {
              const attrsString = Object.entries(annotation.attrs)
                .map(([key, value]) => `${key}="${Array.isArray(value) ? value.join(',') : value}"`)
                .join(' ');
              wordHtml = `<span data-${annotation.type.replace(/([A-Z])/g, '-$1').toLowerCase()}="true" ${attrsString}>${wordHtml}</span>`;
            });
          }

          htmlParts.push(wordHtml);
        });

        // Join with spaces and wrap in paragraph
        return `<p>${htmlParts.join(' ')}</p>`;
      };

      const annotatedHTML = generateAnnotatedHTML();
      editor.commands.setContent(annotatedHTML);
    }
  }, [editor, editingContent, initialContent, words]);

  const extractAnnotationsFromEditor = useCallback((editor: any): UserAnnotation[] => {
    const annotations: UserAnnotation[] = [];
    const doc = editor.getJSON();

    const traverseNode = (node: any) => {
      if (node.marks) {
        node.marks.forEach((mark: any) => {
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

  const handleClearAnnotations = () => {
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

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="sentence-diagramming-canvas border border-gray-300 rounded-md">
      <DiagrammingToolbar
        editor={editor}
        onAnnotationClick={handleAnnotationClick}
        onClearAnnotations={handleClearAnnotations}
        onAddTooltip={onAddTooltip}
        disabled={false}
      />

      <div className="p-4 min-h-[150px] bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
