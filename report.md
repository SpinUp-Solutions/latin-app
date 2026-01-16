# AI Autofill Zod Validation Bug Report

## Issue Summary

**Error Message:** `invalid input expected array, received string`

**When it occurs:** AI autocomplete on verbs (or other word types) that already have existing data for array fields like `principal_parts` or `definitions`.

**Severity:** Medium - Causes autocomplete to fail for words with certain existing data patterns.

---

## Root Cause Analysis

### The Bug Location

**File:** `shared/openai/autocomplete.ts`
**Function:** `mergeValue()` (lines 169-198)

### Problem Description

The `mergeValue` function fails to handle **type mismatches** between existing data and incoming AI-generated data. When existing data contains a **string** where an **array** is expected (due to legacy data or manual entry), the function incorrectly preserves the malformed string instead of using the correctly-typed array from the AI response.

---

## Detailed Flow Analysis

### Step 1: Loading Existing Data

When a verb is loaded, `toFormDefaultValues()` is called:

```typescript
// src/types/vocabulary/form-schemas/builder.ts:127
principal_parts: word.principal_parts ?? [],
```

If `word.principal_parts` in Firestore is stored as a string (e.g., `"amō, amāre, amāvī, amātum"`), it passes through unchanged because it's not `null` or `undefined`.

### Step 2: Passing to AI Autocomplete

In `WordEditPanel.tsx:614`, form values are passed to the AI autocomplete:

```typescript
existingData={form.getValues() as Partial<VocabularyWord>}
```

The string value is included in `existingData.principal_parts`.

### Step 3: The Merge Logic Fails

In `mergeValue()`:

```typescript
// Line 174 - Only enters if BOTH are arrays
if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
  // Array merge logic - SKIPPED because existingValue is a string
}

// Falls through to line 197
return shouldOverwrite(existingValue, overwriteExisting) ? incomingValue : existingValue;
```

### Step 4: shouldOverwrite Returns False

```typescript
// existingValue = "amō, amāre, amāvī, amātum" (string)
shouldOverwrite(existingValue, false)
  → isValueEmpty("amō, amāre, amāvī, amātum")
  → false (string is not empty)
```

**Result:** Returns the malformed string instead of the correct array.

### Step 5: Zod Validation Fails

The returned data contains:
```typescript
{
  principal_parts: "amō, amāre, amāvī, amātum"  // string
}
```

But the schema expects:
```typescript
{
  principal_parts: [
    { full_form: "amō", shortened_form: "amō" },
    { full_form: "amāre", shortened_form: "-āre" },
    // ...
  ]  // array of WordForm objects
}
```

**Error:** `invalid input expected array, received string`

---

## Affected Fields

Any field defined as an array in the schema could be affected:

| Field | Schema Definition | Location |
|-------|------------------|----------|
| `principal_parts` | `z.array(WordFormSchema).nullable()` | `shared/types/vocabulary/schemas/verb.ts:10` |
| `definitions` | `z.array(z.string())` | `shared/types/vocabulary/schemas/base-word.ts:10` |

---

## Files Involved

| File | Role |
|------|------|
| `shared/openai/autocomplete.ts` | Contains the buggy `mergeValue()` function |
| `src/components/ui/admin/vocabulary/WordEditPanel.tsx` | Passes `form.getValues()` as existingData |
| `src/types/vocabulary/form-schemas/builder.ts` | Transforms word data to form values |
| `shared/types/vocabulary/schemas/verb.ts` | Defines `principal_parts` schema |
| `shared/types/vocabulary/schemas/base-word.ts` | Defines `definitions` schema |

---

## Proposed Fix

### Location
`shared/openai/autocomplete.ts`, line 173 (before the array merge logic)

### Code Change

```typescript
function mergeValue(existingValue: unknown, incomingValue: unknown, overwriteExisting?: boolean): unknown {
  if (overwriteExisting) {
    return incomingValue;
  }

  // FIX: Handle type mismatch - if incoming is an array but existing is not,
  // prefer the correctly-typed incoming value. This handles legacy/malformed
  // data where a string was stored instead of an array.
  if (Array.isArray(incomingValue) && !Array.isArray(existingValue)) {
    return incomingValue;
  }

  if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
    if (existingValue.length === 0) {
      return incomingValue;
    }
    // ... rest of existing array merge logic
  }

  // ... rest of existing function
}
```

### Why This Fix Works

1. **Detects type mismatch:** Checks if incoming value is an array but existing is not
2. **Prefers correct type:** Returns the AI-generated array instead of preserving malformed data
3. **Non-breaking:** Only affects cases where types don't match; normal array-to-array merging is unchanged
4. **Defensive:** Prevents Zod validation errors from type mismatches

---

## Testing Recommendations

1. **Test with legacy verb data:** Find or create a verb where `principal_parts` is stored as a string in Firestore
2. **Test AI autocomplete:** Trigger autocomplete and verify it succeeds
3. **Verify data integrity:** Check that the returned data has properly-typed arrays
4. **Test normal flow:** Ensure verbs with correctly-typed array data still merge properly

---

## Additional Considerations

### Data Migration (Optional)

Consider a one-time data migration to fix any existing malformed data in Firestore:

```typescript
// Pseudocode for migration
for each word in vocabulary:
  if typeof word.principal_parts === 'string':
    word.principal_parts = parseStringToWordFormArray(word.principal_parts)
  if typeof word.definitions === 'string':
    word.definitions = word.definitions.split(',').map(s => s.trim())
```

### Input Validation (Optional)

Add validation at the form level to prevent string data from being saved where arrays are expected:

```typescript
// In toFormDefaultValues or similar
principal_parts: Array.isArray(word.principal_parts)
  ? word.principal_parts
  : [],
```

---

## Report Generated

**Date:** 2026-01-16
**Branch:** feature/bug-fixes
**Investigated by:** Claude Code
