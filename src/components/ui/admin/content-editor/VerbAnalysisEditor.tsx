import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2, Eye, AlertCircle, Zap } from 'lucide-react';
import { VerbAnalysisExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';

export const VerbAnalysisEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as VerbAnalysisExercise);

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

  const addVerb = () => {
    const newVerb = {
      word: '',
      correctPronoun: '',
      explanation: '',
    };
    const newVerbs = [...editingContent.data.verbs, newVerb];
    updateData({ verbs: newVerbs });
  };

  const updateVerb = (index: number, field: keyof VerbAnalysisExercise['data']['verbs'][0], value: string) => {
    const newVerbs = editingContent.data.verbs.map((verb, i) => (i === index ? { ...verb, [field]: value } : verb));
    updateData({ verbs: newVerbs });
  };

  const removeVerb = (index: number) => {
    const newVerbs = editingContent.data.verbs.filter((_, i) => i !== index);
    updateData({ verbs: newVerbs });
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
        {editingContent.data.passage.split(' ').map((word, index) => {
          const cleanWord = word.replace(/[.,;!?…]/g, '').toLowerCase();
          const isVerb = editingContent.data.verbs.some(v => v.word.toLowerCase() === cleanWord);

          return (
            <span
              key={index}
              className={`inline-block px-1 py-0.5 mx-0.5 rounded transition-colors ${
                isVerb ? 'bg-red-100 font-bold text-red-700 border border-red-200' : 'hover:bg-blue-100 cursor-pointer'
              }`}
              title={isVerb ? `Verb: ${word}` : `Click to use: ${word}`}>
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
      if (!verb.word?.trim()) {
        warnings.push(`Verb ${index + 1}: Word is required`);
      }
      if (!verb.correctPronoun?.trim()) {
        warnings.push(`Verb ${index + 1}: Correct pronoun is required`);
      }
      if (verb.word && !isWordInPassage(verb.word)) {
        warnings.push(`Verb ${index + 1}: "${verb.word}" not found in passage`);
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
              Passage Preview (verbs highlighted in red):
            </label>
            {renderPassagePreview()}
          </div>
        )}
      </div>

      {/* Verbs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium flex items-center gap-1">
            <Zap className="h-4 w-4" />
            Verbs to Analyze
          </label>
          <Button onClick={addVerb} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Verb
          </Button>
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
                    <label className="block text-xs font-medium mb-1">Verb Word</label>
                    <input
                      type="text"
                      value={verb.word}
                      onChange={e => updateVerb(index, 'word', e.target.value)}
                      className={`w-full p-2 border rounded text-sm ${
                        verb.word && !isWordInPassage(verb.word) ? 'border-orange-300 bg-orange-50' : ''
                      }`}
                      placeholder="e.g., ambulavero"
                    />
                    {verb.word && !isWordInPassage(verb.word) && (
                      <p className="text-xs text-orange-600 mt-1">⚠️ This word is not found in the passage</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Correct Pronoun</label>
                    <input
                      type="text"
                      value={verb.correctPronoun}
                      onChange={e => updateVerb(index, 'correctPronoun', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="e.g., I, you, he/she/it, we, they"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium mb-1">Explanation (optional)</label>
                  <textarea
                    value={verb.explanation || ''}
                    onChange={e => updateVerb(index, 'explanation', e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                    rows={2}
                    placeholder="e.g., First person singular perfect tense"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
    </div>
  );
};
