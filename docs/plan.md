# Paradigm-Based Form Identification Architecture

## Implementation Instructions

**Code Style Requirements:**
- Do NOT add any in-code comments
- No JSDoc comments
- No inline explanatory comments
- Let the code be self-documenting through clear naming

**Type Checking:**
```bash
npx tsc --noEmit
```

**Final Build Check (ignore formatting warnings):**
```bash
npm run build 2>&1 | grep -v "warning"
```

---

## Problem Summary

**Two problems to solve:**

1. **Pronoun paradigm mismatch**: Personal pronouns (1st/2nd) use person × case × number (NO gender), while non-personal pronouns use gender × case × number (NO person). When a pool contains both types, the editor shows wrong steps and wrong form tables.

2. **Duplicated code paths**: Filters mode and Pool mode have completely separate implementations:
   - `GeneratedFormIdentificationEditor.tsx` lines 196-245: inline UI for filters
   - `GeneratedFormIdentificationEditor.tsx` lines 247-257: `MultiPosConfigSection` for pools
   - `useGeneratedExerciseEditor.ts`: extensive `isPoolWordSource` branching

---

## Solution: Unified Paradigm Architecture

**Two key innovations:**

1. **FormParadigm abstraction** - More granular than POS, each paradigm has exactly one set of valid steps and one table schema.

2. **`useAvailableParadigms` hook** - Abstracts word source differences, returning the same interface for both filters and pool modes. Eliminates `isPoolWordSource` branching.

### Paradigm Types

| Paradigm | Applies To | Steps | Table Schema |
|----------|------------|-------|--------------|
| `verb-conjugation` | All verbs | conjugation, tense, voice, mood, person, number | ConjugationTableSchema |
| `noun-declension` | All nouns | declension, case, number, gender | DeclensionTableSchema |
| `adjective-declension` | All adjectives | declension, degree, gender, number, case | DegreesTableSchema |
| `pronoun-personal` | 1st/2nd person personal | pronoun_type, person, case, number | PersonalPronounDeclensionTableSchema |
| `pronoun-gendered` | 3rd person + non-personal | pronoun_type, gender, case, number | AdjectiveDeclensionTableSchema |

**Note:** Adverbs excluded from form ID exercises (only have 'degree' step, minimal utility).

### Key Benefit

Each paradigm has **exactly one set of valid steps** and **exactly one table schema**. No runtime filtering needed.

---

## Files to Create

### 1. `/src/types/exercises/paradigm.ts`

New type definitions:

```typescript
import type { FormIdentificationStep } from './schemas/form-identification';
import type { TableType } from '@/src/utils/schema-helpers';

export type FormParadigm =
  | 'verb-conjugation'
  | 'noun-declension'
  | 'adjective-declension'
  | 'pronoun-personal'
  | 'pronoun-gendered';

export interface ParadigmConfig {
  enabled: boolean;
  steps: FormIdentificationStep[];
  formSelection?: {
    tableType: TableType;
    selectedCellPaths: string[];
  };
}

export type ParadigmConfigs = Partial<Record<FormParadigm, ParadigmConfig>>;
```

### 2. `/src/config/paradigmDefinitions.ts`

Constants defining valid steps and table types per paradigm:

