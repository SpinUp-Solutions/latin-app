## Exercise Creation Guide

This guide provides step-by-step instructions for adding a new exercise type to the Latin app. Follow these steps to ensure proper integration with the lesson builder, live preview, and the unified feedback system.

### Architecture Overview

- **Type-safe TypeScript definitions** with strict typing
- **Redux state management** via `lessonSlice` for live preview and editing
- **Rich text support** using `SimpleRichEditor` for editing and `SimpleRichDisplay` for display
- **Unified feedback system** with escalation levels, success messages, and auto-advance
- **Audio support** for all exercises
- **Live preview** in the lesson builder

### Required Files and Updates

When adding a new exercise (e.g., `"word-order"`), you must create/update these files:

#### 1. Type Definitions

- `src/types/exercises/[exercise-name].d.ts` – New exercise type definition
- `src/types/exercises/index.d.ts` – Add to exports and union type
- `src/types/exercise.d.ts` – Add to main exercise exports
- `src/types/page.d.ts` – Add to `RenderableContentItem` union
- `src/types/lesson.d.ts` – Add to lesson type exports

#### 2. Components

- `src/components/ui/exercises/[exercise-name]-exercise.tsx` – Exercise component
- `src/components/ui/admin/content-editor/[ExerciseName]Editor.tsx` – Editor component

#### 3. Integration Updates

- `src/components/ui/lesson/content-renderer.tsx` – Add case for rendering
- `src/components/ui/admin/ContentEditor.tsx` – Add case for editing
- `src/utils/contentTypeConstants.ts` – Add to `EXERCISE_TYPES` array
- `src/utils/editorRegistry.ts` – Add editor title mapping
- `src/utils/contentFactory.ts` – Add default content creation
- `src/utils/exercises/[exercise-name]Exercise.ts` – Validation utility
- `src/utils/exercises/index.ts` – Export validation utility

---

## Step-by-Step Implementation

### Step 1: Create Type Definitions

Create `src/types/exercises/[exercise-name].d.ts`:

```typescript
import { BaseExercise } from './base';

// Define any specific interfaces your exercise needs
export interface [ExerciseName]Item {
  id: string;
  // Add fields specific to your exercise items
  text: string;
  // ... other fields
}

// Main exercise interface - MUST extend BaseExercise
export interface [ExerciseName]Exercise extends BaseExercise {
  type: '[exercise-name]'; // Must match exactly
  data: {
    // Define your exercise data structure
    items: [ExerciseName]Item[];
    // Add other data fields as needed
  };
}
```

### Step 2: Update Type Exports

Update `src/types/exercises/index.d.ts`:

```typescript
// Add to exports
export type { [ExerciseName]Exercise } from './[exercise-name]';

// Add to imports
import type { [ExerciseName]Exercise } from './[exercise-name]';

// Add to Exercise union type
export type Exercise =
  | MatchingExercise
  | FillExercise
  // ... existing types
  | [ExerciseName]Exercise; // Add your exercise here
```

Update `src/types/exercise.d.ts`:

```typescript
export type {
  BaseExercise,
  // ... existing exports
  [ExerciseName]Exercise, // Add here
  Exercise,
} from './exercises';
```

Update `src/types/page.d.ts`:

```typescript
import {
  // ... existing imports
  [ExerciseName]Exercise, // Add import
} from './exercises';

export type RenderableContentItem =
  | TextContent
  // ... existing types
  | [ExerciseName]Exercise; // Add to union
```

Update `src/types/lesson.d.ts`:

```typescript
export type {
  // ... existing exports
  [ExerciseName]Exercise, // Add here
  Exercise,
} from './exercise';
```

### Step 3: Create Exercise Component

Create `src/components/ui/exercises/[exercise-name]-exercise.tsx`:

- Always use `SimpleRichDisplay` for displaying text content
- Integrate the unified feedback system with `useExerciseFeedback`
- Support audio with `AudioPlayButton`
- Handle auto-advance via `useExerciseProgression` and its `autoAdvanceIfEnabled`

