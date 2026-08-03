import { readFile } from 'node:fs/promises';
import {
  assertNoUnexpectedProjectOverrides,
  assertWriteBoundary,
  captureAuthFingerprint,
  parseArgs,
} from '../scripts/sync-prod-content-to-dev.mjs';
import { SOURCE_PROJECT_ID, TARGET_PROJECT_ID } from '../scripts/sync-prod-content-to-dev-core.mjs';

describe('production content sync CLI guards', () => {
  it('defaults to a read-only plan and requires exact apply preconditions', () => {
    expect(parseArgs([])).toMatchObject({ mode: 'dry-run', apply: false });
    expect(parseArgs(['--apply', '--plan-hash', 'a'.repeat(64)])).toMatchObject({ mode: 'apply', planHash: 'a'.repeat(64) });
    expect(() => parseArgs(['--apply'])).toThrow(/plan-hash/);
    expect(() => parseArgs(['--project', SOURCE_PROJECT_ID])).toThrow(/Unknown argument/);
    expect(parseArgs(['--rollback', '--run-id', 'run-1'])).toMatchObject({ mode: 'rollback', apply: false });
    expect(() => parseArgs(['--rollback', '--run-id', 'run-1', '--apply'])).toThrow(/rollback-token/);
    expect(() => parseArgs(['--verify', '--run-id', 'run-1', '--plan-hash', 'a'.repeat(64)])).toThrow(/plan or rollback tokens/);
    expect(() => parseArgs(['--rollback', '--run-id', 'run-1', '--rollback-token', 'token'])).toThrow(/requires --apply/);
  });

  it('enforces the source-read/target-write boundary', () => {
    expect(() => assertWriteBoundary(SOURCE_PROJECT_ID, 'test')).toThrow(/read-only/);
    expect(() => assertWriteBoundary('latin-app-staging', 'test')).toThrow(/outside/);
    expect(() => assertWriteBoundary(TARGET_PROJECT_ID, 'test')).not.toThrow();
  });

  it('rejects unexpected project and emulator overrides', async () => {
    const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
    const originalEmulator = process.env.FIRESTORE_EMULATOR_HOST;
    process.env.GOOGLE_CLOUD_PROJECT = 'latin-app-prod';
    delete process.env.FIRESTORE_EMULATOR_HOST;
    await expect(assertNoUnexpectedProjectOverrides()).resolves.toBeUndefined();
    process.env.GOOGLE_CLOUD_PROJECT = 'latin-app-staging';
    await expect(assertNoUnexpectedProjectOverrides()).rejects.toThrow(/GOOGLE_CLOUD_PROJECT/);
    process.env.GOOGLE_CLOUD_PROJECT = 'latin-app-prod';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    await expect(assertNoUnexpectedProjectOverrides()).rejects.toThrow(/emulator/);
    if (originalProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = originalProject;
    if (originalEmulator === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = originalEmulator;
  });

  it('fingerprints Auth without returning user data', async () => {
    const auth = {
      listUsers: jest
        .fn()
        .mockResolvedValueOnce({ users: [{ uid: 'u-2', email: 'two@example.invalid', disabled: false, providerData: [] }], pageToken: 'next' })
        .mockResolvedValueOnce({ users: [{ uid: 'u-1', email: 'one@example.invalid', disabled: true, providerData: [] }] }),
    };
    const fingerprint = await captureAuthFingerprint(auth as never);
    expect(fingerprint).toMatchObject({ count: 2, hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(fingerprint)).not.toContain('@example.invalid');
    expect(auth.listUsers).toHaveBeenCalledTimes(2);
  });

  it('has no source write path in the live adapter', async () => {
    const source = await readFile(new URL('../scripts/sync-prod-content-to-dev.mjs', import.meta.url), 'utf8');
    expect(source).toContain("assertWriteBoundary(targetResource?.projectId, 'Firestore')");
    expect(source).toContain("assertWriteBoundary(targetResource?.projectId, 'Storage')");
    expect(source).not.toContain("assertWriteBoundary(SOURCE_PROJECT_ID, 'Firestore')");
    expect(source).not.toContain("assertWriteBoundary(SOURCE_PROJECT_ID, 'Storage')");
    expect(source).not.toContain('batch.set(ref, operation.source.data, { lastUpdateTime');
  });
});
