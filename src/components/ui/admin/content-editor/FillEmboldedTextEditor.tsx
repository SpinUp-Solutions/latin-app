import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Textarea } from '@/src/components/ui/textarea';
import { Input } from '@/src/components/ui/input';
import { Trash2, Eye, AlertCircle, Zap, X, Check } from 'lucide-react';
import { FillEmboldedTextExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { SimpleRichDisplay } from '../../core/simple-rich-display';

export const FillEmboldedTextEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as FillEmboldedTextExercise
  );

  const words = useMemo(() => editingContent?.data?.words || [], [editingContent]);
  const passage = editingContent?.data?.passage || '';

  // New state for word popup
  const [wordPopup, setWordPopup] = useState<{
    wordIndex: number;
    position: { x: number; y: number };
    correctAnswer: string;
    question: string;
    hint: string;
    explanation: string;
    isEditing: boolean;
  } | null>(null);

  const passageRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const passageWords = useMemo(() => {
    return passage ? passage.trim().split(/\s+/) : [];
  }, [passage]);

  const handleWordClickInPreview = useCallback(
    (wordIndex: number, event: React.MouseEvent) => {
      if (!editingContent) return;

      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const passageRect = passageRef.current?.getBoundingClientRect();

      if (!passageRect) return;

      const existingWord = words.find(v => v.wordIndex === wordIndex);

      const x = rect.left - passageRect.left + rect.width / 2;
      const y = rect.top - passageRect.top;

      setWordPopup({
        wordIndex,
        position: { x, y },
        correctAnswer: existingWord?.correctAnswer || '',
        question: existingWord?.question || '',
        hint: existingWord?.hint || '',
        explanation: existingWord?.explanation || '',
        isEditing: !!existingWord,
      });
    },
    [editingContent, words]
  );

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (!wordPopup) return;

      const target = event.target as Node;

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

  const updateContent = useCallback(
    (updates: Partial<FillEmboldedTextExercise>) => {
      if (!editingContent) return;
      dispatch(updateEditingContent({ ...editingContent, ...updates }));
    },
    [dispatch, editingContent]
  );

  const updateData = useCallback(
    (dataUpdates: Partial<FillEmboldedTextExercise['data']>) => {
      if (!editingContent) return;
      updateContent({
        data: {
          ...editingContent.data,
          words: words, // Ensure words is preserved if not in dataUpdates, though spreads handle this usually
          ...dataUpdates,
        },
      });
    },
    [editingContent, updateContent, words]
  );

  const removeWord = useCallback(
    (index: number) => {
      // Safe filter
      const newWords = words.filter((_, i) => i !== index);
      updateData({ words: newWords });
    },
    [words, updateData]
  );

  const handlePassageChange = (newPassage: string) => {
    const newWords = words.filter(w => {
      const wordCount = newPassage.trim().split(/\s+/).length;
      return w.wordIndex < wordCount;
    });

    updateContent({
      data: {
        ...editingContent.data,
        passage: newPassage,
        words: newWords,
      },
    });
  };

  const closeWordPopup = useCallback(() => {
    setWordPopup(null);
  }, []);

  const saveWordPopup = useCallback(() => {
    if (!wordPopup) return;

    const existingWordIndex = words.findIndex(v => v.wordIndex === wordPopup.wordIndex);
    let newWords;

    const wordData = {
      wordIndex: wordPopup.wordIndex,
      correctAnswer: wordPopup.correctAnswer,
      question: wordPopup.question || undefined,
      hint: wordPopup.hint || undefined,
      explanation: wordPopup.explanation || undefined,
    };

    if (existingWordIndex >= 0) {
      newWords = words.map((word, i) => (i === existingWordIndex ? wordData : word));
    } else {
      newWords = [...words, wordData];
    }

    updateData({ words: newWords });
    closeWordPopup();
  }, [wordPopup, words, updateData, closeWordPopup]);

  const deleteWordFromPopup = useCallback(() => {
    if (!wordPopup) return;

    const newWords = words.filter(v => v.wordIndex !== wordPopup.wordIndex);
    updateData({ words: newWords });
    closeWordPopup();
  }, [wordPopup, words, updateData, closeWordPopup]);

  // validation using useMemo
  const warnings = useMemo(() => {
    const warns = [];

    if (!passage.trim()) {
      warns.push('Passage is required');
    }

    if (words.length === 0) {
      warns.push('At least one word is required');
    }

    words.forEach((word, index) => {
      if (word.wordIndex < 0 || word.wordIndex >= passageWords.length) {
        warns.push(`Word ${index + 1}: Invalid word index (${word.wordIndex})`);
      }
      if (!word.correctAnswer?.trim()) {
        warns.push(`Word ${index + 1}: Correct answer is required`);
      }
    });

    return warns;
  }, [passage, words, passageWords]);

  const renderPassagePreview = () => {
    if (!passage) return null;

    return (
      <div ref={passageRef} className="font-serif text-lg leading-relaxed p-4 bg-gray-50 rounded border">
        {passageWords.map((word, index) => {
          const isExistingWord = words.some(v => v.wordIndex === index);

          return (
            <span
              key={index}
              onClick={e => handleWordClickInPreview(index, e)}
              className={`inline-block px-1 py-0.5 mx-0.5 rounded transition-colors relative group cursor-pointer ${
                isExistingWord ? 'bg-red-100 font-bold text-red-700 border border-red-200' : 'hover:bg-blue-100'
              }`}
              title={isExistingWord ? `Click to edit word: ${word}` : `Click to add word: ${word} (index: ${index})`}>
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

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

      <div>
        <label className="block text-sm font-medium mb-2">Latin Text Passage</label>
        <Textarea
          value={passage}
          onChange={e => handlePassageChange(e.target.value)}
          placeholder="Enter the Latin text passage..."
          rows={4}
          className="w-full font-serif text-base"
        />
        <p className="text-xs text-gray-500 mt-1">Students will click on words in this passage and provide answers</p>

        {passage && (
          <div className="mt-3">
            <label className="block text-xs font-medium mb-2 flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Passage Preview (click on words to add/edit):
            </label>
            <p className="text-xs text-gray-500 mb-2">
              • Click on any word to add it or edit existing answers • Existing words are highlighted in red • A popup
              will appear above the clicked word for editing
            </p>
            {renderPassagePreview()}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3">
          <label className="block text-sm font-medium flex items-center gap-1">
            <Zap className="h-4 w-4" />
            Words to Fill
          </label>
          <p className="text-xs text-gray-500 mt-1">Click on words in the passage above to add or edit them.</p>
        </div>

        <div className="space-y-4">
          {words.map((word, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium">Word {index + 1}</h4>
                  <Button onClick={() => removeWord(index)} size="sm" variant="ghost">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Selected Word</label>
                    <div className="w-full p-2 border rounded text-sm bg-gray-50">
                      <span className="font-mono">{passageWords[word.wordIndex] || 'Invalid index'}</span> (index:{' '}
                      {word.wordIndex})
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Correct Answer</label>
                    <div className="w-full p-2 border rounded text-sm bg-gray-50">
                      {word.correctAnswer || 'Not set'}
                    </div>
                  </div>
                </div>

                {word.question && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-1">Question</label>
                    <div className="w-full p-2 border rounded text-sm bg-gray-50">
                      <SimpleRichDisplay content={word.question} />
                    </div>
                  </div>
                )}

                {word.hint && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-1">Hint</label>
                    <div className="w-full p-2 border rounded text-sm bg-gray-50">
                      <SimpleRichDisplay content={word.hint} />
                    </div>
                  </div>
                )}

                {word.explanation && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-1">Explanation</label>
                    <div className="w-full p-2 border rounded text-sm bg-gray-50">
                      <SimpleRichDisplay content={word.explanation} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
        itemProgressionDelay={editingContent.itemProgressionDelay}
        onItemProgressionDelayChange={itemProgressionDelay => updateContent({ itemProgressionDelay })}
      />

      <Card>
        <CardContent className="p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Exercise Summary
          </h3>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Passage length:</span>{' '}
              <span className="font-medium">{passageWords.length} words</span>
            </div>
            <div>
              <span className="text-gray-600">Words to fill:</span> <span className="font-medium">{words.length}</span>
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
                  {wordPopup.isEditing ? 'Edit Word' : 'Add Word'}:
                  <span className="font-mono ml-1 bg-gray-100 px-1 rounded">{passageWords[wordPopup.wordIndex]}</span>
                </h4>
                <Button onClick={closeWordPopup} size="sm" variant="ghost" className="p-1 h-6 w-6">
                  <X className="h-3 w-3" />
                </Button>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Correct Answer</label>
                <Input
                  value={wordPopup.correctAnswer}
                  onChange={e => setWordPopup(prev => (prev ? { ...prev, correctAnswer: e.target.value } : null))}
                  placeholder="e.g., answer..."
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Question (optional)</label>
                <SimpleRichEditor
                  content={wordPopup.question}
                  onChange={value => setWordPopup(prev => (prev ? { ...prev, question: value } : null))}
                  placeholder="e.g., What is the correct answer?"
                  rows={2}
                  className="w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Hint (optional)</label>
                <SimpleRichEditor
                  content={wordPopup.hint}
                  onChange={value => setWordPopup(prev => (prev ? { ...prev, hint: value } : null))}
                  placeholder="e.g., Look at the context..."
                  rows={2}
                  className="w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Explanation (optional)</label>
                <SimpleRichEditor
                  content={wordPopup.explanation}
                  onChange={value => setWordPopup(prev => (prev ? { ...prev, explanation: value } : null))}
                  placeholder="e.g., This is the correct answer because..."
                  rows={2}
                  className="w-full text-sm"
                />
              </div>

              <div className="flex gap-2 justify-end">
                {wordPopup.isEditing && (
                  <Button onClick={deleteWordFromPopup} size="sm" variant="destructive" className="text-xs">
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
                  disabled={!wordPopup.correctAnswer.trim()}
                  className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  {wordPopup.isEditing ? 'Update' : 'Add'}
                </Button>
              </div>
            </div>

            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-300"></div>
          </div>
        </div>
      )}
    </div>
  );
};