```typescript
import type { FormParadigm } from '@/src/types/exercises/paradigm';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { TableType } from '@/src/utils/schema-helpers';

export const PARADIGM_STEPS: Readonly<Record<FormParadigm, readonly FormIdentificationStep[]>> = {
  'verb-conjugation': ['conjugation', 'tense', 'voice', 'mood', 'person', 'number'],
  'noun-declension': ['declension', 'case', 'number', 'gender'],
  'adjective-declension': ['declension', 'degree', 'gender', 'number', 'case'],
  'pronoun-personal': ['pronoun_type', 'person', 'case', 'number'],
  'pronoun-gendered': ['pronoun_type', 'gender', 'case', 'number'],
} as const;

export const PARADIGM_TABLE_TYPE: Readonly<Record<FormParadigm, TableType | undefined>> = {
  'verb-conjugation': 'conjugation',
  'noun-declension': 'declension',
  'adjective-declension': 'adjective-declension',
  'pronoun-personal': 'pronoun-declension',
  'pronoun-gendered': 'pronoun-adjective-declension',
} as const;

export const PARADIGM_LABELS: Readonly<Record<FormParadigm, string>> = {
  'verb-conjugation': 'Verb Conjugation',
  'noun-declension': 'Noun Declension',
  'adjective-declension': 'Adjective Declension',
  'pronoun-personal': 'Personal Pronouns (1st/2nd)',
  'pronoun-gendered': 'Gendered Pronouns (3rd/Other)',
} as const;

export const PARADIGM_POS_GROUP: Readonly<Record<FormParadigm, string>> = {
  'verb-conjugation': 'verb',
  'noun-declension': 'noun',
  'adjective-declension': 'adjective',
  'pronoun-personal': 'pronoun',
  'pronoun-gendered': 'pronoun',
} as const;
```

### 3. `/src/utils/paradigm.ts`

Core utility functions:

```typescript
import type { FormParadigm } from '@/src/types/exercises/paradigm';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import type { GeneratorFilters } from '@/src/types/exercises/base';

export function deriveParadigm(
  partOfSpeech: PartOfSpeech,
  pronounType?: PronounType | null,
  person?: PronounPerson | null
): FormParadigm | undefined {
  switch (partOfSpeech) {
    case 'verb':
      return 'verb-conjugation';
    case 'noun':
      return 'noun-declension';
    case 'adjective':
      return 'adjective-declension';
    case 'pronoun':
      if (pronounType === 'personal' && (person === '1st' || person === '2nd')) {
        return 'pronoun-personal';
      }
      return 'pronoun-gendered';
    default:
      return undefined;
  }
}

export function getParadigmsForPOS(pos: PartOfSpeech): FormParadigm[] {
  switch (pos) {
    case 'verb':
      return ['verb-conjugation'];
    case 'noun':
      return ['noun-declension'];
    case 'adjective':
      return ['adjective-declension'];
    case 'pronoun':
      return ['pronoun-personal', 'pronoun-gendered'];
    default:
      return [];
  }
}

export function getParadigmsFromFilters(filters: GeneratorFilters): FormParadigm[] {
  const pos = filters.partOfSpeech;

  if (!pos || pos === 'all') {
    return ['verb-conjugation', 'noun-declension', 'adjective-declension', 'pronoun-personal', 'pronoun-gendered'];
  }

  if (pos === 'pronoun') {
    const pronounType = filters.pronounType;
    const pronounPerson = filters.pronounPerson;

    if (pronounType === 'personal' && (pronounPerson === '1st' || pronounPerson === '2nd')) {
      return ['pronoun-personal'];
    }
    if (pronounType === 'personal' && pronounPerson === '3rd') {
      return ['pronoun-gendered'];
    }
    if (pronounType && pronounType !== 'all' && pronounType !== 'personal') {
      return ['pronoun-gendered'];
    }
    return ['pronoun-personal', 'pronoun-gendered'];
  }

  const paradigm = deriveParadigm(pos as PartOfSpeech, null, null);
  return paradigm ? [paradigm] : [];
}

export function isPronounParadigm(paradigm: FormParadigm): boolean {
  return paradigm === 'pronoun-personal' || paradigm === 'pronoun-gendered';
}
```

### 4. `/src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts`

New API endpoint returning paradigm breakdown:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import type { FormParadigm } from '@/src/types/exercises/paradigm';
import { deriveParadigm } from '@/src/utils/paradigm';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

