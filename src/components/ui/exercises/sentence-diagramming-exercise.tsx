import React, { useState } from 'react';
import { DiagrammingToolbar } from './sentence-diagramming/diagramming-toolbar';
import {
  SentenceDiagrammingExercise as SentenceDiagrammingExerciseType,
  AnnotationType,
} from '@/src/types/exercises/sentence-diagramming';
import { Button } from '../button';
import { CheckCircle, HelpCircle, RotateCcw } from 'lucide-react';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { FeedbackDisplay } from '../feedback';
import {
  extractAnnotationsFromEditor,
  handleAnnotationClick,
  handleClearAnnotations,
} from '@/src/utils/sentenceDiagramming';
import { useTipTapEditor } from '@/src/hooks/useTipTapEditor';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { getStudentExtensions } from '@/src/utils/tiptapExtensions';
import { stripAdminAnnotations } from '@/src/utils/contentUtils';
import { EditorWithTooltips } from '../core/EditorWithTooltips';

interface SentenceDiagrammingExerciseProps {
  exercise: SentenceDiagrammingExerciseType;
  onComplete?: (score: number) => void;
}

export const SentenceDiagrammingExercise: React.FC<SentenceDiagrammingExerciseProps> = ({ exercise, onComplete }) => {
  const [userAnnotations, setUserAnnotations] = useState<Record<string, AnnotationType>>({});
  const [showHint, setShowHint] = useState(false);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const cleanContent = stripAdminAnnotations(
    exercise.data.sentence.content || `<p>${exercise.data.sentence.latin}</p>`
  );

  const editor = useTipTapEditor({
    extensions: getStudentExtensions({ enableTooltips: true }),
    initialContent: cleanContent,
    className: 'sentence-diagramming-exercise-content',
    onUpdate: editor => {
      const annotations = extractAnnotationsFromEditor(editor);
      setUserAnnotations(annotations);
    },
  });

  const clearAnnotations = () => {
    if (isCorrect === true) return;

    if (editor) {
      handleClearAnnotations(editor);
    }
    setUserAnnotations({});
  };

  const handleSubmit = () => {
    const result = validateAnnotations(userAnnotations, exercise.data.solution.annotations);
    if (result.isComplete) {
      handleCorrect(true); // Always complete since there's only one step
      if (onComplete) {
        // Calculate score based on correctness percentage
        const score = Math.round(result.accuracy);
        onComplete(score);
      }
    } else {
      handleIncorrect();
    }
  };

  const handleReset = () => {
    setShowHint(false);
    setCurrentHintIndex(0);
    clearAnnotations();
    reset();
  };

  const handleNextHint = () => {
    if (currentHintIndex < exercise.data.hints.length - 1) {
      setCurrentHintIndex(currentHintIndex + 1);
    }
  };

  const handlePreviousHint = () => {
    if (currentHintIndex > 0) {
      setCurrentHintIndex(currentHintIndex - 1);
    }
  };

  const validateAnnotations = (
    userAnnotations: Record<string, AnnotationType>,
    solutionAnnotations: Record<string, AnnotationType>
  ) => {
    let totalCorrect = 0;
    const totalExpected = Object.keys(solutionAnnotations).length;

    // Count matches between user annotations and solution
    Object.keys(solutionAnnotations).forEach(wordId => {
      if (userAnnotations[wordId] === solutionAnnotations[wordId]) {
        totalCorrect++;
      }
    });

    return {
      isComplete: totalCorrect === totalExpected,
      accuracy: totalExpected > 0 ? (totalCorrect / totalExpected) * 100 : 0,
      totalCorrect,
      totalExpected,
    };
  };

  if (!editor) {
    return <div>Loading exercise...</div>;
  }

  return (
    <div className="sentence-diagramming-exercise space-y-4">
      <div className="bg-white p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-2">{exercise.title}</h3>
        <SimpleRichDisplay content={exercise.instructions} className="text-gray-600 mb-4" />

        <div className="mb-4">
          <div className="text-sm font-medium text-gray-700 mb-1">Translation:</div>
          <div className="text-gray-600 italic">{exercise.data.sentence.translation}</div>
        </div>

        <div className="sentence-diagramming-editor border border-gray-300 rounded-md">
          <EditorWithTooltips editor={editor} className="p-4 min-h-[150px] bg-white">
            <DiagrammingToolbar
              editor={editor}
              onAnnotationClick={type =>
                handleAnnotationClick(
                  editor,
                  type,
                  exercise.data.sentence.words,
                  exercise.data.sentence.latin,
                  isCorrect === true
                )
              }
              onClearAnnotations={clearAnnotations}
              disabled={isCorrect === true}
              isStudentMode={true}
            />
          </EditorWithTooltips>
        </div>
      </div>

      {showHint && exercise.data.hints.length > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-blue-800">
              Hint {currentHintIndex + 1} of {exercise.data.hints.length}
            </span>
          </div>
          <SimpleRichDisplay content={exercise.data.hints[currentHintIndex]} className="text-blue-700 mb-3" />
          <div className="flex gap-2">
            <Button onClick={handlePreviousHint} disabled={currentHintIndex === 0} variant="outline" size="sm">
              Previous
            </Button>
            <Button
              onClick={handleNextHint}
              disabled={currentHintIndex === exercise.data.hints.length - 1}
              variant="outline"
              size="sm">
              Next
            </Button>
          </div>
        </div>
      )}

      <FeedbackDisplay isCorrect={isCorrect} message={message} level={level} className="mb-4" />

      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={isCorrect === true || Object.keys(userAnnotations).length === 0}
          className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Check Answer
        </Button>

        <Button onClick={() => setShowHint(!showHint)} variant="outline" className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4" />
          {showHint ? 'Hide Hints' : 'Show Hints'}
        </Button>

        <Button onClick={handleReset} variant="outline" className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          Reset
        </Button>
      </div>
    </div>
  );
};
