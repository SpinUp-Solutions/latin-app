// Shared by word.mjs, plan.mjs and apply.mjs: reading the download, saving edits, and the
// compact text view of a word. Local files only; never touches Firestore.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkWord, verifiedCells } from './check.mjs';
import { OUT } from './paths.mjs';

export const DOCS = join(OUT, 'docs');
export const EDITED = join(OUT, 'edited');
export const PROGRESS = join(OUT, 'progress');
export const NOTES = join(OUT, 'notes');
export const BATCHES = join(OUT, 'batches.json');

export const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
export const index = () => readJson(join(OUT, 'index.json')).words;
export const progress = id =>
  existsSync(join(PROGRESS, `${id}.json`)) ? readJson(join(PROGRESS, `${id}.json`)) : null;
export const isEdited = id => existsSync(join(EDITED, `${id}.json`));
export const original = id => readJson(join(DOCS, `${id}.json`));
export const current = id => (isEdited(id) ? readJson(join(EDITED, `${id}.json`)) : original(id));

// The app derives sort_key from the lemma (stripMacrons in src/utils/exercises/helpers.ts).
const sortKey = word => word.normalize('NFD').replace(/̄/g, '').normalize('NFC');

/** Saves an edited word. Cells lose exact duplicates, and sort_key follows the lemma. */
export function save(id, data) {
  mkdirSync(EDITED, { recursive: true });
  const before = original(id);
  const tidy = dedupeCells(nfc(data));
  if (tidy.word !== before.data.word && 'sort_key' in before.data) tidy.sort_key = sortKey(tidy.word);
  writeFileSync(join(EDITED, `${id}.json`), JSON.stringify({ id, updateTime: before.updateTime, data: tidy }, null, 2));
}

// ---------- paths ----------
export const keys = path => path.match(/[^.[\]]+/g).map(k => (/^\d+$/.test(k) ? Number(k) : k));
export const get = (o, path) => keys(path).reduce((n, k) => n?.[k], o);
export function put(o, path, value) {
  const ks = keys(path);
  let node = o;
  ks.slice(0, -1).forEach((k, i) => {
    node[k] ??= typeof ks[i + 1] === 'number' ? [] : {};
    node = node[k];
  });
  node[ks.at(-1)] = value;
}
export const nfc = v =>
  typeof v === 'string'
    ? v.normalize('NFC')
    : Array.isArray(v)
      ? v.map(nfc)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nfc(x)]))
        : v;

const TABLE_FIELDS = ['declension_table', 'degrees_table', 'conjugation_table'];
function dedupeCells(data) {
  const walk = node =>
    Array.isArray(node)
      ? node.every(x => typeof x === 'string')
        ? [...new Set(node)]
        : node.map(walk)
      : node && typeof node === 'object'
        ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]))
        : node;
  for (const field of TABLE_FIELDS) if (data[field]) data[field] = walk(data[field]);
  return data;
}

// ---------- rule fixes ----------
export const CELL_FIXES = ['paradigm', 'paradigm-missing', 'ending-macron', 'stem-macron'];
/** Fixes that need no knowledge of the word; plan.mjs applies them to every word up front. */
export const PREPASS_FIXES = ['lemma-macron', 'placeholder', 'participle-locative', 'alternate-form'];
export const ALL_FIXES = [...CELL_FIXES, 'pronoun-person', 'genitive-mismatch', 'conjugation-label', ...PREPASS_FIXES];

function applyFix(doc, issue) {
  const choice = Array.isArray(issue.expected) ? issue.expected[0] : issue.expected;
  if (issue.check === 'pronoun-person') return put(doc, 'person', choice);
  if (issue.check === 'genitive-mismatch' || issue.check === 'conjugation-label') return put(doc, issue.path, choice);
  const value = get(doc, issue.path);
  if (issue.check === 'paradigm-missing' || !Array.isArray(value)) return put(doc, issue.path, [choice]);
  const i = value.indexOf(issue.actual);
  if (i > -1) value[i] = choice;
}

/**
 * Applies the named rule fixes to `doc` in place and returns what it changed.
 * The fixes that replace a whole cell (PREPASS_FIXES) go last, on the cells as the others left them.
 */
