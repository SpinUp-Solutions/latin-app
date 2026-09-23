jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));
jest.mock('@/src/lib/vocabulary-pools/archive.server', () => {
  const actual = jest.requireActual('@/src/lib/vocabulary-pools/archive.server');
  return { ...actual, loadVocabularyPoolWords: jest.fn(actual.loadVocabularyPoolWords) };
});

import { createFakeGeneratedWordDb } from './helpers/fakeGeneratedWordFirestore';
import { generatedPoolFixture } from './helpers/generatedPoolFixture';
import {
  collectWordsForGeneratedExerciseRequest,
  createFirestoreGeneratedWordLoader,
} from '@/src/lib/tests/generated-word-loader.server';
import { createGeneratedExerciseRng } from '@/src/lib/tests/generated-word-composition.server';
import { resolveGeneratedExerciseItems } from '@/src/lib/tests/generated-exercises';
import * as poolArchive from '@/src/lib/vocabulary-pools/archive.server';

describe('pool generation question-count contract', () => {
  it.each([1, 7, 19, 101])('fills 30 questions from 100 words, skipping invalid forms (seed %s)', async seed => {
    const { words, pool, exercise } = generatedPoolFixture();
    // A saved candidate limit must no longer reduce the available vocabulary.
    const legacyConfig = { ...exercise.data.generatorConfig, poolWordLimit: 5 };
    exercise.data.generatorConfig = legacyConfig;
    const db = createFakeGeneratedWordDb({ words, pools: [pool] });
    const result = await collectWordsForGeneratedExerciseRequest(db as never, exercise, {
      rng: createGeneratedExerciseRng(seed),
    });
    expect(result.words).toHaveLength(30);
    expect(new Set(result.words.map(word => word.id)).size).toBe(30);
    expect(result.words.every(word => word.id.startsWith('valid-') && word.selected_form?.startsWith('amat-'))).toBe(
      true
    );
    expect(result.globalScanLimitReached).toBe(false);
  });

  it.each([0, 17])('returns fewer questions only after exhausting a pool with %s eligible words', async eligible => {
    const { words, pool, exercise } = generatedPoolFixture(eligible);
    const db = createFakeGeneratedWordDb({ words, pools: [pool] });
    const result = await collectWordsForGeneratedExerciseRequest(db as never, exercise);
    expect(result.words).toHaveLength(eligible);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ collected: eligible, scanned: 100, exhausted: true, scanLimitReached: false }),
    ]);
    expect(result.globalScanLimitReached).toBe(false);
  });

  it('finds all 30 usable words even beyond the former collection scan budgets', async () => {
    const { words, pool, exercise } = generatedPoolFixture(30, 2500);
    const db = createFakeGeneratedWordDb({ words, pools: [pool] });
    const result = await collectWordsForGeneratedExerciseRequest(db as never, exercise, {
      rng: createGeneratedExerciseRng(19),
    });
    expect(result.words).toHaveLength(30);
    expect(result.diagnostics[0].scanned).toBeGreaterThan(2000);
    expect(result.diagnostics[0].scanLimitReached).toBe(false);
    expect(result.globalScanLimitReached).toBe(false);
  });

  it('replaces missing, deletion-pending, and duplicate pool references with distinct usable words', async () => {
    const { words, pool, exercise } = generatedPoolFixture(32, 32);
    words.shift();
    words[0].data._deletionPending = true;
    pool.wordDocIds.push(pool.wordDocIds[2], 'missing-word');
    const db = createFakeGeneratedWordDb({ words, pools: [pool] });
    const result = await collectWordsForGeneratedExerciseRequest(db as never, exercise);
    expect(result.words).toHaveLength(30);
    expect(new Set(result.words.map(word => word.id)).size).toBe(30);
    expect(result.words.map(word => word.id)).not.toContain('valid-1');
  });

  it('shares bounded pool reads across paradigms instead of fetching each candidate repeatedly', async () => {
    const { words, pool, exercise } = generatedPoolFixture();
    exercise.data.paradigmConfigs['noun-declension'] = {
      enabled: true,
      filters: {},
      steps: ['case'],
      formSelection: { tableType: 'declension', selectedCellPaths: ['singular.nominative'] },
    };
    const loadWords = jest.mocked(poolArchive.loadVocabularyPoolWords);
    loadWords.mockClear();
    const db = createFakeGeneratedWordDb({ words, pools: [pool] });
    const result = await collectWordsForGeneratedExerciseRequest(db as never, exercise);
    expect(result.words).toHaveLength(30);
    const batches = loadWords.mock.calls.map(([, ids]) => ids ?? []);
    expect(batches.every(ids => ids.length <= 50)).toBe(true);
    expect(batches.flat()).toHaveLength(100);
    expect(new Set(batches.flat()).size).toBe(100);
  });

  it.each(['single-field', 'step-by-step'] as const)('resolves 30 usable words in %s delivery', async mode => {
    const { words, pool, exercise } = generatedPoolFixture();
    exercise.data.mode = mode;
    const db = createFakeGeneratedWordDb({ words, pools: [pool] });
    const items = await resolveGeneratedExerciseItems(exercise, createFirestoreGeneratedWordLoader(db as never));
    const wordIds = new Set(items.map(item => ('wordId' in item ? item.wordId : item.text)));
    expect(wordIds.size).toBe(30);
    expect(items).toHaveLength(mode === 'single-field' ? 30 : 60);
  });

  it('preserves saved all-word exercises while ignoring their retired candidate caps', async () => {
    const { words, pool, exercise } = generatedPoolFixture(17);
    const legacyConfig = { ...exercise.data.generatorConfig, count: 'all' as const, poolWordLimit: 5 };
    exercise.data.generatorConfig = legacyConfig;
    const db = createFakeGeneratedWordDb({ words, pools: [pool] });
    const result = await collectWordsForGeneratedExerciseRequest(db as never, exercise);
    expect(result.requestedCount).toBe('all');
    expect(result.words).toHaveLength(17);
  });
});