```typescript
'use client';

import React, { useState } from 'react';
import { [ExerciseName]Exercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FeedbackDisplay } from '../feedback';
import { validate[ExerciseName]Exercise } from '@/src/utils/exercises/[exercise-name]Exercise';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';

interface Props {
  exercise: [ExerciseName]Exercise;
  onComplete?: () => void;
}

const [ExerciseName]ExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  // Per-exercise state
  const [userAnswer, setUserAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Feedback system
  const { isCorrect, message, level, showExplanation, handleCorrect, handleIncorrect, reset } =
    useExerciseFeedback(exercise.feedbackConfig);

  // Progression system (useful for multi-item exercises)
  const { autoAdvanceIfEnabled } = useExerciseProgression({
    totalItems: 1,
    feedbackConfig: exercise.feedbackConfig,
    onComplete,
  });

  const handleSubmit = () => {
    if (isProcessing) return;
    setIsProcessing(true);

    const validation = validate[ExerciseName]Exercise(userAnswer, exercise);

    if (validation.isCorrect) {
      handleCorrect(true); // or false if multi-step exercise

      // Auto-advance (for single-step exercises, call onComplete directly or use next-exercise delay)
      autoAdvanceIfEnabled(() => {
        reset();
        setUserAnswer('');
        setIsProcessing(false);
      });
      if (exercise.feedbackConfig.progressionRules?.autoAdvance === false) {
        setIsProcessing(false);
      }
    } else {
      // CRITICAL: Let the feedback system handle hints/answers via escalation levels
      handleIncorrect();
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with title and audio */}
      <div className="flex justify-between items-start">
        {exercise.title && (
          <h3 className="text-lg font-serif text-roman-red mb-2">
            <SimpleRichDisplay content={exercise.title} />
          </h3>
        )}
        {exercise.audioPath && (
          <AudioPlayButton
            audioPath={exercise.audioPath}
            variant="default"
            size="sm"
            className="ml-2 rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
          />
        )}
      </div>

      {/* Instructions */}
      {exercise.instructions && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} />
        </div>
      )}

      {/* Your exercise-specific UI here */}
      <div className="p-6 bg-white rounded-lg border border-gray-200">
        {/* Example input + submit omitted for brevity */}

        {/* Unified Feedback Display */}
        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          // Optional: provide correctAnswer sourced from exercise data so the display
          // can reveal it when the escalation level enables showAnswer
          // correctAnswer={...}
          showExplanation={showExplanation}
        />
      </div>
    </div>
  );
};

export default [ExerciseName]ExerciseComponent;
```

### Step 4: Create Editor Component

Create `src/components/ui/admin/content-editor/[ExerciseName]Editor.tsx`:

- Use `SimpleRichEditor` for all input fields
- Include `ExerciseFeedbackSection` and `AudioUploadSection`
- Use Redux `updateEditingContent` for live preview integration

```typescript
import React from 'react';
import { [ExerciseName]Exercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

export const [ExerciseName]Editor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(
    state => state.lesson.editingContent?.content as [ExerciseName]Exercise
  );

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<[ExerciseName]Exercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<[ExerciseName]Exercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

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
            singleLine
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

        {/* Audio Upload */}
        <AudioUploadSection
          audioPath={editingContent.audioPath}
          onAudioPathChange={audioPath => updateContent({ audioPath })}
          contentItemId={editingContent.id}
        />
      </div>

      {/* Your exercise-specific editing UI here */}
      {/* Use SimpleRichEditor for all text inputs */}

      {/* Feedback Configuration */}
      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
      />
    </div>
  );
};
```

### Step 5: Create Validation Utility

Create `src/utils/exercises/[exercise-name]Exercise.ts`:

```typescript
import { [ExerciseName]Exercise } from '@/src/types/exercise';

export interface [ExerciseName]ValidationResult {
  isCorrect: boolean;
  // DO NOT include hint or correctAnswer - feedback system handles escalation
}

export const validate[ExerciseName]Exercise = (
  userAnswer: string,
  exercise: [ExerciseName]Exercise
): [ExerciseName]ValidationResult => {
  // Implement your validation logic here
  // Only return isCorrect. Hints/answers are surfaced by FeedbackDisplay via escalation config.
  return {
    isCorrect: false, // Your validation logic
  };
};
```

