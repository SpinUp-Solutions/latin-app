# Paradigm-Based Form Identification Architecture (Revised)

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

## Scope Clarification (CRITICAL)

**This refactor is for Form Identification exercises ONLY.**

Translation exercises will continue using the existing `posConfigs` system because:
- Translation doesn't have the pronoun step/table problem
- Translation only needs POS-level granularity
- Keeps blast radius contained

**Components to KEEP (used by translation):**
- `MultiPosConfigSection.tsx` - still used by `GeneratedTranslationEditor.tsx`
- `usePoolPOSSummary.ts` - still used by translation via `useGeneratedExerciseEditor.ts`
- `PosConfigs`, `PosGeneratorConfig` types in `base.d.ts`

**Components to CREATE (for form-ID only):**
- `MultiParadigmConfigSection.tsx` - new unified component
- `useAvailableParadigms.ts` - new hook for form-ID
- `ParadigmConfig`, `ParadigmConfigs` types

---

## Solution: Unified Paradigm Architecture

**Two key innovations:**

1. **FormParadigm abstraction** - More granular than POS, each paradigm has exactly one set of valid steps and one table schema.

2. **`useAvailableParadigms` hook** - Abstracts word source differences, returning the same interface for both filters and pool modes. Eliminates `isPoolWordSource` branching in form-ID.

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

## Deep Dive: Filters in ParadigmConfig

### Design Decision: Pragmatic Reuse

`ParadigmConfig.filters` uses the same type as `PosGeneratorConfig.filters`:

```typescript
filters: Omit<GeneratorFilters, 'partOfSpeech'>
```

**Why not type-safe per-paradigm filters?**
- Simpler implementation
- Reuses existing types and UI components
- Filter relevance handled by UI (show/hide) and runtime (ignore irrelevant)
- Paradigm constraints enforced at query time regardless of filter values

### Filter Architecture Per Paradigm

Each paradigm has three categories of filters:

| Category | Description |
|----------|-------------|
| **Implicit Constraints** | Derived from paradigm definition, always applied to query |
| **User-Configurable Filters** | Shown in UI, user can modify |
| **Irrelevant Filters** | Hidden in UI, ignored at query time |

### Detailed Filter Mapping

#### `verb-conjugation`

| Filter Field | Category | Notes |
|--------------|----------|-------|
| partOfSpeech | Implicit | Always `verb` |
| verbConjugation | User | Dropdown: 1, 2, 3, 3io, 4, all |
| isDeponent | User | Toggle: true, false, both |
| search | User | Text field |
| nounDeclension | Irrelevant | Hidden |
| adjectiveDeclension | Irrelevant | Hidden |
| pronounType | Irrelevant | Hidden |
| pronounPerson | Irrelevant | Hidden |

**Query construction:**
```typescript
params.append('wordType', 'verb');
if (filters.verbConjugation && filters.verbConjugation !== 'all') {
  params.append('verbConjugation', filters.verbConjugation);
}
if (filters.isDeponent && filters.isDeponent !== 'both') {
  params.append('isDeponent', filters.isDeponent);
}
if (filters.search) {
  params.append('search', filters.search);
}
```

#### `noun-declension`

| Filter Field | Category | Notes |
|--------------|----------|-------|
| partOfSpeech | Implicit | Always `noun` |
| nounDeclension | User | Dropdown: 1, 2, 3, 3-istem, 4, 5, all |
| search | User | Text field |
| verbConjugation | Irrelevant | Hidden |
| isDeponent | Irrelevant | Hidden |
| adjectiveDeclension | Irrelevant | Hidden |
| pronounType | Irrelevant | Hidden |
| pronounPerson | Irrelevant | Hidden |

**Query construction:**
```typescript
params.append('wordType', 'noun');
if (filters.nounDeclension && filters.nounDeclension !== 'all') {
  params.append('nounDeclension', filters.nounDeclension);
}
if (filters.search) {
  params.append('search', filters.search);
}
```

#### `adjective-declension`

| Filter Field | Category | Notes |
|--------------|----------|-------|
| partOfSpeech | Implicit | Always `adjective` |
| adjectiveDeclension | User | Dropdown: 1-2, 3, all |
| search | User | Text field |
| verbConjugation | Irrelevant | Hidden |
| isDeponent | Irrelevant | Hidden |
| nounDeclension | Irrelevant | Hidden |
| pronounType | Irrelevant | Hidden |
| pronounPerson | Irrelevant | Hidden |

**Query construction:**
```typescript
params.append('wordType', 'adjective');
if (filters.adjectiveDeclension && filters.adjectiveDeclension !== 'all') {
  params.append('adjectiveDeclension', filters.adjectiveDeclension);
}
if (filters.search) {
  params.append('search', filters.search);
}
```

#### `pronoun-personal` (1st/2nd person only)

| Filter Field | Category | Notes |
|--------------|----------|-------|
| partOfSpeech | Implicit | Always `pronoun` |
| pronounType | Implicit | Always `personal` (locked) |
| pronounPerson | Implicit | Always `1st` OR `2nd` (locked) |
| search | User | Text field |
| verbConjugation | Irrelevant | Hidden |
| isDeponent | Irrelevant | Hidden |
| nounDeclension | Irrelevant | Hidden |
| adjectiveDeclension | Irrelevant | Hidden |

**UI behavior:**
- pronounType dropdown: HIDDEN (implicitly "personal")
- pronounPerson dropdown: HIDDEN (implicitly "1st/2nd")
- Only show search field

**Query construction:**
```typescript
params.append('wordType', 'pronoun');
params.append('pronounType', 'personal');
// Fetch both 1st and 2nd person - API must handle this
params.append('pronounPerson', '1st,2nd'); // OR use paradigm param
if (filters.search) {
  params.append('search', filters.search);
}
```

**Alternative: Use paradigm param:**
```typescript
params.append('wordType', 'pronoun');
params.append('paradigm', 'pronoun-personal'); // Server handles 1st/2nd filtering
```

#### `pronoun-gendered` (3rd person personal + all non-personal)

| Filter Field | Category | Notes |
|--------------|----------|-------|
| partOfSpeech | Implicit | Always `pronoun` |
| pronounType | User | Dropdown: personal (3rd only), demonstrative, relative, interrogative, reflexive, intensive, indefinite, possessive, all |
| search | User | Text field |
| pronounPerson | Conditional | If pronounType=personal, locked to 3rd; otherwise hidden |
| verbConjugation | Irrelevant | Hidden |
| isDeponent | Irrelevant | Hidden |
| nounDeclension | Irrelevant | Hidden |
| adjectiveDeclension | Irrelevant | Hidden |

**UI behavior:**
- pronounType dropdown: SHOWN (all options)
  - If user selects "personal", implicitly means "personal 3rd person only"
  - Other options work normally
- pronounPerson dropdown: HIDDEN (not applicable for gendered paradigm)
- Show search field

**Query construction (complex case):**
```typescript
params.append('wordType', 'pronoun');

if (filters.pronounType === 'personal') {
  // Personal 3rd person only
  params.append('pronounType', 'personal');
  params.append('pronounPerson', '3rd');
} else if (filters.pronounType && filters.pronounType !== 'all') {
  // Specific non-personal type
  params.append('pronounType', filters.pronounType);
} else {
  // "all" = all pronouns EXCEPT personal 1st/2nd
  // This requires special handling - use paradigm param
  params.append('paradigm', 'pronoun-gendered');
}

if (filters.search) {
  params.append('search', filters.search);
}
```

