// The one tool a reviewing agent runs. Reads the download (out/docs), writes edits to
// out/edited and review marks to out/progress. Never touches Firestore.
//
//   node scripts/vocab-audit/word.mjs next <n>                  the next unreviewed words of batch n, with rule findings
//   node scripts/vocab-audit/word.mjs done <n>                  mark the words `next` showed as reviewed, then show the next ones
//   node scripts/vocab-audit/word.mjs set <id> <path>=<value> [<path>=<value> ...]
//   node scripts/vocab-audit/word.mjs accept <id> <all|check,check> [--keep path,path]
//   node scripts/vocab-audit/word.mjs replace <id> <path> <from>=<to>   in every form under path that starts with <from>
//   node scripts/vocab-audit/word.mjs clear <id> <path>         empty every cell under path
//   node scripts/vocab-audit/word.mjs note <id> <text>          leave a note on a word (rejected finding, doubt)
//   node scripts/vocab-audit/word.mjs show <id> [--full]        the word now; --full includes the regular cells
//   node scripts/vocab-audit/word.mjs issues <id> [--all]       rule findings on the word now
//   node scripts/vocab-audit/word.mjs diff <id>                 changes against the download
//   node scripts/vocab-audit/word.mjs reset <id>                drop all edits to the word
//   node scripts/vocab-audit/word.mjs status                    progress per batch
//   node scripts/vocab-audit/word.mjs batch <n>                 the words in batch n
//
// Values: JSON when they parse as JSON ("null", "true", "[\"a\",\"b\"]"), otherwise text.
// Text set on a table cell becomes a list; separate alternatives with " / ".
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strip } from './paradigms.mjs';
import {
  ALL_FIXES,
  EDITED,
  NOTES,
  PROGRESS,
  applyFixes,
  batches,
  changes,
  current,
  get,
  index,
  isEdited,
  keys,
  nfc,
  original,
  progress,
  put,
  readJson,
  render,
  renderIssues,
  save,
  strings,
} from './lib.mjs';
import { checkWord } from './check.mjs';

// How much text `next` prints at once. Several short words share a page; a long one gets its own,
// and so does every verb.
const PAGE_CHARS = Number(process.env.VOCAB_AUDIT_PAGE_CHARS ?? 8000);

function fail(message) {
  console.error(message);
  process.exit(1);
}
function resolve(ref) {
  if (!ref) fail('Pass a word id.');
  const words = index();
  const byId = words.find(w => w.id === ref);
  if (byId) return byId.id;
  const matches = words.filter(w => w.word.normalize('NFC') === ref.normalize('NFC') || strip(w.word) === strip(ref));
  if (matches.length === 1) return matches[0].id;
  if (!matches.length) fail(`No word "${ref}".`);
  fail(`"${ref}" matches ${matches.length} documents; use the id: ${matches.map(m => m.id).join(', ')}`);
}
const batch = n => batches().find(b => b.n === Number(n)) ?? fail(`No batch ${n}; there are ${batches().length}.`);

// ---------- pages ----------
const pageFile = n => join(PROGRESS, `page-${n}.json`);
function currentPage(n) {
  if (!existsSync(pageFile(n))) return null;
  const ids = readJson(pageFile(n)).ids.filter(id => !progress(id));
  return ids.length ? ids : null;
}
function printNext(n) {
  const { ids } = batch(n);
  const left = ids.filter(id => !progress(id));
  if (!left.length) return console.log(`batch ${n} is fully reviewed`);
  let page = currentPage(n);
  const text = id => `${render(id)}\n${renderIssues(id)}`;
  if (!page) {
    page = [];
    let chars = 0;
    for (const id of left) {
      const size = text(id).length;
      if (page.length && chars + size > PAGE_CHARS) break;
      page.push(id);
      chars += size;
      // A verb gets the reviewer's whole attention.
      if (current(id).data.part_of_speech === 'verb') break;
    }
    mkdirSync(PROGRESS, { recursive: true });
    writeFileSync(pageFile(n), JSON.stringify({ ids: page }));
  }
  const from = ids.length - left.length + 1;
  console.log(
    `batch ${n}: words ${from}${page.length > 1 ? `–${from + page.length - 1}` : ''} of ${ids.length}\n\n${page.map(text).join('\n\n')}`
  );
}

