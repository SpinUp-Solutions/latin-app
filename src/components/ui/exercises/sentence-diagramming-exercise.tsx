import React, { useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Tooltip } from '../core/tooltip-extension';
import { DiagrammingExtensions } from '../core/diagramming-extensions';
import { DiagrammingToolbar } from './sentence-diagramming/diagramming-toolbar';
import {
  SentenceDiagrammingExercise as SentenceDiagrammingExerciseType,
  UserAnnotation,
  AnnotationType,
} from '@/src/types/exercises/sentence-diagramming';
import { Button } from '../button';
import { CheckCircle, HelpCircle, RotateCcw } from 'lucide-react';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { FeedbackDisplay } from '../feedback';

interface SentenceDiagrammingExerciseProps {
  exercise: SentenceDiagrammingExerciseType;
  onComplete?: () => void;
}

export const SentenceDiagrammingExercise: React.FC<SentenceDiagrammingExerciseProps> = ({ exercise, onComplete }) => {
  const [userAnnotations, setUserAnnotations] = useState<UserAnnotation[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

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
    content: exercise.data.sentence.latin,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const annotations = extractAnnotationsFromEditor(editor);
      setUserAnnotations(annotations);
    },
    editorProps: {
      attributes: {
        class: 'sentence-diagramming-exercise-content',
      },
    },
  });

  const extractAnnotationsFromEditor = useCallback((editor: any): UserAnnotation[] => {
    const annotations: UserAnnotation[] = [];
    const doc = editor.getJSON();

    const traverseNode = (node: any) => {
      if (node.marks) {
        node.marks.forEach((mark: any) => {
          // Map TipTap extension names to annotation types
          const typeMap: Record<string, AnnotationType> = {
            preposition: 'preposition',
            subordination: 'subordination',
            verbCircle: 'verb-circle',
            subjectUnderline: 'subject-underline',
            directObjectUnderline: 'direct-object-underline',
            indirectObjectBracket: 'indirect-object-bracket',
            genitiveArrow: 'genitive-arrow',
            ablativePhrase: 'ablative-phrase',
          };

          const annotationType = typeMap[mark.type];
          if (annotationType) {
            const annotation: UserAnnotation = {
              id: `${annotationType}-${Date.now()}-${Math.random()}`,
              type: annotationType,
              wordIds: mark.attrs?.wordIds || [],
              timestamp: Date.now(),
              ...mark.attrs,
            } as UserAnnotation;

            annotations.push(annotation);
          }
        });
      }

      if (node.content) {
        node.content.forEach(traverseNode);
      }
    };

    traverseNode(doc);
    return annotations;
  }, []);

  const handleAnnotationClick = (annotationType: AnnotationType) => {
    if (!editor || isCorrect === true) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (!selectedText.trim()) {
      alert('Please select text to annotate');
      return;
    }

    const selectedWordIds = getWordIdsFromSelection(from, to);
    const attributes = getAttributesForAnnotationType(annotationType, selectedWordIds);

    switch (annotationType) {
      case 'preposition':
        editor.chain().focus().setPreposition(attributes).run();
        break;
      case 'subordination':
        editor.chain().focus().setSubordination(attributes).run();
        break;
      case 'verb-circle':
        editor.chain().focus().setVerbCircle(attributes).run();
        break;
      case 'subject-underline':
        editor.chain().focus().setSubjectUnderline(attributes).run();
        break;
      case 'direct-object-underline':
        editor.chain().focus().setDirectObjectUnderline(attributes).run();
        break;
      case 'indirect-object-bracket':
        editor.chain().focus().setIndirectObjectBracket(attributes).run();
        break;
      case 'genitive-arrow':
        editor.chain().focus().setGenitiveArrow(attributes).run();
        break;
      case 'ablative-phrase':
        editor.chain().focus().setAblativePhrase(attributes).run();
        break;
    }
  };

  const getWordIdsFromSelection = (from: number, to: number): string[] => {
    const selectedText = editor?.state.doc.textBetween(from, to) || '';
    const selectedWords = exercise.data.sentence.words.filter(
      word => selectedText.includes(word.text) || (word.startPosition <= from && word.endPosition >= to)
    );
    return selectedWords.map(word => word.id);
  };

  const getAttributesForAnnotationType = (type: AnnotationType, wordIds: string[]) => {
    const baseAttributes = { wordIds };

    switch (type) {
      case 'verb-circle':
        return { ...baseAttributes, voice: 'active', expectsDirectObject: true, expectsAgent: false };
      case 'subordination':
        return { ...baseAttributes, clauseType: 'relative' };
      case 'subject-underline':
        return { ...baseAttributes, person: '3rd', number: 'singular' };
      case 'genitive-arrow':
        return {
          ...baseAttributes,
          relationshipType: 'possession',
          genitiveWordId: wordIds[0],
          modifiedWordId: wordIds[1],
        };
      case 'ablative-phrase':
        return { ...baseAttributes, ablativeType: 'means', hasPreposition: false };
      default:
        return baseAttributes;
    }
  };

  const handleClearAnnotations = () => {
    if (!editor || isCorrect === true) return;

    // Clear all diagramming annotations explicitly
    editor
      .chain()
      .focus()
      .unsetPreposition()
      .unsetSubordination()
      .unsetVerbCircle()
      .unsetSubjectUnderline()
      .unsetDirectObjectUnderline()
      .unsetIndirectObjectBracket()
      .unsetGenitiveArrow()
      .unsetAblativePhrase()
      .run();

    setUserAnnotations([]);
  };

  const handleSubmit = () => {
    const result = validateAnnotations(userAnnotations, exercise.data.solution);

    if (result.isComplete) {
      handleCorrect(true); // Always complete since there's only one step
      if (onComplete) {
        onComplete();
      }
    } else {
      const feedback = `${result.accuracy.toFixed(1)}% correct (${result.totalCorrect}/${result.totalExpected})`;
      handleIncorrect(feedback, 'Check your annotations and try again.');
    }
  };

  const handleReset = () => {
    setShowHint(false);
    setCurrentHintIndex(0);
    handleClearAnnotations();
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

  const validateAnnotations = (userAnnotations: UserAnnotation[], solution: any) => {
    console.log('=== VALIDATION DEBUG ===');
    console.log('User annotations:', userAnnotations);
    console.log('Solution:', solution);
    console.log('Solution annotations:', solution.annotations);

    const userByType = groupAnnotationsByType(userAnnotations);
    const solutionByType = solution.annotations;

    console.log('User by type:', userByType);
    console.log('Solution by type:', solutionByType);

    const results: any = {};
    let totalCorrect = 0;
    let totalExpected = 0;
    let totalExtra = 0;

    Object.keys(solutionByType).forEach(type => {
      const expected = solutionByType[type as keyof typeof solutionByType];
      const actual = userByType[type as keyof typeof userByType] || [];

      console.log(`Type ${type}: expected=${expected.length}, actual=${actual.length}`);

      totalExpected += expected.length;

      const correct = expected.filter((expectedAnnotation: any) =>
        actual.some(
          (actualAnnotation: any) =>
            JSON.stringify(actualAnnotation.wordIds.sort()) === JSON.stringify(expectedAnnotation.wordIds.sort())
        )
      );

      totalCorrect += correct.length;
      totalExtra += actual.length - correct.length;

      results[type] = {
        expected: expected.length,
        correct: correct.length,
        missing: expected.length - correct.length,
        extra: actual.length - correct.length,
      };
    });

    console.log('Final totals: correct=' + totalCorrect + ', expected=' + totalExpected);

    return {
      isComplete: totalCorrect === totalExpected && totalExtra === 0,
      accuracy: totalExpected > 0 ? (totalCorrect / (totalExpected + totalExtra)) * 100 : 0,
      results,
      totalCorrect,
      totalExpected,
      totalExtra,
    };
  };

  const groupAnnotationsByType = (annotations: UserAnnotation[]) => {
    return annotations.reduce((acc: any, annotation) => {
      // Map annotation types to solution structure keys
      const typeMap: Record<string, string> = {
        preposition: 'prepositions',
        subordination: 'subordinations',
        'verb-circle': 'verbs',
        'subject-underline': 'subjects',
        'direct-object-underline': 'directObjects',
        'indirect-object-bracket': 'indirectObjects',
        'genitive-arrow': 'genitives',
        'ablative-phrase': 'ablatives',
      };

      const solutionKey = typeMap[annotation.type];
      if (solutionKey) {
        if (!acc[solutionKey]) acc[solutionKey] = [];
        acc[solutionKey].push(annotation);
      }
      return acc;
    }, {});
  };

  if (!editor) {
    return <div>Loading exercise...</div>;
  }

  return (
    <div className="sentence-diagramming-exercise space-y-4">
      <div className="bg-white p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-2">{exercise.title}</h3>
        <p className="text-gray-600 mb-4">{exercise.instructions}</p>

        <div className="mb-4">
          <div className="text-sm font-medium text-gray-700 mb-1">Translation:</div>
          <div className="text-gray-600 italic">{exercise.data.sentence.translation}</div>
        </div>

        <div className="sentence-diagramming-editor border border-gray-300 rounded-md">
          <DiagrammingToolbar
            editor={editor}
            onAnnotationClick={handleAnnotationClick}
            onClearAnnotations={handleClearAnnotations}
            onAddTooltip={() => {}}
            disabled={isCorrect === true}
          />

          <div className="p-4 min-h-[150px] bg-white">
            <EditorContent editor={editor} />
          </div>
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
          <p className="text-blue-700 mb-3">{exercise.data.hints[currentHintIndex]}</p>
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
          disabled={isCorrect === true || userAnnotations.length === 0}
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
