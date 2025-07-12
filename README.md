### 1. Node

Make sure you have [NodeJS version 22](https://nodejs.org/en/download) installed. Follow the instructions at that link to install if you haven't already.

### 2. Fork

Fork this repo into the GitHub of your choice.

### 3. Clone

Clone the forked repo to your local environment. Check your new repository's link. If I wanted to clone this repo, the command would be:

`git clone https://github.com/chrisozgo99/nextjs-template.git`

### 4. Install packages:

`npm i`

### 5. Env files

Create `.env`, `.env.development`, `.env.staging`, and `.env.production` files in the project's root. You only need to configure `.env` now, but for projects that plan on having multiple environments, it will be beneficial to have all these files available.

### 6. Create a Firebase project

a. Go to your [Firebase Dashboard](https://console.firebase.google.com/)

b. Click **Create Project**

c. Click through all the steps with your desired configuration

d. Once you arrive at the Firebase dashboard, click the **gear icon** and **Project Settings**

e. Scroll down and click **Add app**. Choose a **Web app** with the logo that looks like this: **</>**

f. Give your app a name and click **Register app**

g. Copy the firebaseConfig variable in the next step and enter it into your .env file in the following format:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

Below that, in the env file, add the following as well:

```
NEXT_PUBLIC_APP_URL=https://your-website-url.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
```

Your configuration is complete!

### 7. Compile the app

Run the following to compile:

`npm run build`

Then

`npm run dev`

### 8. Environment-specific builds

This project supports development, staging, and production environments. Use the following commands:

#### Development environment (default)

```
npm run dev            # Run the development server with dev environment
npm run build          # Build for dev environment
npm run start          # Start the server with dev environment
```

#### Staging environment

```
npm run dev:staging    # Run the development server with staging environment
npm run build:staging  # Build for staging environment
npm run start:staging  # Start the server with staging environment
```

#### Production environment

```
npm run dev:prod       # Run the development server with production environment
npm run build:prod     # Build for production environment
npm run start:prod     # Start the server with production environment
```

#### Build all environments at once

```
npm run build:all      # Build for development, staging, and production environments
```

### 9. Let's go!

Your app should be visible at `http://localhost:3000`. Time to start building!

# Code Structure

## Interfaces / Types

This app uses TypeScript interfaces to define the structure of lessons, exercises, and content. Here's what each type does:

### Core Content Types

**`ContentItem`** - The base building block for all content in lessons

- Every piece of content has an `id`, `type`, and optional `title` and `audioPath`

**`VocabularyItem`** - Represents a single Latin word to learn

- Contains the Latin word, English translation, pronunciation, and example usage
- Used in flashcards and vocabulary lists

### Content Types for Lessons

**`TextContent`** - Simple text paragraphs

- Used for explanations, instructions, and general information

**`EmphasisContent`** - Important text that needs to stand out

- Used for tips, warnings, or key concepts

**`TableContent`** - Data displayed in rows and columns

- Used for verb conjugation tables and grammar charts

**`VocabularyContent`** - Collections of Latin words to study

- Can be displayed as flashcards, lists, or quizzes
- Contains multiple `VocabularyItem` objects

### Exercise Types

**`MatchingExercise`** - Match items from two columns

- Students connect Latin endings with pronouns, or verbs with meanings

**`FillExercise`** - Fill in the blank questions

- Students type the correct answer in text inputs

**`TextSelectionExercise`** - Click on words in a passage

- Students identify specific words by clicking

**`VerbAnalysisExercise`** - Analyze verbs in context

- Students click on verbs and identify their grammatical properties

**`VerbConjugationExercise`** - Advanced grammar practice

- Complex exercises with passages, conjugation tasks, and translation work

### Lesson Structure

**`Lesson`** - A complete lesson with introduction and exercises

- Has a title, description, introduction pages, and exercise pages

**`IntroductionPage`** - Pages that teach concepts before exercises

- Contains multiple content items (text, tables, vocabulary, etc.)

**`ExercisePage`** - Pages with interactive practice activities

- Contains exercises and instructional content

### How They Work Together

1. A `Lesson` contains multiple `IntroductionPages` and `ExercisePages`
2. Each page contains an array of content items or exercises
3. Content can be text, emphasis, tables, vocabulary, or any type of exercise
4. The app renders different components based on the `type` property of each item

This structure makes it easy to create new lessons by mixing and matching different types of content and exercises.

## How Content is Rendered

The app uses a smart rendering system that turns lesson data into interactive UI components. Here's how it works:

### The Rendering Flow

1. **Lesson Data** → The app loads lesson content from `src/lib/lesson-config.ts` (for now)
2. **LessonPlayer** → Main component that manages the lesson flow and navigation
3. **PageTemplate** → Handles individual pages (introduction or exercise pages)
4. **ContentRenderer** → The core component that decides which UI component to show
5. **Specific Components** → Renders the actual content (text, tables, exercises, etc.)

### ContentRenderer: The Smart Switch

The `ContentRenderer` component is like a traffic controller. It looks at each content item's `type` property and decides which component to render:

```typescript
'text' → TextComponent (regular paragraphs)
'emphasis' → TextComponent with red styling (important info)
'table' → TableComponent (a generic table)
'vocabulary' → Vocabulary (a list of vocabulary words)
'matching' → MatchingTable (drag & drop exercises)
'fill' → FillExercise (fill-in-the-blank questions)
```

### Key Features

- **Type-Based Rendering**: Each content type automatically gets the right component
- **Smooth Animations**: Page transitions and content appear with motion effects
- **Audio Integration**: Components can play audio when content has `audioPath`
- **Progress Tracking**: The system knows which pages are completed
- **Responsive Design**: All components adapt to different screen sizes

### Adding New Content Types

To add a new content type:

1. Define the interface in `src/types/lesson.d.ts` or `src/types/exercise.ts`
2. Create a new UI component for that type
3. Add a case for it in `ContentRenderer`'s switch statement
4. The new type will automatically work in any lesson!

## The Exercise Feedback System

The app includes a comprehensive, unified feedback system that provides consistent student interactions across all exercise types. The system features escalating hints, customizable success messages, automatic progression, and a powerful admin interface for configuration.

### System Architecture

The feedback system follows a clean three-layer architecture:

**Data Layer** - Handles configuration creation and editing

- `feedbackDefaults.ts` - Centralized default values and utilities
- `contentFactory.ts` - Ensures new exercises get proper defaults
- `ExerciseFeedbackSection` - Reusable admin configuration component

**Business Logic** - Core feedback behavior and progression

- `useExerciseFeedback` - Answer validation and message management
- `useExerciseProgression` - Multi-question navigation and timing

**Presentation** - Student-facing UI components

- `FeedbackDisplay` - Styled feedback messages with animations
- `ExerciseInput` - Smart input handling with submission logic
- `ExerciseProgress` - Progress indicators for multi-question exercises

### Configuration Structure

Every exercise includes a comprehensive `feedbackConfig` that defines all feedback behavior:

```typescript
feedbackConfig: {
  // Progressive help system - escalates through levels on wrong answers
  escalationLevels: [
    { message: "Try again!" },                           // Level 1: Basic encouragement
    { message: "Look at the verb ending...", showHint: true }, // Level 2: Show hints
    { message: "The answer is:", showAnswer: true }      // Level 3: Reveal answer
  ],

  // Success messages for positive reinforcement
  successMessage: {
    default: "Correct!",                    // Basic success message
    advance: "Good! Moving to next...",     // When progressing to next question
    completion: "Exercise complete! 🎉",    // When finishing entire exercise
    showExplanation: true                   // Whether to show detailed explanations
  },

  // Exercise flow and behavior
  progressionRules: {
    autoAdvance: true,         // Automatically move to next question
    resetOnCorrect: true,      // Reset error count when student gets one right
    showProgress: true,        // Display "Question 2 of 5" progress bar
    allowManualAdvance: true   // Show "Next" button for manual control
  },

  // Timing for optimal learning pace
  timingConfig: {
    progressionDelay: 1500,    // Wait 1.5s before next question (processing time)
    nextExerciseDelay: 2500    // Wait 2.5s before next exercise (transition time)
  }
}
```

### How It Works

**Escalation System**: When students make incorrect answers, the system automatically escalates through different assistance levels:

1. **First attempt**: Basic encouragement message
2. **Second attempt**: May show contextual hints
3. **Third attempt**: Can reveal the correct answer
4. **Each level is configurable** with custom messages and behavior

**Smart Progression**: The system handles multi-question exercises intelligently:

- Tracks current question index and total questions
- Applies appropriate delays for cognitive processing
- Handles exercise completion and transitions automatically
- Supports both automatic and manual advancement modes

### Implementation Guide

**Basic Exercise Setup**:

```typescript
const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
  exercise.feedbackConfig
);

const { currentIndex, isLastItem, nextItem } = useExerciseProgression({
  totalItems: exercise.data.items.length,
  feedbackConfig: exercise.feedbackConfig,
  onComplete: () => moveToNextExercise(),
});

// Handle answer submission
const handleSubmit = () => {
  const validation = validateAnswer(userInput, currentItem);

  if (validation.isCorrect) {
    handleCorrect(isLastItem);
    // Auto-progression handled by hooks based on config
  } else {
    handleIncorrect(validation.hint, validation.correctAnswer);
  }
};
```

**UI Components**:

```typescript
// Smart input field with submission handling
<ExerciseInput
  value={userAnswer}
  onChange={setUserAnswer}
  onSubmit={handleSubmit}
  placeholder="Type your answer in Latin..."
/>

// Comprehensive feedback display
<FeedbackDisplay
  isCorrect={isCorrect}
  message={message}
  level={level}
  hint={currentItem.hint}
  explanation={currentItem.explanation}
  showExplanation={isCorrect && exercise.feedbackConfig.successMessage?.showExplanation}
/>

// Progress indicator for multi-question exercises
<ExerciseProgress
  current={currentIndex}
  total={totalQuestions}
  showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
/>
```

### Admin Configuration

**Unified Editor Interface**: All exercise types use the `ExerciseFeedbackSection` component, providing consistent configuration across:

- Matching exercises
- Fill-in-the-blank exercises
- Text selection exercises
- Verb analysis exercises
- Verb conjugation exercises

**Default Value Management**: The system uses centralized defaults from `feedbackDefaults.ts`:

- New exercises automatically get sensible defaults
- Editors show current values with fallbacks applied
- Consistent behavior across all exercise types

**Configuration Features**:

- **Escalation Levels**: Add/remove/edit progressive help levels
- **Success Messages**: Customize positive reinforcement for different contexts
- **Progression Rules**: Control automatic vs manual advancement behavior
- **Timing Configuration**: Set optimal delays for learning pace
- **Visual Validation**: Real-time feedback on configuration completeness

### Benefits

**For Students**:

- Consistent, predictable interaction patterns across all exercises
- Progressive assistance that adapts to their struggle level
- Smooth, professionally-timed transitions between questions
- Positive reinforcement with customizable success messages

**For Educators**:

- Fine-grained control over student assistance and progression
- Ability to customize feedback for different learning objectives
- Consistent configuration interface across all exercise types
- Data-driven insights into student struggle patterns

**For Developers**:

- Clean, reusable architecture with minimal boilerplate
- Automatic handling of complex timing and progression logic
- Type-safe configuration with comprehensive defaults
- Easy integration into new exercise types

### Adding Feedback to New Exercises

1. **Include the feedback config** in your exercise type definition:

   ```typescript
   interface MyNewExercise extends BaseExercise {
     feedbackConfig: FeedbackConfig;
     data: {
       // your exercise-specific data
     };
   }
   ```

2. **Use the hooks** in your component:

   ```typescript
   const feedback = useExerciseFeedback(exercise.feedbackConfig);
   const progression = useExerciseProgression({
     totalItems: exercise.data.items.length,
     feedbackConfig: exercise.feedbackConfig,
     onComplete,
   });
   ```

3. **Add admin configuration** using the reusable section:

   ```typescript
   <ExerciseFeedbackSection
     feedbackConfig={editingContent.feedbackConfig}
     onChange={feedbackConfig => updateContent({ feedbackConfig })}
   />
   ```

4. **Include UI components** for student interaction:
   ```typescript
   <ExerciseInput onSubmit={handleSubmit} />
   <FeedbackDisplay {...feedback} />
   <ExerciseProgress {...progression} />
   ```

The system automatically handles all escalation logic, timing, progression, and message management based on your configuration.

## Admin Vocabulary Management (Developer Guide)

The admin vocabulary section is powered by a custom React hook: `useVocabularyData` (`src/hooks/useVocabularyData.ts`). This hook handles all state, API calls, and logic for the admin vocab UI. Here’s how it works and how you can use or extend it:

### What the Hook Manages

- **words**: The current list of vocabulary words (with support for infinite scroll/pagination)
- **loading / loadingMore**: Loading states for initial and paginated fetches
- **hasMore**: Whether there are more words to load (for infinite scroll)
- **lastWordId**: Used for pagination (fetches the next batch)
- **wordTypeCounts**: Counts of words by type (noun, verb, etc.) for analytics
- **countsLoading**: Loading state for word type counts
- **filters**: Current filter state (word type, section, search)
- **debouncedSearch**: Debounced search value for efficient API calls

### Main Functions Provided

- **loadWords(reset = false)**: Fetches words from the API, with support for resetting or loading more
- **updateWord(wordId, updates)**: Updates a word in the backend and updates local state
- **updateFilters(newFilters)**: Updates the filter state (triggers new fetch)
- **resetFilters()**: Resets all filters to default values

### How It Works

- State is managed with React’s `useState` and `useEffect`.
- Filters and search are debounced and memoized to avoid unnecessary API calls.
- Pagination is handled with `lastWordId` and `hasMore`.
- All API calls go through `/api/admin/words`.
- When a word is updated, the local state is updated immediately for a fast UI.

### Example Usage in a Component

```typescript
const { words, loading, hasMore, filters, loadWords, updateWord, updateFilters, resetFilters } = useVocabularyData();

// Use these in your admin UI for listing, filtering, editing, and paginating vocabulary entries.
```

### Related Files

- `src/hooks/useVocabularyData.ts` — Main hook for admin vocab state and logic
- `src/types/admin-vocabulary.d.ts` — Type definitions for words, filters, and API responses
- `src/services/` — API service logic for Firebase and vocabulary parsing
- `src/app/api/admin/words/` — API route for fetching and updating vocabulary data

### Extending or Customizing

- Add new filters by extending the `VocabularyFilters` type and updating the hook logic
- Add new fields to the `Word` type as needed
- Use the provided state and functions to build custom admin UI features
