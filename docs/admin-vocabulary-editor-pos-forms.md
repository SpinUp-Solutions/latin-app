# Admin Vocabulary Editor: POS‑specific Zod‑driven Forms (Implementation Spec)

## Context
- Right‑panel editor (`src/components/ui/admin/vocabulary/WordEditPanel.tsx`) hides complex editors when data is null or missing, so fields like verb principal parts and participles are not editable if absent.
- Target collection is `vocabulary_words_v2`. Client must read/write that collection via the existing API.
- RTK Query endpoints: `src/store/api/vocabularyApi.ts` (`getWords`, `getWordTypeCounts`, `updateWord`) call `/api/admin/words`; backend route is `src/app/api/admin/words/route.ts` and supports a `collection` parameter. Timestamps are normalized for Zod there.
- Zod schemas define the domain under `src/types/vocabulary/schemas/*`.
- Redux slice for filters is `src/store/slices/vocabularySlice.ts`.

## Goals
1) Always render editors for all fields relevant to a word’s `part_of_speech`, even when values are null or missing.
2) Use React Hook Form with Zod resolver for client‑side validation that mirrors the domain schemas.
3) Implement POS‑specific forms and a type‑driven renderer.
4) Keep strict typing across TS.

## Special instructions
- Do not use `any`.
- Do not use `unknown`.
- Do not add in‑code comments.

## Deliverables
- New form components:
  - `src/components/ui/admin/vocabulary/forms/BaseWordForm.tsx`
  - `src/components/ui/admin/vocabulary/forms/NounForm.tsx`
  - `src/components/ui/admin/vocabulary/forms/PronounForm.tsx`
  - `src/components/ui/admin/vocabulary/forms/AdjectiveForm.tsx`
  - `src/components/ui/admin/vocabulary/forms/VerbForm.tsx`
  - `src/components/ui/admin/vocabulary/forms/IndeclinableForm.tsx`
- Optional editors:
  - `src/components/ui/admin/vocabulary/forms/PrincipalPartsEditor.tsx` (array editor of WordForm)
  - `src/components/ui/admin/vocabulary/forms/WordFormInput.tsx` (pair of inputs)
- New form schemas (Zod): `src/types/vocabulary/form-schemas/*` (per POS + base) tailored for forms (exclude server‑only fields; allow optional/nullable where the UI permits empty).
- Update `WordEditPanel.tsx` to render BaseWordForm + the POS‑specific form based on `part_of_speech`.
- Update `ConjugationTable.tsx` to make participles editable via TableCell pathing.

## Data model and validation
- Reference domain schemas in `src/types/vocabulary/schemas/`:
  - Base: `base-word.ts`
  - Noun: `noun.ts` (includes `nominative_singular`, `genitive_singular`, `declension_table`)
  - Verb: `verb.ts` (includes `conjugation`, `conjugation_table`, `principal_parts`, `is_deponent`)
  - Declensions: `declension.ts`
  - Conjugations: `verb-conjugation.ts`
  - WordForm: `word-form.ts` (`{ full_form: string; shortened_form: string }`)
- Types are re‑exported under `src/types/vocabulary/vocabulary-new.d.ts`.

## RTK Query and slice
- Slice `src/store/slices/vocabularySlice.ts` supplies `filters.wordType` and `filters.search`. Leave as‑is.
- Ensure the admin page passes `collection=vocabulary_words_v2` to:
  - `useGetWordsQuery({ ..., collection: 'vocabulary_words_v2' })`
  - `useGetWordTypeCountsQuery({ collection: 'vocabulary_words_v2' })`
  - `useUpdateWordMutation` payload includes `{ collection: 'vocabulary_words_v2' }`
- Backend `/api/admin/words` already accepts `?collection` and returns timestamps as `{ seconds, nanoseconds }`.

## Architecture
- In `WordEditPanel`, select and render a Base form plus POS‑specific form component by `word.part_of_speech`:
  - BaseWordForm: shared fields for all POS (word, translation, definitions, etymology, pronunciation, type, alternate_form).
  - NounForm: gender, declension, `nominative_singular` (WordForm), `genitive_singular` (WordForm), DeclensionTable editor.
  - PronounForm: pronoun_type, DeclensionTable editor.
  - AdjectiveForm: declension, AdjectiveDeclensionTable editor.
  - VerbForm: conjugation, is_deponent, PrincipalPartsEditor (array of WordForm), Conjugation editor (indicative, subjunctive, imperative), non‑finite (infinitives, participles, gerund, supine) all editable.
  - IndeclinableForm: fields specific to adverb/preposition/conjunction/interjection (minimal editors; preposition may include case selection if available).

## Form schemas (form‑friendly)
- Create per‑POS form schemas under `src/types/vocabulary/form-schemas/` that reuse enums and structures from the domain schemas and narrow them for form editing:
  - BaseWordFormSchema: requires non‑empty `word` and `translation`; accepts `definitions: string[]`; includes `type` and optional `alternate_form`, `etymology`, `pronunciation`.
  - NounFormSchema: optional `gender`, optional `declension` (form may allow blank initial), `nominative_singular` and `genitive_singular` as optional/nullable WordForm, `declension_table` optional.
  - PronounFormSchema: `pronoun_type` optional, `declension_table` optional.
  - AdjectiveFormSchema: optional `declension`, `adjective_declension_table` optional.
  - VerbFormSchema: optional `conjugation`, optional `is_deponent`, optional `principal_parts` as `WordForm[]`, optional `conjugation_table`.
- For default values used by React Hook Form:
  - Noun/Pronoun: `declension_table` defaults to `{}` to render the table.
  - Adjective: `adjective_declension_table` defaults to `{}`.
  - Verb: `conjugation_table` defaults to `{}`; `principal_parts` defaults to `[]`.
  - Noun singular forms: default to `{ full_form: '', shortened_form: '' }` for editing.

## Editor behaviors
- Use React Hook Form with zodResolver in each POS form. Initialize `defaultValues` with the defaults above so editors render even if the persisted field is null or missing.
- Reuse `TableCell` and `updateTableCell` from `src/utils/vocabUtils.ts` for tables. For conjugation and participles, use `TABLE_TYPES.CONJUGATION` with nested paths, for example:
  - `nonFinite.participle.perfect_passive.nominative.masculine.singular`
- Do not precreate full nested shapes; rely on `updateTableCell` to deep‑create objects on first edit.
- PrincipalPartsEditor: dynamic list UI of `WordForm` rows with add/remove and two inputs per row. Bind to `principal_parts` in VerbForm.
- Noun principal forms: two `WordFormInput` controls bound to `nominative_singular` and `genitive_singular`.

## Submit and save
- On Apply, submit RHF form and validate via Zod. Before calling `updateWord`, run the existing `cleanFormData` utility to drop empty strings, empty arrays, and undefined; retain `null` when the user intentionally clears a value.
- Call `updateWord({ wordId, updates, collection: 'vocabulary_words_v2' })`.
- Keep selection and show toast feedback.

## Acceptance criteria
- For all POS, right panel shows editors even when fields were previously null or missing.
- Verb principal parts can be added, edited, and removed; participles are editable.
- Noun singular forms are editable.
- Saves persist to `vocabulary_words_v2` and pass Zod validation on fetch.
- Lint and build pass.
