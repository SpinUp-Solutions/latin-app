## Paradigm-Based Form Identification Architecture (v2)

### Implementation Instructions

**Code Style Requirements**

- Do NOT add any in-code comments
- No JSDoc comments
- No inline explanatory comments
- Let the code be self-documenting through clear naming

**Type Checking**

```bash
npx tsc --noEmit
```

**Final Build Check (ignore formatting warnings)**

```bash
npm run build 2>&1 | grep -v "warning"
```

---

### Why a v2 Plan

The original plan is directionally correct, but it assumes `posConfigs` can be removed and that shared editor infrastructure can be deleted. In the current repo:

- `generated-translation` still depends on `posConfigs`, `useGeneratedExerciseEditor`, `usePoolPOSSummary`, and `MultiPosConfigSection`
- `generated-form-identification` is the exercise that needs paradigm semantics (especially pronouns) and can adopt `paradigmConfigs` without impacting translation

This v2 plan keeps translation stable and scopes paradigms to form identification.

---

### Problems to Solve

1. **Pronoun paradigm mismatch**: 1st/2nd personal pronouns use person × case × number (no gender), while gendered/other pronouns use gender × case × number (no person). Pool exercises that include both currently produce incorrect steps and incorrect form-selection tables.
2. **Duplicated editor code paths**: filters mode and pool mode have separate implementations and separate state branching.

---

### Key Repo Facts (Current State)

- `TableType` already supports:
  - `conjugation`, `declension`, `adjective-declension`
  - `pronoun-declension`, `pronoun-adjective-declension`
- `generated-form-identification` currently relies on `filterPronounSteps()` at runtime and uses POS-based configs (`posConfigs`)
- `generated-translation` relies on POS-based configs and must not be broken by this refactor

---

## Solution Overview

### Scope

- **Paradigms apply ONLY to `generated-form-identification`**
- `generated-translation` keeps `posConfigs` and keeps using existing editor/hook/components

### Core Idea

Introduce a `FormParadigm` abstraction for form identification where:

- each paradigm has exactly one valid step set
- each paradigm has exactly one table schema / `TableType`

This removes the need for runtime step filtering and prevents mixing incompatible pronoun table schemas under one configuration.

---

## Paradigms

| Paradigm | Applies To | Steps | `TableType` |
|----------|------------|-------|-------------|
| `verb-conjugation` | Verbs | conjugation, tense, voice, mood, person, number | `conjugation` |
| `noun-declension` | Nouns | declension, case, number, gender | `declension` |
| `adjective-declension` | Adjectives | declension, degree, gender, number, case | `adjective-declension` |
| `pronoun-personal` | Personal pronouns (1st/2nd) | pronoun_type, person, case, number | `pronoun-declension` |
| `pronoun-gendered` | Personal 3rd + non-personal pronouns | pronoun_type, gender, case, number | `pronoun-adjective-declension` |

**Decision:** adverbs excluded from form identification.

---

## Phase 1: Foundation (Types + Definitions + Derivation)

### Files to Create

1. `src/types/exercises/paradigm.ts`

Add paradigm types for form identification:

```typescript
import type { FormIdentificationStep } from './schemas/form-identification';
import type { TableType } from '@/src/utils/schema-helpers';
import type { GeneratorFilters, FormSelection } from './base';

export type FormParadigm =
  | 'verb-conjugation'
  | 'noun-declension'
  | 'adjective-declension'
  | 'pronoun-personal'
  | 'pronoun-gendered';

export type ParadigmFilters = Omit<GeneratorFilters, 'partOfSpeech'>;

export interface ParadigmConfig {
  enabled: boolean;
  filters: ParadigmFilters;
  steps: FormIdentificationStep[];
  formSelection?: FormSelection;
}

export type ParadigmConfigs = Partial<Record<FormParadigm, ParadigmConfig>>;
```

2. `src/config/paradigmDefinitions.ts`

Create constants:

- `PARADIGM_STEPS: Record<FormParadigm, readonly FormIdentificationStep[]>`
- `PARADIGM_TABLE_TYPE: Record<FormParadigm, TableType>`
- `PARADIGM_LABELS: Record<FormParadigm, string>`
- `PARADIGM_POS_GROUP: Record<FormParadigm, 'verb' | 'noun' | 'adjective' | 'pronoun'>`

3. `src/utils/paradigm.ts`

Create:

- `deriveParadigm(partOfSpeech, pronounType?, person?): FormParadigm | undefined`
- `isPronounParadigm(paradigm): boolean`

---

## Phase 2: Pool Paradigm Summary API + RTK Query

### Files to Create

1. `src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts`

Modeled on `pos-summary`, but selects `part_of_speech`, `pronoun_type`, `person` and counts by `deriveParadigm(...)`.

Batch Firestore `in` queries in chunks of **30** doc IDs.

### Files to Modify

1. `src/store/api/vocabularyPoolApi.ts`

Add:

- `getPoolParadigmSummary: builder.query<ParadigmSummaryData, string>(...)`
- export `useGetPoolParadigmSummaryQuery`
- update pool word mutations to invalidate `{ type: 'Pool', id: \`\${poolId}-paradigm-summary\` }`