### Step 6: Update Integration Files

- Add to `src/components/ui/lesson/content-renderer.tsx`:

```typescript
// Add import
import [ExerciseName]Exercise from '../exercises/[exercise-name]-exercise';
import { [ExerciseName]Exercise as [ExerciseName]ExerciseType } from '@/src/types/exercise';

// Add case in switch statement
case '[exercise-name]':
  return <[ExerciseName]Exercise exercise={content as [ExerciseName]ExerciseType} onComplete={onComplete} />;
```

- Add to `src/components/ui/admin/ContentEditor.tsx`:

```typescript
// Add import
import { [ExerciseName]Editor } from './content-editor/[ExerciseName]Editor';

// Add case in renderEditor switch
case '[exercise-name]':
  return <[ExerciseName]Editor />;
```

- Add to `src/utils/contentTypeConstants.ts`:

```typescript
// Add icon import
import { YourIcon } from 'lucide-react';

// Add to EXERCISE_TYPES array
{ type: '[exercise-name]', icon: YourIcon, label: 'Your Exercise Name' },
```

- Add to `src/utils/editorRegistry.ts`:

```typescript
case '[exercise-name]':
  return 'Edit Your Exercise Name';
```

- Add to `src/utils/contentFactory.ts`:

```typescript
case '[exercise-name]':
  return {
    id: baseId,
    type: '[exercise-name]',
    title: 'New Exercise Title',
    instructions: 'Default instructions...',
    audioPath: null,
    feedbackConfig: createDefaultFeedbackConfig(),
    data: {
      // Your default data structure
    },
  };
```

- Add to `src/utils/exercises/index.ts`:

```typescript
export * from './[exercise-name]Exercise';
```

---

## Validation Checklist

- TypeScript compiles without errors
- Exercise appears in lesson builder exercise types
- Can create new exercise instances
- Can edit exercise in modal editor
- Live preview works in lesson builder
- Exercise renders correctly in lesson player
- Feedback system works (correct/incorrect responses)
- Audio upload and playback works
- Auto-advance functionality works
- All text uses `SimpleRichEditor`/`SimpleRichDisplay`
- Follows same styling patterns as other exercises

## Key Patterns to Follow

### Text Handling

- **Input/Editing**: Always use `SimpleRichEditor`
- **Display/Rendering**: Always use `SimpleRichDisplay`
- **Rich text support**: All text fields support bold, italic, and tooltip formatting

### State Management

- Use `updateEditingContent` dispatch for live preview
- Follow the `updateContent` and `updateData` pattern from other editors

### Feedback Integration (Updated)

- Use `useExerciseFeedback`
  - Destructure: `{ isCorrect, message, level, showExplanation, handleCorrect, handleIncorrect, reset }`
- Use `useExerciseProgression` (for multi-item flows or timed transitions)
  - Destructure: `{ currentIndex, isLastItem, nextItem, autoAdvanceIfEnabled }`
- **CRITICAL**: Call `handleIncorrect()` without parameters. The feedback system manages escalation (hints/answers) based on configuration.
- **Visual Feedback**:
  - Pass `level` into `FeedbackDisplay`.
  - Optionally pass `correctAnswer` (sourced from exercise data) to `FeedbackDisplay`. It will only render when `!isCorrect && level?.showAnswer`.
  - Hints are shown when `!isCorrect && level?.showHint`.
  - Explanations are shown when `showExplanation` is true.
- Respect `feedbackConfig.progressionRules?.autoAdvance`.
  - Prefer `autoAdvanceIfEnabled(() => { ...post-advance cleanup... })` over duplicating setTimeout logic.

### System Architecture Notes

The hooks provide sensible defaults and keep escalation state in sync with displayed feedback. Components should avoid duplicating default/timeout logic and instead rely on `useExerciseFeedback` and `useExerciseProgression` to maintain consistent behavior across exercises.
