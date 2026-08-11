import {
  createWordDeletionChallenge,
  firestoreVersionFingerprint,
  isWordDeletionChallengeValid,
} from '@/src/lib/vocabulary/word-deletion.server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('word deletion confirmation challenges', () => {
  it('rejects a confirmation when a pool was added after the warning', () => {
    const challenge = createWordDeletionChallenge({
      wordId: 'word-1',
      actorUid: 'admin-1',
      poolIds: ['pool-a'],
      wordFingerprint: 'word-v1',
      now: 1_000,
    });

    expect(
      isWordDeletionChallengeValid({
        stored: challenge.stored,
        token: challenge.token,
        wordId: 'word-1',
        actorUid: 'admin-1',
        poolIds: ['pool-a', 'pool-b'],
        wordFingerprint: 'word-v1',
        now: 2_000,
      })
    ).toBe(false);
  });

  it('binds a short-lived token to the actor, word, and sorted pool IDs', () => {
    const challenge = createWordDeletionChallenge({
      wordId: 'word-1',
      actorUid: 'admin-1',
      poolIds: ['pool-b', 'pool-a'],
      wordFingerprint: 'word-v1',
      now: 1_000,
    });

    expect(
      isWordDeletionChallengeValid({
        stored: challenge.stored,
        token: challenge.token,
        wordId: 'word-1',
        actorUid: 'admin-1',
        poolIds: ['pool-a', 'pool-b'],
        wordFingerprint: 'word-v1',
        now: 2_000,
      })
    ).toBe(true);
    expect(
      isWordDeletionChallengeValid({
        stored: challenge.stored,
        token: challenge.token,
        wordId: 'word-1',
        actorUid: 'admin-2',
        poolIds: ['pool-a', 'pool-b'],
        wordFingerprint: 'word-v1',
        now: 2_000,
      })
    ).toBe(false);
  });

  it('stores only a fixed-size pool fingerprint for high-cardinality words', () => {
    const challenge = createWordDeletionChallenge({
      wordId: 'word-1',
      actorUid: 'admin-1',
      poolIds: Array.from({ length: 5_000 }, (_, index) => `pool-${index}`),
      wordFingerprint: 'word-v1',
    });

    expect(challenge.stored).toMatchObject({ poolCount: 5_000 });
    expect(challenge.stored.poolFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.stored).not.toHaveProperty('poolIds');
  });

  it('rejects a token after the warned word is edited', () => {
    const challenge = createWordDeletionChallenge({
      wordId: 'word-1',
      actorUid: 'admin-1',
      poolIds: ['pool-a'],
      wordFingerprint: 'word-v1',
      now: 1_000,
    });

    expect(
      isWordDeletionChallengeValid({
        stored: challenge.stored,
        token: challenge.token,
        wordId: 'word-1',
        actorUid: 'admin-1',
        poolIds: ['pool-a'],
        wordFingerprint: 'word-v2',
        now: 2_000,
      })
    ).toBe(false);
  });

  it('preserves nanosecond precision for same-millisecond Firestore updates', () => {
    expect(firestoreVersionFingerprint({ seconds: 100, nanoseconds: 123_000_001 })).not.toBe(
      firestoreVersionFingerprint({ seconds: 100, nanoseconds: 123_999_999 })
    );
  });

  it('transports confirmation tokens in a DELETE body rather than the URL', () => {
    const apiSource = readFileSync(join(process.cwd(), 'src/store/api/vocabularyApi.ts'), 'utf8');
    expect(apiSource).toContain('body: { confirmationToken }');
    expect(apiSource).not.toContain('?confirmationToken=');

    const routeSource = readFileSync(join(process.cwd(), 'src/app/api/admin/words/[wordId]/route.ts'), 'utf8');
    expect(routeSource).not.toContain("searchParams.get('confirmationToken')");
  });
});
