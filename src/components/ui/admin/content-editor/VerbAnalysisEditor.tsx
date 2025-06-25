import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Trash2, Eye, AlertCircle, Zap, X, Check } from 'lucide-react';
import { VerbAnalysisExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';

export const VerbAnalysisEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as VerbAnalysisExercise);

  // New state for word popup
  const [wordPopup, setWordPopup] = useState<{
    wordIndex: number;
    position: { x: number; y: number };
    correctPronoun: string;
    explanation: string;
    isEditing: boolean;
  } | null>(null);
  const passageRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Split passage into words once for reuse
  const passageWords = editingContent?.data.passage ? editingContent.data.passage.trim().split(/\s+/) : [];

  const handleWordClickInPreview = useCallback(
    (wordIndex: number, event: React.MouseEvent) => {
      if (!editingContent) return;

      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const passageRect = passageRef.current?.getBoundingClientRect();

      if (!passageRect) return;

      // Find existing verb for this word index
      const existingVerb = editingContent.data.verbs.find(v => v.wordIndex === wordIndex);

      // Simple positioning - just use the word's position
      const x = rect.left - passageRect.left + rect.width / 2;
      const y = rect.top - passageRect.top;

      setWordPopup({
        wordIndex,
        position: { x, y },
        correctPronoun: existingVerb?.correctPronoun || '',
        explanation: existingVerb?.explanation || '',
        isEditing: !!existingVerb,
      });
    },
    [editingContent]
  );

  // Close popup when clicking outside
  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (!wordPopup) return;

      const target = event.target as Node;

      // Skip closing when clicking inside the popup or the passage.
      if (popupRef.current?.contains(target) || passageRef.current?.contains(target)) {
        return;
      }

      setWordPopup(null);
    },
    [wordPopup]
  );

  React.useEffect(() => {
    if (wordPopup) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [wordPopup, handleClickOutside]);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<VerbAnalysisExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<VerbAnalysisExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const removeVerb = (index: number) => {
    const newVerbs = editingContent.data.verbs.filter((_, i) => i !== index);
    updateData({ verbs: newVerbs });
  };

  const closeWordPopup = () => {
    setWordPopup(null);
  };

  const saveWordPopup = () => {
    if (!wordPopup) return;

    const existingVerbIndex = editingContent.data.verbs.findIndex(v => v.wordIndex === wordPopup.wordIndex);
    let newVerbs;

    if (existingVerbIndex >= 0) {
      newVerbs = editingContent.data.verbs.map((verb, i) =>
        i === existingVerbIndex
          ? {
              wordIndex: wordPopup.wordIndex,
              correctPronoun: wordPopup.correctPronoun,
              explanation: wordPopup.explanation || undefined,
            }
          : verb
      );
    } else {
      newVerbs = [
        ...editingContent.data.verbs,
        {
          wordIndex: wordPopup.wordIndex,
          correctPronoun: wordPopup.correctPronoun,
          explanation: wordPopup.explanation || undefined,
        },
      ];
    }

    updateData({ verbs: newVerbs });
    closeWordPopup();
  };

  const deleteWordVerb = () => {
    if (!wordPopup) return;

    const newVerbs = editingContent.data.verbs.filter(v => v.wordIndex !== wordPopup.wordIndex);
    updateData({ verbs: newVerbs });
    closeWordPopup();
  };

  const renderPassagePreview = () => {
    if (!editingContent.data.passage) return null;

    return (
      <div ref={passageRef} className="font-serif text-lg leading-relaxed p-4 bg-gray-50 rounded border">
        {passageWords.map((word, index) => {
          const isExistingVerb = editingContent.data.verbs.some(v => v.wordIndex === index);

          return (
            <span
              key={index}
              onClick={e => handleWordClickInPreview(index, e)}
              className={`inline-block px-1 py-0.5 mx-0.5 rounded transition-colors relative group cursor-pointer ${
                isExistingVerb ? 'bg-red-100 font-bold text-red-700 border border-red-200' : 'hover:bg-blue-100'
              }`}
              title={isExistingVerb ? `Click to edit verb: ${word}` : `Click to add verb: ${word} (index: ${index})`}>
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  const validateContent = () => {
    const warnings = [];

    if (!editingContent.data.passage?.trim()) {
      warnings.push('Passage is required');
    }

    if (editingContent.data.verbs.length === 0) {
      warnings.push('At least one verb is required');
    }

    editingContent.data.verbs.forEach((verb, index) => {
      if (verb.wordIndex < 0 || verb.wordIndex >= passageWords.length) {
        warnings.push(`Verb ${index + 1}: Invalid word index (${verb.wordIndex})`);
      }
      if (!verb.correctPronoun?.trim()) {
        warnings.push(`Verb ${index + 1}: Correct pronoun is required`);
      }
    });

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

      {/* Passage */}
      <div>
        <label className="block text-sm font-medium mb-2">Latin Text Passage</label>
        <textarea
          value={editingContent.data.passage || ''}
          onChange={e => updateData({ passage: e.target.value })}
          className="w-full p-3 border rounded-md font-serif text-base"
          rows={4}
          placeholder="Enter the Latin text that contains the verbs students will analyze..."
        />
        <p className="text-xs text-gray-500 mt-1">
          Students will click on verbs in this passage and enter the correct pronouns
        </p>

        {editingContent.data.passage && (
          <div className="mt-3">
            <label className="block text-xs font-medium mb-2 flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Passage Preview (click on words to add/edit verbs):
            </label>
            <p className="text-xs text-gray-500 mb-2">
              • Click on any word to add it as a verb or edit existing verb answers • Existing verbs are highlighted in
              red • A popup will appear above the clicked word for editing
            </p>
            {renderPassagePreview()}
          </div>
        )}
      </div>

      {/* Verbs */}
      <div>
        <div className="mb-3">
          <label className="block text-sm font-medium flex items-center gap-1">
            <Zap className="h-4 w-4" />
            Verbs to Analyze
          </label>
          <p className="text-xs text-gray-500 mt-1">Click on words in the passage above to add or edit verbs.</p>
        </div>

        <div className="space-y-4">
          {editingContent.data.verbs.map((verb, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium">Verb {index + 1}</h4>
                  <Button
                    onClick={() => removeVerb(index)}
                    size="sm"
                    variant="ghost"
                    disabled={editingContent.data.verbs.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Selected Word</label>
                    <div className="w-full p-2 border rounded text-sm bg-gray-50">
                      <span className="font-mono">{passageWords[verb.wordIndex] || 'Invalid index'}</span> (index:{' '}
                      {verb.wordIndex})
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Correct Pronoun</label>
                    <div className="w-full p-2 border rounded text-sm bg-gray-50">
                      {verb.correctPronoun || 'Not set'}
                    </div>
                  </div>
                </div>

                {verb.explanation && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-1">Explanation</label>
                    <div className="w-full p-2 border rounded text-sm bg-gray-50">{verb.explanation}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

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
                {editingContent.data.passage ? editingContent.data.passage.split(' ').length : 0} words
              </span>
            </div>
            <div>
              <span className="text-gray-600">Verbs to analyze:</span>{' '}
              <span className="font-medium">{editingContent.data.verbs.length}</span>
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

      {/* Word Popup Overlay */}
      {wordPopup && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div
            ref={popupRef}
            className="word-popup fixed bg-white border border-gray-300 rounded-lg shadow-lg p-4 min-w-64 max-w-sm pointer-events-auto -translate-x-1/2 translate-y-8"
            style={{
              left: `${wordPopup.position.x + (passageRef.current?.getBoundingClientRect().left || 0)}px`,
              top: `${wordPopup.position.y + (passageRef.current?.getBoundingClientRect().top || 0)}px`,
            }}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">
                  {wordPopup.isEditing ? 'Edit Verb' : 'Add Verb'}:
                  <span className="font-mono ml-1 bg-gray-100 px-1 rounded">{passageWords[wordPopup.wordIndex]}</span>
                </h4>
                <Button onClick={closeWordPopup} size="sm" variant="ghost" className="p-1 h-6 w-6">
                  <X className="h-3 w-3" />
                </Button>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Correct Pronoun</label>
                <input
                  type="text"
                  value={wordPopup.correctPronoun}
                  onChange={e => setWordPopup(prev => (prev ? { ...prev, correctPronoun: e.target.value } : null))}
                  className="w-full p-2 border rounded text-sm"
                  placeholder="e.g., I, you, he/she/it..."
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Explanation (optional)</label>
                <textarea
                  value={wordPopup.explanation}
                  onChange={e => setWordPopup(prev => (prev ? { ...prev, explanation: e.target.value } : null))}
                  className="w-full p-2 border rounded text-sm"
                  rows={2}
                  placeholder="e.g., First person singular..."
                />
              </div>

              <div className="flex gap-2 justify-end">
                {wordPopup.isEditing && (
                  <Button onClick={deleteWordVerb} size="sm" variant="destructive" className="text-xs">
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                )}
                <Button onClick={closeWordPopup} size="sm" variant="outline" className="text-xs">
                  Cancel
                </Button>
                <Button
                  onClick={saveWordPopup}
                  size="sm"
                  disabled={!wordPopup.correctPronoun.trim()}
                  className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  {wordPopup.isEditing ? 'Update' : 'Add'}
                </Button>
              </div>
            </div>

            {/* Arrow pointing to the word */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-300"></div>
          </div>
        </div>
      )}
    </div>
  );
};
