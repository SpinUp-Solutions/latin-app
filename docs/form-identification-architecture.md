# Form Identification Exercise Architecture

## Overview

The Form Identification Exercise system enables students to practice identifying grammatical forms of Latin words (case, number, gender, tense, mood, etc.). It supports three exercise modes:

1. **Step-by-Step** - Answer one grammatical property at a time
2. **Single-Field** - All answers in one input (comma within path, semicolon between paths)
3. **Multi-Answer** - Identify all valid primary paths per step

## Abbreviation System

### Single Source of Truth

All grammatical term variants are managed through a single `ANSWER_VARIANTS` map in `src/utils/exercises/formIdentificationHelpers.ts`.

```
┌─────────────────────────────────────────────────────────┐
│                    Zod Schemas                          │
│  CaseSchema, GenderSchema, NumberSchema, PersonSchema,  │
│  DegreeSchema, VoiceSchema, PronounTypeSchema, etc.     │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              createVariantMap()                         │
│  Iterates schemas, builds variant arrays                │
│  Convention: [full, ..., shortest]                      │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              ANSWER_VARIANTS                            │
│  Record<string, string[]>                               │
│  Single source of truth                                 │
└──────────────┬─────────────────────┬────────────────────┘
               │                     │
               ▼                     ▼
┌──────────────────────┐  ┌──────────────────────────────┐
│ getAcceptedAnswers() │  │ getDisplayForm()             │
│ Returns full array   │  │ Returns variants[length - 1] │
│ (for validation)     │  │ (for display)                │
└──────────────────────┘  └──────────────────────────────┘
```

### Convention: Last Element = Display Form

Arrays are ordered `[full_form, ..., shortest_form]`. The **last element** is used as the display form.

Examples:
| Value | Variants Array | Display Form |
|-------|----------------|--------------|
| nominative | `['nominative', 'nom.', 'nom']` | `nom` |
| singular | `['singular', 'sg', 'sing', 's']` | `s` |
| masculine | `['masculine', 'masc.', 'masc', 'm']` | `m` |
| first | `['first', '1st', '1']` | `1` |

### Public API

```typescript
// Validation: accepts any variant
getAcceptedAnswersForStep('nominative')
// → ['nominative', 'nom.', 'nom']

// Display: returns shortest form
getDisplayForm('nominative')
// → 'nom'
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Admin Editor                                 │
│  GeneratedFormIdentificationEditor.tsx                              │
│  - Configures exercise (mode, steps, POS configs)                   │
│  - Preview uses getDisplayForm() for correct answer display         │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Exercise Config                                 │
│  { mode, posConfigs: [{ pos, steps, filters }], ... }               │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API Layer                                    │
│  advancedVocabularyApi.ts - fetches words with form_path,           │
│  primary_form_paths, optional_form_paths                            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Exercise Component                              │
│  generated-form-identification-exercise.tsx                         │
│  - Builds exercise items from word data                             │
│  - Uses getDisplayForm() for correctAnswerDisplay                   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Validation Layer                                │
│  generatedFormIdentificationExercise.ts                             │
│  - validateSingleFieldFormIdentificationExercise()                  │
│  - Uses getAcceptedAnswersForStep() to check user input             │
└─────────────────────────────────────────────────────────────────────┘
```

## Form Paths

Words can have multiple valid grammatical interpretations. For example, "bellum" can be nominative OR accusative singular neuter.

```typescript
{
  form_path: { case: 'nominative', number: 'singular' },
  primary_form_paths: [
    { case: 'nominative', number: 'singular' },
    { case: 'accusative', number: 'singular' }
  ],
  optional_form_paths: []
}
```

The validation system accepts any path from `primary_form_paths` or `optional_form_paths`.

## Key Files

| File | Purpose |
|------|---------|
| `src/utils/exercises/formIdentificationHelpers.ts` | Core helpers: ANSWER_VARIANTS, getAcceptedAnswersForStep, getDisplayForm, extractStepValue |
| `src/utils/exercises/generatedFormIdentificationExercise.ts` | Validation functions |
| `src/components/ui/exercises/generated-form-identification-exercise.tsx` | Main UI component |
| `src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx` | Admin editor |
| `src/types/exercises/schemas/form-identification.ts` | Zod schemas for exercise items |
| `src/config/formIdentificationSteps.ts` | Maps POS to available steps |

## Adding New Grammatical Terms

1. Add to the appropriate Zod schema in `shared/types/vocabulary/schemas/enums.ts`
2. Update `createVariantMap()` in `formIdentificationHelpers.ts` to include variants
3. Ensure the array ends with the shortest display form
