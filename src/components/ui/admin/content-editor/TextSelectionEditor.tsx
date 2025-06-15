import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2, Search, Eye, AlertCircle } from 'lucide-react';
import { TextSelectionExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';

export const TextSelectionEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as TextSelectionExercise);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<TextSelectionExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<TextSelectionExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const addQuestion = () => {
    const newQuestion = {
      id: `q${Date.now()}`,
      text: '',
      correctWord: '',
      explanation: '',
    };
    const newQuestions = [...editingContent.data.questions, newQuestion];
    updateData({ questions: newQuestions });
  };

  const updateQuestion = (index: number, field: keyof TextSelectionExercise['data']['questions'][0], value: string) => {
    const newQuestions = editingContent.data.questions.map((question, i) =>
      i === index ? { ...question, [field]: value } : question
    );
    updateData({ questions: newQuestions });
  };

  const removeQuestion = (index: number) => {
    const newQuestions = editingContent.data.questions.filter((_, i) => i !== index);
    updateData({ questions: newQuestions });
  };

  const getWordsInPassage = () => {
    if (!editingContent.data.passage) return [];
    return editingContent.data.passage
      .toLowerCase()
      .replace(/[.,;!?…]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 0);
  };

  const isWordInPassage = (word: string) => {
    const wordsInPassage = getWordsInPassage();
    return wordsInPassage.includes(word.toLowerCase());
  };

  const renderPassagePreview = () => {
    if (!editingContent.data.passage) return null;

    return (
      <div className="font-serif text-lg leading-relaxed p-4 bg-gray-50 rounded border">
        {editingContent.data.passage.split(' ').map((word, index) => (
          <span
            key={index}
            className="inline-block px-1 py-0.5 mx-0.5 rounded hover:bg-blue-100 cursor-pointer transition-colors"
            title={`Click to select: ${word}`}>
            {word}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Basic Fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Exercise Title</label>
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
            className="w-full p-2 border rounded-md"
            rows={3}
            placeholder="Provide instructions for students..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Audio Path (optional)</label>
          <input
            type="text"
            value={editingContent.audioPath || ''}
            onChange={e => updateContent({ audioPath: e.target.value || null })}
            className="w-full p-2 border rounded-md"
            placeholder="/assets/audio/example.mp3"
          />
        </div>
      </div>

      {/* Passage */}
      <div>
        <label className="block text-sm font-medium mb-2">Text Passage</label>
        <textarea
          value={editingContent.data.passage || ''}
          onChange={e => updateData({ passage: e.target.value })}
          className="w-full p-3 border rounded-md font-serif text-base"
          rows={4}
          placeholder="Enter the Latin text that students will analyze..."
        />
        <p className="text-xs text-gray-500 mt-1">Students will click on words in this passage to answer questions</p>

        {editingContent.data.passage && (
          <div className="mt-3">
            <label className="block text-xs font-medium mb-2 flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Passage Preview:
            </label>
            {renderPassagePreview()}
          </div>
        )}
      </div>

      {/* Questions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium">Questions</label>
          <Button onClick={addQuestion} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Question
          </Button>
        </div>

        <div className="space-y-4">
          {editingContent.data.questions.map((question, index) => (
            <Card key={question.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium">Question {index + 1}</h4>
                  <Button
                    onClick={() => removeQuestion(index)}
                    size="sm"
                    variant="ghost"
                    disabled={editingContent.data.questions.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Question ID</label>
                    <input
                      type="text"
                      value={question.id}
                      onChange={e => updateQuestion(index, 'id', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Unique identifier for this question"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Question Text/Prompt</label>
                    <textarea
                      value={question.text}
                      onChange={e => updateQuestion(index, 'text', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={2}
                      placeholder="What should students look for? e.g., 'Click on the unnecessary pronoun in the passage.'"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                      <Search className="h-3 w-3" />
                      Correct Word
                    </label>
                    <input
                      type="text"
                      value={question.correctWord}
                      onChange={e => updateQuestion(index, 'correctWord', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="The exact word students need to click (case-insensitive)"
                    />
                    {question.correctWord && !isWordInPassage(question.correctWord) && (
                      <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs">
                        <AlertCircle className="h-3 w-3" />
                        Warning: This word doesn't appear to be in the passage
                      </div>
                    )}
                    {question.correctWord && isWordInPassage(question.correctWord) && (
                      <div className="flex items-center gap-1 mt-1 text-green-600 text-xs">✓ Word found in passage</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Explanation (optional)</label>
                    <textarea
                      value={question.explanation || ''}
                      onChange={e => updateQuestion(index, 'explanation', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={2}
                      placeholder="Explain why this is the correct answer (shown after correct selection)"
                    />
                  </div>

                  {/* Question Preview */}
                  <div className="mt-3 p-3 bg-gray-50 rounded border">
                    <label className="block text-xs font-medium mb-2">Preview:</label>
                    <div className="text-sm space-y-2">
                      <div>
                        <strong>Prompt:</strong> {question.text || 'Question will appear here'}
                      </div>
                      <div>
                        <strong>Target Word:</strong>{' '}
                        <span className="font-mono bg-blue-100 px-1 rounded">{question.correctWord || 'word'}</span>
                      </div>
                      {question.explanation && (
                        <div>
                          <strong>Explanation:</strong> {question.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {editingContent.data.questions.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-sm">No questions yet</div>
              <div className="text-xs">Click "Add Question" to create your first text selection question</div>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div>
        <label className="block text-sm font-medium mb-2">Exercise Summary</label>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm space-y-2">
              <div>
                <strong>Passage Length:</strong>{' '}
                {editingContent.data.passage ? `${editingContent.data.passage.split(' ').length} words` : '0 words'}
              </div>
              <div>
                <strong>Total Questions:</strong> {editingContent.data.questions.length}
              </div>
              <div>
                <strong>Questions with explanations:</strong>{' '}
                {editingContent.data.questions.filter(q => q.explanation && q.explanation.trim() !== '').length}
              </div>
              <div>
                <strong>Completed questions:</strong>{' '}
                {editingContent.data.questions.filter(q => q.text.trim() !== '' && q.correctWord.trim() !== '').length}
              </div>
              {!editingContent.data.passage && <div className="text-amber-600">⚠️ No passage text provided</div>}
              {editingContent.data.questions.some(q => q.text.trim() === '' || q.correctWord.trim() === '') && (
                <div className="text-amber-600">⚠️ Some questions are missing text or correct words</div>
              )}
              {editingContent.data.questions.some(q => q.correctWord && !isWordInPassage(q.correctWord)) && (
                <div className="text-amber-600">⚠️ Some correct words don't appear in the passage</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
