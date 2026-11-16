// Rule-based checks on every downloaded word, no AI.
// Writes out/checks.json (all issues) and prints a summary.
// Usage: node scripts/vocab-audit/check.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import jitiFactory from 'jiti';
import { OUT } from './paths.mjs';
import { adjectiveCells, nounCells, strip, verbCells } from './paradigms.mjs';

const schemas = jitiFactory(import.meta.url)('../../shared/types/vocabulary/schemas/index.ts');

const ENGLISH_FIELDS = new Set([
  'translation',
  'definitions',
  'etymology',
  'pronunciation',
  'createdAt',
  'updatedAt',
  'type',
  'sort_key',
  'part_of_speech',
  'gender',
  'declension',
  'conjugation',
  'pronoun_type',
  'person',
  'case',
  'random_index',
  'is_deponent',
]);
// Latin forms: plain letters, macron vowels, diaeresis, and the punctuation dictionary entries use.
const LATIN_FORM = /^[A-Za-zāēīōūȳĀĒĪŌŪȲäëïöüÄËÏÖÜ\s\-–'’(),.;\/]*$/u;
const FOREIGN_SCRIPT = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}\p{Script=Greek}]/u;

function* strings(value, path) {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
}

const get = (object, path) => path.split('.').reduce((node, key) => node?.[key], object);
const same = (a, b) => a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase();

// ---------- one form per cell ----------
// The client wants one form in each cell, the regular one. Alternates that a general rule
// yields for every word are removed: -ēre for -ērunt, -re for -ris, -īs for -ēs, and
// syncopated perfects (amāstī for amāvistī). Two more fixes need no judgement either:
// placeholder text in a cell becomes an empty cell, and participles get no locative.
const TABLES = ['declension_table', 'degrees_table', 'conjugation_table'];
const ENDING_RULES = [
  { note: '-ēre for -ērunt', path: /\.active\.perfect\.plural\.third$/, regular: 'ērunt', alternate: 'ēre' },
  {
    note: '-re for -ris',
    path: /\.(indicative|subjunctive)\.passive\.(present|imperfect|future)\.singular\.second$/,
    regular: 'ris',
    alternate: 're',
  },
  { note: '-īs for -ēs', path: /\.accusative(\.(masculine|feminine))?\.plural$/, regular: 'ēs', alternate: 'īs' },
  // A present participle used as a participle has -e; -ī is its adjectival use. Most stored verbs have -e.
  {
    note: '-ī for -e in the participle',
    path: /\.participle\.present\.active\.ablative\.(masculine|feminine|neuter)\.singular$/,
    regular: 'e',
    alternate: 'ī',
  },
];
const PERFECT_ACTIVE_PATH = /\.active\.(perfect|pluperfect|future_perfect)\.|\.infinitive\.perfect\.active$/;
/** Cells where the first expected form is the one to store, so a cell equal to it needs no review. */
const REGULAR_FIRST = /\.passive\.(perfect|pluperfect|future_perfect)\.(singular|plural)\./;
const regularFirst = path => REGULAR_FIRST.test(path) || ENDING_RULES.some(rule => rule.path.test(path));

function* tableCells(node, path) {
  if (Array.isArray(node)) {
    if (node.length && node.every(x => typeof x === 'string')) yield [path, node];
  } else if (node && typeof node === 'object')
    for (const [key, value] of Object.entries(node)) yield* tableCells(value, `${path}.${key}`);
}

/** amāvistī → amāstī, audīvī → audiī, mōverint → mōrint: is `short` a syncopated `long`? */
function syncopated(long, short) {
  const [l, s] = [strip(long), strip(short)];
  if (s.length >= l.length) return false;
  for (let i = l.indexOf('v'); i > -1; i = l.indexOf('v', i + 1))
    if ([1, 2].some(n => l.slice(0, i) + l.slice(i + n) === s)) return true;
  return false;
}

/** amātus est / amāta est / amātum est → amātus est: compound forms that differ only in gender. */
function masculineOnly(forms) {
  if (forms.length < 2) return null;
  const parts = forms.map(form => form.trim().split(/\s+/));
  if (parts.some(p => p.length < 2 || p.slice(1).join(' ') !== parts[0].slice(1).join(' '))) return null;
  const stems = new Set();
  for (const [participle] of parts) {
    const ending = ['us', 'um', 'am', 'ae', 'a', 'ī'].find(e => participle.endsWith(e));
    if (!ending) return null;
    stems.add(participle.slice(0, -ending.length));
  }
  if (stems.size !== 1) return null;
  for (const ending of ['us', 'ī', 'um']) {
    const i = parts.findIndex(([participle]) => participle.endsWith(ending));
    if (i > -1) return forms[i];
  }
  return null;
}