// A mistyped path must not add a key to the stored word. The only keys an edit may add are
// those of a new entry in a list of forms (principal_parts, dictionary_forms).
const FORM_KEYS = new Set(['full_form', 'shortened_form']);
function newKey(doc, path) {
  let node = doc;
  for (const key of keys(path)) {
    if (typeof key === 'string' && !FORM_KEYS.has(key) && (node == null || typeof node !== 'object' || !(key in node)))
      return key;
    node = node?.[key];
  }
  return null;
}

function parseValue(raw, path, existing) {
  try {
    const value = JSON.parse(raw);
    // "3" on a string field such as declension stays the string "3".
    return typeof existing === 'string' && (typeof value === 'number' || typeof value === 'boolean') ? raw : value;
  } catch {
    const tableCell = Array.isArray(existing) || (existing == null && /_table\./.test(path));
    return tableCell ? raw.split(' / ').map(s => s.trim()) : raw;
  }
}

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  if (i > -1) args.splice(i, 1);
  return i > -1;
};
const [full, all] = [flag('--full'), flag('--all')];
const [command, ref, ...rest] = args;

switch (command) {
  case 'status': {
    let reviewed = 0;
    let total = 0;
    for (const { n, ids } of batches()) {
      const done = ids.filter(id => progress(id)).length;
      reviewed += done;
      total += ids.length;
      console.log(`batch ${n}: ${done}/${ids.length} reviewed, ${ids.filter(isEdited).length} edited`);
    }
    console.log(`total: ${reviewed}/${total} reviewed`);
    break;
  }
  case 'batch':
    for (const id of batch(ref).ids) {
      const { word, part_of_speech } = current(id).data;
      console.log(`${progress(id) ? '✓' : ' '} ${word} · ${part_of_speech} · ${id}`);
    }
    break;
  case 'next':
    printNext(ref);
    break;
  case 'done': {
    const page = currentPage(ref);
    if (!page) {
      // Nothing was shown yet (or it is all reviewed): show, don't mark.
      printNext(ref);
      break;
    }
    // Nobody reviews the result, so a word with rule errors is not accepted in silence.
    const open = page.filter(
      id => !existsSync(join(NOTES, `${id}.json`)) && checkWord(current(id).data).some(i => i.severity === 'error')
    );
    if (open.length) {
      console.log(
        `not marked: ${open.length} word(s) still have rule errors. Fix them, or where a rule is wrong for the word say why with \`note <id> <text>\`, then run \`done ${ref}\` again.\n\n${open
          .map(id => `# ${current(id).data.word} · ${id}\n${renderIssues(id)}`)
          .join('\n\n')}`
      );
      break;
    }
    for (const id of page) {
      const noteFile = join(NOTES, `${id}.json`);
      writeFileSync(
        join(PROGRESS, `${id}.json`),
        JSON.stringify({
          id,
          batch: Number(ref),
          note: existsSync(noteFile) ? readJson(noteFile).note : null,
          at: new Date().toISOString(),
          by: process.env.VOCAB_AUDIT_REVIEWER ?? null,
          edited: isEdited(id),
        })
      );
    }
    rmSync(pageFile(ref), { force: true });
    console.log(`reviewed: ${page.map(id => current(id).data.word).join(', ')}\n`);
    printNext(ref);
    break;
  }
  case 'note': {
    const id = resolve(ref);
    if (!rest.length) fail('Pass the note text.');
    mkdirSync(NOTES, { recursive: true });
    writeFileSync(join(NOTES, `${id}.json`), JSON.stringify({ id, note: rest.join(' ') }));
    console.log(`noted: ${current(id).data.word}`);
    break;
  }
  case 'show':
    console.log(render(resolve(ref), { full }));
    break;
  case 'issues':
    console.log(renderIssues(resolve(ref), { all }));
    break;
  case 'set': {
    const id = resolve(ref);
    if (!rest.length) fail('Nothing to set: pass <path>=<value>.');
    const doc = nfc(structuredClone(current(id).data));
    for (const pair of rest) {
      const at = pair.indexOf('=');
      if (at < 1) fail(`Not <path>=<value>: ${pair}`);
      const path = pair.slice(0, at);
      const top = keys(path)[0];
      if (!(top in original(id).data))
        fail(`Unknown field "${top}". Only existing fields can be set (the lemma is the field "word").`);
      const unknown = newKey(doc, path);
      if (unknown) fail(`"${unknown}" in ${path} is not a key of this word. Nothing was set.`);
      put(doc, path, nfc(parseValue(pair.slice(at + 1), path, get(doc, path))));
    }
    save(id, doc);
    console.log(`set ${rest.length} value(s) on ${doc.word}\n${renderIssues(id)}`);
    break;
  }
  case 'accept': {
    const id = resolve(ref);
    const which = !rest[0] || rest[0] === 'all' ? ALL_FIXES : rest[0].split(',');
    const keepAt = rest.indexOf('--keep');
    const keep = new Set(keepAt > -1 ? rest[keepAt + 1].split(',') : []);
    const doc = nfc(structuredClone(current(id).data));
    const applied = applyFixes(doc, which, keep);
    save(id, doc);
    console.log(`applied ${applied.length} fix(es) to ${doc.word}\n${renderIssues(id)}`);
    break;
  }
  case 'replace': {
    const id = resolve(ref);
    const [path, pair] = rest;
    const at = pair?.indexOf('=') ?? -1;
    if (!path || at < 1) fail('Usage: replace <id> <path> <from>=<to>');
    const [from, to] = [pair.slice(0, at), pair.slice(at + 1)].map(s => s.normalize('NFC'));
    const doc = nfc(structuredClone(current(id).data));
    let changed = 0;
    for (const [at, value] of [...strings(get(doc, path), path)])
      if (value.startsWith(from)) {
        put(doc, at, to + value.slice(from.length));
        changed++;
      }
    if (!changed) fail(`No form under ${path} starts with "${from}".`);
    save(id, doc);
    console.log(`replaced ${from}… with ${to}… in ${changed} form(s) of ${doc.word}\n${renderIssues(id)}`);
    break;
  }
  case 'clear': {
    const id = resolve(ref);
    const [path] = rest;
    const doc = nfc(structuredClone(current(id).data));
    const node = path && get(doc, path);
    if (node === undefined) fail(`Nothing at ${path}.`);
    // A cell is a list of forms; every cell under the path becomes null, the structure stays.
    const cells = new Set([...strings(node, path)].map(([at]) => at.replace(/\[\d+\]$/, '')));
    for (const at of cells) put(doc, at, null);
    save(id, doc);
    console.log(`emptied ${cells.size} cell(s) of ${doc.word}\n${renderIssues(id)}`);
    break;
  }
  case 'diff': {
    const id = resolve(ref);
    const lines = changes(original(id).data, current(id).data);
    console.log(lines.length ? lines.join('\n') : 'no changes');
    break;
  }
  case 'reset': {
    const id = resolve(ref);
    rmSync(join(EDITED, `${id}.json`), { force: true });
    console.log(`reset ${id}`);
    break;
  }
  default:
    console.log(
      readFileSync(new URL(import.meta.url), 'utf8')
        .split('\n')
        .filter(l => l.startsWith('//'))
        .map(l => l.slice(3))
        .join('\n')
    );
}
