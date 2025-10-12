import { Timestamp } from 'firebase-admin/firestore';
import { VocabularyWordSchema } from '@/src/types/vocabulary/schemas';

type URec = Record<string, unknown>;

// ==================== Normalization Helpers ====================

const posMap = new Map<string, string>([
  ['Noun', 'noun'],
  ['Verb', 'verb'],
  ['Pronoun', 'pronoun'],
  ['Adjective', 'adjective'],
  ['Adverb', 'adverb'],
  ['Preposition', 'preposition'],
  ['Conjunction', 'conjunction'],
  ['Interjection', 'interjection'],
]);

const declFix = new Map<string, string>([
  ['4-istem', '3-istem'],
  ['3 i', '3-istem'],
  ['3i', '3-istem'],
]);

const norm = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : s);
const normPos = (s: unknown) => (s ? (posMap.get(String(s)) ?? norm(s)) : null) as string | null;
const normDecl = (s: unknown) => (s ? (declFix.get(String(s)) ?? norm(s)) : null) as string | null;
const normGender = (s: unknown) => {
  const normalized = norm(s);
  if (normalized === 'masculine' || normalized === 'feminine' || normalized === 'neuter') return normalized;
  return null;
};

const getObj = (v: unknown): URec | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as URec) : undefined;
const getStr = (o: URec, k: string): string | undefined => {
  const v = o[k];
  return typeof v === 'string' ? v : undefined;
};
const getArrStr = (o: URec, k: string): string[] | null => {
  const v = o[k];
  if (!Array.isArray(v)) return null;
  const filtered = (v as unknown[]).filter((x): x is string => typeof x === 'string');
  return filtered.length > 0 ? filtered : null;
};

// Convert nullable string to null if empty or undefined
const toNullable = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

// Convert nullable array to null if empty or undefined
const toNullableArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const filtered = (value as unknown[]).filter((x): x is string => typeof x === 'string');
  return filtered.length > 0 ? filtered : null;
};

const ensureTimestamp = (v: unknown) => {
  const maybe = v as { seconds?: number; nanoseconds?: number } | null | undefined;
  if (maybe && typeof maybe.seconds === 'number' && typeof maybe.nanoseconds === 'number')
    return Timestamp.fromMillis(maybe.seconds * 1000 + Math.floor((maybe.nanoseconds || 0) / 1e6));
  return Timestamp.now();
};

// ==================== Structure Builders ====================

// WordForm structure
const toWordForm = (s: string | null | undefined): { full_form: string; shortened_form: string } | null => {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;

  if (trimmed.includes('-')) {
    return {
      full_form: '',
      shortened_form: trimmed,
    };
  }
  return {
    full_form: trimmed,
    shortened_form: '',
  };
};

const toWordFormArray = (arr: string[]): Array<{ full_form: string; shortened_form: string }> | null => {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.map(s => toWordForm(s)).filter((wf): wf is { full_form: string; shortened_form: string } => wf !== null);
};

// Create empty declension table with all required fields
const createEmptyDeclensionTable = (): Record<string, { singular: string[] | null; plural: string[] | null }> => ({
  nominative: { singular: null, plural: null },
  genitive: { singular: null, plural: null },
  dative: { singular: null, plural: null },
  accusative: { singular: null, plural: null },
  ablative: { singular: null, plural: null },
  vocative: { singular: null, plural: null },
  locative: { singular: null, plural: null },
});

// Convert legacy declension table to v3 structure
const toDeclensionTable = (rows: unknown) => {
  const table = createEmptyDeclensionTable();

  if (!Array.isArray(rows)) return table;

  rows.forEach((r: unknown) => {
    const row = getObj(r);
    if (!row) return;
    const c = norm(getStr(row, 'case')) as string | undefined;
    if (!c) return;

    if (c in table) {
      table[c as keyof typeof table] = {
        singular: getArrStr(row, 'singular'),
        plural: getArrStr(row, 'plural'),
      };
    }
  });

  return table;
};

