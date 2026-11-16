// Compares each word (edited version when there is one) against its downloaded Wiktionary entry
// and the stress rules. Writes out/wiktionary-report.json and prints a summary. Local only.
// Usage: node scripts/vocab-audit/wiktionary-compare.mjs [id ...]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strip } from './paradigms.mjs';
import { OUT } from './paths.mjs';
import { checkPronunciation } from './stress.mjs';

const nfc = s => s.normalize('NFC').toLowerCase().trim();
const decode = s =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&#124;/g, '|')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .trim();

function current(id) {
  const edited = join(OUT, 'edited', `${id}.json`);
  return JSON.parse(readFileSync(existsSync(edited) ? edited : join(OUT, 'docs', `${id}.json`), 'utf8')).data;
}

const POS_HEADING = {
  noun: 'Noun',
  verb: 'Verb',
  adjective: 'Adjective',
  adverb: 'Adverb',
  pronoun: 'Pronoun',
  preposition: 'Preposition',
  conjunction: 'Conjunction',
  numeral: 'Numeral',
  interjection: 'Interjection',
  determiner: 'Determiner',
};

// Picks the part of the Latin section that describes this word: the etymology (and part of speech)
// whose headword matches the lemma.
function pickSection(latin, d) {
  const etymologies = latin.split(/(?=<h3 id="Etymology_\d+")/);
  const parts = etymologies.length > 1 ? etymologies.slice(1) : etymologies;
  const posParts = parts.flatMap(part => {
    const split = part.split(
      /(?=<h[34] id="(?:Noun|Verb|Adjective|Adverb|Pronoun|Preposition|Conjunction|Numeral|Interjection|Determiner|Participle|Proper_noun|Postposition)(?:_\d+)?")/
    );
    return split.length > 1 ? split.slice(1) : split;
  });
  const headwords = part =>
    [...part.matchAll(/<strong class="Latn headword"[^>]*>(.*?)<\/strong>/g)].map(m => nfc(decode(m[1])));
  const wantPos = POS_HEADING[d.part_of_speech];
  const isPos = part =>
    wantPos &&
    (part.startsWith(`<h3 id="${wantPos}`) ||
      part.startsWith(`<h4 id="${wantPos}`) ||
      (wantPos === 'Noun' && /^<h[34] id="Proper_noun/.test(part)));
  const word = nfc(d.word);
  const stripped = strip(word);
  const tiers = [
    posParts.filter(p => isPos(p) && headwords(p).includes(word)),
    posParts.filter(p => isPos(p) && headwords(p).some(h => strip(h) === stripped)),
    posParts.filter(p => headwords(p).includes(word)),
    posParts.filter(p => isPos(p)),
  ];
  const chosen = tiers.find(t => t.length) ?? posParts;
  return { html: chosen.join('\n'), matched: tiers.findIndex(t => t.length) };
}

function parseSection(html) {
  const headwords = [...html.matchAll(/<strong class="Latn headword"[^>]*>(.*?)<\/strong>/g)].map(m => decode(m[1]));
  // Headword-line labels: (present infinitive X, perfect active Y, ...)
  const labels = {};
  for (const line of html.matchAll(/class="headword-line">([\s\S]*?)<\/(?:p|span)>\s*(?:<\/p>)?/g)) {
    for (const m of line[1].matchAll(
      /<i>([^<]+)<\/i>((?:\s*(?:<b class="Latn[^"]*"[^>]*>[\s\S]*?<\/b>|or|,(?!\s*<i>)|\s)+))/g
    )) {
      const forms = [...m[2].matchAll(/<b class="Latn[^"]*"[^>]*>([\s\S]*?)<\/b>/g)].map(x => decode(x[1]));
      (labels[m[1].trim()] ??= []).push(...forms);
    }
  }
  // Tagged inflection forms.
  const tagged = {};
  for (const m of html.matchAll(
    /<span class="Latn form-of lang-la ([^" ]+)-form-of[^"]*" lang="la">([\s\S]*?)<\/span>/g
  )) {
    const form = decode(m[2]);
    if (!form) continue;
    for (const tag of m[1].replace(/&#124;/g, '|').split('|;|')) (tagged[tag] ??= new Set()).add(form);
  }
  // Self-links (the lemma's own cell) are rendered as <strong class="selflink">; capture them via the table cell tag.
  for (const m of html.matchAll(
    /<span class="Latn form-of lang-la ([^" ]+)-form-of[^"]*" lang="la"><strong class="selflink">([\s\S]*?)<\/strong>/g
  )) {
    const form = decode(m[2]);
    for (const tag of m[1].replace(/&#124;/g, '|').split('|;|')) (tagged[tag] ??= new Set()).add(form);
  }
  return { headwords, labels, tagged };
}

const CASE = {
  nom: 'nominative',
  gen: 'genitive',
  dat: 'dative',
  acc: 'accusative',
  abl: 'ablative',
  voc: 'vocative',
  loc: 'locative',
};
const NUM = { s: 'singular', p: 'plural' };
const GEN = { m: 'masculine', f: 'feminine', n: 'neuter' };
const PERSON = { 1: 'first', 2: 'second', 3: 'third' };
const TENSE = {
  pres: 'present',
  impf: 'imperfect',
  fut: 'future',
  perf: 'perfect',
  plup: 'pluperfect',
  futp: 'future_perfect',
};
const MOOD = { ind: 'indicative', sub: 'subjunctive', imp: 'imperative' };

// Wiktionary tag -> our cell path(s), relative to the word's table field.
function pathsFor(tag, d) {
  const t = tag.split('|');
  const pos = d.part_of_speech;
  if (pos === 'verb') {
    const dep = d.is_deponent;
    if (t.length === 5 && PERSON[t[0]] && TENSE[t[2]] && MOOD[t[4]]) {
      if (t.includes('sigm')) return [];
      const voice = t[3] === 'pass' ? 'passive' : 'active';
      const mood = MOOD[t[4]];
      // Deponents store finite forms in the passive slots; imperatives under both voices.
      const voices = dep ? (mood === 'imperative' ? ['active', 'passive'] : ['passive']) : [voice];
      return voices.map(v => `conjugation_table.${mood}.${v}.${TENSE[t[2]]}.${NUM[t[1]]}.${PERSON[t[0]]}`);
    }
    if (t[2] === 'inf' && TENSE[t[0]] && t[0] !== 'fut') {
      const voice = dep ? 'active' : t[1] === 'pass' ? 'passive' : 'active';
      return [`conjugation_table.nonFinite.infinitive.${TENSE[t[0]]}.${voice}`];
    }
    if (t[2] === 'part') {
      const kind = {
        'pres|act': 'present.active',
        'fut|act': 'future.active',
        'perf|pass': 'perfect.passive',
        'fut|pass': 'future.passive',
        'perf|act': 'perfect.passive',
      }[`${t[0]}|${t[1]}`];
      return kind ? [`conjugation_table.nonFinite.participle.${kind}.nominative.masculine.singular`] : [];
    }
    if (t[1] === 'ger' && CASE[t[0]]) return [`conjugation_table.gerund.${CASE[t[0]]}`];
    if (t[1] === 'sup' && CASE[t[0]]) return [`conjugation_table.supine.${CASE[t[0]]}`];
    return [];
  }
  if (t.length === 2 && CASE[t[0]] && NUM[t[1]]) return [`declension_table.${CASE[t[0]]}.${NUM[t[1]]}`];
  if (t.length === 3 && CASE[t[0]] && GEN[t[1]] && NUM[t[2]]) {
    if (pos === 'adjective') return [`degrees_table.positive.${CASE[t[0]]}.${GEN[t[1]]}.${NUM[t[2]]}`];
    return d.declension_table?.[CASE[t[0]]]?.[GEN[t[1]]]
      ? [`declension_table.${CASE[t[0]]}.${GEN[t[1]]}.${NUM[t[2]]}`]
      : [`declension_table.${CASE[t[0]]}.${NUM[t[2]]}`];
  }
  return [];
}

const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const cellForms = v => (v == null ? null : (Array.isArray(v) ? v : [v]).filter(x => typeof x === 'string' && x.trim()));

function compareWord(id) {
  const d = current(id);
  const issues = [];
  const add = (check, path, ours, wiktionary, note) => issues.push({ check, path, ours, wiktionary, note });

  for (const i of checkPronunciation(d.word, d.pronunciation))
    add(i.check, 'pronunciation', d.pronunciation, null, i.note);

  const file = join(OUT, 'wiktionary', `${id}.json`);
  if (!existsSync(file)) return { id, word: d.word, status: 'not downloaded', issues };
  const page = JSON.parse(readFileSync(file, 'utf8'));
  if (!page.latin) return { id, word: d.word, status: 'no Latin entry', issues };
  const { html, matched } = pickSection(page.latin, d);
  const { headwords, labels, tagged } = parseSection(html);
  const status = ['matched', 'macron-differs', 'other part of speech', 'lemma differs'][matched] ?? 'unmatched';

  // Lemma.
  if (headwords.length && !headwords.some(h => nfc(h) === nfc(d.word)))
    add('lemma', 'word', d.word, headwords, 'lemma differs from the Wiktionary headword');

  // Principal parts and genitive against the headword line.
  const pp = (d.principal_parts ?? []).map(p => p?.full_form);
  const labelled = (...names) => names.flatMap(n => labels[n] ?? []);
  if (d.part_of_speech === 'verb' && pp.length) {
    const checks = [
      [1, labelled('present infinitive', 'infinitive')],
      [2, labelled('perfect active', 'perfect')],
      [3, labelled('supine', 'future participle', 'perfect passive')],
    ];
    for (const [i, forms] of checks) {
      if (!forms.length) {
        if (pp[i] && i === 2 && labels['no perfect'] !== undefined)
          add('principal-part', `principal_parts[${i}]`, pp[i], [], 'Wiktionary lists no perfect');
        continue;
      }
      if (!pp[i]) add('principal-part', `principal_parts[${i}]`, null, forms, 'missing principal part');
      else if (!forms.some(f => nfc(f) === nfc(pp[i])))
        add(
          forms.some(f => strip(nfc(f)) === strip(nfc(pp[i]))) ? 'principal-part-macron' : 'principal-part',
          `principal_parts[${i}]`,
          pp[i],
          forms
        );
    }
  }
  if (d.part_of_speech === 'noun' && d.genitive_singular?.full_form) {
    const forms = labelled('genitive');
    const ours = d.genitive_singular.full_form;
    if (forms.length && !forms.some(f => nfc(f) === nfc(ours)))
      add(
        forms.some(f => strip(nfc(f)) === strip(nfc(ours))) ? 'genitive-macron' : 'genitive',
        'genitive_singular.full_form',
        ours,
        forms
      );
  }
  if (d.part_of_speech === 'adjective') {
    for (const [label, degree] of [
      ['comparative', 'comparative'],
      ['superlative', 'superlative'],
    ]) {
      const forms = labelled(label);
      const ours = cellForms(get(d.degrees_table, `${degree}.nominative.masculine.singular`));
      if (!forms.length && ours?.length && /not comparable/.test(html))
        add(`${degree}-extra`, `degrees_table.${degree}`, ours, [], `Wiktionary gives no ${degree}`);
      else if (forms.length && ours?.length && !ours.some(o => forms.some(f => nfc(f) === nfc(o))))
        add(`${degree}-differs`, `degrees_table.${degree}.nominative.masculine.singular`, ours, forms);
      else if (forms.length && !ours?.length && ours !== undefined)
        add(`${degree}-missing`, `degrees_table.${degree}`, null, forms);
    }
  }

  // Tagged table cells.
  const byPath = {};
  // Pronoun pages often show a shared table for several pronouns, so only the lemma is compared.
  if (d.part_of_speech !== 'pronoun')
    for (const [tag, forms] of Object.entries(tagged))
      for (const p of pathsFor(tag, d)) for (const f of forms) (byPath[p] ??= new Set()).add(f);
  const hasTable = Object.keys(byPath).length > 0;
  // Intransitive verbs: Wiktionary shows only an impersonal third-singular passive, which we leave empty.
  const passivePersons = Object.keys(tagged).filter(t => /\|pass\|(ind|sub)$/.test(t));
  const impersonalOnly = passivePersons.length > 0 && passivePersons.every(t => t.startsWith('3|s|'));
  for (const [path, wset] of Object.entries(byPath)) {
    const w = [...wset];
    const raw = get(d, path);
    if (raw === undefined) continue; // our table has no such slot
    if (impersonalOnly && /\.passive(\.|$)/.test(path) && !d.is_deponent) continue;
    const ours = cellForms(raw);
    if (!ours || !ours.length) {
      add('cell-missing', path, null, w, 'Wiktionary has this form, ours is empty');
      continue;
    }
    for (const o of ours) {
      if (w.some(x => nfc(x) === nfc(o))) continue;
      add(w.some(x => strip(nfc(x)) === strip(nfc(o))) ? 'cell-macron' : 'cell-differs', path, o, w);
    }
  }
  // Our forms in voices or numbers Wiktionary shows nothing for.
  if (hasTable) {
    const groups =
      d.part_of_speech === 'verb'
        ? d.is_deponent
          ? []
          : [
              'conjugation_table.indicative.passive.present',
              'conjugation_table.indicative.active.perfect',
              'conjugation_table.supine.accusative',
            ]
        : ['declension_table.nominative.plural', 'declension_table.genitive.plural'];
    for (const g of groups) {
      const ourHas = /\["/.test(JSON.stringify(get(d, g) ?? null)); // at least one filled cell
      const wikHas = Object.keys(byPath).some(p => p.startsWith(g));
      if (ourHas && !wikHas)
        add('extra-forms', g, JSON.stringify(get(d, g)).slice(0, 120), [], 'we fill forms Wiktionary does not show');
    }
  }
  return { id, word: d.word, status, page: page.page, issues };
}

const { words } = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8'));
const only = process.argv.slice(2);
const report = words.filter(w => !only.length || only.includes(w.id)).map(w => compareWord(w.id));
writeFileSync(join(OUT, 'wiktionary-report.json'), JSON.stringify(report, null, 2));

const byCheck = {};
for (const r of report) for (const i of r.issues) byCheck[i.check] = (byCheck[i.check] ?? 0) + 1;
const byStatus = {};
for (const r of report) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
console.log(`${report.length} words; ${report.filter(r => r.issues.length).length} with findings`);
console.log('status:', byStatus);
console.log('findings:', byCheck);
const summary = [];
for (const r of report) {
  if (!r.issues.length) continue;
  const counts = {};
  for (const i of r.issues) counts[i.check] = (counts[i.check] ?? 0) + 1;
  summary.push(
    `${r.word} (${r.id}) [${r.status}]: ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`
  );
}
writeFileSync(join(OUT, 'wiktionary-summary.txt'), summary.join('\n') + '\n');
