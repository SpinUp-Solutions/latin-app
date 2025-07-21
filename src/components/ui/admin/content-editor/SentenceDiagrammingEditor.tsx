import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Tooltip } from '../../core/tooltip-extension';
import { DiagrammingExtensions } from '../../core/diagramming-extensions';
import { DiagrammingToolbar } from '../../exercises/sentence-diagramming/diagramming-toolbar';
import { SentenceWord, AnnotationType, SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';
import { TooltipEditorDialog } from '../../core/tooltip-editor-dialog';
import { TooltipData } from '@/src/types/tooltip';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { 
  extractAnnotationsFromEditor, 
  handleAnnotationClick, 
  handleClearAnnotations,
  getAttributesForAnnotationType 
} from '@/src/utils/sentenceDiagramming';

export const SentenceDiagrammingEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as SentenceDiagrammingExercise);

  const [isTooltipDialogOpen, setIsTooltipDialogOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [existingTooltipData, setExistingTooltipData] = useState<TooltipData | null>(null);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<SentenceDiagrammingExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<SentenceDiagrammingExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const handleSentenceChange = (sentenceUpdates: Partial<SentenceDiagrammingExercise['data']['sentence']>) => {
    updateData({
      sentence: { ...editingContent.data.sentence, ...sentenceUpdates },
    });
  };

  const handleLatinChange = (latin: string) => {
    const words = tokenizeSentence(latin);
    handleSentenceChange({ latin, words });
  };

  const handleAnnotationsAndContentChange = (annotations: Record<string, AnnotationType>, htmlContent: string) => {
    updateData({
      solution: {
        ...editingContent.data.solution,
        annotations: annotations,
      },
      sentence: {
        ...editingContent.data.sentence,
        content: htmlContent,
      },
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
          onChange={e => updateContent({ title: e.target.value })}
          className="w-full p-2 border rounded-md"
          placeholder="Enter exercise title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Instructions</label>
        <textarea
          value={editingContent.instructions || ''}
          onChange={e => updateContent({ instructions: e.target.value })}
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
          onChange={e => updateData({ difficulty: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
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
          onAnnotationsAndContentChange={handleAnnotationsAndContentChange}
          onAddTooltip={handleAddTooltip}
          editingContent={editingContent}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Hints</label>
        <textarea
          value={editingContent.data.hints?.join('\n') || ''}
          onChange={e => updateData({ hints: e.target.value.split('\n').filter(h => h.trim()) })}
          className="w-full p-2 border rounded-md h-24"
          placeholder="Enter hints (one per line)..."
        />
      </div>

      <AudioUploadSection
        contentItemId={editingContent.id}
        audioPath={editingContent.audioPath}
        onAudioPathChange={audioPath => updateContent({ audioPath })}
      />

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
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
  onAnnotationsAndContentChange: (annotations: Record<string, AnnotationType>, htmlContent: string) => void;
  onAddTooltip: () => void;
  editingContent: SentenceDiagrammingExercise;
}

const SentenceDiagrammingCanvas: React.FC<SentenceDiagrammingCanvasProps> = ({
  sentence,
  words,
  initialContent,
  onAnnotationsAndContentChange,
  onAddTooltip,
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
      const htmlContent = editor.getHTML();

      // Single atomic update to prevent race conditions
      onAnnotationsAndContentChange(annotations, htmlContent);
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
              preposition: 'preposition',
              subordination: 'subordination',
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



  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="sentence-diagramming-canvas border border-gray-300 rounded-md">
      <DiagrammingToolbar
        editor={editor}
        onAnnotationClick={(type) => handleAnnotationClick(editor, type, words, sentence)}
        onClearAnnotations={() => handleClearAnnotations(editor)}
        onAddTooltip={onAddTooltip}
        disabled={false}
      />

      <div className="p-4 min-h-[150px] bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