// Create empty adjective declension table
const createEmptyAdjectiveDeclensionTable = () => {
  const emptyGenderForms = {
    masculine: { singular: null as string[] | null, plural: null as string[] | null },
    feminine: { singular: null as string[] | null, plural: null as string[] | null },
    neuter: { singular: null as string[] | null, plural: null as string[] | null },
  };

  return {
    nominative: { ...emptyGenderForms },
    genitive: { ...emptyGenderForms },
    dative: { ...emptyGenderForms },
    accusative: { ...emptyGenderForms },
    ablative: { ...emptyGenderForms },
    vocative: { ...emptyGenderForms },
    locative: { ...emptyGenderForms },
  };
};

// Convert legacy adjective declension table to v3 structure
const toAdjectiveDeclensionTable = (rows: unknown) => {
  const table = createEmptyAdjectiveDeclensionTable();

  if (!Array.isArray(rows)) return table;

  const g = (x: unknown) => {
    const o = getObj(x) || {};
    return { singular: getArrStr(o, 'singular'), plural: getArrStr(o, 'plural') };
  };

  rows.forEach((r: unknown) => {
    const row = getObj(r);
    if (!row) return;
    const c = norm(getStr(row, 'case')) as string | undefined;
    if (!c || !(c in table)) return;

    table[c as keyof typeof table] = {
      masculine: g(row['masculine']),
      feminine: g(row['feminine']),
      neuter: g(row['neuter']),
    };
  });

  return table;
};

// Create empty conjugation table with all required fields
const createEmptyConjugationTable = () => {
  const emptyPersonForms = {
    first: null,
    second: null,
    third: null,
  };

  const emptyNumberForms = {
    singular: { ...emptyPersonForms },
    plural: { ...emptyPersonForms },
  };

  const emptyVoiceForms = {
    present: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
    imperfect: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
    future: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
    perfect: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
    pluperfect: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
    future_perfect: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
  };

  const emptySubjunctive = {
    present: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
    imperfect: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
    perfect: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
    pluperfect: { ...emptyNumberForms, singular: { ...emptyPersonForms }, plural: { ...emptyPersonForms } },
  };

  return {
    indicative: {
      active: { ...emptyVoiceForms },
      passive: { ...emptyVoiceForms },
    },
    subjunctive: {
      active: { ...emptySubjunctive },
      passive: { ...emptySubjunctive },
    },
    imperative: {
      active: {
        present: {
          singular: { second: null },
          plural: { second: null },
        },
        future: {
          singular: { second: null, third: null },
          plural: { second: null, third: null },
        },
      },
      passive: {
        present: {
          singular: { second: null },
          plural: { second: null },
        },
        future: {
          singular: { third: null },
          plural: { third: null },
        },
      },
    },
    nonFinite: {
      infinitive: {
        present: { active: null, passive: null },
        perfect: { active: null, passive: null },
        future: { active: null, passive: null },
      },
      participle: {
        present: { active: createEmptyAdjectiveDeclensionTable() },
        perfect: { passive: createEmptyAdjectiveDeclensionTable() },
        future: {
          active: createEmptyAdjectiveDeclensionTable(),
          passive: createEmptyAdjectiveDeclensionTable(),
        },
      },
    },
    gerund: {
      genitive: null,
      dative: null,
      accusative: null,
      ablative: null,
    },
    supine: {
      accusative: null,
      ablative: null,
    },
  };
};

// Helper to safely get person forms from legacy data
const getPersonForms = (obj: unknown) => {
  const o = getObj(obj);
  return {
    first: o ? getArrStr(o, 'first') : null,
    second: o ? getArrStr(o, 'second') : null,
    third: o ? getArrStr(o, 'third') : null,
  };
};

// Helper to safely get number forms from legacy data
const getNumberForms = (obj: unknown) => {
  const o = getObj(obj);
  return {
    singular: getPersonForms(o?.['singular']),
    plural: getPersonForms(o?.['plural']),
  };
};