### Filter Summary Table

| Paradigm | Shown Filters | Hidden Filters | Implicit Constraints |
|----------|---------------|----------------|---------------------|
| verb-conjugation | verbConjugation, isDeponent, search | noun*, adj*, pronoun* | wordType=verb |
| noun-declension | nounDeclension, search | verb*, adj*, pronoun* | wordType=noun |
| adjective-declension | adjectiveDeclension, search | verb*, noun*, pronoun* | wordType=adjective |
| pronoun-personal | search | ALL except search | wordType=pronoun, pronounType=personal, pronounPerson∈{1st,2nd} |
| pronoun-gendered | pronounType, search | pronounPerson, verb*, noun*, adj* | wordType=pronoun, NOT(personal 1st/2nd) |

### Pool Mode vs Filter Mode

**Filter Mode:**
- All filter fields in "User" category are editable
- UI shows paradigm-appropriate filter controls
- Filters determine which words are fetched

**Pool Mode:**
- Filters are largely irrelevant (words pre-selected in pool)
- Paradigm still matters for:
  - Correct `tableType` for form selection
  - Correct `steps` for the paradigm
- Can optionally store filters for future use or display purposes

---

## Files to Create

### 1. `/src/types/exercises/paradigm.ts`

New type definitions:

```typescript
import type { FormIdentificationStep } from './schemas/form-identification';
import type { TableType } from '@/src/utils/schema-helpers';
import type { GeneratorFilters } from './base';

export type FormParadigm =
  | 'verb-conjugation'
  | 'noun-declension'
  | 'adjective-declension'
  | 'pronoun-personal'
  | 'pronoun-gendered';

export interface ParadigmConfig {
  enabled: boolean;
  steps: FormIdentificationStep[];
  filters: Omit<GeneratorFilters, 'partOfSpeech'>;
  formSelection?: {
    tableType: TableType;
    selectedCellPaths: string[];
  };
}

export type ParadigmConfigs = Partial<Record<FormParadigm, ParadigmConfig>>;
```

### 2. `/src/config/paradigmDefinitions.ts`

Constants defining valid steps, table types, labels, and filter relevance:

```typescript
import type { FormParadigm } from '@/src/types/exercises/paradigm';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { TableType } from '@/src/utils/schema-helpers';
import type { GeneratorFilters } from '@/src/types/exercises/base';

export const PARADIGM_STEPS: Readonly<Record<FormParadigm, readonly FormIdentificationStep[]>> = {
  'verb-conjugation': ['conjugation', 'tense', 'voice', 'mood', 'person', 'number'],
  'noun-declension': ['declension', 'case', 'number', 'gender'],
  'adjective-declension': ['declension', 'degree', 'gender', 'number', 'case'],
  'pronoun-personal': ['pronoun_type', 'person', 'case', 'number'],
  'pronoun-gendered': ['pronoun_type', 'gender', 'case', 'number'],
} as const;

export const PARADIGM_TABLE_TYPE: Readonly<Record<FormParadigm, TableType>> = {
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

type FilterKey = keyof Omit<GeneratorFilters, 'partOfSpeech'>;

export const PARADIGM_RELEVANT_FILTERS: Readonly<Record<FormParadigm, readonly FilterKey[]>> = {
  'verb-conjugation': ['verbConjugation', 'isDeponent', 'search'],
  'noun-declension': ['nounDeclension', 'search'],
  'adjective-declension': ['adjectiveDeclension', 'search'],
  'pronoun-personal': ['search'],
  'pronoun-gendered': ['pronounType', 'search'],
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

export function getParadigmPOS(paradigm: FormParadigm): PartOfSpeech {
  switch (paradigm) {
    case 'verb-conjugation':
      return 'verb';
    case 'noun-declension':
      return 'noun';
    case 'adjective-declension':
      return 'adjective';
    case 'pronoun-personal':
    case 'pronoun-gendered':
      return 'pronoun';
  }
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
    for (let i = 0; i < wordDocIds.length; i += 30) {
      const chunk = wordDocIds.slice(i, i + 30);
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
- **Shows only relevant filters per paradigm** using `PARADIGM_RELEVANT_FILTERS`

This component should:
- Accept `availableParadigms: FormParadigm[]`
- Accept `paradigmWordCounts?: Partial<Record<FormParadigm, number>>`
- Accept `paradigmConfigs: ParadigmConfigs`
- Accept `onUpdateParadigmConfig: (paradigm: FormParadigm, updates: Partial<ParadigmConfig>) => void`
- Accept `onToggleParadigm: (paradigm: FormParadigm, enabled: boolean) => void`
- Group pronoun paradigms under a "Pronouns" section header
- Use `PARADIGM_STEPS[paradigm]` to show only valid steps for each paradigm
- Use `PARADIGM_LABELS[paradigm]` for display names
- Use `PARADIGM_RELEVANT_FILTERS[paradigm]` to show only relevant filter controls

**FormSelectionTable Integration (CRITICAL):**

Each paradigm's form selection panel should render `FormSelectionTable` with props derived from paradigm:

```typescript
const getFormSelectionProps = (paradigm: FormParadigm) => {
  const pos = getParadigmPOS(paradigm);

  if (paradigm === 'pronoun-personal') {
    return { partOfSpeech: pos, pronounType: 'personal' as const, pronounPerson: '1st' as const };
  }
  if (paradigm === 'pronoun-gendered') {
    return { partOfSpeech: pos, pronounType: undefined, pronounPerson: undefined };
  }
  return { partOfSpeech: pos, pronounType: undefined, pronounPerson: undefined };
};
```

This ensures:
- `pronoun-personal` → `shouldUsePersonalPronounSchema()` returns true → PersonalPronounDeclensionTableSchema
- `pronoun-gendered` → `shouldUsePersonalPronounSchema()` returns false → AdjectiveDeclensionTableSchema
- Other POS types work unchanged (verb/noun/adjective)

**Form Selection Handlers (CRITICAL for clickable cells):**

Inside `MultiParadigmConfigSection`, use `useFormSelectionControls` hook for the active paradigm:

```typescript
const [activeParadigm, setActiveParadigm] = useState<FormParadigm | undefined>(availableParadigms[0]);

const currentConfig = activeParadigm ? paradigmConfigs[activeParadigm] : undefined;
const formSelectionProps = activeParadigm ? getFormSelectionProps(activeParadigm) : null;

const { handleToggleCell, handleTogglePaths, handleSelectAll, handleClearSelection } = useFormSelectionControls(
  formSelectionProps?.partOfSpeech,
  currentConfig?.formSelection,
  (formSelectionValue) => {
    if (activeParadigm) {
      onUpdateParadigmConfig(activeParadigm, { formSelection: formSelectionValue });
    }
  },
  formSelectionProps?.pronounType,
  formSelectionProps?.pronounPerson
);
```

Then pass handlers to `FormSelectionTable`:
```tsx
<FormSelectionTable
  partOfSpeech={formSelectionProps.partOfSpeech}
  pronounType={formSelectionProps.pronounType}
  pronounPerson={formSelectionProps.pronounPerson}
  selectedCellPaths={currentConfig?.formSelection?.selectedCellPaths || []}
  onToggleCell={handleToggleCell}
  onTogglePaths={handleTogglePaths}
  onSelectAll={handleSelectAll}
  onClearSelection={handleClearSelection}
