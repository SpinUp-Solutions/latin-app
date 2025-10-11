import { Timestamp } from 'firebase-admin/firestore';

type URec = Record<string, unknown>;

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
const normPos = (s: unknown) => (s ? (posMap.get(String(s)) ?? norm(s)) : undefined) as string | undefined;
const normDecl = (s: unknown) => (s ? (declFix.get(String(s)) ?? norm(s)) : undefined) as string | undefined;

const getObj = (v: unknown): URec | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as URec) : undefined;
const getStr = (o: URec, k: string): string | undefined => {
  const v = o[k];
  return typeof v === 'string' ? v : undefined;
};
const getArrStr = (o: URec, k: string): string[] => {
  const v = o[k];
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : [];
};

const toWordForm = (s: string): { full_form: string; shortened_form: string } => {
  const trimmed = s.trim();
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

const toWordFormArray = (arr: string[]): Array<{ full_form: string; shortened_form: string }> => {
  return arr.map(toWordForm);
};

export const ensureTimestamp = (v: unknown) => {
  const maybe = v as { seconds?: number; nanoseconds?: number } | null | undefined;
  if (maybe && typeof maybe.seconds === 'number' && typeof maybe.nanoseconds === 'number')
    return Timestamp.fromMillis(maybe.seconds * 1000 + Math.floor((maybe.nanoseconds || 0) / 1e6));
  return Timestamp.now();
};

export const toDeclensionObject = (
  rows: unknown
): Record<string, { singular: string[]; plural: string[] }> | undefined => {
  if (!Array.isArray(rows)) return undefined;
  return rows.reduce((acc: Record<string, { singular: string[]; plural: string[] }>, r: unknown) => {
    const row = getObj(r);
    if (!row) return acc;
    const c = norm(getStr(row, 'case')) as string | undefined;
    if (!c) return acc;
    acc[c] = { singular: getArrStr(row, 'singular'), plural: getArrStr(row, 'plural') };
    return acc;
  }, {});
};

export const toAdjectiveDeclensionObject = (
  rows: unknown
):
  | Record<
      string,
      {
        masculine: { singular: string[]; plural: string[] };
        feminine: { singular: string[]; plural: string[] };
        neuter: { singular: string[]; plural: string[] };
      }
    >
  | undefined => {
  if (!Array.isArray(rows)) return undefined;
  const g = (x: unknown) => {
    const o = getObj(x) || {};
    return { singular: getArrStr(o, 'singular'), plural: getArrStr(o, 'plural') };
  };
  return rows.reduce(
    (
      acc: Record<
        string,
        {
          masculine: { singular: string[]; plural: string[] };
          feminine: { singular: string[]; plural: string[] };
          neuter: { singular: string[]; plural: string[] };
        }
      >,
      r: unknown
    ) => {
      const row = getObj(r);
      if (!row) return acc;
      const c = norm(getStr(row, 'case')) as string | undefined;
      if (!c) return acc;
      acc[c] = {
        masculine: g(row['masculine']),
        feminine: g(row['feminine']),
        neuter: g(row['neuter']),
      };
      return acc;
    },
    {}
  );
};

export const mapVerbConjugation = (legacy: unknown): URec | undefined => {
  const l = getObj(legacy);
  if (!l) return undefined;
  const out: URec = {};
  if (l['indicative']) out['indicative'] = l['indicative'];
  if (l['subjunctive']) out['subjunctive'] = l['subjunctive'];
  const nf = getObj(l['nonFinite']);
  if (nf && nf['infinitive'])
    out['nonFinite'] = { ...(out['nonFinite'] as URec | undefined), infinitive: nf['infinitive'] };
  if (l['gerund']) out['gerund'] = l['gerund'];
  if (l['supine']) out['supine'] = l['supine'];
  return Object.keys(out).length ? out : undefined;
};

export function mapLegacyWord(data: URec): { mapped?: URec; reason?: string } {
  const pos = normPos(data['part_of_speech'] || data['partOfSpeech'] || data['wordType']);
  if (!pos) return { reason: 'missing part_of_speech' };

  const base: URec = {
    word: (data['word'] as string) ?? '',
    translation: (data['translation'] as string) ?? '',
    definitions: Array.isArray(data['definitions']) ? (data['definitions'] as string[]) : [],
    type: (data['type'] as string) || 'core',
    etymology: data['etymology'] ?? null,
    pronunciation: data['pronunciation'] ?? null,
    alternate_form: data['alternate_form'] ?? data['alternateForm'] ?? null,
    createdAt: ensureTimestamp(data['createdAt']),
    updatedAt: ensureTimestamp(data['updatedAt']),
  };

  const mapped: URec = { part_of_speech: pos, ...base };

  const setIfDefined = (key: string, value: unknown) => {
    if (value !== undefined) mapped[key] = value;
  };

  if (pos === 'noun') {
    mapped['gender'] = data['gender'] ? norm(data['gender']) : null;
    setIfDefined('declension', normDecl(data['declension'] || data['declensionClass']));
    const declTable = toDeclensionObject(data['declension_table'] || data['declensionTable']);
    setIfDefined('declension_table', declTable);

    const principalParts = Array.isArray(data['principal_parts'])
      ? (data['principal_parts'] as string[])
      : Array.isArray(data['principalParts'])
        ? (data['principalParts'] as string[])
        : [];

    const nomSingStr = principalParts[0] || declTable?.nominative?.singular?.[0];
    mapped['nominative_singular'] = nomSingStr ? toWordForm(nomSingStr) : null;

    const genSingStr = principalParts[1] || declTable?.genitive?.singular?.[0];
    mapped['genitive_singular'] = genSingStr ? toWordForm(genSingStr) : null;
  } else if (pos === 'pronoun') {
    mapped['pronoun_type'] = data['pronoun_type'] || data['pronounType'] || null;
    setIfDefined('declension_table', toDeclensionObject(data['declension_table'] || data['declensionTable']));
  } else if (pos === 'adjective') {
    mapped['declension'] = normDecl(data['declension'] || data['declensionClass']) || null;
    setIfDefined(
      'adjective_declension_table',
      toAdjectiveDeclensionObject(data['adjective_declension_table'] || data['adjectiveDeclensionTable'])
    );
  } else if (pos === 'verb') {
    mapped['conjugation'] = norm(data['conjugation'] || data['conjugationClass']);
    mapped['is_deponent'] = data['is_deponent'] ?? data['isDeponent'] ?? null;
    setIfDefined('conjugation_table', mapVerbConjugation(data['conjugation_table'] || data['conjugationTable']));

    const principalParts = Array.isArray(data['principal_parts'])
      ? (data['principal_parts'] as string[])
      : Array.isArray(data['principalParts'])
        ? (data['principalParts'] as string[])
        : [];

    mapped['principal_parts'] = principalParts.length > 0 ? toWordFormArray(principalParts) : null;
  }

  return { mapped };
}
