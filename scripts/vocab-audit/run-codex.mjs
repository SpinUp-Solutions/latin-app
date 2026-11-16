// Step 3: review the batches with the Codex CLI installed on this machine.
//
// Each batch gets its own `codex exec` session, so no batch pays for another's context.
// The session runs in Codex's workspace-write sandbox: it can run word.mjs and write only
// under the repository. It has web search and network access, to look forms up in
// dictionaries (--no-network turns both off). Because it can reach the network, it is
// started without this machine's gcloud sign-in, so its commands cannot write to Firestore.
// Your Codex settings file is not loaded (no MCP servers, no notifications); the sign-in is.
//
// The run can stop at any point (Ctrl-C, usage running out, a closed laptop) and be started
// again with the same command. Every reviewed word is recorded in out/progress, so a new run
// skips finished batches and an unfinished batch picks up at its first unreviewed word. The
// only words seen twice are the few a session was looking at when it stopped. If sessions
// start failing without reviewing anything, the run stops by itself.
// `node scripts/vocab-audit/status.mjs` shows where the run stands.
//
// Usage: node scripts/vocab-audit/run-codex.mjs [options]
//   --batches 1-5,9      which batches (default: every batch that is not fully reviewed)
//   --pos verb           only batches of this part of speech
//   --limit 3            at most this many batches
//   --concurrency 3      sessions at once
//   --model gpt-6.1-terra  Codex model
//   --effort high        reasoning effort
//   --no-network         no web search and no network for the session's commands
//   --attempts 3         sessions per batch before giving up on it
//   --timeout 45         minutes per session
//   --codex-bin <path>   the Codex CLI (default: $CODEX_BIN, the one in ChatGPT.app, then `codex` on PATH)
//   --dry-run            list the batches and stop
import { spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { batches, progress } from './lib.mjs';
import { OUT } from './paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const RUNS = join(OUT, 'runs');
const SESSIONS = join(RUNS, 'sessions.ndjson');
const APP_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const model = arg('model', 'gpt-6.1-terra');
const effort = arg('effort', 'high');
const network = !process.argv.includes('--no-network');
const concurrency = Number(arg('concurrency', '3'));
const attempts = Number(arg('attempts', '3'));
const timeoutMs = Number(arg('timeout', '45')) * 60_000;
const codexBin = arg('codex-bin', process.env.CODEX_BIN ?? (existsSync(APP_CODEX) ? APP_CODEX : 'codex'));

function selected() {
  const only = arg('batches');
  const wanted = only
    ? new Set(
        only.split(',').flatMap(part => {
          const [from, to = from] = part.split('-').map(Number);
          return Array.from({ length: to - from + 1 }, (_, i) => from + i);
        })
      )
    : null;
  const pos = arg('pos');
  const list = batches().filter(b => (wanted ? wanted.has(b.n) : left(b) > 0) && (!pos || b.part_of_speech === pos));
  return list.slice(0, Number(arg('limit', String(list.length))));
}
const left = batch => batch.ids.filter(id => !progress(id)).length;

const brief = readFileSync(join(HERE, 'REVIEW_BRIEF.md'), 'utf8');
const prompt = n =>
  `${brief}\n\nYour batch is ${n}. Start with: node ${relative(ROOT, join(HERE, 'word.mjs'))} next ${n}\n`;

// The sessions get an empty gcloud configuration and no service-account file, so a command
// they run cannot obtain this machine's Google credentials.
const { GOOGLE_APPLICATION_CREDENTIALS: _, ...inherited } = process.env;
const sessionEnv = { ...inherited, CLOUDSDK_CONFIG: mkdtempSync(join(tmpdir(), 'vocab-audit-gcloud-')) };

// Stopping the run stops its sessions too; what they reviewed so far is already on disk.
const running = new Set();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const child of running) child.kill('SIGTERM');
    console.log(
      '\nStopped. Run the same command again to continue: node scripts/vocab-audit/status.mjs shows progress.'
    );
    process.exit(130);
  });

const ZERO = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
const add = (a, b) => Object.fromEntries(Object.keys(ZERO).map(k => [k, (a[k] ?? 0) + (b?.[k] ?? 0)]));