// Text standing in for "no form": —, null, ]null, "(not used)", or nothing with a Latin letter in it.
const placeholder = form =>
  /^\W*null$/i.test(form.trim()) || /\(not used\)/i.test(form) || !/\p{Script=Latin}/u.test(form);
const PARTICIPLE_LOCATIVE = /\.participle\..*\.locative\./;

/** Findings on single table cells that need no knowledge of the word: all of them have a fix. */
function cellIssues(d) {
  const issues = [];
  for (const table of TABLES) {
    for (const [path, forms] of tableCells(d[table], table)) {
      if (PARTICIPLE_LOCATIVE.test(path)) {
        issues.push({ severity: 'warn', check: 'participle-locative', path, actual: forms, expected: null });
        continue;
      }
      const real = forms.filter(f => !placeholder(f));
      if (real.length < forms.length) {
        issues.push({
          severity: 'error',
          check: 'placeholder',
          path,
          actual: forms,
          expected: real.length ? real : null,
        });
        if (!real.length) continue;
      }
      const kept = [...new Set(real.map(f => f.normalize('NFC')))];
      const notes = kept.length < real.length ? ['duplicate'] : [];
      const drop = (form, note) => {
        kept.splice(kept.indexOf(form), 1);
        notes.push(note);
      };
      const rule = ENDING_RULES.find(r => r.path.test(path));
      if (rule) {
        const stemOf = (form, ending) =>
          strip(form).endsWith(strip(ending)) ? strip(form).slice(0, -ending.length) : null;
        for (const form of [...kept]) {
          const stem = stemOf(form, rule.alternate);
          if (stem == null) continue;
          if (kept.some(other => other !== form && stemOf(other, rule.regular) === stem)) drop(form, rule.note);
          else if (kept.length === 1 && form.endsWith(rule.alternate)) {
            // The alternate is stored alone: swap in the regular ending.
            kept[0] = form.slice(0, -rule.alternate.length) + rule.regular;
            notes.push(rule.note);
          }
        }
      }
      if (PERFECT_ACTIVE_PATH.test(path))
        for (const form of [...kept])
          if (kept.some(other => other !== form && syncopated(other, form))) drop(form, 'syncopated perfect');
      const masculine = masculineOnly(kept);
      if (masculine) {
        kept.splice(0, kept.length, masculine);
        notes.push('gender variants');
      }
      if (notes.length)
        issues.push({
          severity: 'warn',
          check: 'alternate-form',
          path,
          actual: real,
          expected: kept,
          note: notes.join(', '),
        });
      if (kept.length > 1) issues.push({ severity: 'warn', check: 'multiple-forms', path, actual: kept });
    }
  }
  return issues;
}

function compareCells(issues, table, tablePath, cells) {
  for (const [key, expected] of Object.entries(cells)) {
    const actual = get(table, key);
    const path = `${tablePath}.${key}`;
    const shown = expected.map(e => e.stem + e.ending);
    if (actual == null || actual.length === 0) {
      if (tablePath !== 'conjugation_table')
        issues.push({ severity: 'error', check: 'paradigm-missing', path, expected: shown });
      continue;
    }
    for (const form of actual) {
      const matches = expected.filter(e => strip(e.stem + e.ending) === strip(form));
      if (!matches.length) {
        issues.push({ severity: 'error', check: 'paradigm', path, actual: form, expected: shown });
        continue;
      }
      const f = form.normalize('NFC').toLowerCase();
      const fixed = matches.map(e => e.stem + e.ending);
      if (!matches.some(e => f.endsWith(e.ending.normalize('NFC').toLowerCase())))
        issues.push({ severity: 'warn', check: 'ending-macron', path, actual: form, expected: fixed });
      else if (!matches.some(e => f.startsWith(e.stem.normalize('NFC').toLowerCase())))
        issues.push({ severity: 'warn', check: 'stem-macron', path, actual: form, expected: fixed });
    }
  }
}

/** A 3rd-conjugation verb in -iō or -ior (capiō, patior) has its own label, 3io. */
const conjugationOf = d =>
  d.conjugation === '3' && /(io|ior)$/.test(strip(d.principal_parts?.[0]?.full_form ?? d.word ?? ''))
    ? '3io'
    : d.conjugation;

