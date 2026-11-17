#!/usr/bin/env node
/**
 * Real-model check for the vocabulary AI before a release: runs the same engine the `autocompleteWord`
 * Function runs, against OpenAI, with no database at all (no Firestore, no emulator, no production).
 *
 *   npm --prefix functions run build
 *   OPENAI_API_KEY=sk-... node scripts/vocabulary-ai-smoke.mjs [report.json]
 *
 * Cases: a noun and a verb filled from scratch, a correction, an answer to an open question, a rule for all
 * words, and a later fill that must follow the note kept from the correction.
 *
 * The merge gate fails on unrelated or contradictory changes, on a teacher's edit overwritten without
 * acceptance, or on an accepted and saved correction not retained. This script checks retention itself and
 * flags changes outside each case's expected fields as REVIEW: a related fix (a table that follows from a
 * corrected conjugation) is fine, so a person decides. Overwriting without acceptance cannot happen here;
 * nothing lands without Accept, which the editor's tests cover.
 */
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engine = resolve(root, 'functions/lib/shared/openai/autocomplete.js');
if (!existsSync(engine)) {
  console.error('Build the Functions code first: npm --prefix functions run build');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('Set OPENAI_API_KEY. Each run costs a little: the verb table is the most expensive case.');
  process.exit(1);
}
const { autocompleteVocabularyWord } = createRequire(import.meta.url)(engine);
const { PRODUCTION_VOCABULARY_AUTOCOMPLETE_PROFILE, VOCABULARY_AUTOCOMPLETE_PROFILES } = createRequire(import.meta.url)(
  resolve(root, 'functions/lib/shared/openai/model-registry.js')
);

const profile = VOCABULARY_AUTOCOMPLETE_PROFILES[PRODUCTION_VOCABULARY_AUTOCOMPLETE_PROFILE];
const RULES = [{ id: 'smoke-rule', instruction: 'Use Classical Latin forms and senses.' }];
const results = [];
let totalCost = 0;

const emptyNoun = {
  word: 'rosa',
  part_of_speech: 'noun',
  translation: '',
  definitions: [],
  etymology: null,
  pronunciation: null,
  alternate_form: null,
  gender: null,
  declension: null,
  nominative_singular: null,
  genitive_singular: null,
};
const emptyVerb = {
  word: 'ferō',
  part_of_speech: 'verb',
  translation: '',
  definitions: [],
  etymology: null,
  pronunciation: null,
  alternate_form: null,
  conjugation: null,
  principal_parts: null,
  is_deponent: false,
};

async function call(name, request) {
  const started = Date.now();
  const response = await autocompleteVocabularyWord(request, RULES);
  const seconds = (Date.now() - started) / 1000;
  const cost = response.cost?.totalCost ?? 0;
  totalCost += cost;
  if (!response.success) {
    record(name, 'FAIL', [`The AI call failed: ${response.errorCode ?? ''} ${response.error ?? ''}`], {
      seconds,
      cost,
    });
    return null;
  }
  return { response, seconds, cost };
}

function record(name, verdict, notes, extra = {}) {
  results.push({ name, verdict, notes, ...extra });
  const timing =
    extra.seconds !== undefined ? ` (${extra.seconds.toFixed(1)} s, $${(extra.cost ?? 0).toFixed(4)})` : '';
  console.log(`\n${verdict.padEnd(6)} ${name}${timing}`);
  for (const note of notes) console.log(`       ${note}`);
}

const proposed = response => Object.keys(response.data ?? {}).filter(field => field !== 'part_of_speech');
const mentions = (value, pattern) => pattern.test(JSON.stringify(value ?? ''));

