import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2, Eye, AlertCircle, Users, BookOpen, Zap, Check, X } from 'lucide-react';
import { VerbConjugationExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { FeedbackConfigEditor } from './FeedbackConfigEditor';

export const VerbConjugationEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as VerbConjugationExercise);

  // State for adding new vocabulary
  const [showAddVocab, setShowAddVocab] = useState(false);
  const [newVocabTerm, setNewVocabTerm] = useState('');
  const [newVocabDefinition, setNewVocabDefinition] = useState('');

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<VerbConjugationExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<VerbConjugationExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const updatePassage = (passageUpdates: Partial<VerbConjugationExercise['data']['passage']>) => {
    updateData({
      passage: {
        ...editingContent.data.passage,
        ...passageUpdates,
      },
    });
  };

  const updateConjugationTask = (taskUpdates: Partial<VerbConjugationExercise['data']['conjugationTask']>) => {
    if (!editingContent.data.conjugationTask) return;

    updateData({
      conjugationTask: {
        ...editingContent.data.conjugationTask,
        ...taskUpdates,
      },
    });
  };

  const toggleConjugationTask = () => {
    if (editingContent.data.conjugationTask) {
      updateData({ conjugationTask: undefined });
    } else {
      updateData({
        conjugationTask: {
          instructions: '',
          answer: '',
        },
      });
    }
  };

  const toggleLivingLatinPractice = () => {
    if (editingContent.data.livingLatinPractice) {
      updateData({ livingLatinPractice: undefined });
    } else {
      updateData({
        livingLatinPractice: {
          examples: [],
          exercises: [],
        },
      });
    }
  };

  const addSpecialVocab = () => {
    if (newVocabTerm.trim()) {
      const currentVocab = editingContent.data.passage.specialVocab || {};
      updatePassage({
        specialVocab: {
          ...currentVocab,
          [newVocabTerm.trim()]: newVocabDefinition.trim(),
        },
      });

      // Reset form
      setNewVocabTerm('');
      setNewVocabDefinition('');
      setShowAddVocab(false);
    }
  };

  const cancelAddVocab = () => {
    setNewVocabTerm('');
    setNewVocabDefinition('');
    setShowAddVocab(false);
  };

  const updateSpecialVocab = (key: string, value: string) => {
    const currentVocab = editingContent.data.passage.specialVocab || {};
    updatePassage({
      specialVocab: {
        ...currentVocab,
        [key]: value,
      },
    });
  };

  const removeSpecialVocab = (key: string) => {
    const currentVocab = editingContent.data.passage.specialVocab || {};
    const newVocab = { ...currentVocab };
    delete newVocab[key];
    updatePassage({ specialVocab: newVocab });
  };

  const addExample = () => {
    if (!editingContent.data.livingLatinPractice) return;

    const newExample = {
      latin: '',
      translation: '',
    };
    const newExamples = [...editingContent.data.livingLatinPractice.examples, newExample];
    updateData({
      livingLatinPractice: {
        ...editingContent.data.livingLatinPractice,
        examples: newExamples,
      },
    });
  };

  const updateExample = (index: number, field: 'latin' | 'translation', value: string) => {
    if (!editingContent.data.livingLatinPractice) return;

    const newExamples = editingContent.data.livingLatinPractice.examples.map((example, i) =>
      i === index ? { ...example, [field]: value } : example
    );
    updateData({
      livingLatinPractice: {
        ...editingContent.data.livingLatinPractice,
        examples: newExamples,
      },
    });
  };

  const removeExample = (index: number) => {
    if (!editingContent.data.livingLatinPractice) return;

    const newExamples = editingContent.data.livingLatinPractice.examples.filter((_, i) => i !== index);
    updateData({
      livingLatinPractice: {
        ...editingContent.data.livingLatinPractice,
        examples: newExamples,
      },
    });
  };

  const addExercise = () => {
    if (!editingContent.data.livingLatinPractice) return;

    const newExercise = {
      english: '',
      answer: '',
    };
    const newExercises = [...editingContent.data.livingLatinPractice.exercises, newExercise];
    updateData({
      livingLatinPractice: {
        ...editingContent.data.livingLatinPractice,
        exercises: newExercises,
      },
    });
  };

  const updateExercise = (index: number, field: 'english' | 'answer', value: string) => {
    if (!editingContent.data.livingLatinPractice) return;

    const newExercises = editingContent.data.livingLatinPractice.exercises.map((exercise, i) =>
      i === index ? { ...exercise, [field]: value } : exercise
    );
    updateData({
      livingLatinPractice: {
        ...editingContent.data.livingLatinPractice,
        exercises: newExercises,
      },
    });
  };

  const removeExercise = (index: number) => {
    if (!editingContent.data.livingLatinPractice) return;

    const newExercises = editingContent.data.livingLatinPractice.exercises.filter((_, i) => i !== index);
    updateData({
      livingLatinPractice: {
        ...editingContent.data.livingLatinPractice,
        exercises: newExercises,
      },
    });
  };

  const validateContent = () => {
    const warnings = [];

    if (!editingContent.data.passage.latin?.trim()) {
      warnings.push('Latin passage is required');
    }

    if (!editingContent.data.passage.translation?.trim()) {
      warnings.push('English translation is required');
    }

    if (editingContent.data.conjugationTask) {
      if (!editingContent.data.conjugationTask.instructions?.trim()) {
        warnings.push('Conjugation task instructions are required');
      }
      if (!editingContent.data.conjugationTask.answer?.trim()) {
        warnings.push('Conjugation task answer is required');
      }
    }

    if (editingContent.data.livingLatinPractice) {
      editingContent.data.livingLatinPractice.examples.forEach((example, index) => {
        if (!example.latin?.trim()) {
          warnings.push(`Example ${index + 1}: Latin text is required`);
        }
        if (!example.translation?.trim()) {
          warnings.push(`Example ${index + 1}: Translation is required`);
        }
      });

      editingContent.data.livingLatinPractice.exercises.forEach((exercise, index) => {
        if (!exercise.english?.trim()) {
          warnings.push(`Practice ${index + 1}: English prompt is required`);
        }
        if (!exercise.answer?.trim()) {
          warnings.push(`Practice ${index + 1}: Latin answer is required`);
        }
      });
    }

    return warnings;
  };

  const warnings = validateContent();

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

      {/* Main Passage */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Latin Passage
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Latin Text</label>
              <textarea
                value={editingContent.data.passage.latin}
                onChange={e => updatePassage({ latin: e.target.value })}
                className="w-full p-3 border rounded-md font-serif text-base"
                rows={3}
                placeholder="Enter the Latin passage..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">English Translation</label>
              <textarea
                value={editingContent.data.passage.translation}
                onChange={e => updatePassage({ translation: e.target.value })}
                className="w-full p-3 border rounded-md"
                rows={3}
                placeholder="Enter the English translation..."
              />
            </div>

            {/* Special Vocabulary */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Special Vocabulary (optional)</label>
                {!showAddVocab ? (
                  <Button onClick={() => setShowAddVocab(true)} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Term
                  </Button>
                ) : null}
              </div>

              {/* Add new vocabulary form */}
              {showAddVocab && (
                <div className="mb-3 p-3 border border-dashed border-gray-300 rounded-md bg-gray-50">
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium mb-1">Latin Term</label>
                      <input
                        type="text"
                        value={newVocabTerm}
                        onChange={e => setNewVocabTerm(e.target.value)}
                        className="w-full p-2 border rounded text-sm font-serif italic"
                        placeholder="e.g., quid, mi, opis..."
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Definition/Explanation</label>
                      <input
                        type="text"
                        value={newVocabDefinition}
                        onChange={e => setNewVocabDefinition(e.target.value)}
                        className="w-full p-2 border rounded text-sm"
                        placeholder="e.g., (accusative/direct object form) something"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button onClick={cancelAddVocab} size="sm" variant="ghost">
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        onClick={addSpecialVocab}
                        size="sm"
                        disabled={!newVocabTerm.trim()}
                        className="bg-green-600 hover:bg-green-700">
                        <Check className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {editingContent.data.passage.specialVocab &&
                Object.keys(editingContent.data.passage.specialVocab).length > 0 && (
                  <div className="space-y-2">
                    {Object.entries(editingContent.data.passage.specialVocab).map(([term, definition]) => (
                      <div key={term} className="flex items-center gap-2">
                        <span className="font-serif italic text-sm w-24 text-right">{term}</span>
                        <span className="text-sm">=</span>
                        <input
                          type="text"
                          value={definition}
                          onChange={e => updateSpecialVocab(term, e.target.value)}
                          className="flex-1 p-1 border rounded text-sm"
                          placeholder="Definition or explanation..."
                        />
                        <Button onClick={() => removeSpecialVocab(term)} size="sm" variant="ghost">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conjugation Task */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Conjugation Task
            </h3>
            <Button
              onClick={toggleConjugationTask}
              size="sm"
              variant={editingContent.data.conjugationTask ? 'destructive' : 'outline'}>
              {editingContent.data.conjugationTask ? 'Remove Task' : 'Add Task'}
            </Button>
          </div>

          {editingContent.data.conjugationTask && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Task Instructions</label>
                <textarea
                  value={editingContent.data.conjugationTask.instructions}
                  onChange={e => updateConjugationTask({ instructions: e.target.value })}
                  className="w-full p-2 border rounded-md"
                  rows={3}
                  placeholder="Instructions for the conjugation task..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Correct Answer</label>
                <textarea
                  value={editingContent.data.conjugationTask.answer}
                  onChange={e => updateConjugationTask({ answer: e.target.value })}
                  className="w-full p-2 border rounded-md font-serif"
                  rows={2}
                  placeholder="The correct Latin answer..."
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Living Latin Practice */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Living Latin Practice
            </h3>
            <Button
              onClick={toggleLivingLatinPractice}
              size="sm"
              variant={editingContent.data.livingLatinPractice ? 'destructive' : 'outline'}>
              {editingContent.data.livingLatinPractice ? 'Remove Practice' : 'Add Practice'}
            </Button>
          </div>

          {editingContent.data.livingLatinPractice && (
            <div className="space-y-6">
              {/* Examples */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium">Examples</label>
                  <Button onClick={addExample} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Example
                  </Button>
                </div>

                <div className="space-y-3">
                  {editingContent.data.livingLatinPractice.examples.map((example, index) => (
                    <Card key={index} className="border-dashed">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-medium">Example {index + 1}</h4>
                          <Button onClick={() => removeExample(index)} size="sm" variant="ghost">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <label className="block text-xs font-medium mb-1">Latin</label>
                            <input
                              type="text"
                              value={example.latin}
                              onChange={e => updateExample(index, 'latin', e.target.value)}
                              className="w-full p-2 border rounded text-sm font-serif"
                              placeholder="e.g., Sis felix semper!"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Translation</label>
                            <input
                              type="text"
                              value={example.translation}
                              onChange={e => updateExample(index, 'translation', e.target.value)}
                              className="w-full p-2 border rounded text-sm"
                              placeholder="e.g., May you always be happy!"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Practice Exercises */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium">Practice Exercises</label>
                  <Button onClick={addExercise} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Exercise
                  </Button>
                </div>

                <div className="space-y-3">
                  {editingContent.data.livingLatinPractice.exercises.map((exercise, index) => (
                    <Card key={index} className="border-dashed">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-medium">Exercise {index + 1}</h4>
                          <Button onClick={() => removeExercise(index)} size="sm" variant="ghost">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <label className="block text-xs font-medium mb-1">English Prompt</label>
                            <input
                              type="text"
                              value={exercise.english}
                              onChange={e => updateExercise(index, 'english', e.target.value)}
                              className="w-full p-2 border rounded text-sm"
                              placeholder="e.g., May she always be happy!"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Latin Answer</label>
                            <input
                              type="text"
                              value={exercise.answer}
                              onChange={e => updateExercise(index, 'answer', e.target.value)}
                              className="w-full p-2 border rounded text-sm font-serif"
                              placeholder="e.g., Sit felix semper"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feedback Configuration */}
      <div>
        <h3 className="text-lg font-medium mb-4">Feedback Configuration</h3>
        <FeedbackConfigEditor
          feedbackConfig={editingContent.feedbackConfig}
          onChange={feedbackConfig => updateContent({ feedbackConfig })}
        />
      </div>

      {/* Summary and Validation */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Exercise Summary
          </h3>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Passage length:</span>{' '}
              <span className="font-medium">
                {editingContent.data.passage.latin ? editingContent.data.passage.latin.split(' ').length : 0} words
              </span>
            </div>
            <div>
              <span className="text-gray-600">Special vocabulary:</span>{' '}
              <span className="font-medium">
                {editingContent.data.passage.specialVocab
                  ? Object.keys(editingContent.data.passage.specialVocab).length
                  : 0}{' '}
                terms
              </span>
            </div>
            <div>
              <span className="text-gray-600">Conjugation task:</span>{' '}
              <span className="font-medium">{editingContent.data.conjugationTask ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div>
              <span className="text-gray-600">Living Latin practice:</span>{' '}
              <span className="font-medium">
                {editingContent.data.livingLatinPractice
                  ? `${editingContent.data.livingLatinPractice.examples.length} examples, ${editingContent.data.livingLatinPractice.exercises.length} exercises`
                  : 'Disabled'}
              </span>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-800">Validation Warnings</span>
              </div>
              <ul className="text-xs text-orange-700 space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