/** The regular paradigm for a word: { table, cells, notes }, cells keyed by path inside the table. */
function paradigmFor(d) {
  const pos = d.part_of_speech;
  let table;
  let result;
  if (pos === 'noun') {
    table = 'declension_table';
    result = nounCells({
      nom: d.nominative_singular?.full_form || d.declension_table?.nominative?.singular?.[0],
      gen: d.declension_table?.genitive?.singular?.[0] || d.genitive_singular?.full_form,
      declension: d.declension,
      gender: d.gender,
    });
    if (!result.skip) result = { cells: result };
  } else if (pos === 'adjective') {
    table = 'degrees_table';
    result = adjectiveCells({ word: d.word, declension: d.declension, degrees: d.degrees_table });
  } else if (pos === 'verb') {
    table = 'conjugation_table';
    result = verbCells({
      conjugation: conjugationOf(d),
      principalParts: d.principal_parts,
      isDeponent: d.is_deponent,
      table: d.conjugation_table,
    });
  } else return { notes: [] };
  return {
    table,
    cells: result.skip ? null : result.cells,
    notes: [...(result.skip ? [result.skip] : []), ...(result.notes ?? [])],
  };
}

/**
 * Paths of the cells that hold exactly the regular form built from the word's labels and
 * stems. Cells where the paradigm allows a word-specific choice (-e or -ī, -um or -ium) are
 * never included: those need a reviewer.
 */
export function verifiedCells(d) {
  const verified = new Set();
  const { table, cells } = paradigmFor(d);
  if (!cells) return verified;
  for (const [key, expected] of Object.entries(cells)) {
    const actual = get(d[table], key);
    const path = `${table}.${key}`;
    if (!Array.isArray(actual) || actual.length !== 1 || typeof actual[0] !== 'string') continue;
    if (expected.length > 1 && !regularFirst(path)) continue;
    if (same(actual[0], expected[0].stem + expected[0].ending)) verified.add(path);
  }
  return verified;
}