// Helper to safely get voice forms for indicative (6 tenses)
const getIndicativeVoiceForms = (obj: unknown) => {
  const o = getObj(obj);
  return {
    present: getNumberForms(o?.['present']),
    imperfect: getNumberForms(o?.['imperfect']),
    future: getNumberForms(o?.['future']),
    perfect: getNumberForms(o?.['perfect']),
    pluperfect: getNumberForms(o?.['pluperfect']),
    future_perfect: getNumberForms(o?.['future_perfect']),
  };
};

// Helper to safely get voice forms for subjunctive (4 tenses)
const getSubjunctiveVoiceForms = (obj: unknown) => {
  const o = getObj(obj);
  return {
    present: getNumberForms(o?.['present']),
    imperfect: getNumberForms(o?.['imperfect']),
    perfect: getNumberForms(o?.['perfect']),
    pluperfect: getNumberForms(o?.['pluperfect']),
  };
};

// Helper to get imperative forms
const getImperativeForms = (obj: unknown) => {
  const o = getObj(obj);
  const active = getObj(o?.['active']);
  const passive = getObj(o?.['passive']);

  const activePresent = getObj(active?.['present']);
  const activeFuture = getObj(active?.['future']);
  const passivePresent = getObj(passive?.['present']);
  const passiveFuture = getObj(passive?.['future']);

  return {
    active: {
      present: {
        singular: { second: activePresent ? getArrStr(activePresent['singular'] as URec, 'second') : null },
        plural: { second: activePresent ? getArrStr(activePresent['plural'] as URec, 'second') : null },
      },
      future: {
        singular: {
          second: activeFuture ? getArrStr(activeFuture['singular'] as URec, 'second') : null,
          third: activeFuture ? getArrStr(activeFuture['singular'] as URec, 'third') : null,
        },
        plural: {
          second: activeFuture ? getArrStr(activeFuture['plural'] as URec, 'second') : null,
          third: activeFuture ? getArrStr(activeFuture['plural'] as URec, 'third') : null,
        },
      },
    },
    passive: {
      present: {
        singular: { second: passivePresent ? getArrStr(passivePresent['singular'] as URec, 'second') : null },
        plural: { second: passivePresent ? getArrStr(passivePresent['plural'] as URec, 'second') : null },
      },
      future: {
        singular: { third: passiveFuture ? getArrStr(passiveFuture['singular'] as URec, 'third') : null },
        plural: { third: passiveFuture ? getArrStr(passiveFuture['plural'] as URec, 'third') : null },
      },
    },
  };
};

const getInfinitiveForms = (obj: unknown) => {
  const o = getObj(obj);

  const getVoice = (active: unknown, passive: unknown) => ({
    active: Array.isArray(active) ? active[0] || null : typeof active === 'string' ? active : null,
    passive: Array.isArray(passive) ? passive[0] || null : typeof passive === 'string' ? passive : null,
  });

  if (!o) {
    return {
      present: { active: null, passive: null },
      perfect: { active: null, passive: null },
      future: { active: null, passive: null },
    };
  }

  const activePresent = o['active_present'] || getObj(o['present'])?.['active'];
  const passivePresent = o['passive_present'] || getObj(o['present'])?.['passive'];
  const activePerfect = o['active_perfect'] || getObj(o['perfect'])?.['active'];
  const passivePerfect = o['passive_perfect'] || getObj(o['perfect'])?.['passive'];
  const activeFuture = o['active_future'] || getObj(o['future'])?.['active'];
  const passiveFuture = o['passive_future'] || getObj(o['future'])?.['passive'];

  return {
    present: getVoice(activePresent, passivePresent),
    perfect: getVoice(activePerfect, passivePerfect),
    future: getVoice(activeFuture, passiveFuture),
  };
};

