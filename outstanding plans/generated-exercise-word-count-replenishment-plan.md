# Final Implementation Plan (v5.1)
## Exact Usable Word Count Replenishment for Generated Exercises

---

## 1. What this is about

Teachers configure generated exercises — morphology drills (`generated-form-identification`) and vocabulary exercises (`generated-translation`) — by picking filters, paradigm tables, cell selections, and a **word count** (e.g., 10). Today that number fails in two directions:

- **Exercises come up short.** The system fetches 10 candidate words, then discards any whose inflection tables lack the selected forms. A student gets 7 questions instead of 10 — a different 7 every attempt.
- **Multi-paradigm exercises inflate.** With nouns + verbs enabled and count=10, each paradigm fetches 10 independently → up to 20 items.

Root cause: candidates are fetched with a hard limit first; eligibility filtering happens afterward with no replenishment. This feature makes the configured count a **contract**, enforced by one shared engine used identically by student delivery and admin preview.

## 2. Target UX

### Admin (content author)
- Sets Word Count = 10, enables paradigms, selects cells → **Preview** → exactly 10 valid-form words for healthy configurations, every time.
- Multi-paradigm exercises are **balanced** (verbs+nouns at 10 → ~5+5).
- Preview uses **identical semantics, budgets, and eligibility rules** as delivery. For healthy configurations (eligible density comfortably supports the target within the scan budgets), what preview shows is what students get.
- Near the sparsity boundary, samples may differ between preview and an individual attempt because candidate traversal is randomized — a preview shortfall diagnostic means students are *likely* (not guaranteed) to see a similar shortfall. Diagnostics (per-paradigm scanned/exhausted/limit-reached) tell the author to widen filters or pick less sparse cells.
- Preview works on drafts mid-editing (dedicated request schema, not the stricter persisted-exercise schema).

### Student
- Every exercise contains the full number of words the teacher configured, whenever the vocabulary supports it within scan budgets.
- In step-by-step morphology modes one word produces several interaction items — students may see more prompts than the word count. That's existing intended behavior; the guaranteed quantity is **words**.
- Which words appear remains random per attempt; filtering itself is unchanged — invalid-form words never appear, they just no longer reduce the total.

### Unchanged
- `count: 'all'` behavior (delivery **and** editor preview), legacy `/api/admin/words` GET route, grading, rendering.

## 3. The contract (precise)

> Deliver **exactly `count` usable source words whenever at least `count` eligible candidates are found within the configured scan budgets**; otherwise best effort, with budget exhaustion explicitly surfaced.

- `count` is a **word quota, not an item quota** — resolved interaction items may exceed `count` in multi-step modes.
- `count` is the **total across all enabled paradigms**, fairly allocated with borrowing.
- Contract is **cost-bounded**: budgets scale with `count`, are **identical across preview and delivery**, and exhaustion is surfaced (server log on delivery; structured diagnostics in preview).
- Preview is **representative, not predictive**: identical semantics and budgets; randomized traversal means boundary-case outcomes may differ per invocation.

## 4. Confirmed decisions

| Decision | Choice |
|---|---|
| Multi-paradigm semantics | `count` = total usable words, fair-shared with borrowing |
| Shortfall policy | Best effort within budgets; surfaced, never silent |
| Scan ceilings | Hard but scaled (`≥ k × count`); terminate collection, reported in diagnostics |
| Output cap | New product policy `MAX_GENERATED_WORD_COUNT` in shared config module — value set after auditing persisted counts; enforced in authoring + delivery validation |
| Preview parity model | Representative (Option A): same semantics/budgets, randomized outcome |
| `poolWordLimit` | Caps the **shared sampled pool-ID universe** (computed once); not multiplied per spec; guarantee = `min(count, eligible within cap)` |
| Cross-spec duplicate words | Allowed (current behavior); seen-ID dedup is **per stream**, never global |
| `count: 'all'` | Unchanged in delivery and preview |
| Pronoun overlap | Spec-aware rejection — **flagged observable behavior change** (§8.5) |

## 5. Problem summary

Delivery loader (`src/lib/tests/generated-word-loader.server.ts`): fetches `count` docs per spec → `mapWord()` drops nulls → `filterOverlappingPronounParadigms()` drops more → item building drops empty-display/no-answerable-step words. No replenishment. Pool path filters after slicing. Admin preview (`/api/admin/words` exerciseMode + client-side composition in `advancedVocabularyApi.ts`) independently repeats the pattern.