---

## Phase 3: Form Identification Data Model Cutover

### Files to Modify

1. `src/types/exercises/generated-form-identification.d.ts`

Replace `posConfigs` with `paradigmConfigs`:

```typescript
import type { BaseExercise, GeneratorConfigBase } from './base';
import type { ParadigmConfigs } from './paradigm';

export interface GeneratedFormIdentificationExercise extends BaseExercise {
  type: 'generated-form-identification';
  data: {
    mode: 'step-by-step' | 'single-field';
    requireAllPrimaryAnswers?: boolean;
    generatorConfig: GeneratorConfigBase;
    paradigmConfigs: ParadigmConfigs;
  };
}
```

2. `src/utils/contentFactory.ts`

Update default `generated-form-identification` content to initialize `paradigmConfigs: {}`.

**Migration decision:** clean cutover for generated form identification exercises only; existing documents in Firestore must be recreated or migrated.

---

## Phase 4: Unified Word Fetching for Form Identification

### Files to Modify

1. `src/store/api/advancedVocabularyApi.ts`

Add a new endpoint:

- `getMultiParadigmWords` for `generated-form-identification`
- keep `getMultiPosWords` unchanged for translation

Implementation outline:

- Input:
  - `exerciseType: 'generated-form-identification'`
  - `collection`, `wordSource`, `poolId`, `count`, `paradigmConfigs`
- Determine enabled paradigms and fetch words per paradigm:
  - `wordType = PARADIGM_POS_GROUP[paradigm]`
  - `tableType = PARADIGM_TABLE_TYPE[paradigm]`
  - apply `filters` only when `wordSource === 'filters'`
  - apply `formSelection` cell paths when present
- After each fetch, filter the returned words by `deriveParadigm(...) === paradigm` to guarantee correct classification (especially pronouns), even when no form selection is configured
- Merge results across paradigms and shuffle

Export hook:

- `useGetMultiParadigmWordsQuery`

---

## Phase 5: Unified Editor for Form Identification (No Translation Impact)

### Files to Create

1. `src/hooks/useGeneratedFormIdentificationEditor.ts`

Form-ID-specific editor hook that replaces `useGeneratedExerciseEditor` in `GeneratedFormIdentificationEditor.tsx` only.

Responsibilities:

- own `paradigmConfigs` updates
- preview words via `useGetMultiParadigmWordsQuery`
- pool paradigm info via `useGetPoolParadigmSummaryQuery`
- keep `generatorConfig` behavior consistent (`ensureGeneratorConfig`)

2. `src/hooks/useAvailableParadigms.ts`

Form-ID-only helper that returns available paradigms:

- pool mode: paradigms from `getPoolParadigmSummary`
- filters mode: paradigms from `Object.keys(paradigmConfigs)` or a fixed ordered list of all paradigms

### Files to Create

1. `src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx`

New paradigm config UI used by both word sources:

- shows paradigms grouped by POS (pronouns grouped with sub-tabs)
- toggles enable/disable per paradigm
- uses `PARADIGM_STEPS[paradigm]` (no runtime filtering)
- uses `PARADIGM_TABLE_TYPE[paradigm]` and stores `formSelection.tableType` accordingly

### Files to Modify

1. `src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx`

- remove `useGeneratedExerciseEditor` usage
- replace dual blocks (filters vs pool) with a single `MultiParadigmConfigSection`
- keep `WordSourceSection`, `VocabularyPoolSelector`, preview UI structure

**Important:** do not delete `MultiPosConfigSection` or `usePoolPOSSummary` because translation still uses them.

---

## Phase 6: Runtime Refactor (Remove Pronoun Hack)

### Files to Modify

1. `src/components/ui/exercises/generated-form-identification-exercise.tsx`

- swap `exercise.data.posConfigs` → `exercise.data.paradigmConfigs`
- for each word, derive paradigm via `deriveParadigm(word.part_of_speech, word.pronoun_type, word.person)`
- select config from `paradigmConfigs[paradigm]`
- remove all `filterPronounSteps()` usage

2. `src/utils/exercises/formIdentificationHelpers.ts`

- remove `filterPronounSteps()` and any call sites

---

## Phase 7: Cleanup (Safe Deletions Only)

### Files to Delete

- `src/config/formIdentificationSteps.ts` (only after form identification editor no longer imports it)

### Files to Keep

- `src/hooks/usePoolPOSSummary.ts`
- `src/components/ui/admin/content-editor/MultiPosConfigSection.tsx`
- `src/hooks/useGeneratedExerciseEditor.ts`

These remain required for `generated-translation`.

---

## Verification Checklist

- `npx tsc --noEmit`
- create a pool containing a mix of:
  - 1st/2nd personal pronouns
  - gendered pronouns / non-personal pronouns
  - confirm editor shows two pronoun paradigms with correct steps + correct form-selection tables
- confirm `generated-translation` editor and runtime still work unchanged
- final build:

```bash
npm run build 2>&1 | grep -v "warning"
```