interface ParadigmSummaryResponse {
  success: boolean;
  data: {
    paradigmSummary: Partial<Record<FormParadigm, number>>;
    posSummary: Partial<Record<PartOfSpeech, number>>;
    totalWords: number;
    poolId: string;
  };
}

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { poolId: string } }
): Promise<NextResponse<ParadigmSummaryResponse>> {
  try {
    const { poolId } = params;

    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();

    if (!poolDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          data: {
            paradigmSummary: {},
            posSummary: {},
            totalWords: 0,
            poolId,
          },
        },
        { status: 404 }
      );
    }

    const poolData = poolDoc.data();
    const wordDocIds = (poolData?.wordDocIds || []) as string[];

    if (wordDocIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          paradigmSummary: {},
          posSummary: {},
          totalWords: 0,
          poolId,
        },
      });
    }

    const batches = [];
    for (let i = 0; i < wordDocIds.length; i += 10) {
      const chunk = wordDocIds.slice(i, i + 10);
      const batchQuery = adminDb
        .collection(VOCABULARY_WORDS_COLLECTION)
        .where(FieldPath.documentId(), 'in', chunk)
        .select('part_of_speech', 'pronoun_type', 'person');
      batches.push(batchQuery.get());
    }

    const batchResults = await Promise.all(batches);
    const allDocs = batchResults.flatMap(result => result.docs);

    const paradigmSummary: Partial<Record<FormParadigm, number>> = {};
    const posSummary: Partial<Record<PartOfSpeech, number>> = {};
    let totalWords = 0;

    allDocs.forEach(doc => {
      const data = doc.data();
      const pos = data.part_of_speech as PartOfSpeech;

      if (pos) {
        posSummary[pos] = (posSummary[pos] || 0) + 1;

        const paradigm = deriveParadigm(pos, data.pronoun_type, data.person);
        if (paradigm) {
          paradigmSummary[paradigm] = (paradigmSummary[paradigm] || 0) + 1;
        }

        totalWords++;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        paradigmSummary,
        posSummary,
        totalWords,
        poolId,
      },
    });
  } catch (error) {
    console.error('Error fetching paradigm summary:', error);
    return NextResponse.json(
      {
        success: false,
        data: {
          paradigmSummary: {},
          posSummary: {},
          totalWords: 0,
          poolId: params.poolId,
        },
      },
      { status: 500 }
    );
  }
}
```

### 5. `/src/hooks/useAvailableParadigms.ts`

**Key abstraction** - Unified hook that works for both word sources:

```typescript
import { useMemo } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetPoolParadigmSummaryQuery } from '@/src/store/api/vocabularyPoolApi';
import type { FormParadigm } from '@/src/types/exercises/paradigm';
import type { GeneratorFilters } from '@/src/types/exercises/base';
import { getParadigmsFromFilters } from '@/src/utils/paradigm';

export interface UseAvailableParadigmsReturn {
  isLoading: boolean;
  isError: boolean;
  availableParadigms: FormParadigm[];
  paradigmWordCounts: Partial<Record<FormParadigm, number>>;
  hasMultipleParadigms: boolean;
  uniqueParadigm: FormParadigm | undefined;
}