/>
```

**Filter UI per paradigm:**
- verb-conjugation: Show verbConjugation dropdown, isDeponent toggle, search field
- noun-declension: Show nounDeclension dropdown, search field
- adjective-declension: Show adjectiveDeclension dropdown, search field
- pronoun-personal: Show search field ONLY (pronounType/pronounPerson implicit)
- pronoun-gendered: Show pronounType dropdown, search field

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

### 2. `/src/store/api/vocabularyPoolApi.ts`

Add `getPoolParadigmSummaryQuery` endpoint:

```typescript
import type { FormParadigm } from '@/src/types/exercises/paradigm';

interface ParadigmSummaryData {
  paradigmSummary: Partial<Record<FormParadigm, number>>;
  posSummary: Partial<Record<PartOfSpeech, number>>;
  totalWords: number;
  poolId: string;
}

// Add to endpoints:
getPoolParadigmSummary: builder.query<ParadigmSummaryData, string>({
  query: poolId => `/admin/vocabulary-pools/${poolId}/paradigm-summary`,
  transformResponse: (response: { success: boolean; data: ParadigmSummaryData }) => response.data,
  providesTags: (result, error, poolId) => [{ type: 'Pool', id: `${poolId}-paradigm-summary` }],
}),

// Update mutations to invalidate paradigm-summary:
addWordsToPool: builder.mutation<...>({
  // ...existing
  invalidatesTags: (result, error, { poolId }) => [
    { type: 'Pool', id: poolId },
    { type: 'Pool', id: `${poolId}-paradigm-summary` },  // ADD THIS
    { type: 'AvailableWords', id: 'LIST' },
  ],
}),

removeWordsFromPool: builder.mutation<...>({
  // ...existing
  invalidatesTags: (result, error, { poolId }) => [
    { type: 'Pool', id: poolId },
    { type: 'Pool', id: `${poolId}-paradigm-summary` },  // ADD THIS
    { type: 'AvailableWords', id: 'LIST' },
  ],
}),
```

Export the hook: `useGetPoolParadigmSummaryQuery`

### 3. `/src/store/api/advancedVocabularyApi.ts` (CRITICAL)

Add new `getMultiParadigmWords` endpoint for form-ID exercises:

```typescript
import type { FormParadigm, ParadigmConfigs, ParadigmConfig } from '@/src/types/exercises/paradigm';
import { PARADIGM_TABLE_TYPE, PARADIGM_POS_GROUP } from '@/src/config/paradigmDefinitions';

interface MultiParadigmQueryArgs {
  exerciseType: 'generated-form-identification';
  collection: string;
  wordSource: 'filters' | 'pool';
  poolId?: string | null;
  count?: number | 'all';
  paradigmConfigs: ParadigmConfigs;
}