/** One conversation turn, checked against the fields it may change and what it should say back. */
async function converse(name, draft, message, { allowed, expect }) {
  const result = await call(name, {
    word: draft.word,
    part_of_speech: draft.part_of_speech,
    existingData: draft,
    conversation: { message, history: [] },
  });
  if (!result) return null;
  const { response, seconds, cost } = result;
  const changed = proposed(response);
  const reply = response.reply;
  const notes = [
    `Teacher: ${message}`,
    `AI: ${reply?.message}`,
    `Proposed changes: ${changed.length ? changed.join(', ') : 'none'}`,
    `Settles questions about: ${reply?.answered.join(', ') || 'none'}`,
    `Would remember: ${reply?.remember.map(note => note.note).join(' | ') || 'nothing'}`,
    `Suggested rule for all words: ${reply?.rule ?? 'none'}`,
  ];
  const problems = expect(response);
  const outside = changed.filter(field => !allowed.includes(field));
  if (outside.length)
    notes.push(`Changes outside ${allowed.join(', ') || 'none'}: ${outside.join(', ')}. Related or not?`);
  notes.push(...problems.map(problem => `Problem: ${problem}`));
  record(name, problems.length ? 'FAIL' : outside.length ? 'REVIEW' : 'PASS', notes, { seconds, cost, response });
  return response;
}

function fillNotes(response, schemaFields) {
  const filled = Object.entries(response.fieldStatus ?? {})
    .filter(([, status]) => status === 'filled')
    .map(([field]) => field);
  const missing = schemaFields.filter(field => response.fieldStatus?.[field] === 'missing');
  return [
    `Filled: ${filled.join(', ') || 'nothing'}`,
    `Left empty: ${missing.join(', ') || 'nothing'}`,
    ...(response.uncertainties ?? []).map(item => `Asks about ${item.field}: ${item.question ?? item.explanation}`),
    (response.uncertainties ?? []).length ? '' : 'No questions: the AI says it is sure of everything.',
  ].filter(Boolean);
}

console.log(
  `Vocabulary AI smoke run: ${profile.label} (${profile.model}), output cap ${profile.maxOutputTokens} tokens`
);

// 1. A noun from scratch.
const noun = await call('Fill a noun (rosa) from scratch', {
  word: 'rosa',
  part_of_speech: 'noun',
  existingData: emptyNoun,
});
let rosa = { ...emptyNoun };
if (noun) {
  rosa = { ...emptyNoun, ...noun.response.data };
  const problems = [];
  if (!rosa.declension_table) problems.push('No declension table.');
  if (!rosa.translation) problems.push('No translation.');
  record(
    'Fill a noun (rosa) from scratch',
    problems.length ? 'FAIL' : 'PASS',
    [...fillNotes(noun.response, Object.keys(emptyNoun)), ...problems],
    noun
  );
}

// 2. A verb with full tables: the largest answer the model gives.
const verb = await call('Fill an irregular verb (ferō) from scratch', {
  word: 'ferō',
  part_of_speech: 'verb',
  existingData: emptyVerb,
});
if (verb) {
  const data = verb.response.data;
  const parts = (data.principal_parts ?? []).map(part => part?.full_form).join(', ');
  const problems = [];
  if (!data.conjugation_table) problems.push('No conjugation table.');
  if (!/tul/.test(parts) || !/lāt/.test(parts)) problems.push(`Principal parts look regularised: ${parts}`);
  record(
    'Fill an irregular verb (ferō) from scratch',
    problems.length ? 'FAIL' : 'PASS',
    [
      `Principal parts: ${parts}`,
      `Output tokens: ${verb.response.cost?.tokens.completionTokens ?? '?'} of ${profile.maxOutputTokens}`,
      ...fillNotes(verb.response, Object.keys(emptyVerb)),
      ...problems,
    ],
    verb
  );
}

