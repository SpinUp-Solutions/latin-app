import React from 'react';
import { SentenceWord, AnnotationType, SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { DiagrammingEditor } from '../../core/DiagrammingEditor';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

export const SentenceDiagrammingEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as SentenceDiagrammingExercise);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<SentenceDiagrammingExercise>) => {
    const updatedContent = { ...editingContent, ...updates };

    dispatch(updateEditingContent(updatedContent));
  };

  const updateData = (dataUpdates: Partial<SentenceDiagrammingExercise['data']>) => {
    const updatedContent = {
      ...editingContent,
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    };

    dispatch(updateEditingContent(updatedContent));
  };

  const handleSentenceChange = (sentenceUpdates: Partial<SentenceDiagrammingExercise['data']['sentence']>) => {
    const updatedContent = {
      ...editingContent,
      data: {
        ...editingContent.data,
        sentence: { ...editingContent.data.sentence, ...sentenceUpdates },
      },
    };

    dispatch(updateEditingContent(updatedContent));
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
    const updatedContent = {
      ...editingContent,
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
    };

    dispatch(updateEditingContent(updatedContent));
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

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <SimpleRichEditor
          content={editingContent.title || ''}
          onChange={value => updateContent({ title: value })}
          placeholder="Enter exercise title..."
          singleLine={true}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Instructions</label>
        <SimpleRichEditor
          content={editingContent.instructions || ''}
          onChange={value => updateContent({ instructions: value })}
          placeholder="Enter instructions for students..."
          className="w-full h-24"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Latin Sentence</label>
        <SimpleRichEditor
          content={editingContent.data.sentence.latin}
          onChange={value => handleLatinChange(value)}
          placeholder="Enter Latin sentence..."
          singleLine={true}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">English Translation</label>
        <SimpleRichEditor
          content={editingContent.data.sentence.translation}
          onChange={value => handleSentenceChange({ translation: value })}
          placeholder="Enter English translation..."
          singleLine={true}
          className="w-full"
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

        <DiagrammingEditor
          key={editingContent.data.sentence.latin}
          initialContent={editingContent.data.sentence.content || `<p>${editingContent.data.sentence.latin}</p>`}
          words={editingContent.data.sentence.words}
          sentence={editingContent.data.sentence.latin}
          onUpdate={handleAnnotationsAndContentChange}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Hints</label>
        <SimpleRichEditor
          content={editingContent.data.hints?.join('\n') || ''}
          onChange={value => updateData({ hints: value.split('\n').filter(h => h.trim()) })}
          placeholder="Enter hints (one per line)..."
          className="w-full h-24"
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
    </div>
  );
};
