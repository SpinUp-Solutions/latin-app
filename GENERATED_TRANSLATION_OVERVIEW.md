# Generated Translation Exercise - System Overview

## Purpose
The Generated Translation Exercise dynamically generates vocabulary translation questions by querying a Firestore database of Latin vocabulary words. Students see a Latin word form and must provide the English translation.

## Architecture Flow

### 1. Exercise Configuration (`exerciseSelectFields.ts`)
```typescript
export const EXERCISE_SELECT_FIELDS = {
  'generated-translation': ['translation'],
}
```
- Defines which **additional** fields to fetch from the database for this exercise type
- These are added to the base fields automatically

### 2. Field Composition (`selectComposer.ts`)
```typescript
const BASE_FIELDS = ['word', 'part_of_speech']
const TABLE_FIELDS = ['conjugation_table', 'declension_table', 'degrees_table']
```
- **Base fields** are always included: `word`, `part_of_speech`
- **Table fields** are added if `formSelection` is configured (for selecting specific conjugated/declined forms)
- **Additional fields** from exercise config are added (e.g., `translation`)
- Final select array: `['word', 'part_of_speech', 'translation']` (or more if form selection is used)

### 3. Query Building (`useGeneratedExerciseQuery.ts`)
```typescript
const selectFields = composeSelectFields(additionalFields, { formSelection: config.formSelection });
const tableType = deriveTableType(config.filters.partOfSpeech);
const queryArgs = {
  collection: 'vocabulary_words_v4',
  partOfSpeech: config.filters.partOfSpeech,
  cellPaths: config.formSelection?.selectedCellPaths || [],
  tableType,
  select: selectFields.join(','),  // Sent as comma-separated string
  ...otherFilters
}
```
- Composes the select fields
- Derives table type from part of speech (verb → conjugation, noun → declension, etc.)
- Builds query arguments for RTK Query

### 4. API Processing (`/api/admin/words/route.ts`)

#### 4.1 Firestore Query with Field Selection
```typescript
if (selectFields) {
  const fields = selectFields.split(',').map(f => f.trim());
  query = query.select(...fields);  // Firestore only fetches these fields
}
```
- The `select` parameter limits what Firestore fetches (performance optimization)
- Only the requested fields are retrieved from the database

#### 4.2 Exercise Mode Response
When `tableType` is present, the API enters "exercise mode":

```typescript
const isExerciseMode = !!tableType;

if (isExerciseMode) {
  // 1. Form Selection (optional)
  let selectedForm = serialized.word;  // Default to root word
  let formPath = null;

  if (cellPaths && tableType) {
    // Pick a random form from the specified cell paths
    const formResult = pickRandomFormServer(serialized, tableType, paths);
    if (formResult) {
      selectedForm = formResult.form;  // e.g., "amabam" instead of "amo"
      formPath = parseFormPathFromString(formResult.path, tableType);
    }
  }

  // 2. Build response with all fetched fields
  const result = {
    ...serialized,  // Spread ALL fields that were fetched
    root_word: serialized.word,  // Override: add root word
    selected_form: selectedForm,  // Override: add selected form
    form_path: formPath,  // Override: add form path
  };

  // 3. Remove table data (not needed in response, only used for form selection)
  delete result.word;
  delete result.conjugation_table;
  delete result.declension_table;
  delete result.degrees_table;

  return result;
}
```