const getParticipleForms = (obj: unknown) => {
  const o = getObj(obj);

  if (!o) {
    return {
      present: { active: createEmptyAdjectiveDeclensionTable() },
      perfect: { passive: createEmptyAdjectiveDeclensionTable() },
      future: {
        active: createEmptyAdjectiveDeclensionTable(),
        passive: createEmptyAdjectiveDeclensionTable(),
      },
    };
  }

  const presentActive = o['present_active'] || getObj(o['present'])?.['active'];
  const perfectPassive = o['perfect_passive'] || getObj(o['perfect'])?.['passive'];
  const futureActive = o['future_active'] || getObj(o['future'])?.['active'];
  const futurePassive = o['future_passive'] || getObj(o['future'])?.['passive'];

  return {
    present: {
      active: presentActive ? toAdjectiveDeclensionTable(presentActive) : createEmptyAdjectiveDeclensionTable(),
    },
    perfect: {
      passive: perfectPassive ? toAdjectiveDeclensionTable(perfectPassive) : createEmptyAdjectiveDeclensionTable(),
    },
    future: {
      active: futureActive ? toAdjectiveDeclensionTable(futureActive) : createEmptyAdjectiveDeclensionTable(),
      passive: futurePassive ? toAdjectiveDeclensionTable(futurePassive) : createEmptyAdjectiveDeclensionTable(),
    },
  };
};

// Helper to get gerund forms
const getGerundForms = (obj: unknown) => {
  const o = getObj(obj);
  return {
    genitive: o ? getArrStr(o, 'genitive') : null,
    dative: o ? getArrStr(o, 'dative') : null,
    accusative: o ? getArrStr(o, 'accusative') : null,
    ablative: o ? getArrStr(o, 'ablative') : null,
  };
};

// Helper to get supine forms
const getSupineForms = (obj: unknown) => {
  const o = getObj(obj);
  return {
    accusative: o ? getArrStr(o, 'accusative') : null,
    ablative: o ? getArrStr(o, 'ablative') : null,
  };
};

// Convert legacy conjugation table to v3 structure
const toConjugationTable = (legacy: unknown) => {
  const empty = createEmptyConjugationTable();
  const l = getObj(legacy);

  if (!l) return empty;

  // Extract indicative
  const indicative = getObj(l['indicative']);
  const indicativeActive = indicative ? getIndicativeVoiceForms(indicative['active']) : empty.indicative.active;
  const indicativePassive = indicative ? getIndicativeVoiceForms(indicative['passive']) : empty.indicative.passive;

  // Extract subjunctive
  const subjunctive = getObj(l['subjunctive']);
  const subjunctiveActive = subjunctive ? getSubjunctiveVoiceForms(subjunctive['active']) : empty.subjunctive.active;
  const subjunctivePassive = subjunctive ? getSubjunctiveVoiceForms(subjunctive['passive']) : empty.subjunctive.passive;

  // Extract imperative
  const imperative = l['imperative'] ? getImperativeForms(l['imperative']) : empty.imperative;

  // Extract nonFinite
  const nonFinite = getObj(l['nonFinite']);
  const infinitive = nonFinite?.['infinitive']
    ? getInfinitiveForms(nonFinite['infinitive'])
    : empty.nonFinite.infinitive;
  const participle = nonFinite?.['participle']
    ? getParticipleForms(nonFinite['participle'])
    : empty.nonFinite.participle;

  // Extract gerund and supine
  const gerund = l['gerund'] ? getGerundForms(l['gerund']) : empty.gerund;
  const supine = l['supine'] ? getSupineForms(l['supine']) : empty.supine;

  return {
    indicative: {
      active: indicativeActive,
      passive: indicativePassive,
    },
    subjunctive: {
      active: subjunctiveActive,
      passive: subjunctivePassive,
    },
    imperative,
    nonFinite: {
      infinitive,
      participle,
    },
    gerund,
    supine,
  };
};

// ==================== Main Mapper ====================