## 6. Architecture

```
        delivery loader                        admin preview (new POST endpoint)
  (specs from paradigmConfigs)          (specs from draft body via normalizePreviewSpecs)
              └───────────────┬──────────────────────────────┘
                              ▼
        collectGeneratedExerciseWords()     ← shared orchestration, server-only
        ├─ injectable rng (seeded substreams)
        ├─ fair share allocation (shuffled spec order)
        ├─ per-spec resumable candidate streams (snapshot cursors)
        ├─ spec-aware eligibility (mapWord + overlap + prepare)
        ├─ borrowing round across any stream with capacity
        ├─ shared depletable scan budget (scales with count)
        └─ shuffle + defensive slice to count
```

Spec *construction* stays at call sites (different upstream schemas); everything downstream of normalized `WordQuerySpec[]` is shared, so counting semantics cannot drift between paths.

## 7. Constant layering

```ts
// src/config/generatedExerciseLimits.ts   — shared, side-effect-free, client-safe
export const MAX_GENERATED_WORD_COUNT = ...;   // value chosen after persisted-count audit

// src/lib/tests/generated-word-composition.server.ts   — server-only
BASE_GLOBAL_SCAN, SCAN_MULTIPLIER, PER_SPEC_* , batch sizing constants
```

Consumers of the shared constant: authoring/editor schema, active-exercise validation (where `count: z.union([z.literal('all'), z.number().int().positive()])` gets its ceiling), preview request schema, composition module (read-only).

## 8. Design details

### 8.1 Stateful candidate collector

```ts
interface CandidateStream<TDoc> {
  nextBatch(limit: number): Promise<{ docs: TDoc[]; exhausted: boolean }>;
  totalScanned: number;   // cumulative across ALL passes — borrowing can't bypass guardrails
}
interface CollectionResult<W> {
  words: W[];                  // eligible mapped words taken this call
  scanned: number;             // documents examined (reads charged), NOT accepted words
  exhausted: boolean;          // source fully traversed
  scanLimitReached: boolean;   // stopped deliberately by per-spec ceiling
}
// canContinue = !exhausted && !scanLimitReached && globalBudgetRemaining > 0
```

### 8.2 Pagination — snapshot cursors only

Value cursors skip same-key documents at page boundaries (`sort_key` collisions are routine; e2e fixtures set `random_index: 0.5` everywhere). All cursors use document snapshots: `query.startAfter(lastDocSnapshot)` (pattern proven at `route.ts:363`). Random selection keeps threshold/wrap phases `[threshold,1)` → `[0,threshold)`, snapshot-paginated. Search: `orderBy('sort_key')` + snapshot cursor. Pool: chunked iteration over the shared sampled ID list.

### 8.3 Allocation & borrowing

```text
Pass 0  shuffle spec order via rng (fairness for small counts: count=2, n=5 → 1,1,0,0,0 to random specs)
        share[i] = floor(count/n) (+1 for first count % n)
Pass 1  replenish each spec toward its share
Pass 2  deficit = count − collected
        while deficit > 0 and some stream canContinue:
          round-robin streams with capacity, continue cursors past original shares
        stop: total == count | all exhausted | global budget depleted
Final   shuffle combined → defensive slice to count
```

**Lending rule:** quota-met streams lend; exhausted, per-spec-depleted, or globally-depleted streams do not. Filling your share never closes your stream.

### 8.4 Budgets & batching

- Adaptive batches: first batch = remaining share; subsequent = `clamp(2 × deficit, 4, 100)`. Healthy configs read ≈ today's cost.
- Per-spec ceiling: `max(400, 40 × share)`, cumulative across passes.
- Global depletable budget owned by coordinator: `max(BASE_GLOBAL_SCAN ≈ 2000, SCAN_MULTIPLIER × count)`, `SCAN_MULTIPLIER ≥ 2`.
- `MAX_GENERATED_WORD_COUNT` caps output; budgets cap examination — neither substitutes for the other.

### 8.5 Spec-aware eligibility + extracted preparation

```ts
evaluate(candidate: { doc: QueryDocumentSnapshot; spec: WordQuerySpec }): W | null
```

