import React from 'react';
import {
  DiagramSelectionMark,
  DiagramToolKey,
  SentenceDiagrammingExercise,
} from '@/src/types/exercises/sentence-diagramming';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { DiagrammingEditor } from '../../core/DiagrammingEditor';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import {
  buildDiagrammingContent,
  DEFAULT_STUDENT_DIAGRAM_TOOLS,
  DIAGRAM_MARK_DEFINITIONS,
  ensureDiagrammingContent,
  tokenizeSentence,
} from '@/src/utils/sentenceDiagramming';

export const SentenceDiagrammingEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as SentenceDiagrammingExercise
  );

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const availableStudentTools = editingContent.data.availableStudentTools || DEFAULT_STUDENT_DIAGRAM_TOOLS;

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
    dispatch(
      updateEditingContent({
        ...editingContent,
        data: {
          ...editingContent.data,
          sentence: {
            ...editingContent.data.sentence,
            latin,
            words,
            content: buildDiagrammingContent(words),
          },
          solution: {
            ...editingContent.data.solution,
            marks: [],
          },
        },
      })
    );
  };

  const handleAnnotationsAndContentChange = (marks: DiagramSelectionMark[], htmlContent: string) => {
    const updatedContent = {
      ...editingContent,
      data: {
        ...editingContent.data,
        solution: {
          ...editingContent.data.solution,
          marks,
        },
        sentence: {
          ...editingContent.data.sentence,
          content: htmlContent,
        },
      },
    };

    dispatch(updateEditingContent(updatedContent));
  };

  const handleAvailableToolToggle = (tool: DiagramToolKey) => {
    const nextTools = availableStudentTools.includes(tool)
      ? availableStudentTools.filter(currentTool => currentTool !== tool)
      : [...availableStudentTools, tool];

    updateData({
      availableStudentTools: nextTools,
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
        <label className="block text-sm font-medium mb-2">Student Toolbar</label>
        <div className="rounded-md border border-gray-200 p-4 space-y-3">
          <div className="text-sm text-gray-600">
            Choose which annotation tools the student can use for this exercise.
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {DIAGRAM_MARK_DEFINITIONS.map(definition => (
              <label
                key={definition.type}
                className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={availableStudentTools.includes(definition.type)}
                  onChange={() => handleAvailableToolToggle(definition.type)}
                />
                <span>{definition.title}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Solution Diagram</label>
        <div className="text-sm text-gray-600 mb-2">
          Create the correct annotation solution by selecting text and using the toolbar below:
        </div>

        <DiagrammingEditor
          key={editingContent.data.sentence.latin}
          initialContent={ensureDiagrammingContent(
            editingContent.data.sentence.content,
            editingContent.data.sentence.words
          )}
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
