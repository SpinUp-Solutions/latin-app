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
'text' → IntroComponent (regular paragraphs)
'emphasis' → IntroComponent with red styling (important info)
'table' → ConjugationTable (grammar tables)
'vocabulary' → VocabularyViewer (flashcards/word lists)
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

The app includes a unified feedback system that handles student responses and progression through exercises. It supports escalating hints, customizable success messages, and automatic advancement between questions.

### How It Works

Every exercise includes a `feedbackConfig` that defines:

- Messages to display for incorrect answers
- Success messages for correct answers
- Progression behavior (auto-advance vs manual)
- Timing delays between questions

The system uses two main hooks:

- `useExerciseFeedback` - manages answer validation and feedback messages
- `useExerciseProgression` - handles navigation between questions in multi-part exercises

### Basic Setup

```typescript
const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
  exercise.feedbackConfig
);

// When they submit an answer:
if (answerIsRight) {
  handleCorrect(isLastQuestion);
} else {
  handleIncorrect(hintText, correctAnswer);
}
```

### Feedback Config Structure

Here's what a typical `feedbackConfig` looks like:

```typescript
feedbackConfig: {
  escalationLevels: [
    { message: "Try again!" },                    // First wrong attempt
    { message: "Here's a hint:", showHint: true }, // Second attempt
    { message: "The answer is:", showAnswer: true } // Third attempt
  ],
  successMessage: {
    default: "Nice work!",
    completion: "Exercise complete! 🎉",
    advance: "Correct! Moving to the next question..."
  },
  progressionRules: {
    autoAdvance: true,      // Auto-move to next question
    resetOnCorrect: true,   // Reset hint level when they get one right
    showProgress: true      // Show "Question 2 of 5" progress bar
  },
  timingConfig: {
    progressionDelay: 1500,     // Wait 1.5s before next question
    nextExerciseDelay: 2500     // Wait 2.5s before next exercise
  }
}
```

### Escalation Levels

The system automatically escalates through different feedback levels as students make mistakes:

1. **First wrong answer**: Shows basic "try again" message
2. **Second wrong answer**: May show a hint
3. **Third wrong answer**: Shows the correct answer

Each level can control:

- `message` - Custom text to show
- `showHint` - Whether to display the exercise's hint text
- `showAnswer` - Whether to reveal the correct answer

### Multi-Question Exercises

For exercises with multiple questions (like verb analysis), use `useExerciseProgression`:

```typescript
const { currentIndex, isLastItem, nextItem } = useExerciseProgression({
  totalItems: exercise.data.verbs.length,
  feedbackConfig: exercise.feedbackConfig,
  onComplete: () => console.log('All done!'),
});

// The hook automatically handles timing and auto-advancement
```

### Components You'll Use

**`ExerciseInput`** - Smart input field that handles submission

```typescript
<ExerciseInput
  value={userAnswer}
  onChange={setUserAnswer}
  onSubmit={handleSubmit}
  placeholder="Type your answer..."
/>
```

**`FeedbackDisplay`** - Shows success/error messages with styled presentation

```typescript
<FeedbackDisplay
  isCorrect={isCorrect}
  message={message}
  level={level}
  hint={currentItem.hint}
  explanation={currentItem.explanation}
  showExplanation={isCorrect === true}
/>
```

**`ExerciseProgress`** - Progress bar for multi-question exercises

```typescript
<ExerciseProgress
  current={currentIndex}
  total={totalQuestions}
  label="Question"  // or "Match", "Verb", etc.
  showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
/>
```

### Benefits

- **Consistent UX**: All exercises provide the same user experience
- **Configurable**: Each exercise can have different feedback behavior
- **Escalating Help**: Students receive more assistance as they struggle
- **Smooth Flow**: Auto-advancement maintains lesson momentum
- **Developer Friendly**: Simple configuration with automatic behavior

### Adding Feedback to New Exercises

1. Add `feedbackConfig` to your exercise type definition
2. Use the hooks in your component
3. Call `handleCorrect`/`handleIncorrect` based on validation
4. Include the UI components for input and feedback display

The system handles all timing, escalation, and message logic automatically.