export function applyFixes(doc, which = ALL_FIXES, keep = new Set()) {
  const applied = [];
  for (const issue of checkWord(doc))
    if (
      !PREPASS_FIXES.includes(issue.check) &&
      which.includes(issue.check) &&
      issue.expected &&
      !keep.has(issue.path ?? '')
    ) {
      applyFix(doc, issue);
      applied.push(issue);
    }
  for (const issue of checkWord(doc))
    if (PREPASS_FIXES.includes(issue.check) && which.includes(issue.check) && !keep.has(issue.path)) {
      put(doc, issue.path, issue.expected);
      applied.push(issue);
    }
  return applied;
}

/** Every string under `node`, with its path. */
export function* strings(node, path) {
  if (typeof node === 'string') yield [path, node];
  else if (Array.isArray(node)) for (const [i, v] of node.entries()) yield* strings(v, `${path}[${i}]`);
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) yield* strings(v, path ? `${path}.${k}` : k);
}

// ---------- compact rendering ----------
const CASES = ['nominative', 'genitive', 'dative', 'accusative', 'ablative', 'vocative', 'locative'];
const GENDERS = ['masculine', 'feminine', 'neuter'];
const cell = v => (v == null ? '–' : Array.isArray(v) ? (v.length ? v.join('/') : '–') : String(v));
const isCases = node => node && typeof node === 'object' && Object.keys(node).some(k => CASES.includes(k));
const isPersons = node =>
  node &&
  typeof node === 'object' &&
  'singular' in node &&
  'plural' in node &&
  node.singular &&
  typeof node.singular === 'object' &&
  !Array.isArray(node.singular);

/**
 * `view.verified` holds the cell paths to hide; `view.hidden` counts the cells left out.
 * A table of cases prints its path once and one indented row per case, and a row or table
 * with nothing in it prints as a single "–".
 */
function renderTable(node, path, lines, view) {
  const hide = paths => {
    const hidden = paths.length > 0 && paths.every(p => view.verified.has(p));
    if (hidden) view.hidden += paths.length;
    return hidden;
  };
  if (node == null) return lines.push(`${path}: –`);
  if (Array.isArray(node) || typeof node !== 'object') {
    if (!hide([path])) lines.push(`${path}: ${cell(node)}`);
    return;
  }
  if (isPersons(node)) {
    const people = n => ['first', 'second', 'third'].filter(p => p in (node[n] ?? {}));
    if (hide(['singular', 'plural'].flatMap(n => people(n).map(p => `${path}.${n}.${p}`)))) return;
    const row = n =>
      people(n)
        .map(p => cell(node[n][p]))
        .join(' · ');
    const text = `${row('singular')} | ${row('plural')}`;
    const listed = people('singular').join(',');
    return lines.push(
      `${path}: ${/[^–·| ]/.test(text) ? text : '–'}${listed === 'first,second,third' ? '' : `  (${listed})`}`
    );
  }
  if (isCases(node)) {
    const rows = [];
    for (const kase of CASES) {
      const row = node[kase];
      if (row === undefined) continue;
      const at = `${path}.${kase}`;
      if (row && GENDERS.some(g => g in row)) {
        const all = n => GENDERS.map(g => cell(row[g]?.[n])).join(' · ');
        const empty = [all('singular'), all('plural')].every(s => s === '– · – · –');
        if (kase === 'locative' && empty) continue;
        if (hide(GENDERS.flatMap(g => ['singular', 'plural'].map(n => `${at}.${g}.${n}`)))) continue;
        rows.push([kase, empty ? '–' : `${all('singular')} | ${all('plural')}`]);
      } else if (row && ('singular' in row || 'plural' in row)) {
        const empty = row.singular == null && row.plural == null;
        if (kase === 'locative' && empty) continue;
        if (hide([`${at}.singular`, `${at}.plural`])) continue;
        rows.push([kase, empty ? '–' : `${cell(row.singular)} | ${cell(row.plural)}`]);
      } else if (!hide([at])) rows.push([kase, cell(row)]);
    }
    if (!rows.length) return;
    if (rows.every(([, text]) => text === '–')) return lines.push(`${path}: – (every case)`);
    if (rows.length === 1) return lines.push(`${path}.${rows[0][0]}: ${rows[0][1]}`);
    lines.push(`${path}:`, ...rows.map(([kase, text]) => `  .${kase}: ${text}`));
    return;
  }
  for (const [k, v] of Object.entries(node)) renderTable(v, `${path}.${k}`, lines, view);
}

// Fields the reviewer never needs: bookkeeping, and sort_key, which follows the lemma.
const SKIPPED = new Set([
  ...TABLE_FIELDS,
  'word',
  'part_of_speech',
  'random_index',
  'createdAt',
  'updatedAt',
  'sort_key',
]);