// Add to endpoints:
getMultiParadigmWords: builder.query<GetAdvancedWordsResponse['data'], MultiParadigmQueryArgs>({
  async queryFn(arg, _api, _extraOptions, baseQuery) {
    const { exerciseType, collection, wordSource, poolId, count, paradigmConfigs } = arg;

    const enabledEntries = Object.entries(paradigmConfigs).filter(
      (entry): entry is [FormParadigm, ParadigmConfig] => {
        const [, cfg] = entry;
        return cfg?.enabled === true;
      }
    );

    if (enabledEntries.length === 0) {
      return { data: { words: [], hasMore: false, lastWordId: null, limit: null, filters: {}, collection } };
    }

    const additionalFields = getExerciseAdditionalFields(exerciseType);

    const results = await Promise.all(
      enabledEntries.map(async ([paradigm, cfg]) => {
        const pos = PARADIGM_POS_GROUP[paradigm];
        const tableType = PARADIGM_TABLE_TYPE[paradigm];

        const selectFields = composeSelectFields(additionalFields, {
          formSelection: cfg.formSelection,
        });

        const params = new URLSearchParams();
        params.append('collection', collection);
        params.append('wordType', pos);

        if (wordSource === 'pool') {
          params.append('fetchAll', 'true');
        } else if (count === 'all') {
          params.append('fetchAll', 'true');
        } else if (typeof count === 'number') {
          params.append('limit', String(count));
          params.append('randomStart', String(Math.random()));
        }

        if (cfg.formSelection?.selectedCellPaths && cfg.formSelection.selectedCellPaths.length > 0) {
          params.append('cellPaths', cfg.formSelection.selectedCellPaths.join(','));
        }
        if (tableType) {
          params.append('tableType', tableType);
        }
        if (selectFields.length > 0) {
          params.append('select', selectFields.join(','));
        }

        if (wordSource === 'pool' && poolId) {
          params.append('poolId', poolId);
          // Pool mode: words are filtered by paradigm client-side after fetch (see below)
        } else {
          // Filter mode: apply paradigm-specific implicit constraints + user filters
          if (paradigm === 'verb-conjugation') {
            if (cfg.filters.verbConjugation && cfg.filters.verbConjugation !== 'all') {
              params.append('verbConjugation', cfg.filters.verbConjugation);
            }
            if (cfg.filters.isDeponent && cfg.filters.isDeponent !== 'both') {
              params.append('isDeponent', cfg.filters.isDeponent);
            }
          } else if (paradigm === 'noun-declension') {
            if (cfg.filters.nounDeclension && cfg.filters.nounDeclension !== 'all') {
              params.append('nounDeclension', cfg.filters.nounDeclension);
            }
          } else if (paradigm === 'adjective-declension') {
            if (cfg.filters.adjectiveDeclension && cfg.filters.adjectiveDeclension !== 'all') {
              params.append('adjectiveDeclension', cfg.filters.adjectiveDeclension);
            }
          } else if (paradigm === 'pronoun-personal') {
            // Implicit: personal 1st/2nd only
            // Use 'in' query by passing comma-separated (requires server update below)
            params.append('pronounType', 'personal');
            params.append('pronounPerson', '1st,2nd');
          } else if (paradigm === 'pronoun-gendered') {
            // User can filter by pronounType
            if (cfg.filters.pronounType === 'personal') {
              // Personal 3rd only
              params.append('pronounType', 'personal');
              params.append('pronounPerson', '3rd');
            } else if (cfg.filters.pronounType && cfg.filters.pronounType !== 'all') {
              params.append('pronounType', cfg.filters.pronounType);
            } else {
              // All gendered pronouns: fetch all pronouns, filter client-side below
              params.append('excludePersonalFirstSecond', 'true');
            }
          }

          if (cfg.filters.search) {
            params.append('search', cfg.filters.search);
          }
        }

        return baseQuery({
          url: `/admin/words?${params.toString()}`,
        });
      })
    );

    const errorResult = results.find(r => r.error);
    if (errorResult?.error) {
      return { error: errorResult.error };
    }

    const allWords: VocabularyWordWithId[] = [];
    for (const result of results) {
      if (result.data) {
        const responseData = result.data as GetAdvancedWordsResponse;
        allWords.push(...responseData.data.words);
      }
    }

    const shuffled = shuffleArray(allWords);

    return {
      data: {
        words: shuffled,
        hasMore: false,
        lastWordId: null,
        limit: null,
        filters: {},
        collection,
      },
    };
  },
  serializeQueryArgs: ({ queryArgs }) => JSON.stringify(queryArgs),
  providesTags: [{ type: 'AdvancedWordList', id: 'MULTI_PARADIGM' }],
  keepUnusedDataFor: 60,
}),
```

Export: `useGetMultiParadigmWordsQuery`

### 4. `/src/app/api/admin/words/route.ts` (Server-side - REQUIRED)

**Update pronoun filtering to support comma-separated `pronounPerson` values:**

Find this existing code (around line 214):
```typescript
if (pronounPerson) {
  query = query.where('person', '==', pronounPerson);
}
```

Replace with:
```typescript
if (pronounPerson) {
  const persons = pronounPerson.split(',').map(p => p.trim());
  if (persons.length === 1) {
    query = query.where('person', '==', persons[0]);
  } else {
    query = query.where('person', 'in', persons);
  }
}
```

**Add support for `excludePersonalFirstSecond` param (for pronoun-gendered "all" case):**

Add after existing pronoun filtering:
```typescript
const excludePersonalFirstSecond = searchParams.get('excludePersonalFirstSecond') === 'true';
// Note: Firestore doesn't support != with compound queries easily
// For pronoun-gendered "all", we'll filter client-side in getMultiParadigmWords after fetch
// The param is a hint but actual filtering happens client-side
```

**Client-side filtering in `getMultiParadigmWords`** (add after collecting allWords):
```typescript
// Filter out personal 1st/2nd pronouns for pronoun-gendered paradigm when needed
const filteredWords = allWords.filter(word => {
  // Check if this word came from a pronoun-gendered query that requested excludePersonalFirstSecond
  if (word.part_of_speech === 'pronoun' &&
      word.pronoun_type === 'personal' &&
      (word.person === '1st' || word.person === '2nd')) {
    // Check if any enabled paradigm is pronoun-gendered with "all" filter
    const genderedConfig = paradigmConfigs['pronoun-gendered'];
    if (genderedConfig?.enabled && (!genderedConfig.filters.pronounType || genderedConfig.filters.pronounType === 'all')) {
      return false; // Exclude personal 1st/2nd from gendered "all"
    }
  }
  return true;
});
```

### 5. `/src/hooks/useFormIdentificationEditor.ts` (NEW)

Create a dedicated hook for form-ID exercises (don't modify the shared `useGeneratedExerciseEditor`):

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { produce } from 'immer';
import { useAppDispatch } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { useGetMultiParadigmWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { useAvailableParadigms } from '@/src/hooks/useAvailableParadigms';
import { useFormSelectionControls } from '@/src/hooks/useFormSelection';
import { ensureGeneratorConfig, DEFAULT_PARADIGM_FILTERS } from '@/src/utils/exercises/generatorConfigDefaults';
import { PARADIGM_STEPS, PARADIGM_TABLE_TYPE } from '@/src/config/paradigmDefinitions';
import { getParadigmPOS } from '@/src/utils/paradigm';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import type { FormParadigm, ParadigmConfig, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import type { GeneratorFilters, FormSelection } from '@/src/types/exercises/base';

export function useFormIdentificationEditor(editingContent: GeneratedFormIdentificationExercise) {
  const dispatch = useAppDispatch();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const rawConfig = editingContent.data?.generatorConfig;
  const config = useMemo(() => ensureGeneratorConfig(rawConfig), [rawConfig]);
  const isPoolWordSource = config.wordSource === 'pool';

  // Use the unified paradigm hook
  const paradigmInfo = useAvailableParadigms(
    config.wordSource,
    config.poolId || null,
    {} // Filters derived from paradigmConfigs, not global
  );

  // Active paradigm = single enabled paradigm if only one
  const activeParadigm = useMemo(() => {
    const paradigmConfigs = editingContent.data.paradigmConfigs ?? {};
    const enabledEntries = Object.entries(paradigmConfigs).filter(([, cfg]) => cfg?.enabled);
    if (enabledEntries.length === 1) {
      return enabledEntries[0][0] as FormParadigm;
    }
    return undefined;
  }, [editingContent.data.paradigmConfigs]);

  // Derive filters and form selection from active paradigm
  const derivedFilters = useMemo((): GeneratorFilters => {
    if (!activeParadigm) {
      return { partOfSpeech: 'all' };
    }
    const paradigmConfig = editingContent.data.paradigmConfigs?.[activeParadigm];
    const pos = getParadigmPOS(activeParadigm);
    return {
      partOfSpeech: pos,
      ...paradigmConfig?.filters,
    };
  }, [activeParadigm, editingContent.data.paradigmConfigs]);

  const derivedFormSelection = useMemo(() => {
    if (!activeParadigm) return undefined;
    return editingContent.data.paradigmConfigs?.[activeParadigm]?.formSelection;
  }, [activeParadigm, editingContent.data.paradigmConfigs]);

  // Preview query using paradigm-aware API
  const previewResult = useGetMultiParadigmWordsQuery(
    isPreviewOpen && editingContent.data.paradigmConfigs
      ? {
          exerciseType: 'generated-form-identification',
          collection: config.collection,
          wordSource: config.wordSource,
          poolId: config.poolId,
          count: config.count,
          paradigmConfigs: editingContent.data.paradigmConfigs,
        }
      : skipToken
  );

  const updateContent = useCallback(
    (updates: Partial<GeneratedFormIdentificationExercise>) => {
      dispatch(updateEditingContent({ ...editingContent, ...updates }));
    },
    [dispatch, editingContent]
  );

  const updateConfig = useCallback(
    (configUpdates: Partial<typeof config>) => {
      const nextContent = produce(editingContent, draft => {
        draft.data.generatorConfig = ensureGeneratorConfig({ ...rawConfig, ...configUpdates });
      });
      updateContent(nextContent);
    },
    [editingContent, rawConfig, updateContent]
  );

  const handleUpdateParadigmConfig = useCallback(
    (paradigm: FormParadigm, updates: Partial<ParadigmConfig>) => {
      const tableType = PARADIGM_TABLE_TYPE[paradigm];
      const defaultSteps = PARADIGM_STEPS[paradigm];

      const nextContent = produce(editingContent, draft => {
        if (!draft.data.paradigmConfigs) {
          draft.data.paradigmConfigs = {};
        }

        const currentConfig = draft.data.paradigmConfigs[paradigm] || {
          enabled: false,
          filters: {},
          formSelection: tableType ? { tableType, selectedCellPaths: [] } : undefined,
          steps: [...defaultSteps],
        };

        draft.data.paradigmConfigs[paradigm] = { ...currentConfig, ...updates };
      });
      updateContent(nextContent);
    },
    [editingContent, updateContent]
  );

  const handleToggleParadigm = useCallback(
    (paradigm: FormParadigm, enabled: boolean) => {
      handleUpdateParadigmConfig(paradigm, { enabled });
    },
    [handleUpdateParadigmConfig]
  );

  // Initialize paradigm configs when pool loads
  useEffect(() => {
    if (!isPoolWordSource || paradigmInfo.availableParadigms.length === 0) {
      return;
    }

    const currentConfigs = editingContent.data.paradigmConfigs ?? {};
    if (Object.keys(currentConfigs).length > 0) {
      return;
    }

    const initialConfigs: ParadigmConfigs = {};
    paradigmInfo.availableParadigms.forEach(paradigm => {
      const tableType = PARADIGM_TABLE_TYPE[paradigm];
      const defaultSteps = PARADIGM_STEPS[paradigm];
      initialConfigs[paradigm] = {
        enabled: false,
        filters: {},
        formSelection: tableType ? { tableType, selectedCellPaths: [] } : undefined,
        steps: [...defaultSteps],
      };
    });

    updateContent({
      data: { ...editingContent.data, paradigmConfigs: initialConfigs },
    });
  }, [isPoolWordSource, paradigmInfo.availableParadigms, editingContent.data, updateContent]);

  // Form selection controls
  const formSelectionControls = useFormSelectionControls(
    activeParadigm ? getParadigmPOS(activeParadigm) : undefined,
    derivedFormSelection,
    (formSelectionValue: FormSelection | undefined) => {
      if (!activeParadigm) return;
      handleUpdateParadigmConfig(activeParadigm, {
        formSelection: formSelectionValue,
      });
    },
    derivedFilters.pronounType,
    derivedFilters.pronounPerson
  );

  return {
    editingContent,
    config,
    activeParadigm,
    derivedFilters,
    derivedFormSelection,
    isPoolWordSource,
    isPreviewOpen,
    setIsPreviewOpen,
    paradigmInfo,
    updateContent,
    updateConfig,
    handleUpdateParadigmConfig,
    handleToggleParadigm,
    formSelectionControls,
    previewData: previewResult.data,
    isPreviewFetching: previewResult.isFetching,
  };
}
```