**Key Points:**
- `...serialized` spreads ALL fields that Firestore returned (including `translation`)
- Only overrides the exercise-specific fields: `root_word`, `selected_form`, `form_path`
- Deletes the table structures (they're large and only used server-side for form selection)

#### 4.3 Final Response Shape
```typescript
{
  root_word: "amo",           // Original dictionary form
  selected_form: "amabam",    // Form shown to student (from form selection)
  part_of_speech: "verb",
  form_path: {                // Where this form came from
    tense: "imperfect",
    person: "first",
    number: "singular"
  },
  translation: "love, like",  // Comma-separated translations
  definitions: [...],         // Other selected fields...
  conjugation: "1",
  is_deponent: false
}
```

### 5. Frontend Processing (`generated-translation-exercise.tsx`)

#### 5.1 Data Transformation
```typescript
const items: ExerciseItem[] = useMemo(() => {
  const words = data.words as ExerciseWordResponse[];

  return words.map(word => {
    const translations = word.translation
      ? word.translation.split(',').map(t => t.trim())
      : [];

    return {
      text: word.selected_form,           // Show the Latin form
      acceptedAnswers: translations,       // ["love", "like"]
      hint: word.definitions.join(', ')
    };
  });
}, [data]);
```

#### 5.2 Answer Validation
```typescript
const userAnswerNormalized = userAnswer.trim().toLowerCase();
const validation = {
  isCorrect: currentItem.acceptedAnswers.some(
    answer => answer.toLowerCase() === userAnswerNormalized
  ),
};
```
- User's answer is normalized (trimmed, lowercased)
- Checks if it matches ANY of the comma-separated translations
- "love" OR "like" would both be correct

#### 5.3 Feedback Display
```typescript
<FeedbackDisplay
  isCorrect={isCorrect}
  message={message}
  showAnswer={Boolean(level?.showAnswer)}
  answer={currentItem.acceptedAnswers.join(' OR ')}  // "love OR like"
/>
```

### 6. Form Selection (Optional Feature)

When configured, form selection allows picking specific word forms:

**Example Configuration:**
```typescript
formSelection: {
  selectedCellPaths: [
    'imperfect.active.indicative.first.singular',
    'imperfect.active.indicative.third.plural'
  ]
}
```

**Server-side Process:**
1. `pickRandomFormServer()` navigates through the conjugation/declension table
2. Collects all forms matching the cell paths
3. Randomly selects one: `amabam` (I was loving)
4. Returns both the form and its path

**Why it works:**
- Tables like `conjugation_table` are fetched via Firestore select
- Form is extracted server-side
- Only the selected form is sent to client (tables are deleted)
- Client shows the selected form instead of root word

### 7. Key Design Decisions

#### Why spread `...serialized`?
- Avoids manually listing every possible field
- Automatically includes any new fields added to select config
- Simpler and more maintainable than field-by-field copying

#### Why delete table fields?
- Table structures are large (100+ cells)
- Only needed server-side for form selection
- Client only needs the final selected form

#### Why `tableType` triggers exercise mode?
- Derived from `partOfSpeech` filter
- Indicates we're doing form-based exercises
- Enables form selection and exercise response format

#### Why comma-separated translations?
- Database stores: `"love, like, cherish"`
- Allows multiple valid answers without complex data structure
- Simple to parse and validate on frontend

## Data Flow Summary

```
1. User creates exercise with filters (e.g., "all verbs")
   ↓
2. Frontend composes select fields: ['word', 'part_of_speech', 'translation']
   ↓
3. Frontend sends API request with select, filters, tableType
   ↓
4. API queries Firestore with .select() - only fetches needed fields
   ↓
5. API picks random form (if formSelection configured)
   ↓
6. API spreads all fetched fields + adds exercise fields
   ↓
7. API deletes table structures
   ↓
8. Frontend receives: { root_word, selected_form, translation, ... }
   ↓
9. Frontend splits translations by comma
   ↓
10. Frontend validates if user answer matches any translation
```

## Common Issues

### "Accepted answers are empty"
- **Cause:** `translation` field not in API response
- **Previous issue:** Exercise mode was hardcoded to return specific fields
- **Fix:** Changed to `...serialized` to include all fetched fields

### "Form path is null"
- **Cause:** No `formSelection` configured or no valid cell paths
- **Expected:** When form selection isn't used, form_path should be null
- **Not an error:** Root word is used as selected_form

### "Fields not showing up"
- **Check:** Is field added to `EXERCISE_SELECT_FIELDS` config?
- **Check:** Does Firestore document have this field?
- **Check:** Is API deleting it (e.g., table fields)?

## Files Reference

### Configuration
- `/src/config/exerciseSelectFields.ts` - Define which fields to fetch

### Type Definitions
- `/src/types/exercises/generated-translation.d.ts` - Exercise type
- `/src/types/exercises/base.d.ts` - Base interfaces (GeneratorConfigBase, etc.)

### Query Building
- `/src/hooks/useGeneratedExerciseQuery.ts` - Builds query args
- `/src/utils/generated/selectComposer.ts` - Composes select fields

### API
- `/src/app/api/admin/words/route.ts` - Fetches words, does form selection

### Frontend Components
- `/src/components/ui/exercises/generated-translation-exercise.tsx` - Runtime exercise
- `/src/components/ui/admin/content-editor/GeneratedTranslationEditor.tsx` - Admin editor

### Rendering
- `/src/components/ui/lesson/content-renderer.tsx` - Routes to correct component
- `/src/components/ui/admin/ContentEditor.tsx` - Routes to correct editor
