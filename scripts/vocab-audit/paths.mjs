import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Working files of a run (downloads, edits, progress, logs). Gitignored. */
export const OUT = process.env.VOCAB_AUDIT_OUT ?? join(dirname(fileURLToPath(import.meta.url)), 'out');
/** Backups live outside the repository so that removing a worktree does not remove them. */
export const BACKUPS = process.env.VOCAB_AUDIT_BACKUP_DIR ?? join(homedir(), 'latin-app-vocab-backups');