export function useAvailableParadigms(
  wordSource: 'filters' | 'pool',
  poolId: string | null,
  filters: GeneratorFilters
): UseAvailableParadigmsReturn {
  const poolSummary = useGetPoolParadigmSummaryQuery(
    wordSource === 'pool' && poolId ? poolId : skipToken
  );

  const filtersParadigms = useMemo(() => {
    if (wordSource !== 'filters') return null;
    return getParadigmsFromFilters(filters);
  }, [wordSource, filters]);

  return useMemo(() => {
    if (wordSource === 'pool') {
      const paradigms = Object.keys(poolSummary.data?.paradigmSummary || {}) as FormParadigm[];
      return {
        isLoading: poolSummary.isLoading,
        isError: poolSummary.isError,
        availableParadigms: paradigms,
        paradigmWordCounts: poolSummary.data?.paradigmSummary ?? {},
        hasMultipleParadigms: paradigms.length > 1,
        uniqueParadigm: paradigms.length === 1 ? paradigms[0] : undefined,
      };
    }

    return {
      isLoading: false,
      isError: false,
      availableParadigms: filtersParadigms ?? [],
      paradigmWordCounts: {},
      hasMultipleParadigms: (filtersParadigms?.length ?? 0) > 1,
      uniqueParadigm: filtersParadigms?.length === 1 ? filtersParadigms[0] : undefined,
    };
  }, [wordSource, poolSummary, filtersParadigms]);
}
```

### 6. `/src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx`

New editor component with paradigm tabs **grouped by POS**:
- Verbs, Nouns, Adjectives show as single tabs
- Pronouns grouped under "Pronouns" header with "Personal (1st/2nd)" and "Gendered (3rd/Other)" sub-tabs
- **Used for BOTH filters and pool modes** (unified)

This component should:
- Accept `availableParadigms: FormParadigm[]`
- Accept `paradigmWordCounts?: Partial<Record<FormParadigm, number>>`
- Accept `paradigmConfigs: Partial<Record<FormParadigm, ParadigmConfig>>`
- Accept `onUpdateParadigmConfig: (paradigm: FormParadigm, updates: Partial<ParadigmConfig>) => void`
- Accept `onToggleParadigm: (paradigm: FormParadigm, enabled: boolean) => void`
- Group pronoun paradigms under a "Pronouns" section header
- Use `PARADIGM_STEPS[paradigm]` to show only valid steps for each paradigm
- Use `PARADIGM_TABLE_TYPE[paradigm]` to show the correct form selection table
- Use `PARADIGM_LABELS[paradigm]` for display names

---

## Files to Modify

### 1. `/src/types/exercises/generated-form-identification.d.ts`

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

### 2. `/src/types/exercises/base.d.ts`

Add paradigm-related type exports. Remove `FormIdentificationPosConfig` and `FormIdentificationPosConfigs` types.

### 3. `/src/store/api/vocabularyPoolApi.ts`

Add `getPoolParadigmSummaryQuery` endpoint:

```typescript
interface ParadigmSummaryData {
  paradigmSummary: Partial<Record<FormParadigm, number>>;
  posSummary: Partial<Record<PartOfSpeech, number>>;
  totalWords: number;
  poolId: string;
}

getPoolParadigmSummary: builder.query<ParadigmSummaryData, string>({
  query: poolId => `/admin/vocabulary-pools/${poolId}/paradigm-summary`,
  transformResponse: (response: { success: boolean; data: ParadigmSummaryData }) => response.data,
  providesTags: (result, error, poolId) => [{ type: 'Pool', id: `${poolId}-paradigm-summary` }],
}),
```

Export the hook: `useGetPoolParadigmSummaryQuery`

### 4. `/src/hooks/useGeneratedExerciseEditor.ts`

**Major refactor** - Remove `isPoolWordSource` branching:
- Use `useAvailableParadigms` hook instead of separate `usePoolPOSSummary`
- Replace posConfigs handling with paradigmConfigs
- Remove all `if (isPoolWordSource)` conditionals
- Unified paradigm initialization logic
- Return `paradigmInfo` from `useAvailableParadigms` instead of `posSummary`
- Replace `handleUpdatePosConfig` with `handleUpdateParadigmConfig`
- Replace `handleTogglePOS` with `handleToggleParadigm`
- Remove `activePOS` logic, replace with `activeParadigm`

### 5. `/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx`

**Unified UI** - Replace two separate code blocks with one:

```tsx
// BEFORE: Two separate blocks (lines 196-257)
{!editor.isPoolWordSource && ...}  // Inline UI for filters
{editor.isPoolWordSource && ...}   // MultiPosConfigSection for pools