/** The compact view. Rows whose cells all equal the regular paradigm are left out unless `full`. */
export function render(id, { full = false } = {}) {
  const { data: d } = current(id);
  const mark = [progress(id) ? 'REVIEWED' : null, isEdited(id) ? 'EDITED' : null].filter(Boolean).join(' ');
  const lines = [`# ${d.word} · ${d.part_of_speech} · ${id}${mark ? ` [${mark}]` : ''}`];
  for (const [k, v] of Object.entries(d)) {
    if (SKIPPED.has(k) || k.startsWith('_')) continue;
    if (k === 'definitions') lines.push(`definitions: ${(v ?? []).map((x, i) => `[${i}] ${x}`).join(' ') || '–'}`);
    else if (Array.isArray(v) && v.every(x => x && typeof x === 'object'))
      lines.push(
        `${k}: ${v.map((x, i) => `[${i}] ${x.full_form}${x.shortened_form ? ` (${x.shortened_form})` : ' (–)'}`).join(' · ') || '–'}`
      );
    else if (v && typeof v === 'object') lines.push(`${k}: ${JSON.stringify(v)}`);
    else lines.push(`${k}: ${v ?? '–'}`);
  }
  const view = { verified: full ? new Set() : verifiedCells(d), hidden: 0 };
  for (const field of TABLE_FIELDS) if (d[field] !== undefined) renderTable(d[field], field, lines, view);
  if (view.hidden) lines.push(`regular: ${view.hidden} cells equal the regular paradigm and are not shown`);
  return lines.join('\n');
}

export const show = v =>
  v === undefined || v === null
    ? '∅'
    : Array.isArray(v) && v.every(x => typeof x !== 'object' || x === null)
      ? v.join(' / ')
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);

const ISSUE_LINES = 12;
const issueLine = i =>
  `- ${i.severity === 'error' ? 'E' : 'W'} ${i.check} ${i.path ?? ''}${i.actual !== undefined ? `: ${show(i.actual)}` : ''}${'expected' in i ? ` → ${show(i.expected)}` : ''}${i.note ? ` (${i.note})` : ''}${i.chars ? ` [${i.chars}]` : ''}`;

/**
 * Rule findings. Findings on table cells that `accept` can fix are summed up per check with
 * a few examples, since the cells themselves are in the view; `all` lists every finding.
 */
export function renderIssues(id, { all = false } = {}) {
  const issues = checkWord(current(id).data).filter(i => i.severity !== 'info');
  if (!issues.length) return 'issues: none';
  if (all) return [`issues (${issues.length}):`, ...issues.map(issueLine)].join('\n');
  const lines = [`issues (${issues.length}):`];
  const byCheck = Map.groupBy(issues, i => i.check);
  for (const [check, list] of byCheck) {
    if (CELL_FIXES.includes(check) && list.length > 2) {
      const examples = [...new Set(list.map(i => `${show(i.actual)} → ${show(i.expected)}`))].slice(0, 4);
      lines.push(`- ${list[0].severity === 'error' ? 'E' : 'W'} ${check} ×${list.length}, e.g. ${examples.join('; ')}`);
      continue;
    }
    lines.push(...list.slice(0, ISSUE_LINES).map(issueLine));
    if (list.length > ISSUE_LINES) lines.push(`- … ${list.length - ISSUE_LINES} more ${check}`);
  }
  if ([...byCheck.keys()].some(check => CELL_FIXES.includes(check) && byCheck.get(check).length > 2))
    lines.push(`(every finding: issues ${id} --all)`);
  return lines.join('\n');
}

/** Changed leaves between two versions of a word, as "- path: before → after" lines. */
export function changes(before, after, path = '', out = []) {
  const leaf = v =>
    v === null || typeof v !== 'object' || (Array.isArray(v) && v.every(x => typeof x !== 'object' || x === null));
  if (leaf(before) || leaf(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) out.push(`- ${path}: ${show(before)} → ${show(after)}`);
    return out;
  }
  for (const k of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]))
    changes(before?.[k], after?.[k], Array.isArray(after) ? `${path}[${k}]` : path ? `${path}.${k}` : k, out);
  return out;
}

/** The batches written by plan.mjs: [{ n, ids, chars }]. */
export function batches() {
  if (!existsSync(BATCHES)) {
    console.error('No batches yet. Run: node scripts/vocab-audit/plan.mjs');
    process.exit(1);
  }
  return readJson(BATCHES).batches;
}
