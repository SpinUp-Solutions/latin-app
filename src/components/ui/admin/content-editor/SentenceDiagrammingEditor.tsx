import React, { useState, useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Tooltip } from '../../core/tooltip-extension';
import { DiagrammingExtensions } from '../../core/diagramming-extensions';
import { DiagrammingToolbar } from '../../exercises/sentence-diagramming/diagramming-toolbar';
import {
  SentenceWord,
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
    console.log('=== HANDLE CHANGE (DISPATCH) ===');
    console.log('Updates:', updates);
    const updatedContent = { ...editingContent, ...updates };
    console.log('Final content being dispatched:', updatedContent);
    console.log('Solution annotations in dispatched content:', updatedContent.data?.solution?.annotations);
    dispatch(updateEditingContent(updatedContent));
  };

  const handleDataChange = (dataUpdates: Partial<SentenceDiagrammingExercise['data']>) => {
    console.log('=== HANDLE DATA CHANGE ===');
    console.log('Data updates:', dataUpdates);
    
    handleChange({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const handleSentenceChange = (sentenceUpdates: Partial<SentenceDiagrammingExercise['data']['sentence']>) => {
    console.log('=== HANDLE SENTENCE CHANGE ===');
    console.log('Sentence updates:', sentenceUpdates);
    
    // Only update sentence data, preserve the existing solution and other data
    handleChange({
      data: {
        ...editingContent.data,
        sentence: { ...editingContent.data.sentence, ...sentenceUpdates },
      },
    });
  };

  const handleLatinChange = (latin: string) => {
    const words = tokenizeSentence(latin);
    handleSentenceChange({ latin, words });
  };

  const handleAnnotationsChange = (annotations: Record<string, AnnotationType>) => {
    console.log('=== HANDLE ANNOTATIONS CHANGE ===');
    console.log('New annotations:', annotations);
    
    const updatedSolution = {
      ...editingContent.data.solution,
      annotations: annotations,
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
          onCombinedChange={handleChange}
          editingContent={editingContent}
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
  onChange: (annotations: Record<string, AnnotationType>) => void;
  onContentChange: (updates: Partial<SentenceDiagrammingExercise['data']['sentence']>) => void;
  onAddTooltip: () => void;
  onCombinedChange: (updates: Partial<SentenceDiagrammingExercise>) => void;
  editingContent: SentenceDiagrammingExercise;
}

const SentenceDiagrammingCanvas: React.FC<SentenceDiagrammingCanvasProps> = ({
  sentence,
  words,
  initialContent,
  onChange,
  onContentChange,
  onAddTooltip,
  onCombinedChange,
  editingContent,
}) => {

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
      console.log('=== ADMIN EDITOR DEBUG ===');
      console.log('Extracted annotations:', annotations);
      
      // Get HTML content
      const htmlContent = editor.getHTML();
      
      // Combine both updates in a single dispatch to avoid race conditions
      onCombinedChange({
        data: {
          ...editingContent.data,
          solution: {
            ...editingContent.data.solution,
            annotations: annotations,
          },
          sentence: {
            ...editingContent.data.sentence,
            content: htmlContent,
          },
        },
      });
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
          // Check if this word has an annotation in the new simple format
          const annotationType = solutionAnnotations[word.id];
          let wordHtml = word.text;

          if (annotationType) {
            // Map annotation type to TipTap extension
            const extensionMap: Record<AnnotationType, string> = {
              'preposition': 'preposition',
              'subordination': 'subordination',
              'verb-circle': 'verbCircle',
              'subject-underline': 'subjectUnderline',
              'direct-object-underline': 'directObjectUnderline',
              'indirect-object-bracket': 'indirectObjectBracket',
              'genitive-arrow': 'genitiveArrow',
              'ablative-phrase': 'ablativePhrase',
            };

            const extensionName = extensionMap[annotationType];
            if (extensionName) {
              const attributes = getAttributesForAnnotationType(annotationType, [word.id]);
              const attrsString = Object.entries(attributes)
                .map(([key, value]) => `${key}="${Array.isArray(value) ? value.join(',') : value}"`)
                .join(' ');
              wordHtml = `<span data-${extensionName.replace(/([A-Z])/g, '-$1').toLowerCase()}="true" ${attrsString}>${wordHtml}</span>`;
            }
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

  const extractAnnotationsFromEditor = useCallback((editor: any): Record<string, AnnotationType> => {
    const annotations: Record<string, AnnotationType> = {};
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
          if (annotationType && mark.attrs?.wordIds) {
            // For each word in the annotation, map wordId -> annotationType
            mark.attrs.wordIds.forEach((wordId: string) => {
              annotations[wordId] = annotationType;
            });
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