A candidate consumes quota only if it survives every later stage:
1. `mapWord(doc, spec) !== null` — form selection + step compatibility;
2. **spec-aware pronoun overlap** — reject personal 1st/2nd pronouns only from the *broad gendered* spec; the same word from the *personal* spec stays eligible;
3. **item-buildability** — `prepareGeneratedFormIdentificationWord(exercise, word) !== null`, extracted into pure `src/utils/exercises/formIdentificationPreparation.ts`.

Loader eligibility and item builder consume the **same pure preparation helper** (computed twice — cheap, deterministic; the loader's public `ExerciseWordResponse[]` contract is unchanged). Translation predicate derives from existing drop conditions (missing translations english→latin, missing root word).

> ⚠️ **Behavior change:** today broad-gendered configs eliminate *all* personal 1st/2nd pronouns — including personal-spec words — despite the helper's stated dedup intent. Spec-aware rejection fixes that mismatch but changes observable behavior for those configs. Requires origin-aware test + check whether the admin UI can produce the combination.

### 8.6 Injected randomness

`rng?: () => number` (default `Math.random`) feeds **all five** stochastic points: spec-order shuffle, pool-ID shuffle, `random_index` threshold, form selection (`selectForm`), final shuffle. Derived substreams (`allocationRng`, `queryRng`, `formRng`, `shuffleRng`) from one seed via small non-crypto PRNG, so adding a random call early doesn't shift later seeded expectations. Tests seed and assert exact allocations.

### 8.7 Pool handling — shared universe cap

```ts
const poolCandidateIds = shuffle(pool.wordDocIds, rng).slice(0, poolWordLimit ?? Infinity);
// ONE shared sampled universe; per-spec streams traverse the SAME list
```

- The cap applies to **pool IDs drawn** — missing/deleted documents consume the cap without extending it.
- "Pool IDs considered" and `totalScanned` (Firestore documents read) remain distinct counters.
- One shared chunked loader (~50 IDs/chunk) loads each chunk once and evaluates it per spec.
- Invariant: `min(count, eligible within poolWordLimit)`.

## 9. Admin preview (Slice 2)

New dedicated endpoint; legacy GET route keeps its CRUD role and its own `GENERATED_MAX_RESULTS = 200`:

```http
POST /api/admin/exercises/generated-preview
{
  "type": "generated-form-identification",
  "data": {
    "generatorConfig": { "...": "...", "count": 10 },
    "paradigmConfigs": { },
    "mode": "step-by-step"
  }
}
```

- **One canonical `count`** at `data.generatorConfig.count` — matching the existing contract; no top-level duplicate.
- Pipeline mirrors delivery exactly:

```text
unknown body
  ↓ GeneratedExercisePreviewRequestSchema      ← composed from shared generator/paradigm
  ↓                                              sub-schemas + MAX_GENERATED_WORD_COUNT
  ↓                                              (NOT the persisted-exercise schema verbatim;
  ↓                                              mid-edit drafts must validate)
  ↓ normalize generated exercise config
  ↓ requireGeneratedVocabularyCollection() / getReadableVocabularyPool()
  ↓                                             ← same source restrictions as delivery,
  ↓                                               so preview can't become more permissive
  ↓ normalizePreviewSpecs()
  ↓ collectGeneratedExerciseWords()            ← identical orchestration + budgets
  → words + per-spec diagnostics { collected, scanned, exhausted, scanLimitReached }
```

- `verifyAdminAccess()` required; structured errors via `createRouteErrorResponse`.
- `count` validated against `MAX_GENERATED_WORD_COUNT` (full authorable range); `'all'` explicitly supported (the editor relies on it today).
- Client: mutation-based preview hook replaces `getMultiPosWords`/`getMultiParadigmWords` usage in editor hooks (mutations sidestep RTK Query cache interplay).

## 10. File-by-file changes

| File | Change | Slice |
|---|---|---|
| `src/config/generatedExerciseLimits.ts` (new, shared) | `MAX_GENERATED_WORD_COUNT` | 1 |
| `src/lib/tests/generated-word-composition.server.ts` (new, server-only) | Collector + `collectGeneratedExerciseWords()` + budget constants + rng plumbing | 1 |
| `src/utils/exercises/formIdentificationPreparation.ts` (new, pure) | `prepareGeneratedFormIdentificationWord()` extracted from `getPreparedPaths` | 1 |
| `src/lib/tests/generated-exercises.ts` | Consume extracted preparation; export translation usability predicate | 1 |
| `src/lib/tests/generated-word-loader.server.ts` | Thin: build specs → orchestration; remove inline load/filter logic | 1 |
| `src/utils/generated/pronounParadigmFiltering.ts` | Spec-aware variant; sole call site is the loader | 1 |
| `src/lib/tests/active-exercise-validation.ts` | `count ≤ MAX_GENERATED_WORD_COUNT` (post-audit) | 1 |
| `src/app/api/admin/exercises/generated-preview/route.ts` (new) | Endpoint per §9 | 2 |
| `src/store/api/advancedVocabularyApi.ts` + editor hooks | Mutation-based preview replacing queryFn composition | 2 |

## 11. Behavior changes / release notes

1. Multi-paradigm exercises shrink from `specs × count` toward `count` (intended).
2. Delivered counts rise to the configured target where vocabulary allows within budgets.
3. Broad-gendered + personal pronoun configs: personal-paradigm words no longer eliminated (§8.5 flag).
4. Preview aligns with delivery semantics/budgets; near-boundary samples may differ (representative model).
5. New validation ceiling on `count` — audit persisted content before choosing the value; deal with outliers explicitly.

## 12. Testing plan

Extend `tests/generatedWordLoaderSecurity.test.ts` (mocked-Firestore chain pattern) + `tests/generatedVocabularyRoute.test.ts`; new `tests/morphologyWordReplenishment.test.ts`:

**Core guarantee**
1. Target met: mixed fixture, count=10 → exactly 10 usable words
2. Exhaustion: fewer eligible than count → all eligible, bounded queries
3. Borrowing: rich spec stopped on quota-met lends to sparse spec → total = count
4. Balance: two healthy paradigms, count=10 → shares honored
5. `count < spec count`: seeded rng → exact deterministic remainder assignment
6. `count: 'all'` unchanged (delivery)
7. Scan ceiling hit → terminates, best-effort, `scanLimitReached` flagged
8. Global budget: many sparse paradigms can't collectively exceed it
9. Adaptive batching: high-eligibility small-count case reads ≈ remaining, not a fixed minimum

**Cursor integrity**
10. Duplicate `sort_key` across batch boundary — nothing skipped
11. Duplicate `random_index` across wrap boundary — nothing skipped
12. Per-stream dedup only; cross-spec duplicates still allowed

**Eligibility**
13. Passes `mapWord`, fails preparation → skipped during backfill
14. Origin-aware pronouns: personal-spec words survive broad-gendered overlap; broad-spec duplicates rejected without consuming quota
15. Translation predicates (missing translation / root word)

**End-to-end & pools**
16. Frozen delivery resolves exactly N words from mixed fixture; multi-step mode yields > N items from exactly N words (word-vs-item semantics)
17. Pool chunked backfill; `poolWordLimit=100`, 3 paradigms → shared universe ≤ 100 IDs; missing/deleted IDs consume cap without extending it
18. Search-path snapshot pagination
19. Seeded-RNG replay: same seed → identical word set across runs

**Slice 2 — preview**
20. Preview/delivery parity on healthy configs across the full authorable range (`≤ MAX_GENERATED_WORD_COUNT`)
21. `count: 'all'` through the new preview endpoint preserves all-matching semantics
22. Preview rejects invalid collections/pools exactly like delivery; mutation hook covered without RTK Query cache complexity

## 13. Verification

```bash
npx tsc --noEmit
npm test -- --runInBand tests/morphologyWordReplenishment.test.ts \
  tests/generatedWordLoaderSecurity.test.ts \
  tests/generatedVocabularyRoute.test.ts \
  tests/advancedVocabularyPagination.test.ts \
  tests/generatedFormIdentificationFailureModes.test.ts
npm run lint && git diff --check
# full suite (cross-cutting change); no Firestore rule changes → rules suite n/a
```

Manual: morphology exercise, specific cells (e.g., 3rd-conj future active indicative), count=10 → preview shows exactly 10 valid-form words; verbs+nouns → 10 total balanced; student playback progression matches 10 selected words; sparse-filter exercise → preview diagnostics explain the shortfall.

## 14. Rollout sequence

```text
audit persisted counts → choose MAX_GENERATED_WORD_COUNT above reality
  → deal with outliers explicitly
  → Slice 1: shared engine + delivery loader + regression suite (ships independently)
  → Slice 2: preview endpoint + client hook + parity suite
```