// 3. A correction in the teacher's own words.
const wrongEtymology = { ...rosa, etymology: 'Native Latin, from an Indo-European root meaning "red".' };
const correction = await converse(
  'Correct the etymology',
  wrongEtymology,
  'rosa is not native Latin. It is a loan from Greek rhódon, probably through another language. Please fix the etymology.',
  {
    allowed: ['etymology'],
    expect: response => [
      ...(!('etymology' in (response.data ?? {})) ? ['It did not propose a new etymology.'] : []),
      ...('etymology' in (response.data ?? {}) && !mentions(response.data.etymology, /greek|rhod/i)
        ? ['The new etymology does not mention the Greek source.']
        : []),
      ...(!response.reply?.remember.length ? ['It wrote down nothing to remember about rosa.'] : []),
      ...(response.reply?.rule ? ['It turned a fact about one word into a rule for all words.'] : []),
    ],
  }
);

// 4. An answer to a question the AI asked.
const question = {
  field: 'pronunciation',
  question: 'Is the o in rosa long or short?',
  explanation: 'I wrote a long o, but I am not sure of the vowel length.',
  options: ['The o is short.', 'The o is long.'],
};
await converse(
  'Answer an open question',
  { ...rosa, pronunciation: 'ˈroː.sa', ai_review: { uncertainties: [question], guidance: [] } },
  'Pronunciation: The o is short.',
  {
    allowed: ['pronunciation'],
    expect: response => [
      ...(!response.reply?.answered.includes('pronunciation') ? ['It did not mark the question as settled.'] : []),
      ...(response.reply?.rule ? ['It suggested a rule for all words from an answer about one word.'] : []),
    ],
  }
);

// 5. A principle for every word.
await converse(
  'State a rule for all words',
  rosa,
  'As a general rule for every word: only fill in a locative when the word has an attested locative. Never build one by analogy.',
  {
    allowed: ['declension_table'],
    expect: response => (response.reply?.rule ? [] : ['It did not suggest a rule for all words.']),
  }
);

// 6. The correction, once accepted and saved, is followed by a later request.
const remembered = (
  correction?.reply?.remember.length
    ? correction.reply.remember
    : [{ field: 'etymology', note: 'rosa is a loan from Greek rhódon.' }]
).map((note, index) => ({ id: `note-${index}`, instruction: note.note, ...(note.field ? { field: note.field } : {}) }));
const later = await call('Follow the kept note in a later fill', {
  word: 'rosa',
  part_of_speech: 'noun',
  existingData: { ...rosa, etymology: null, ai_review: { uncertainties: [], guidance: remembered } },
  fieldsToComplete: ['etymology'],
});
if (later) {
  const etymology = later.response.data?.etymology;
  const kept = mentions(etymology, /greek|rhod/i);
  record(
    'Follow the kept note in a later fill',
    kept ? 'PASS' : 'FAIL',
    [
      `Note given: ${remembered.map(note => note.instruction).join(' | ')}`,
      `New etymology: ${etymology}`,
      ...(kept ? [] : ['Problem: it did not follow the kept note.']),
    ],
    later
  );
}

const counts = Object.fromEntries(
  ['PASS', 'REVIEW', 'FAIL'].map(verdict => [verdict, results.filter(r => r.verdict === verdict).length])
);
const chat = results.filter(
  r =>
    ['Correct the etymology', 'Answer an open question', 'State a rule for all words'].includes(r.name) &&
    r.seconds !== undefined &&
    r.verdict !== 'FAIL'
);
console.log(
  `\n${counts.PASS} passed, ${counts.REVIEW} to review, ${counts.FAIL} failed. Total cost $${totalCost.toFixed(4)}.` +
    (chat.length
      ? ` A chat reply took ${Math.min(...chat.map(r => r.seconds)).toFixed(1)}-${Math.max(...chat.map(r => r.seconds)).toFixed(1)} s.`
      : '')
);
const report = process.argv[2];
if (report) {
  writeFileSync(report, JSON.stringify({ profile: profile.key, model: profile.model, totalCost, results }, null, 2));
  console.log(`Full answers written to ${report}`);
}
process.exitCode = counts.FAIL ? 1 : 0;
