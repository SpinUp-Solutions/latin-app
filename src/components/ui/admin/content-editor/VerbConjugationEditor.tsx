import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2, Eye, AlertCircle, Users, BookOpen, Zap, Check, X } from 'lucide-react';
import { VerbConjugationExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

export const VerbConjugationEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as VerbConjugationExercise);

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
          hint: '',
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
      hint: '',
    };
    const newExercises = [...editingContent.data.livingLatinPractice.exercises, newExercise];
    updateData({
      livingLatinPractice: {
        ...editingContent.data.livingLatinPractice,
        exercises: newExercises,
      },
    });
  };

  const updateExercise = (index: number, field: 'english' | 'answer' | 'hint', value: string) => {
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
            placeholder="Provide instructions for students..."
            rows={3}
            className="w-full"
          />
        </div>

        <AudioUploadSection
          audioPath={editingContent.audioPath}
          onAudioPathChange={audioPath => updateContent({ audioPath })}
          contentItemId={editingContent.id}
        />
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
              <SimpleRichEditor
                content={editingContent.data.passage.latin}
                onChange={value => updatePassage({ latin: value })}
                placeholder="Enter the Latin passage..."
                rows={3}
                className="w-full font-serif text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">English Translation</label>
              <SimpleRichEditor
                content={editingContent.data.passage.translation}
                onChange={value => updatePassage({ translation: value })}
                placeholder="Enter the English translation..."
                rows={3}
                className="w-full"
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
                      <SimpleRichEditor
                        content={newVocabTerm}
                        onChange={setNewVocabTerm}
                        placeholder="e.g., quid, mi, opis..."
                        singleLine={true}
                        className="w-full font-serif italic"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Definition/Explanation</label>
                      <SimpleRichEditor
                        content={newVocabDefinition}
                        onChange={setNewVocabDefinition}
                        singleLine={true}
                        className="w-full"
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
                        <SimpleRichEditor
                          content={definition}
                          onChange={value => updateSpecialVocab(term, value)}
                          placeholder="Definition or explanation..."
                          singleLine={true}
                          className="flex-1"
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
                <SimpleRichEditor
                  content={editingContent.data.conjugationTask.instructions}
                  onChange={value => updateConjugationTask({ instructions: value })}
                  placeholder="Instructions for the conjugation task..."
                  rows={3}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Hint (Optional)</label>
                <SimpleRichEditor
                  content={editingContent.data.conjugationTask.hint || ''}
                  onChange={value => updateConjugationTask({ hint: value })}
                  placeholder="Helpful hint for students when they make mistakes..."
                  rows={2}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Shown when students make incorrect attempts (if enabled in feedback config)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Correct Answer</label>
                <SimpleRichEditor
                  content={editingContent.data.conjugationTask.answer}
                  onChange={value => updateConjugationTask({ answer: value })}
                  placeholder="The correct Latin answer..."
                  rows={2}
                  className="w-full font-serif"
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
                            <SimpleRichEditor
                              content={example.latin}
                              onChange={value => updateExample(index, 'latin', value)}
                              placeholder="e.g., Sis felix semper!"
                              singleLine={true}
                              className="w-full font-serif"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Translation</label>
                            <SimpleRichEditor
                              content={example.translation}
                              onChange={value => updateExample(index, 'translation', value)}
                              singleLine={true}
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
                            <SimpleRichEditor
                              content={exercise.english}
                              onChange={value => updateExercise(index, 'english', value)}
                              placeholder="e.g., May she always be happy!"
                              singleLine={true}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Hint (Optional)</label>
                            <SimpleRichEditor
                              content={exercise.hint || ''}
                              onChange={value => updateExercise(index, 'hint', value)}
                              placeholder="Helpful hint for this exercise..."
                              singleLine={true}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Latin Answer</label>
                            <SimpleRichEditor
                              content={exercise.answer}
                              onChange={value => updateExercise(index, 'answer', value)}
                              placeholder="e.g., Sit felix semper"
                              singleLine={true}
                              className="w-full font-serif"
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
      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
      />

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
