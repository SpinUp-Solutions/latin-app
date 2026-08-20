# OpenAI Batching and Caching Improvement Plan

## Status

Outstanding.

The existing evaluation cache has a strong foundation: deterministic versioned keys, a 30-day TTL, in-process duplicate coalescing, separate original and incremental cost reporting, prompt-cache usage tracking, and validation before cache writes. The main remaining risks are unbounded student-grading concurrency, duplicate work across concurrent submissions or Firebase instances, oversized output budgets, and manual cache invalidation.

## Goals

- Keep student test submission synchronous and reliable.
- Prevent duplicate OpenAI charges for the same submission or evaluation request.
- Bound OpenAI traffic across concurrent work.
- Preserve accurate token and cost reporting.
- Make result-cache invalidation difficult to forget.
- Improve prompt-cache hit rates without creating unnecessary cache writes.
- Retain the current failure isolation and grading quality.

## Priority 1: Make student grading idempotent and concurrency-safe

### Problem

`gradeFrozenTranslationExercises` uses nested `Promise.all` calls. Every translation item across every translation exercise can therefore start an OpenAI request simultaneously.

Grading also happens after reading an `in-progress` attempt but before the transaction that marks it submitted. Two concurrent submission requests can both grade the same attempt, even though only one eventually writes the submitted result.

If one request fails, `Promise.all` rejects while other billable requests continue. Their successful results are discarded, and a retry grades them again.

### Work

- Add an atomic attempt transition from `in-progress` to `grading` before making provider calls.
- Store a grading lease with:
  - attempt ID;
  - answer fingerprint;
  - lease owner/request ID;
  - lease expiry;
  - grading start timestamp.
- Make concurrent submitters join or observe the active grading operation instead of starting another one.
- Allow an expired lease to be reclaimed safely.
- Persist successful translation-item scores as they complete, keyed by:
  - attempt ID;
  - exercise ID;
  - item index or stable item ID;
  - source text;
  - answer fingerprint;
  - model/profile version;
  - prompt/schema fingerprint.
- Resume from persisted item scores following a partial failure.
- Replace unbounded `Promise.all` execution with a bounded worker pool.
- Start with a per-submission concurrency limit of 2–4 and tune using observed latency and rate-limit data.
- Use `Promise.allSettled` or equivalent explicit outcome collection so all started work is accounted for.
- Keep the final attempt submission transaction conditional on the same answer fingerprint used for grading.

### Acceptance criteria

- Two simultaneous submissions for one attempt result in at most one OpenAI request per unique translation item.
- Retrying after a partial provider failure reuses completed item scores.
- A changed answer invalidates any score generated from the previous fingerprint.
- No test can create more than the configured number of concurrent OpenAI requests.
- Lease expiry recovery is covered by tests.

## Priority 2: Separate the score-only model profile

### Problem

Test grading returns only `{ "score": number }` but inherits the lesson-grading output budget of 5,000 tokens. This is unnecessarily large and can reduce effective token-per-minute capacity.

### Work

- Introduce a dedicated test-grading profile or a definition-specific output-token limit.
- Determine an initial limit from real usage, including hidden reasoning tokens.
- Evaluate a starting range of 512–1,000 output tokens rather than applying an arbitrary minimal value.
- Track incomplete responses and output/reasoning-token percentiles before lowering the limit further.
- Keep the detailed lesson-grading limit independent.

### Acceptance criteria

- Score-only grading no longer sends the 5,000-token lesson limit.
- The chosen limit has headroom above measured p99 output plus reasoning usage.
- Existing score-quality and incomplete-response tests pass.

## Priority 3: Enforce a real provider concurrency budget

### Problem

`MAX_CONCURRENCY = 4` applies to one evaluation invocation only. Firebase permits two concurrent invocations per instance and two instances, allowing as many as 16 simultaneous requests from this function. Other app functions can consume the same project/model limits as well.

The current admin throttle is per administrator and counts requested cells. It protects against individual misuse but is not a global provider-rate limiter.

### Work

- Separate controls into:
  - per-user abuse/run quotas;
  - global provider request and token budgets;
  - per-model concurrency limits.
- Choose one implementation:
  - a durable queue with workers and per-model limits; or
  - a Firestore-backed distributed semaphore/lease; or
  - a simpler Firebase configuration with one invocation at a time, if throughput requirements permit it.
- Account for all OpenAI-using functions that share the project/model limits.
- Continue relying on the official SDK for eligible transient retries, while recording final 429 and timeout failures.
- Add metrics for queue time, provider time, retry count, and rate-limit failures.

### Acceptance criteria

- The configured provider concurrency cannot be exceeded across Firebase instances.
- Multiple administrators cannot bypass the global limit.
- Student grading and admin evaluation have explicit priority or fairness rules.
- Load tests verify the maximum observed concurrency.

## Priority 4: Replace process-local evaluation coalescing

### Problem

The `inFlightResults` map coalesces identical work only inside one JavaScript process. Requests handled by different Firebase instances can still issue duplicate OpenAI calls and race to write the same cache document.

### Work

- Add a distributed single-flight record keyed by the evaluation cache key and refresh mode.
- Acquire ownership transactionally before calling OpenAI.
- Store lease expiry and owner/request ID.
- Have non-owners wait, poll with a bound, or return a job identifier.
- On completion, write the result cache before releasing/finishing the lease.
- Ensure failures and crashed workers leave recoverable leases.
- Preserve force-refresh semantics while coalescing identical concurrent force-refresh requests.