### 6. `/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx`

**Update to use new hook and unified component:**

```tsx
// Replace:
import { useGeneratedExerciseEditor } from '@/src/hooks/useGeneratedExerciseEditor';
import { MultiPosConfigSection } from './MultiPosConfigSection';
import { AVAILABLE_STEPS } from '@/src/config/formIdentificationSteps';

// With:
import { useFormIdentificationEditor } from '@/src/hooks/useFormIdentificationEditor';
import { MultiParadigmConfigSection } from './MultiParadigmConfigSection';

// In component:
const editor = useFormIdentificationEditor(editingContent);

// Replace the two separate blocks (lines 196-257) with one unified block:
{editor.paradigmInfo.availableParadigms.length > 0 && (
  <MultiParadigmConfigSection
    availableParadigms={editor.paradigmInfo.availableParadigms}
    paradigmWordCounts={editor.paradigmInfo.paradigmWordCounts}
    paradigmConfigs={editingContent.data.paradigmConfigs}
    onUpdateParadigmConfig={editor.handleUpdateParadigmConfig}
    onToggleParadigm={editor.handleToggleParadigm}
  />
)}
```

### 7. `/src/components/ui/exercises/generated-form-identification-exercise.tsx`

- Import `deriveParadigm` from `@/src/utils/paradigm`
- Replace `posConfigs[word.part_of_speech]` lookups with `paradigmConfigs[deriveParadigm(word.part_of_speech, word.pronoun_type, word.person)]`
- Remove `filterPronounSteps()` calls - paradigm config already has correct steps
- Remove import of `filterPronounSteps`

### 8. `/src/utils/contentFactory.ts`

Update form-ID default:

```typescript
case 'generated-form-identification':
  return {
    // ...existing
    data: {
      mode: 'step-by-step',
      generatorConfig: {
        collection: VOCABULARY_WORDS_COLLECTION,
        wordSource: 'filters',
        poolId: null,
        count: 5,
      },
      paradigmConfigs: {},  // Changed from posConfigs: {}
    },
  };
```

### 9. `/src/utils/exercises/formIdentificationHelpers.ts`

- Remove `filterPronounSteps()` function entirely

---

## Files to Keep (NOT delete)

These are used by translation exercises:

| File | Reason |
|------|--------|
| `/src/hooks/usePoolPOSSummary.ts` | Used by translation via `useGeneratedExerciseEditor` |
| `/src/components/ui/admin/content-editor/MultiPosConfigSection.tsx` | Used by `GeneratedTranslationEditor.tsx` |
| `/src/config/formIdentificationSteps.ts` | May still be useful, or can be deprecated later |
| `PosConfigs`, `PosGeneratorConfig` in `base.d.ts` | Used by translation types |

---

## Implementation Phases

### Phase 1: Foundation (Agent A)

1. Create `/src/types/exercises/paradigm.ts` - type definitions including filters
2. Create `/src/config/paradigmDefinitions.ts` - constants including PARADIGM_RELEVANT_FILTERS
3. Create `/src/utils/paradigm.ts` - utility functions including `getParadigmPOS`

**Verify:**
```bash
npx tsc --noEmit
```

### Phase 2: API Layer (Agent A)

1. Create `/src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts`
2. Update `/src/app/api/admin/words/route.ts` - add comma-separated pronounPerson support (REQUIRED)
3. Update `/src/store/api/vocabularyPoolApi.ts` - add paradigm summary endpoint + update invalidation tags
4. Update `/src/store/api/advancedVocabularyApi.ts` - add `getMultiParadigmWords` endpoint + client-side filtering

**Verify:**
```bash
npx tsc --noEmit
```

### Phase 3: Editor Layer (Agent B)

1. Update `/src/types/exercises/generated-form-identification.d.ts` - replace posConfigs with paradigmConfigs
2. Create `/src/hooks/useAvailableParadigms.ts`
3. Create `/src/hooks/useFormIdentificationEditor.ts` (NEW dedicated hook)
4. Create `/src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx`

**Verify:**
```bash
npx tsc --noEmit
```

### Phase 4: Integration (Agent B + Orchestrator)

**Agent B:**
1. Update `/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx`

**Orchestrator:**
1. Update `/src/components/ui/exercises/generated-form-identification-exercise.tsx`
2. Update `/src/utils/contentFactory.ts`
3. Update `/src/utils/exercises/formIdentificationHelpers.ts` - remove filterPronounSteps

**Verify:**
```bash
npx tsc --noEmit
```

### Phase 5: Cleanup (Orchestrator)

1. Remove `filterPronounSteps()` from formIdentificationHelpers.ts (if not done in Phase 4)
2. Verify no remaining `posConfigs` references in form-ID code paths
3. Keep translation-related code intact

**Final Verification:**
```bash
npx tsc --noEmit
npm run build 2>&1 | grep -v "warning"
```

---

## Agent Workload Split

### Agent A: Foundation + API

| File | Action |
|------|--------|
| `/src/types/exercises/paradigm.ts` | CREATE |
| `/src/config/paradigmDefinitions.ts` | CREATE |
| `/src/utils/paradigm.ts` | CREATE |
| `/src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts` | CREATE |
| `/src/store/api/vocabularyPoolApi.ts` | MODIFY |
| `/src/store/api/advancedVocabularyApi.ts` | MODIFY |

### Agent B: Editor + UI

| File | Action |
|------|--------|
| `/src/types/exercises/generated-form-identification.d.ts` | MODIFY |
| `/src/hooks/useAvailableParadigms.ts` | CREATE |
| `/src/hooks/useFormIdentificationEditor.ts` | CREATE |
| `/src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx` | CREATE |
| `/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx` | MODIFY |

### Orchestrator: Runtime + Cleanup

| File | Action |
|------|--------|
| `/src/components/ui/exercises/generated-form-identification-exercise.tsx` | MODIFY |
| `/src/utils/contentFactory.ts` | MODIFY |
| `/src/utils/exercises/formIdentificationHelpers.ts` | MODIFY |
| Type error fixes across all files | FIX |

---

## Critical Interface Contracts

### Contract 1: `ParadigmConfig` (includes filters)

```typescript
export interface ParadigmConfig {
  enabled: boolean;
  steps: FormIdentificationStep[];
  filters: Omit<GeneratorFilters, 'partOfSpeech'>;  // MUST INCLUDE
  formSelection?: {
    tableType: TableType;
    selectedCellPaths: string[];
  };
}
```

