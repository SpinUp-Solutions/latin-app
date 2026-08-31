# OpenAI Batching and Caching Improvement Plan

## Status

Partially completed as of 2026-08-31.

Completed work includes per-item student grading reservations and persisted scores, a Firestore-backed global OpenAI concurrency lease, cross-instance evaluation single-flight, automatic prompt/schema/profile fingerprints, and a 24-hour evaluation cache with fresh runs as the UI default. Remaining work is concentrated in output-budget tuning, telemetry/load testing, and optional asynchronous processing modes.

## Goals

- Keep student test submission synchronous and reliable.
- Prevent duplicate OpenAI charges for the same submission or evaluation request.
- Bound OpenAI traffic across concurrent work.
- Preserve accurate token and cost reporting.
- Make result-cache invalidation difficult to forget.
- Improve prompt-cache hit rates without creating unnecessary cache writes.
- Retain the current failure isolation and grading quality.

## Priority 1: Make student grading idempotent and concurrency-safe — superseded by item grading

### Problem

The original plan referred to the removed `gradeFrozenTranslationExercises` submission path. Translation items are now graded individually under a transactional reservation, with per-item request windows and persisted grades. Concurrent requests cannot own the same active item reservation.

### Archived bulk-submission proposal

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

## Priority 3: Enforce a real provider concurrency budget — core control completed

### Problem

All OpenAI call paths now acquire a shared Firestore lease. The global limit applies across Firebase and Next.js instances in addition to the existing per-user quotas and per-run worker limit.

### Remaining work

- Add explicit student/admin priority or fairness if real traffic shows starvation.
- Add metrics for queue time, provider time, retry count, and rate-limit failures.
- Load-test the global limit across multiple worker instances.

### Acceptance criteria

- The configured provider concurrency cannot be exceeded across Firebase instances.
- Multiple administrators cannot bypass the global limit.
- Student grading and admin evaluation have explicit priority or fairness rules.
- Load tests verify the maximum observed concurrency.

## Priority 4: Replace process-local evaluation coalescing — completed

### Problem

Evaluation cells now use a Firestore-backed claim keyed by the automatic evaluation cache key. Other instances join the shared cached result, and expired claims can be reclaimed.

### Implemented

- Added a distributed single-flight record keyed by the evaluation cache key.
- Ownership is acquired transactionally before calling OpenAI.
- Claims store an expiry and owner ID; expired claims can be reclaimed.
- Non-owners poll the shared result cache with a bound.
- Successful output is cached before the claim is released.
- Identical force-refresh requests share the same claim.

### Acceptance criteria

- Identical concurrent requests on separate instances result in one provider call.
- A crashed owner does not block the cache key indefinitely.
- Joined callers report zero incremental provider cost while retaining the original usage metadata.

## Priority 5: Strengthen cache invalidation — completed

### Problem

Cache keys now include a deterministic fingerprint of the system prompt, generated prompt structure, structured-output schema, parser implementation, model, reasoning effort, output limit, and cache mode. Cache retention is 24 hours, and evaluation runs are fresh by default so rolling model aliases do not silently hide changes.

### Implemented

- Added a deterministic grading fingerprint covering behavior-affecting inputs, including:
  - system prompt;
  - stable user instructions;
  - structured-output schema;
  - model ID;
  - reasoning effort;
  - output-token limit;
  - grading mode/namespace.
- Included the fingerprint in app-cache keys.
- Retained human-readable prompt/profile versions for reporting and deliberate migrations.
- Added deterministic and behavior-change tests for the fingerprint.
- Shortened retention to 24 hours and made fresh evaluation runs the default for rolling aliases.

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

1. Add the dedicated score-only output budget.
2. Measure prompt-cache shards and tune their count.
3. Add load tests and provider lease telemetry.
4. Add optional Flex or Batch evaluation modes.

## Official references

- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI rate limits](https://developers.openai.com/api/docs/guides/rate-limits)
- [OpenAI Batch API](https://developers.openai.com/api/docs/guides/batch)
- [OpenAI Flex processing](https://developers.openai.com/api/docs/guides/flex-processing)

## Baseline verification

The 2026-08-31 hardening pass verifies these areas with the focused AI/evaluation and attempt-service suites, including explicit coverage for distributed single-flight, automatic fingerprinting, quotas, expectations, and run persistence.

- `tests/translationGradingRunner.test.ts`
- `tests/aiEvaluationExecution.test.ts`
- `tests/aiEvaluationDomain.test.ts`
- `tests/aiEvaluationThrottle.test.ts`

Large-scale load testing remains outstanding.