### Acceptance criteria

- Identical concurrent requests on separate instances result in one provider call.
- A crashed owner does not block the cache key indefinitely.
- Joined callers report zero incremental provider cost while retaining the original usage metadata.

## Priority 5: Strengthen cache invalidation

### Problem

Evaluation cache correctness currently depends on manually incrementing `translation-grading-v3` and related schema/profile versions whenever behavior changes. A prompt or schema edit without a version bump can reuse stale results for 30 days.

### Work

- Add a deterministic grading fingerprint covering behavior-affecting inputs, including:
  - system prompt;
  - stable user instructions;
  - structured-output schema;
  - model ID;
  - reasoning effort;
  - output-token limit;
  - grading mode/namespace.
- Include the fingerprint in app-cache keys.
- Retain human-readable prompt/profile versions for reporting and deliberate migrations.
- Add a test that snapshots or independently verifies the fingerprint.
- Decide whether model aliases are acceptable for 30-day evaluation reuse. If evaluations must always reflect the current backend snapshot, pin a snapshot model or shorten retention.

### Acceptance criteria

- A behavior-affecting prompt, schema, or profile change automatically changes the cache key.
- Pricing-only changes do not unnecessarily invalidate model output.
- Cached costs continue to be recalculated from stored usage using the current price table.

## Priority 6: Tune OpenAI prompt-cache routing from measurements

### Current assessment

The lesson-grading prompt is structured correctly for caching: static instructions and schema precede variable source and answer content. GPT-5.6 uses an explicit breakpoint and explicit cache mode, while earlier models stay on automatic caching.

The score-only test prompt's stable prefix is likely below OpenAI's 1,024-token cacheability threshold. Its prompt-cache key is therefore unlikely to provide meaningful savings for normal short test items. Do not pad the prompt solely to make it cacheable.

The fixed four-way candidate cache-key sharding protects higher-volume traffic, but it also creates up to four cold cache routes. It should be retained only when observed traffic would overload a single key.

### Work

- Record the selected cache shard/key in server-side evaluation telemetry.
- Calculate by model, namespace, and shard:
  - requests per minute;
  - cached input tokens;
  - cache-write tokens;
  - cache hit rate;
  - read-to-write token ratio;
  - input cost saved or added.
- Use the smallest stable shard count that keeps each key near OpenAI's recommended traffic range.
- Consider including stable source/direction content before the explicit breakpoint when repeated requests grade the same source and measurements show a worthwhile benefit.
- Do not use OpenAI prompt caching as a replacement for durable application idempotency; it caches prompt computation, not the generated score/result.

### Acceptance criteria

- Shard count is justified by recorded traffic rather than a fixed assumption.
- Cache-write cost and subsequent read savings are visible per shard.
- Typical score-only requests are not described as cache hits unless `cached_tokens > 0`.

## Priority 7: Offer an economical admin-evaluation mode

### Recommendation

Keep student submission on standard synchronous processing. For admin evaluation, offer processing modes based on latency requirements:

1. **Interactive:** bounded synchronous Responses API calls using the current UI flow.
2. **Economical synchronous:** Flex processing when both compared models support it, with bounded retries and an optional fallback to standard processing.
3. **Offline:** OpenAI Batch API when completion within 24 hours is acceptable.

Do not silently change an interactive run into a 24-hour batch job. Persist offline job status and allow the UI to leave and return later.

### Acceptance criteria

- Processing mode and expected latency are explicit in the UI.
- Batch jobs survive browser and function termination.
- Results retain the same cache, usage, cost, and model metadata contracts where applicable.
- Quality comparisons confirm that changing service tier does not alter evaluation interpretation.

## Testing plan

- Unit-test the bounded concurrency worker and ensure it never exceeds its limit.
- Test concurrent submission calls against the same attempt.
- Test grading-lease acquisition, joining, expiry, and recovery.
- Test partial success persistence and retry resumption.
- Test cross-instance evaluation single-flight behavior using separate worker contexts.
- Test prompt/config fingerprint invalidation.
- Test cache-key stability for equivalent inputs and changes for behavior-affecting inputs.
- Test app-cache hits, OpenAI prompt-cache reads, cache writes, fresh API calls, and coalesced duplicates independently.
- Add a load test representing the maximum number of translation items and concurrent users.
- Retain the existing translation-grading, evaluation execution/domain, and throttle suites.

## Suggested implementation order

1. Add bounded student-grading concurrency.
2. Add the atomic attempt grading lease and persisted per-item scores.
3. Add the dedicated score-only output budget.
4. Add tests for concurrent submission and partial retry.
5. Add distributed evaluation single-flight and a global provider budget.
6. Add automatic cache fingerprints.
7. Measure prompt-cache shards and tune their count.
8. Add optional Flex or Batch evaluation modes.

## Official references

- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI rate limits](https://developers.openai.com/api/docs/guides/rate-limits)
- [OpenAI Batch API](https://developers.openai.com/api/docs/guides/batch)
- [OpenAI Flex processing](https://developers.openai.com/api/docs/guides/flex-processing)

## Baseline verification

Before this plan was written, the following suites passed with 25 tests total:

- `tests/translationGradingRunner.test.ts`
- `tests/aiEvaluationExecution.test.ts`
- `tests/aiEvaluationDomain.test.ts`
- `tests/aiEvaluationThrottle.test.ts`

These suites do not currently cover cross-instance duplication or large-test concurrency.