export function mapLegacyWordV3(
  data: URec
): { success: true; data: URec } | { success: false; reason: string; word?: string } {
  const wordName = String(data['word'] || 'UNKNOWN');
  const pos = normPos(data['part_of_speech'] || data['partOfSpeech'] || data['wordType']);

  if (!pos) {
    return { success: false, reason: 'missing or invalid part_of_speech', word: wordName };
  }

  // Base fields (always required)
  const mapped: URec = {
    word: wordName,
    part_of_speech: pos,
    translation: toNullable(data['translation']) || '',
    definitions: toNullableArray(data['definitions']) || [],
    etymology: toNullable(data['etymology']),
    pronunciation: toNullable(data['pronunciation']),
    type: toNullable(data['type']) || 'core',
    alternate_form: toNullable(data['alternate_form'] || data['alternateForm']),
    createdAt: ensureTimestamp(data['createdAt']),
    updatedAt: ensureTimestamp(data['updatedAt']),
  };

  // Part-of-speech specific fields (ALWAYS set all fields, use empty structures for tables)
  if (pos === 'noun') {
    const declTable = toDeclensionTable(data['declension_table'] || data['declensionTable']);
    const principalParts = toNullableArray(data['principal_parts'] || data['principalParts']);

    const nomSingStr = principalParts?.[0] || declTable?.nominative?.singular?.[0];
    const genSingStr = principalParts?.[1] || declTable?.genitive?.singular?.[0];

    mapped['gender'] = normGender(data['gender']);
    mapped['declension'] = normDecl(data['declension'] || data['declensionClass']);
    mapped['declension_table'] = declTable;
    mapped['nominative_singular'] = toWordForm(nomSingStr);
    mapped['genitive_singular'] = toWordForm(genSingStr);
  } else if (pos === 'pronoun') {
    const declTable = toDeclensionTable(data['declension_table'] || data['declensionTable']);

    mapped['pronoun_type'] = toNullable(data['pronoun_type'] || data['pronounType']);
    mapped['declension_table'] = declTable;
  } else if (pos === 'adjective') {
    const degreesData = data['degrees_table'] || data['degreesTable'];
    const dictionaryForms = toNullableArray(data['dictionary_forms'] || data['dictionaryForms']);

    let degreesTable;
    if (degreesData && getObj(degreesData)) {
      const d = getObj(degreesData)!;
      degreesTable = {
        positive: toAdjectiveDeclensionTable(d['positive']),
        comparative: toAdjectiveDeclensionTable(d['comparative']),
        superlative: toAdjectiveDeclensionTable(d['superlative']),
      };
    } else {
      const legacyTable = data['adjective_declension_table'] || data['adjectiveDeclensionTable'];
      degreesTable = {
        positive: toAdjectiveDeclensionTable(legacyTable),
        comparative: createEmptyAdjectiveDeclensionTable(),
        superlative: createEmptyAdjectiveDeclensionTable(),
      };
    }

    mapped['declension'] = normDecl(data['declension'] || data['declensionClass']);
    mapped['dictionary_forms'] = dictionaryForms ? toWordFormArray(dictionaryForms) : null;
    mapped['degrees_table'] = degreesTable;
  } else if (pos === 'verb') {
    const conjugationTable = toConjugationTable(data['conjugation_table'] || data['conjugationTable']);
    const principalParts = toNullableArray(data['principal_parts'] || data['principalParts']);

    mapped['conjugation'] = norm(data['conjugation'] || data['conjugationClass']);
    mapped['conjugation_table'] = conjugationTable;
    mapped['principal_parts'] = principalParts ? toWordFormArray(principalParts) : null;
    mapped['is_deponent'] = data['is_deponent'] ?? data['isDeponent'] ?? null;
  }
  // Indeclinable words (adverb, preposition, conjunction, interjection) - no extra fields needed

  // Validate against schema
  const result = VocabularyWordSchema.safeParse(mapped);

  if (!result.success) {
    const errorDetails = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    return {
      success: false,
      reason: `Schema validation failed: ${errorDetails}`,
      word: wordName,
    };
  }

  return { success: true, data: result.data };
}