### Contract 2: Filter Relevance per Paradigm

```typescript
export const PARADIGM_RELEVANT_FILTERS: Readonly<Record<FormParadigm, readonly FilterKey[]>> = {
  'verb-conjugation': ['verbConjugation', 'isDeponent', 'search'],
  'noun-declension': ['nounDeclension', 'search'],
  'adjective-declension': ['adjectiveDeclension', 'search'],
  'pronoun-personal': ['search'],  // pronounType/pronounPerson implicit
  'pronoun-gendered': ['pronounType', 'search'],  // pronounPerson hidden
} as const;
```

### Contract 3: `getMultiParadigmWords` Query Shape

```typescript
interface MultiParadigmQueryArgs {
  exerciseType: 'generated-form-identification';
  collection: string;
  wordSource: 'filters' | 'pool';
  poolId?: string | null;
  count?: number | 'all';
  paradigmConfigs: ParadigmConfigs;  // NOT posConfigs
}
```

### Contract 4: `useFormIdentificationEditor` Return Type

```typescript
{
  // ... common fields
  activeParadigm: FormParadigm | undefined;  // NOT activePOS
  paradigmInfo: UseAvailableParadigmsReturn;  // NOT posSummary
  handleUpdateParadigmConfig: (paradigm: FormParadigm, updates: Partial<ParadigmConfig>) => void;
  handleToggleParadigm: (paradigm: FormParadigm, enabled: boolean) => void;
  // NO handleUpdatePosConfig, handleTogglePOS
}
```

---

## Potential Problems & Mitigations

### Problem 1: Pronoun filtering complexity

**Risk**: `pronoun-gendered` with `pronounType='all'` needs to fetch all pronouns EXCEPT personal 1st/2nd.

**Mitigation**:
- Option A: Add `paradigm` param to `/api/admin/words` route for server-side filtering
- Option B: Make multiple queries in `getMultiParadigmWords` and merge results
- Option C: Fetch all pronouns, filter client-side (less efficient)

**Recommendation**: Option A (server-side) for clean separation.

### Problem 2: FormSelectionTable expects partOfSpeech

**Risk**: `FormSelectionTable` takes `partOfSpeech` prop, not `paradigm`.

**Mitigation**:
- Use `getParadigmPOS(paradigm)` to derive POS
- FormSelectionTable already handles pronounType/pronounPerson for table type selection
- PARADIGM_TABLE_TYPE gives correct table type per paradigm

### Problem 3: Translation exercises must keep working

**Risk**: Accidentally breaking translation by modifying shared code.

**Mitigation**:
- Create NEW `useFormIdentificationEditor` hook instead of modifying shared hook
- Keep `MultiPosConfigSection` for translation
- Keep `usePoolPOSSummary` for translation
- Test translation exercises after changes

### Problem 4: Filter UI needs paradigm-specific rendering

**Risk**: Showing wrong filter controls for a paradigm.

**Mitigation**:
- Use `PARADIGM_RELEVANT_FILTERS[paradigm]` to conditionally render filter controls
- For pronoun-personal: only show search field
- For pronoun-gendered: show pronounType dropdown (with special handling for "personal" option)

---

## Success Criteria

1. `npx tsc --noEmit` passes with zero errors
2. `npm run build` completes without errors
3. Form-ID editor shows correct steps per paradigm
4. Form-ID editor shows correct filter controls per paradigm
5. Form-ID editor shows correct form selection table per paradigm
6. Both filters mode and pool mode use unified `MultiParadigmConfigSection`
7. Translation exercises continue working unchanged
8. No `filterPronounSteps()` calls in form-ID code paths
9. Preview fetches words correctly for each enabled paradigm

---

---

# DETAILED MULTI-AGENT EXECUTION STRATEGY

---

## Agent Architecture

| Role | Model | Primary Responsibility |
|------|-------|------------------------|
| **Orchestrator** | Claude Opus 4.5 (Main) | Coordination, type checking, fixing errors, runtime changes, cleanup |
| **Agent A** | Claude Opus (nextjs-firebase-executor) | Foundation layer: types, utils, API route, RTK Query endpoint |
| **Agent B** | Claude Opus (nextjs-firebase-executor) | Editor layer: hooks, components, UI modifications |

---

## Detailed File Ownership

### Agent A Files (Foundation + API)

| File | Action | Dependencies | Notes |
|------|--------|--------------|-------|
| `/src/types/exercises/paradigm.ts` | CREATE | `FormIdentificationStep`, `TableType`, `GeneratorFilters` | **CRITICAL**: Foundation type with filters |
| `/src/config/paradigmDefinitions.ts` | CREATE | `paradigm.ts` types | Constants including PARADIGM_RELEVANT_FILTERS |
| `/src/utils/paradigm.ts` | CREATE | `paradigm.ts` types, `enums`, `GeneratorFilters` | Pure functions including getParadigmPOS |
| `/src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts` | CREATE | `paradigm.ts`, `paradigm.ts` utils | Server-side only, sync params |
| `/src/app/api/admin/words/route.ts` | MODIFY | None | Add comma-separated pronounPerson support |
| `/src/store/api/vocabularyPoolApi.ts` | MODIFY | `paradigm.ts` types | Add endpoint + update invalidation tags |
| `/src/store/api/advancedVocabularyApi.ts` | MODIFY | `paradigm.ts`, `paradigmDefinitions.ts` | Add `getMultiParadigmWords` endpoint + client-side filtering |

### Agent B Files (Editor + UI)

