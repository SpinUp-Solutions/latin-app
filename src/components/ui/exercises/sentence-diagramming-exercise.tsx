import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useSelector } from 'react-redux';
import StarterKit from '@tiptap/starter-kit';
import { Tooltip } from '../core/tooltip-extension';
import { DiagrammingExtensions } from '../core/diagramming-extensions';
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
import { TooltipContent } from '../core/tooltip-content';
import { TooltipData, MousePosition } from '@/src/types/tooltip';
import { calculateTooltipPosition } from '@/src/utils/tooltipUtils';
import { RootState } from '@/src/store';

interface SentenceDiagrammingExerciseProps {
  exercise: SentenceDiagrammingExerciseType;
  onComplete?: () => void;
}

interface ActiveTooltip {
  id: string;
  data: Omit<TooltipData, 'id'>;
}

interface TooltipOverlayProps {
  elementPosition: MousePosition;
  data: Omit<TooltipData, 'id'>;
}

const TooltipOverlay: React.FC<TooltipOverlayProps> = ({ elementPosition, data }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => calculateTooltipPosition(elementPosition, 180));
  const [isBelow, setIsBelow] = useState(false);

  useEffect(() => {
    if (!tooltipRef.current) return;

    const updatePosition = () => {
      const rect = tooltipRef.current?.getBoundingClientRect();
      if (rect?.height) {
        const newPosition = calculateTooltipPosition(elementPosition, rect.height);
        setPosition(newPosition);
        setIsBelow(newPosition.isBelow);
      }
    };

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(tooltipRef.current);
    updatePosition();

    return () => resizeObserver.disconnect();
  }, [elementPosition]);

  return (
    <div
      ref={tooltipRef}
      className="tooltip-overlay fixed z-50 animate-in fade-in-0 zoom-in-95 duration-200 pointer-events-auto"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: isBelow ? 'translateX(-50%)' : 'translateX(-50%) translateY(-100%)',
      }}>
      <TooltipContent {...data} className="bg-white shadow-lg" />

      <div
        className={`absolute w-2 h-2 bg-white border rotate-45 shadow left-1/2 transform -translate-x-1/2 ${
          isBelow ? 'top-0 -translate-y-1/2 border-l border-t' : 'top-full -translate-y-1/2 border-b border-r'
        }`}
      />
    </div>
  );
};