// AFTER: One unified block
{editor.paradigmInfo.availableParadigms.length > 0 && (
  <MultiParadigmConfigSection
    exerciseType="form-identification"
    availableParadigms={editor.paradigmInfo.availableParadigms}
    paradigmWordCounts={editor.paradigmInfo.paradigmWordCounts}
    paradigmConfigs={editingContent.data.paradigmConfigs}
    onUpdateParadigmConfig={editor.handleUpdateParadigmConfig}
    onToggleParadigm={editor.handleToggleParadigm}
  />
)}
```

Remove imports for `MultiPosConfigSection`, `AVAILABLE_STEPS`, and update to use `paradigmConfigs`.

### 6. `/src/components/ui/exercises/generated-form-identification-exercise.tsx`

- Import `deriveParadigm` from `@/src/utils/paradigm`
- Replace `posConfigs[word.part_of_speech]` lookups with `paradigmConfigs[deriveParadigm(word.part_of_speech, word.pronoun_type, word.person)]`
- Remove `filterPronounSteps()` calls - paradigm config already has correct steps
- Remove import of `filterPronounSteps`

### 7. `/src/utils/exercises/formIdentificationHelpers.ts`

- Remove `filterPronounSteps()` function entirely

---

## Files to Delete

### 1. `/src/hooks/usePoolPOSSummary.ts`

Replaced by `useAvailableParadigms` which handles both word sources.

### 2. `/src/components/ui/admin/content-editor/MultiPosConfigSection.tsx`

Replaced by `MultiParadigmConfigSection`.

---

## Implementation Phases

### Phase 1: Foundation

1. Create `/src/types/exercises/paradigm.ts` - type definitions
2. Create `/src/config/paradigmDefinitions.ts` - constants (steps, table types, labels)
3. Create `/src/utils/paradigm.ts` - `deriveParadigm()`, `getParadigmsForPOS()`, `getParadigmsFromFilters()`

**Verify:**
```bash
npx tsc --noEmit
```

### Phase 2: API & Unified Hook

1. Create `/src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts`
2. Update `/src/store/api/vocabularyPoolApi.ts` - add paradigm summary endpoint
3. Create `/src/hooks/useAvailableParadigms.ts` - **unified hook for both modes**

**Verify:**
```bash
npx tsc --noEmit
```

### Phase 3: Editor (Unified)

1. Update `/src/types/exercises/generated-form-identification.d.ts` - replace posConfigs with paradigmConfigs
2. Create `/src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx`
3. Update `/src/hooks/useGeneratedExerciseEditor.ts`:
   - Replace `usePoolPOSSummary` with `useAvailableParadigms`
   - Remove all `isPoolWordSource` branching
   - Use paradigmConfigs
4. Update `/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx`:
   - Remove dual code paths
   - Use single `MultiParadigmConfigSection` for both modes

**Verify:**
```bash
npx tsc --noEmit
```

### Phase 4: Runtime

1. Update `/src/components/ui/exercises/generated-form-identification-exercise.tsx`
   - Use `deriveParadigm()` for word classification
   - Remove `filterPronounSteps()` calls
2. Update `/src/store/api/advancedVocabularyApi.ts` - support paradigm-based word fetching if needed

**Verify:**
```bash
npx tsc --noEmit
```

### Phase 5: Cleanup

1. Delete `/src/hooks/usePoolPOSSummary.ts`
2. Delete `/src/components/ui/admin/content-editor/MultiPosConfigSection.tsx`
3. Remove `filterPronounSteps()` from formIdentificationHelpers.ts
4. Remove old posConfigs-related code from base.d.ts
5. Remove `/src/config/formIdentificationSteps.ts` (replaced by paradigmDefinitions.ts)

**Final Verification:**
```bash
npx tsc --noEmit
npm run build 2>&1 | grep -v "warning"
```

---

## Migration Strategy

**Clean cutover - no backwards compatibility:**
- Remove `posConfigs` entirely
- Only support `paradigmConfigs`
- Existing exercises will need to be recreated or manually updated in Firestore

---

## User Decisions

1. **UI Layout**: Grouped by POS (Pronouns grouped with sub-tabs)
2. **Migration**: No backwards compatibility - clean cutover
3. **Adverbs**: Excluded from form ID exercises
4. **Unified solution**: Same architecture for both filters and pool modes

---

## Key Benefits

1. **Pronoun problem solved**: Each paradigm (pronoun-personal, pronoun-gendered) has exactly one set of valid steps and one table schema
2. **Unified code**: One `useAvailableParadigms` hook and one `MultiParadigmConfigSection` component for both word sources
3. **Simpler runtime**: No `filterPronounSteps()` hack needed - paradigm config already has correct steps
4. **Reduced branching**: Eliminates extensive `isPoolWordSource` conditionals throughout the codebase

---

## Execution Strategy: Multi-Agent Parallel Implementation

### Agent Architecture

| Role | Model | Responsibilities |
|------|-------|------------------|
| **Orchestrator (Main)** | Opus 4.5 | Type checking, fixing type errors, coordination, final integration |
| **Executor Agent A** | Opus | Foundation + API layer (types, utils, API endpoint, RTK Query) |
| **Executor Agent B** | Opus | Editor layer (hooks, components, UI) |

### Workload Split (Non-Interfering)

**Agent A: Foundation & API (Phase 1-2)**
Files to create/modify:
- `/src/types/exercises/paradigm.ts` (NEW)
- `/src/config/paradigmDefinitions.ts` (NEW)
- `/src/utils/paradigm.ts` (NEW)
- `/src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts` (NEW)
- `/src/store/api/vocabularyPoolApi.ts` (MODIFY - add endpoint)

**Agent B: Editor & UI (Phase 3-4)**
Files to create/modify:
- `/src/types/exercises/generated-form-identification.d.ts` (MODIFY)
- `/src/hooks/useAvailableParadigms.ts` (NEW)
- `/src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx` (NEW)
- `/src/hooks/useGeneratedExerciseEditor.ts` (MODIFY)
- `/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx` (MODIFY)

**Main Orchestrator: Runtime & Cleanup (Phase 4-5)**
Files to modify:
- `/src/components/ui/exercises/generated-form-identification-exercise.tsx` (MODIFY)
- `/src/utils/exercises/formIdentificationHelpers.ts` (MODIFY - remove filterPronounSteps)
- Type error fixes across all files
- Delete deprecated files

### Execution Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Foundation (Agent A)                                    │
│ - Create paradigm.ts types                                       │
│ - Create paradigmDefinitions.ts constants                        │
│ - Create paradigm.ts utils                                       │
│                                                                  │
│ Orchestrator: Run `npx tsc --noEmit` → Fix type errors          │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 2: API Layer (Agent A)                                     │
│ - Create paradigm-summary API route                              │
│ - Update vocabularyPoolApi.ts                                    │
│                                                                  │
│ Orchestrator: Run `npx tsc --noEmit` → Fix type errors          │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 3: Editor Layer (Agent B)                                  │
│ - Update generated-form-identification.d.ts (posConfigs →        │
│   paradigmConfigs)                                               │
│ - Create useAvailableParadigms.ts hook                          │
│ - Create MultiParadigmConfigSection.tsx                         │
│                                                                  │
│ Orchestrator: Run `npx tsc --noEmit` → Fix type errors          │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 4: Integration (Agent B + Orchestrator)                    │
│ Agent B:                                                         │
│ - Update useGeneratedExerciseEditor.ts                          │
│ - Update GeneratedFormIdentificationEditor.tsx                   │
│                                                                  │
│ Orchestrator:                                                    │
│ - Update generated-form-identification-exercise.tsx             │
│ - Remove filterPronounSteps from helpers                         │
│                                                                  │
│ Orchestrator: Run `npx tsc --noEmit` → Fix ALL type errors      │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 5: Cleanup (Orchestrator)                                  │
│ - Delete usePoolPOSSummary.ts                                    │
│ - Delete MultiPosConfigSection.tsx                               │
│ - Remove formIdentificationSteps.ts if exists                    │
│ - Final build: `npm run build 2>&1 | grep -v "warning"`         │
└─────────────────────────────────────────────────────────────────┘
```

### API Batching Fix

Change chunk size from 10 to 30 in paradigm-summary route:
```typescript
for (let i = 0; i < wordDocIds.length; i += 30) {
  const chunk = wordDocIds.slice(i, i + 30);
  // ...
}
```

### RTK Query Tag Fix

Ensure proper cache invalidation by adding to existing pool mutations:
```typescript
invalidatesTags: (result, error, { poolId }) => [
  { type: 'Pool', id: poolId },
  { type: 'Pool', id: `${poolId}-paradigm-summary` },
  // ... existing tags
],
```

### Coordination Rules

1. **Agent A completes before Agent B starts Phase 3** - Agent B needs the types from paradigm.ts
2. **No file conflicts** - Each agent works on distinct file sets
3. **Orchestrator runs tsc after each phase** - Catches integration issues early
4. **Agents do NOT add comments** - Per code style requirements