| File | Action | Dependencies | Notes |
|------|--------|--------------|-------|
| `/src/types/exercises/generated-form-identification.d.ts` | MODIFY | `paradigm.ts` types | Change `posConfigs` → `paradigmConfigs` |
| `/src/hooks/useAvailableParadigms.ts` | CREATE | `vocabularyPoolApi.ts`, `paradigm.ts` utils | **CRITICAL**: Depends on Agent A's RTK Query endpoint |
| `/src/hooks/useFormIdentificationEditor.ts` | CREATE | `useAvailableParadigms`, `advancedVocabularyApi` | NEW dedicated hook (don't modify shared hook) |
| `/src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx` | CREATE | `paradigm.ts`, `paradigmDefinitions.ts` | Use PARADIGM_RELEVANT_FILTERS for filter UI |
| `/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx` | MODIFY | `useFormIdentificationEditor`, `MultiParadigmConfigSection` | Remove dual code paths |

### Orchestrator Files (Runtime + Cleanup)

| File | Action | Dependencies | Notes |
|------|--------|--------------|-------|
| `/src/components/ui/exercises/generated-form-identification-exercise.tsx` | MODIFY | `paradigm.ts` utils | Use deriveParadigm for lookups |
| `/src/utils/contentFactory.ts` | MODIFY | None | Change posConfigs → paradigmConfigs |
| `/src/utils/exercises/formIdentificationHelpers.ts` | MODIFY | None | Remove `filterPronounSteps` |
| Type error fixes across all files | FIX | All | After each phase |

---

## Execution Timeline (Detailed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Foundation Types (Agent A)                                          │
│ Duration: ~5-10 minutes                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Agent A creates:                                                            │
│   1. /src/types/exercises/paradigm.ts (with filters field!)                 │
│   2. /src/config/paradigmDefinitions.ts (with PARADIGM_RELEVANT_FILTERS!)   │
│   3. /src/utils/paradigm.ts (with getParadigmPOS!)                          │
│                                                                             │
│ Orchestrator waits, then runs: npx tsc --noEmit                             │
│ Orchestrator fixes any type errors in Agent A's files                       │
│                                                                             │
│ ✓ CHECKPOINT: Types compile cleanly                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: API Layer (Agent A)                                                 │
│ Duration: ~15-20 minutes                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Agent A creates/modifies:                                                   │
│   1. /src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts │
│      - Use synchronous params: `{ params }: { params: { poolId: string } }` │
│      - Use batch size of 30                                                 │
│   2. /src/app/api/admin/words/route.ts                                      │
│      - Add comma-separated pronounPerson support (use 'in' query)           │
│   3. /src/store/api/vocabularyPoolApi.ts                                    │
│      - Add getPoolParadigmSummary endpoint                                  │
│      - Update addWordsToPool/removeWordsFromPool invalidation tags          │
│   4. /src/store/api/advancedVocabularyApi.ts                                │
│      - Add getMultiParadigmWords endpoint (CRITICAL!)                       │
│      - Fan out by paradigm, not POS                                         │
│      - Handle pronoun filtering per paradigm                                │
│      - Add client-side filtering for pronoun-gendered "all"                 │
│                                                                             │
│ Orchestrator waits, then runs: npx tsc --noEmit                             │
│ Orchestrator fixes any type errors                                          │
│                                                                             │
│ ✓ CHECKPOINT: API endpoints compile, RTK Query hooks exported               │
├─────────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: Editor Layer (Agent B)                                              │
│ Duration: ~20-30 minutes                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Agent B creates/modifies:                                                   │
│   1. /src/types/exercises/generated-form-identification.d.ts                │
│      - Change posConfigs → paradigmConfigs                                  │
│   2. /src/hooks/useAvailableParadigms.ts                                    │
│   3. /src/hooks/useFormIdentificationEditor.ts (NEW - don't modify shared!) │
│   4. /src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx │
│      - Use PARADIGM_RELEVANT_FILTERS for filter UI per paradigm             │
│      - Show correct filters for each paradigm                               │
│                                                                             │
│ Orchestrator waits, then runs: npx tsc --noEmit                             │
│ Orchestrator fixes type errors (expect many due to paradigmConfigs change)  │
│                                                                             │
│ ✓ CHECKPOINT: New components compile                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: Integration (Agent B + Orchestrator in parallel)                    │
│ Duration: ~15-25 minutes                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Agent B modifies:                                                           │
│   1. /src/components/ui/admin/content-editor/                               │
│      GeneratedFormIdentificationEditor.tsx                                  │
│      - Use useFormIdentificationEditor hook                                 │
│      - Use MultiParadigmConfigSection                                       │
│      - Remove dual code paths                                               │
│                                                                             │
│ Orchestrator modifies (IN PARALLEL - different files):                      │
│   1. /src/components/ui/exercises/                                          │
│      generated-form-identification-exercise.tsx                             │
│      - Use deriveParadigm for paradigmConfigs lookups                       │
│      - Remove filterPronounSteps calls                                      │
│   2. /src/utils/contentFactory.ts                                           │
│      - Change posConfigs: {} to paradigmConfigs: {}                         │
│   3. /src/utils/exercises/formIdentificationHelpers.ts                      │
│      - Remove filterPronounSteps function                                   │
│                                                                             │
│ Orchestrator then runs: npx tsc --noEmit                                    │
│ Orchestrator fixes ALL remaining type errors                                │
│                                                                             │
│ ✓ CHECKPOINT: Full type check passes                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ PHASE 5: Verification (Orchestrator only)                                    │
│ Duration: ~5 minutes                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Orchestrator:                                                               │
│   1. Verify no posConfigs references in form-ID code paths                  │
│   2. Verify translation exercises still work (posConfigs intact)            │
│   3. Verify MultiPosConfigSection.tsx NOT deleted                           │
│   4. Verify usePoolPOSSummary.ts NOT deleted                                │
│                                                                             │
│ Final verification:                                                         │
│   npx tsc --noEmit                                                          │
│   npm run build 2>&1 | grep -v "warning"                                    │
│                                                                             │
│ ✓ CHECKPOINT: Build passes, translation still works                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Coordination Rules

1. **Agent A completes before Agent B starts Phase 3** - Agent B needs types + API from Agent A
2. **No file conflicts** - Each agent works on distinct file sets
3. **Orchestrator runs tsc after each phase** - Catches integration issues early
4. **Agents do NOT add comments** - Per code style requirements
5. **DO NOT DELETE shared components** - Translation needs them
6. **Create NEW hook, don't modify shared** - useFormIdentificationEditor is new

---

## Agent Prompt Templates

### Agent A Prompt (Phase 1 + 2)

```
You are implementing Phase 1 and Phase 2 of a paradigm-based architecture refactor for Form Identification exercises only.

READ THE PLAN: /home/harry/Documents/chris/latin-app/docs/plan2.md

CODE STYLE: NO COMMENTS. No JSDoc. No inline comments. Self-documenting code only.

PHASE 1 - Create these files:
1. /src/types/exercises/paradigm.ts
   - FormParadigm type
   - ParadigmConfig interface WITH filters field: `filters: Omit<GeneratorFilters, 'partOfSpeech'>`
   - ParadigmConfigs type

2. /src/config/paradigmDefinitions.ts
   - PARADIGM_STEPS
   - PARADIGM_TABLE_TYPE
   - PARADIGM_LABELS
   - PARADIGM_POS_GROUP
   - PARADIGM_RELEVANT_FILTERS (maps paradigm to relevant filter keys)

3. /src/utils/paradigm.ts
   - deriveParadigm()
   - getParadigmsForPOS()
   - getParadigmsFromFilters()
   - isPronounParadigm()
   - getParadigmPOS()

PHASE 2 - Create/modify these files:
1. CREATE /src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts
   - Use synchronous params: `{ params }: { params: { poolId: string } }`
   - Use batch size of 30 (not 10)

2. MODIFY /src/app/api/admin/words/route.ts
   - Update pronounPerson filtering to support comma-separated values
   - Use Firestore 'in' query for multiple values: `query.where('person', 'in', persons)`

3. MODIFY /src/store/api/vocabularyPoolApi.ts
   - Add getPoolParadigmSummary endpoint
   - Export useGetPoolParadigmSummaryQuery hook
   - Update addWordsToPool and removeWordsFromPool to invalidate paradigm-summary tag

4. MODIFY /src/store/api/advancedVocabularyApi.ts
   - Add getMultiParadigmWords endpoint (see plan for full implementation)
   - Fan out by paradigm with correct filters per paradigm
   - Handle pronoun-personal vs pronoun-gendered filtering
   - Add client-side filtering for pronoun-gendered "all" case
   - Export useGetMultiParadigmWordsQuery

Reference existing files for patterns:
- /src/store/api/vocabularyPoolApi.ts
- /src/store/api/advancedVocabularyApi.ts
- /src/utils/schema-helpers.ts
- /shared/types/vocabulary/schemas/enums.ts

CRITICAL: Match the exact interface contracts specified in the plan.
```

### Agent B Prompt (Phase 3 + 4)

```
You are implementing Phase 3 and Phase 4 of a paradigm-based architecture refactor for Form Identification exercises only.

READ THE PLAN: /home/harry/Documents/chris/latin-app/docs/plan2.md

CODE STYLE: NO COMMENTS. No JSDoc. No inline comments. Self-documenting code only.

PREREQUISITE: Agent A has completed Phase 1-2. The following now exist:
- /src/types/exercises/paradigm.ts (FormParadigm, ParadigmConfig with filters)
- /src/config/paradigmDefinitions.ts (PARADIGM_STEPS, PARADIGM_RELEVANT_FILTERS, etc.)
- /src/utils/paradigm.ts (deriveParadigm, getParadigmPOS, etc.)
- /src/store/api/vocabularyPoolApi.ts has useGetPoolParadigmSummaryQuery
- /src/store/api/advancedVocabularyApi.ts has useGetMultiParadigmWordsQuery

PHASE 3 - Create/modify these files:
1. MODIFY /src/types/exercises/generated-form-identification.d.ts
   - Replace posConfigs with paradigmConfigs

2. CREATE /src/hooks/useAvailableParadigms.ts
   - Unified hook for both filters and pool modes

3. CREATE /src/hooks/useFormIdentificationEditor.ts
   - NEW dedicated hook for form-ID (DO NOT modify useGeneratedExerciseEditor!)
   - Use useAvailableParadigms
   - Use useGetMultiParadigmWordsQuery for preview
   - Return paradigmInfo, handleUpdateParadigmConfig, handleToggleParadigm

4. CREATE /src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx
   - Based on existing MultiPosConfigSection.tsx structure (DO NOT delete that file!)
   - Use PARADIGM_STEPS, PARADIGM_TABLE_TYPE, PARADIGM_LABELS
   - Use PARADIGM_RELEVANT_FILTERS to show correct filter controls per paradigm
   - Include drag-and-drop step reordering

PHASE 4 - Modify this file:
1. /src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx
   - Replace useGeneratedExerciseEditor with useFormIdentificationEditor
   - Replace MultiPosConfigSection with MultiParadigmConfigSection
   - Remove dual code paths (filters vs pool)
   - Use unified MultiParadigmConfigSection for both modes

Reference existing files:
- /src/components/ui/admin/content-editor/MultiPosConfigSection.tsx (structure to mirror, DO NOT DELETE)
- /src/hooks/usePoolPOSSummary.ts (pattern reference, DO NOT DELETE)
- /src/hooks/useGeneratedExerciseEditor.ts (DO NOT MODIFY - translation uses it)

CRITICAL:
- Match the exact interface contracts specified in the plan
- DO NOT delete or modify files used by translation exercises
- Create NEW files instead of modifying shared ones
```

---

## Orchestrator Checklist

### After Phase 1
- [ ] Run `npx tsc --noEmit`
- [ ] Verify `/src/types/exercises/paradigm.ts` exports `FormParadigm`, `ParadigmConfig` (with filters!), `ParadigmConfigs`
- [ ] Verify `/src/config/paradigmDefinitions.ts` exports all constants including `PARADIGM_RELEVANT_FILTERS`
- [ ] Verify `/src/utils/paradigm.ts` exports all functions including `getParadigmPOS`

### After Phase 2
- [ ] Run `npx tsc --noEmit`
- [ ] Verify API route uses synchronous `{ params }` pattern (matching existing routes)
- [ ] Verify batch size is 30
- [ ] Verify `useGetPoolParadigmSummaryQuery` is exported
- [ ] Verify `useGetMultiParadigmWordsQuery` is exported
- [ ] Verify pool mutations invalidate paradigm-summary tag

### After Phase 3
- [ ] Run `npx tsc --noEmit`
- [ ] Expect type errors in GeneratedFormIdentificationEditor (paradigmConfigs references)
- [ ] Verify `useAvailableParadigms` matches contract
- [ ] Verify `useFormIdentificationEditor` is NEW file (not modified shared hook)
- [ ] Verify `MultiParadigmConfigSection` uses PARADIGM_RELEVANT_FILTERS

### After Phase 4
- [ ] Run `npx tsc --noEmit`
- [ ] Fix all type errors
- [ ] Verify GeneratedFormIdentificationEditor uses new hook and component

### After Phase 5 (Verification)
- [ ] Run `grep -r "posConfigs" src/components/ui/exercises/generated-form-identification` - should find nothing
- [ ] Run `grep -r "filterPronounSteps" src/` - should find nothing in form-ID paths
- [ ] Verify these files still exist (translation needs them):
  - [ ] `/src/hooks/usePoolPOSSummary.ts`
  - [ ] `/src/components/ui/admin/content-editor/MultiPosConfigSection.tsx`
  - [ ] `/src/hooks/useGeneratedExerciseEditor.ts`
- [ ] Run `npx tsc --noEmit`
- [ ] Run `npm run build 2>&1 | grep -v "warning"`
- [ ] Verify no errors

---

## Risk Summary

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Type dependency chain breakage | High | Medium | Strict interface contracts, checkpoints |
| Next.js params sync pattern | Medium | Low | Use synchronous `{ params }` pattern (not Promise) |
| RTK Query cache invalidation | Medium | High | Update mutation invalidation tags |
| Breaking translation exercises | High | Medium | Create NEW files, don't modify shared |
| Shared hook modification | High | Medium | Create useFormIdentificationEditor, don't touch useGeneratedExerciseEditor |
| Missing filters in ParadigmConfig | High | High | Explicitly include `filters` field in type |
| Wrong filter UI per paradigm | Medium | Medium | Use PARADIGM_RELEVANT_FILTERS constant |
| advancedVocabularyApi not updated | High | Medium | First-class phase, explicit in plan |
| Pronoun filtering complexity | Medium | High | Server-side paradigm param or multiple queries |
| contentFactory.ts forgotten | Medium | Medium | Explicit in orchestrator tasks |

---

## Files Summary

### Files to CREATE
| File | Owner |
|------|-------|
| `/src/types/exercises/paradigm.ts` | Agent A |
| `/src/config/paradigmDefinitions.ts` | Agent A |
| `/src/utils/paradigm.ts` | Agent A |
| `/src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts` | Agent A |
| `/src/hooks/useAvailableParadigms.ts` | Agent B |
| `/src/hooks/useFormIdentificationEditor.ts` | Agent B |
| `/src/components/ui/admin/content-editor/MultiParadigmConfigSection.tsx` | Agent B |

### Files to MODIFY
| File | Owner |
|------|-------|
| `/src/app/api/admin/words/route.ts` | Agent A |
| `/src/store/api/vocabularyPoolApi.ts` | Agent A |
| `/src/store/api/advancedVocabularyApi.ts` | Agent A |
| `/src/types/exercises/generated-form-identification.d.ts` | Agent B |
| `/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx` | Agent B |
| `/src/components/ui/exercises/generated-form-identification-exercise.tsx` | Orchestrator |
| `/src/utils/contentFactory.ts` | Orchestrator |
| `/src/utils/exercises/formIdentificationHelpers.ts` | Orchestrator |

### Files to KEEP (DO NOT DELETE)
| File | Reason |
|------|--------|
| `/src/hooks/usePoolPOSSummary.ts` | Translation uses it |
| `/src/hooks/useGeneratedExerciseEditor.ts` | Translation uses it |
| `/src/components/ui/admin/content-editor/MultiPosConfigSection.tsx` | Translation uses it |
| `/src/config/formIdentificationSteps.ts` | May be useful, deprecate later |
| `PosConfigs`, `PosGeneratorConfig` in `base.d.ts` | Translation types |