export function checkWord(d) {
  const issues = [];
  const add = (severity, check, extra) => issues.push({ severity, check, ...extra });

  // Characters
  for (const [path, value] of strings(d, '')) {
    const top = path.split(/[.[]/)[0];
    if (ENGLISH_FIELDS.has(top)) {
      // An etymology may quote cognates in any script (Greek, Sanskrit, Armenian).
      if (top === 'etymology') continue;
      const bad = [...value].filter(ch => FOREIGN_SCRIPT.test(ch) || /\p{Script=Greek}/u.test(ch));
      if (bad.length) add('error', 'foreign-script', { path, actual: value, chars: [...new Set(bad)].join('') });
    } else if (!LATIN_FORM.test(value)) {
      // Prepositions note their case as "per (+ Acc)".
      const bad = [...value].filter(ch => !LATIN_FORM.test(ch) && !(top === 'dictionary_entry' && ch === '+'));
      if (!bad.length) continue;
      add('error', 'non-latin-char', { path, actual: value, chars: [...new Set(bad)].join('') });
    }
  }

  // Schema
  const pos = d.part_of_speech;
  const schema = pos === 'pronoun' ? schemas.PronounSchema : schemas.VocabularyWordSchema;
  const parsed = schema.safeParse(d);
  if (!parsed.success)
    for (const e of parsed.error.issues.slice(0, 10))
      add('error', 'schema', { path: e.path.join('.'), note: e.message });

  // Required content
  if (!d.translation?.trim()) add('error', 'empty-translation', {});
  if (!Array.isArray(d.definitions) || !d.definitions.some(x => x?.trim())) add('error', 'empty-definitions', {});
  if (['noun', 'verb', 'adjective'].includes(pos) && !d.dictionary_entry?.trim())
    add('error', 'missing-dictionary-entry', {});
  // A note in brackets may come first: "(intr.) to be present". Impersonal verbs read "it pleases".
  if (pos === 'verb' && d.translation && !/^(\([^)]*\)\s*)*(to|it)\s/i.test(d.translation.trim()))
    add('error', 'verb-translation-to', { actual: d.translation });
  for (const [field, from] of [
    ['principal_parts', 1],
    ['dictionary_forms', 1],
  ]) {
    const list = d[field];
    if (Array.isArray(list)) {
      if (field === 'dictionary_forms' && list.length === 0 && pos === 'adjective')
        add('error', 'empty-dictionary-forms', {});
      list.forEach((form, i) => {
        if (i >= from && form?.full_form && !form.shortened_form?.trim())
          add('error', 'empty-shortened-form', { path: `${field}[${i}]`, actual: form.full_form });
      });
    }
  }
  if (pos === 'noun' && d.genitive_singular?.full_form && !d.genitive_singular.shortened_form?.trim())
    add('error', 'empty-shortened-form', { path: 'genitive_singular', actual: d.genitive_singular.full_form });

  // Pronoun person from the table's nominative
  if (pos === 'pronoun' && d.pronoun_type === 'personal') {
    const nomSg = strip(d.declension_table?.nominative?.singular?.[0]);
    const nomPl = strip(d.declension_table?.nominative?.plural?.[0]);
    const expected =
      nomSg === 'ego' || nomPl === 'nos'
        ? '1st'
        : nomSg === 'tu' || nomPl === 'vos'
          ? '2nd'
          : d.declension_table?.genitive?.singular?.some(f => strip(f) === 'sui')
            ? '3rd'
            : null;
    if (expected && d.person !== expected) add('error', 'pronoun-person', { actual: d.person, expected });
  }

  if (pos === 'verb' && conjugationOf(d) !== d.conjugation)
    add('error', 'conjugation-label', { path: 'conjugation', actual: d.conjugation, expected: conjugationOf(d) });
  if (pos === 'verb' && !d.conjugation)
    add('error', 'conjugation-label', { path: 'conjugation', note: 'empty: set 1, 2, 3, 3io, 4 or irregular' });

  // A vowel before another vowel is short: no verb ends in -ēō or -ēor (audeō, not audēō).
  if (pos === 'verb')
    for (const [path, value] of [
      ['word', d.word],
      ['principal_parts[0].full_form', d.principal_parts?.[0]?.full_form],
      ['principal_parts[0].shortened_form', d.principal_parts?.[0]?.shortened_form],
      ['dictionary_entry', d.dictionary_entry],
    ]) {
      if (typeof value !== 'string') continue;
      const fixed = value.normalize('NFC').replace(/ē(ō|or)(?=$|,)/, 'e$1');
      if (fixed !== value.normalize('NFC')) add('error', 'lemma-macron', { path, actual: value, expected: fixed });
    }

  // Lemma consistency
  const lemmaForms =
    {
      noun: [d.nominative_singular?.full_form, d.declension_table?.nominative?.singular?.[0]],
      verb: [d.principal_parts?.[0]?.full_form],
      adjective: [d.dictionary_forms?.[0]?.full_form, d.degrees_table?.positive?.nominative?.masculine?.singular?.[0]],
    }[pos] ?? [];
  for (const form of lemmaForms.filter(Boolean)) {
    if (form.normalize('NFC') === d.word.normalize('NFC')) continue;
    add(strip(form) === strip(d.word) ? 'warn' : 'error', 'lemma-mismatch', { actual: form, expected: d.word });
  }

  if (pos === 'noun') {
    const tableGen = d.declension_table?.genitive?.singular?.[0];
    const fieldGen = d.genitive_singular?.full_form;
    if (tableGen && fieldGen && tableGen.normalize('NFC') !== fieldGen.normalize('NFC'))
      add(strip(tableGen) === strip(fieldGen) ? 'warn' : 'error', 'genitive-mismatch', {
        path: 'genitive_singular.full_form',
        actual: fieldGen,
        expected: tableGen,
      });
  }

  // Paradigms
  const paradigm = paradigmFor(d);
  if (paradigm.cells) compareCells(issues, d[paradigm.table], paradigm.table, paradigm.cells);
  for (const note of paradigm.notes) add('info', 'paradigm-skipped', { note });

  issues.push(...cellIssues(d));

  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = join(OUT, 'docs');
  const report = [];
  for (const file of readdirSync(dir).sort()) {
    // Checks the edited version of a word when there is one.
    const edited = join(OUT, 'edited', file);
    const { id, data } = JSON.parse(readFileSync(existsSync(edited) ? edited : join(dir, file), 'utf8'));
    report.push({ id, word: data.word, part_of_speech: data.part_of_speech, issues: checkWord(data) });
  }
  writeFileSync(join(OUT, 'checks.json'), JSON.stringify(report, null, 2));

  const byCheck = {};
  for (const { issues } of report)
    for (const { severity, check } of issues)
      byCheck[`${severity} ${check}`] = (byCheck[`${severity} ${check}`] ?? 0) + 1;
  const words = sev => report.filter(r => r.issues.some(i => i.severity === sev)).length;
  console.log(
    `${report.length} words: ${words('error')} with errors, ${words('warn')} with warnings, ${report.filter(r => !r.issues.some(i => i.severity !== 'info')).length} clean`
  );
  console.table(Object.fromEntries(Object.entries(byCheck).sort((a, b) => b[1] - a[1])));
}