/** One `codex exec` session on a batch. Resolves with its token usage and how it ended. */
function session(batch) {
  return new Promise(done => {
    const base = join(RUNS, `batch-${batch.n}`);
    const args = [
      'exec',
      '--json',
      '--ephemeral',
      '--ignore-user-config',
      '--skip-git-repo-check',
      '--sandbox',
      'workspace-write',
      '-C',
      ROOT,
      '-m',
      model,
      '-c',
      `model_reasoning_effort="${effort}"`,
      '-c',
      'approval_policy="never"',
      ...(network ? ['-c', 'web_search="live"', '-c', 'sandbox_workspace_write.network_access=true'] : []),
      // A run directory outside the repository must be writable too.
      ...(relative(ROOT, OUT).startsWith('..') ? ['--add-dir', OUT] : []),
      '-o',
      `${base}.reply.md`,
      '-',
    ];
    const child = spawn(codexBin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: sessionEnv });
    running.add(child);
    // One transcript per session, named by its start time so a later run never overwrites it.
    const transcript = `${base}.${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    const log = createWriteStream(transcript);
    let usage = ZERO;
    let calls = 0;
    let buffer = '';
    child.stdout.on('data', chunk => {
      log.write(chunk);
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.type === 'turn.completed') usage = add(usage, event.usage);
          if (event.type === 'item.completed' && event.item?.type === 'command_execution') calls++;
        } catch {
          // Not a JSON line (a warning from the CLI): it is in the log.
        }
      }
    });
    child.stderr.on('data', chunk => log.write(chunk));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('error', error => {
      clearTimeout(timer);
      done({ usage, calls, exit: `could not start ${codexBin}: ${error.message}` });
    });
    child.on('close', (code, signal) => {
      running.delete(child);
      clearTimeout(timer);
      log.end();
      done({ usage, calls, transcript, exit: signal ? `stopped (${signal})` : code });
    });
    child.stdin.end(prompt(batch.n));
  });
}

// Sessions that review nothing mean something outside the batch is wrong (usage ran out,
// signed out, no network). After a few in a row the run stops instead of failing its way
// through every remaining batch; run it again later and it continues where it stopped.
const STALL_LIMIT = 3;
let stalled = 0;
let stop = null;

async function review(batch) {
  const started = Date.now();
  const before = left(batch);
  let usage = ZERO;
  let calls = 0;
  const exits = [];
  for (let attempt = 1; attempt <= attempts && left(batch) > 0 && !stop; attempt++) {
    const sessionStarted = Date.now();
    const leftBefore = left(batch);
    const result = await session(batch);
    const reviewed = leftBefore - left(batch);
    usage = add(usage, result.usage);
    calls += result.calls;
    exits.push(result.exit);
    // One line per session, appended: status.mjs adds these up across runs.
    appendFileSync(
      SESSIONS,
      `${JSON.stringify({
        at: new Date().toISOString(),
        batch: batch.n,
        part_of_speech: batch.part_of_speech,
        model,
        effort,
        reviewed,
        chars: Math.round((reviewed * batch.chars) / batch.ids.length),
        commands: result.calls,
        seconds: Math.round((Date.now() - sessionStarted) / 1000),
        exit: result.exit,
        usage: result.usage,
      })}\n`
    );
    stalled = reviewed ? 0 : stalled + 1;
    if (stalled >= STALL_LIMIT || (typeof result.exit === 'string' && result.exit.startsWith('could not start')))
      stop = `${stalled} sessions in a row reviewed nothing (last exit: ${result.exit}). See ${relative(ROOT, result.transcript ?? RUNS)}`;
  }
  const record = {
    batch: batch.n,
    part_of_speech: batch.part_of_speech,
    reviewed: before - left(batch),
    unreviewed: left(batch),
    sessions: exits.length,
    exits,
    commands: calls,
    seconds: Math.round((Date.now() - started) / 1000),
    usage,
  };
  const k = n => `${Math.round(n / 1000)}k`;
  const all = batches();
  console.log(
    `batch ${batch.n} (${batch.part_of_speech}): ${record.reviewed} words reviewed${record.unreviewed ? `, ${record.unreviewed} LEFT` : ''}, ` +
      `${calls} commands, ${record.seconds}s, tokens in ${k(usage.input_tokens)} (${k(usage.cached_input_tokens)} cached) out ${k(usage.output_tokens)}` +
      `  ·  overall ${all.reduce((n, b) => n + b.ids.length - left(b), 0)}/${all.reduce((n, b) => n + b.ids.length, 0)} words`
  );
  return record;
}

const queue = selected();
console.log(
  `${queue.length} batches, ${queue.reduce((n, b) => n + left(b), 0)} words to review · ${model} at ${effort} · ${network ? 'web on' : 'web off'} · ${concurrency} at once · ${codexBin}`
);
if (process.argv.includes('--dry-run') || !queue.length) {
  for (const b of queue) console.log(`  batch ${b.n}: ${b.part_of_speech}, ${left(b)}/${b.ids.length} words left`);
  process.exit(0);
}
mkdirSync(RUNS, { recursive: true });

const records = [];
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length && !stop) records.push(await review(queue.shift()));
  })
);

const total = records.reduce((sum, r) => add(sum, r.usage), ZERO);
const words = records.reduce((n, r) => n + r.reviewed, 0);
const unfinished = batches().filter(b => left(b) > 0).length;
console.log(
  `\n${words} words reviewed in this run. Tokens: ${total.input_tokens} in (${total.cached_input_tokens} cached), ${total.output_tokens} out` +
    (words
      ? `; per word ${Math.round(total.input_tokens / words)} in, ${Math.round(total.output_tokens / words)} out.`
      : '.')
);
if (stop) console.log(`Stopped early: ${stop}`);
if (unfinished) {
  console.log(
    `${unfinished} batches still have words to review. Run the same command again to continue; reviewed words are not reviewed twice.`
  );
  process.exitCode = 1;
} else console.log('Every batch is reviewed. Next: node scripts/vocab-audit/apply.mjs');
console.log('Progress: node scripts/vocab-audit/status.mjs');