export const SentenceDiagrammingExercise: React.FC<SentenceDiagrammingExerciseProps> = ({ exercise, onComplete }) => {
  console.log('=== EXERCISE COMPONENT RECEIVED ===');
  console.log('Exercise data:', exercise);
  console.log('Solution annotations:', exercise.data.solution.annotations);

  const [userAnnotations, setUserAnnotations] = useState<Record<string, AnnotationType>>({});
  const [showHint, setShowHint] = useState(false);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);
  
  // Tooltip state
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [fixedElementPos, setFixedElementPos] = useState<MousePosition>({ x: 0, y: 0 });
  const hideTimeoutRef = useRef<NodeJS.Timeout>();
  const editorRef = useRef<HTMLDivElement>(null);
  const tooltips = useSelector((state: RootState) => state.lesson.tooltips);

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  // Tooltip hover handlers
  const handleMouseEnter = useCallback(
    (event: MouseEvent) => {
      const tooltipElement = (event.target as HTMLElement).closest('[data-tooltip="true"]') as HTMLElement;
      if (!tooltipElement) return;

      const tooltipId = tooltipElement.getAttribute('data-tooltip-id');
      if (!tooltipId || activeTooltip?.id === tooltipId) return;

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = undefined;
      }

      const tooltipData = tooltips[tooltipId];
      if (!tooltipData) return;

      const rect = tooltipElement.getBoundingClientRect();
      setFixedElementPos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      setActiveTooltip({ id: tooltipId, data: tooltipData });
    },
    [activeTooltip?.id, tooltips]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!activeTooltip) return;

      const target = event.target as HTMLElement;
      const isOverTooltip = target.closest('[data-tooltip="true"], .tooltip-overlay');

      if (isOverTooltip) {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = undefined;
        }
      } else if (!hideTimeoutRef.current) {
        hideTimeoutRef.current = setTimeout(() => setActiveTooltip(null), 400);
      }
    },
    [activeTooltip]
  );

  // Function to strip admin annotations but keep tooltips
  const stripAdminAnnotations = (htmlContent: string): string => {
    // Create a temporary div to manipulate the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Remove all diagramming annotation marks but keep tooltips
    const annotationSelectors = [
      '[data-preposition="true"]',
      '[data-subordination="true"]', 
      '[data-verb-circle="true"]',
      '[data-subject-underline="true"]',
      '[data-direct-object-underline="true"]',
      '[data-indirect-object-bracket="true"]',
      '[data-genitive-arrow="true"]',
      '[data-genitive-arrow-target="true"]',
      '[data-ablative-phrase="true"]'
    ];

    annotationSelectors.forEach(selector => {
      const elements = tempDiv.querySelectorAll(selector);
      elements.forEach(element => {
        // Remove the annotation attributes and styles but keep the text and tooltip attributes
        const annotationClasses = element.className.split(' ').filter(cls => 
          !cls.includes('-annotation') && 
          !cls.includes('preposition') && 
          !cls.includes('subordination') &&
          !cls.includes('verb-circle') &&
          !cls.includes('subject-underline') &&
          !cls.includes('direct-object') &&
          !cls.includes('indirect-object') &&
          !cls.includes('genitive') &&
          !cls.includes('ablative')
        );
        
        // Keep only tooltip-related attributes
        const tooltipId = element.getAttribute('data-tooltip-id');
        const isTooltip = element.getAttribute('data-tooltip');
        
        // Clear all attributes
        Array.from(element.attributes).forEach(attr => {
          element.removeAttribute(attr.name);
        });
        
        // Restore tooltip attributes if they exist
        if (isTooltip) {
          element.setAttribute('data-tooltip', 'true');
          if (tooltipId) element.setAttribute('data-tooltip-id', tooltipId);
          element.className = 'tooltip-text cursor-help underline decoration-dotted decoration-blue-500/60 hover:decoration-blue-500 transition-colors';
        } else {
          element.className = annotationClasses.join(' ');
        }
        
        // Remove inline styles added by annotations
        element.removeAttribute('style');
      });
    });

    return tempDiv.innerHTML;
  };

  // Set up tooltip event listeners
  useEffect(() => {
    const editorContainer = editorRef.current;
    if (!editorContainer) return;

    editorContainer.addEventListener('mouseenter', handleMouseEnter, true);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      editorContainer.removeEventListener('mouseenter', handleMouseEnter, true);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseEnter, handleMouseMove]);

  const cleanContent = stripAdminAnnotations(exercise.data.sentence.content || `<p>${exercise.data.sentence.latin}</p>`);

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
    content: cleanContent,
    immediatelyRender: false,
    editable: true, // Enable editing for student annotations
    onUpdate: ({ editor }) => {
      const annotations = extractAnnotationsFromEditor(editor);
      setUserAnnotations(annotations);
    },
    editorProps: {
      attributes: {
        class: 'sentence-diagramming-exercise-content',
      },
    },
  }, [cleanContent]);

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
    console.log('=== VALIDATION DEBUG ===');
    console.log('User annotations:', userAnnotations);
    console.log('Solution annotations:', solutionAnnotations);
    let totalCorrect = 0;
    const totalExpected = Object.keys(solutionAnnotations).length;

    // Count matches between user annotations and solution
    Object.keys(solutionAnnotations).forEach(wordId => {
      if (userAnnotations[wordId] === solutionAnnotations[wordId]) {
        totalCorrect++;
      }
    });

    console.log(`Final totals: correct=${totalCorrect}, expected=${totalExpected}`);

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
        <p className="text-gray-600 mb-4">{exercise.instructions}</p>

        <div className="mb-4">
          <div className="text-sm font-medium text-gray-700 mb-1">Translation:</div>
          <div className="text-gray-600 italic">{exercise.data.sentence.translation}</div>
        </div>

        <div className="sentence-diagramming-editor border border-gray-300 rounded-md">
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

          <div ref={editorRef} className="p-4 min-h-[150px] bg-white">
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

      {activeTooltip && <TooltipOverlay elementPosition={fixedElementPos} data={activeTooltip.data} />}
    </div>
  );
};
