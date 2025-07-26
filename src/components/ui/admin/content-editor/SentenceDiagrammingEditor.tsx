import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Tooltip } from '../../core/tooltip-extension';
import { DiagrammingExtensions } from '../../core/diagramming-extensions';
import { DiagrammingToolbar } from '../../exercises/sentence-diagramming/diagramming-toolbar';
import { SentenceWord, AnnotationType, SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';
import { TooltipEditorDialog } from '../../core/tooltip-editor-dialog';
import { TooltipData, TooltipFormData } from '@/src/types/tooltip';
import { findTooltipMarkWithData, generateTooltipId } from '@/src/utils/tooltipUtils';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent, addTooltip, removeTooltip } from '@/src/store/slices/lessonSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import {
  extractAnnotationsFromEditor,
  handleAnnotationClick,
  handleClearAnnotations,
} from '@/src/utils/sentenceDiagramming';
import { useSelector } from 'react-redux';

export const SentenceDiagrammingEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as SentenceDiagrammingExercise);
  const tooltips = useAppSelector(state => state.lesson.tooltips);

  const [isTooltipDialogOpen, setIsTooltipDialogOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [currentEditor, setCurrentEditor] = useState<any>(null);
  const [editingTooltip, setEditingTooltip] = useState<TooltipData | null>(null);

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
    handleSentenceChange({
      latin,
      words,
      content: `<p>${latin}</p>`, // Reset content to plain sentence when text changes
    });
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
    if (!currentEditor) return;
    
    const { from, to } = currentEditor.state.selection;
    const selectedText = currentEditor.state.doc.textBetween(from, to);
    
    if (!selectedText.trim()) {
      alert('Please select text to add a tooltip');
      return;
    }

    // Check if there's already a tooltip on this selection
    const existingTooltip = findTooltipMarkWithData(currentEditor, from, to);
    if (existingTooltip) {
      const tooltipId = existingTooltip.attrs.tooltipId;
      const tooltipData = tooltips[tooltipId];
      if (tooltipData) {
        setEditingTooltip(tooltipData);
      } else {
        // Fallback to mark data if not in global state
        setEditingTooltip({
          id: tooltipId,
          word: existingTooltip.attrs.word,
          translation: existingTooltip.attrs.translation,
          pronunciation: existingTooltip.attrs.pronunciation,
          partOfSpeech: existingTooltip.attrs.partOfSpeech,
          wordType: existingTooltip.attrs.wordType,
          definition: existingTooltip.attrs.definition,
          examples: existingTooltip.attrs.examples,
          etymology: existingTooltip.attrs.etymology,
          gender: existingTooltip.attrs.gender,
          declensionClass: existingTooltip.attrs.declensionClass,
          conjugationClass: existingTooltip.attrs.conjugationClass,
          grammaticalInfo: existingTooltip.attrs.grammaticalInfo,
          principalParts: existingTooltip.attrs.principalParts,
        });
      }
    } else {
      setEditingTooltip(null);
      setSelectedText(selectedText);
    }
    
    setIsTooltipDialogOpen(true);
  };

  const handleSaveTooltip = (tooltipData: TooltipFormData) => {
    if (!currentEditor) return;

    const tooltipId = editingTooltip?.id || generateTooltipId(tooltipData.word);
    
    // Save to global state
    dispatch(addTooltip({
      id: tooltipId,
      data: {
        word: tooltipData.word,
        translation: tooltipData.translation,
        pronunciation: tooltipData.pronunciation,
        partOfSpeech: tooltipData.partOfSpeech,
        wordType: tooltipData.wordType,
        definition: tooltipData.definition,
        examples: tooltipData.examples,
        etymology: tooltipData.etymology,
        gender: tooltipData.gender,
        declensionClass: tooltipData.declensionClass,
        conjugationClass: tooltipData.conjugationClass,
        grammaticalInfo: tooltipData.grammaticalInfo,
        principalParts: tooltipData.principalParts,
      }
    }));
    
    // Apply to editor
    currentEditor
      .chain()
      .focus()
      .setTooltip({
        tooltipId,
        word: tooltipData.word,
        translation: tooltipData.translation,
        pronunciation: tooltipData.pronunciation,
        partOfSpeech: tooltipData.partOfSpeech,
        wordType: tooltipData.wordType,
        definition: tooltipData.definition,
        examples: tooltipData.examples,
        etymology: tooltipData.etymology,
        gender: tooltipData.gender,
        declensionClass: tooltipData.declensionClass,
        conjugationClass: tooltipData.conjugationClass,
        grammaticalInfo: tooltipData.grammaticalInfo,
        principalParts: tooltipData.principalParts,
      })
      .run();

    setIsTooltipDialogOpen(false);
    setEditingTooltip(null);
    setSelectedText('');
  };

  const handleRemoveTooltip = () => {
    if (!currentEditor || !editingTooltip) return;
    
    // Remove from global state
    dispatch(removeTooltip(editingTooltip.id));
    
    // Remove from editor
    currentEditor.chain().focus().unsetTooltip().run();
    setIsTooltipDialogOpen(false);
    setEditingTooltip(null);
    setSelectedText('');
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
          onSelectedTextChange={setSelectedText}
          onEditorReady={setCurrentEditor}
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
        onClose={() => {
          setIsTooltipDialogOpen(false);
          setEditingTooltip(null);
          setSelectedText('');
        }}
        onSave={handleSaveTooltip}
        onRemove={editingTooltip ? handleRemoveTooltip : undefined}
        selectedText={selectedText}
        initialData={editingTooltip}
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
  onSelectedTextChange: (text: string) => void;
  onEditorReady: (editor: any) => void;
}

const SentenceDiagrammingCanvas: React.FC<SentenceDiagrammingCanvasProps> = ({
  sentence,
  words,
  initialContent,
  onAnnotationsAndContentChange,
  onAddTooltip,
  editingContent,
  onSelectedTextChange,
  onEditorReady,
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
    content: initialContent || `<p>${sentence}</p>`,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const annotations = extractAnnotationsFromEditor(editor);
      const htmlContent = editor.getHTML();

      // Single atomic update to prevent race conditions
      onAnnotationsAndContentChange(annotations, htmlContent);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to);
      onSelectedTextChange(text);
    },
    editorProps: {
      attributes: {
        class: 'sentence-diagramming-canvas',
      },
    },
  });

  // Notify parent when editor is ready
  React.useEffect(() => {
    if (editor) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="sentence-diagramming-canvas border border-gray-300 rounded-md">
      <DiagrammingToolbar
        editor={editor}
        onAnnotationClick={type => handleAnnotationClick(editor, type, words, sentence)}
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
