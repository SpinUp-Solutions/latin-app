// Regular Latin paradigms used to check stored tables (issue #344).
// Each expected cell is a list of acceptable { stem, ending } pairs. Stems come
// from the stored lemma, so a stem mismatch means the table disagrees with its
// own lemma; endings carry their standard vowel lengths.

export const strip = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .trim();

const CASES = ['nominative', 'genitive', 'dative', 'accusative', 'ablative', 'vocative'];
const PERSONS = [
  ['singular', 'first'],
  ['singular', 'second'],
  ['singular', 'third'],
  ['plural', 'first'],
  ['plural', 'second'],
  ['plural', 'third'],
];

/** Split "ā|āre" style alternatives. */
const alts = spec => spec.split('|');

/** Build expected cells for a 6-case × 2-number table from ending specs. */
function caseCells(prefix, stem, singular, plural, overrides = {}) {
  const cells = {};
  CASES.forEach((kase, i) => {
    for (const [number, specs] of [
      ['singular', singular],
      ['plural', plural],
    ]) {
      const key = [...prefix, kase, number].join('.');
      const spec = overrides[`${kase}.${number}`] ?? specs[i];
      if (spec == null) continue;
      cells[key] = alts(spec).map(ending =>
        ending.startsWith('=') ? { stem: '', ending: ending.slice(1) } : { stem, ending }
      );
    }
  });
  return cells;
}

const endsWith = (word, ending) => strip(word).endsWith(strip(ending));
const cut = (word, ending) => word.slice(0, word.length - ending.length);

// ---------- nouns ----------

/**
 * Expected noun cells, or { skip } with a reason. `nom` and `gen` are the
 * stored nominative/genitive singular full forms (macrons as stored).
 */
export function nounCells({ nom, gen, declension, gender }) {
  if (!nom) return { skip: 'no nominative singular (plural-only noun?)' };
  const neuter = gender === 'neuter';
  switch (declension) {
    case '1': {
      if (!endsWith(nom, 'a')) return { skip: `1st declension lemma "${nom}" does not end in -a` };
      const stem = nom.slice(0, -1);
      return caseCells([], stem, ['a', 'ae', 'ae', 'am', 'ā', 'a'], ['ae', 'ārum', 'īs|ābus', 'ās', 'īs|ābus', 'ae']);
    }
    case '2': {
      if (endsWith(nom, 'ius') || endsWith(nom, 'ium')) {
        const stem = nom.slice(0, -2); // keeps the i: fīli-
        const contracted = stem.slice(0, -1); // fīl-
        const gsg = `ī|=${contracted}ī`;
        if (endsWith(nom, 'ium'))
          return caseCells([], stem, ['um', gsg, 'ō', 'um', 'ō', 'um'], ['a', 'ōrum', 'īs', 'a', 'īs', 'a']);
        return caseCells(
          [],
          stem,
          ['us', gsg, 'ō', 'um', 'ō', `=${contracted}ī|e`],
          ['ī', 'ōrum', 'īs', 'ōs', 'īs', 'ī']
        );
      }
      if (endsWith(nom, 'us') && !neuter) {
        const stem = nom.slice(0, -2);
        return caseCells([], stem, ['us', 'ī', 'ō', 'um', 'ō', 'e'], ['ī', 'ōrum', 'īs', 'ōs', 'īs', 'ī']);
      }
      if (endsWith(nom, 'um')) {
        const stem = nom.slice(0, -2);
        return caseCells([], stem, ['um', 'ī', 'ō', 'um', 'ō', 'um'], ['a', 'ōrum', 'īs', 'a', 'īs', 'a']);
      }
      if (gen && endsWith(gen, 'ī')) {
        const stem = cut(gen, 'ī');
        return caseCells([], stem, [`=${nom}`, 'ī', 'ō', 'um', 'ō', `=${nom}`], ['ī', 'ōrum', 'īs', 'ōs', 'īs', 'ī']);
      }
      return { skip: `2nd declension lemma "${nom}" has no regular stem` };
    }
    case '3':
    case '3-istem': {
      if (!gen || !endsWith(gen, 'is')) return { skip: `3rd declension genitive "${gen}" does not end in -is` };
      const stem = gen.slice(0, -2);
      const i = declension === '3-istem';
      if (neuter) {
        return caseCells(
          [],
          stem,
          [`=${nom}`, 'is', 'ī', `=${nom}`, i ? 'ī|e' : 'e', `=${nom}`],
          [i ? 'ia' : 'a', i ? 'ium' : 'um', 'ibus', i ? 'ia' : 'a', 'ibus', i ? 'ia' : 'a']
        );
      }
      return caseCells(
        [],
        stem,
        [`=${nom}`, 'is', 'ī', i ? 'em|im' : 'em', i ? 'e|ī' : 'e', `=${nom}`],
        ['ēs', i ? 'ium|um' : 'um', 'ibus', i ? 'ēs|īs' : 'ēs', 'ibus', 'ēs']
      );
    }
    case '4': {
      if (endsWith(nom, 'ū')) {
        const stem = nom.slice(0, -1);
        return caseCells([], stem, ['ū', 'ūs', 'ū|uī', 'ū', 'ū', 'ū'], ['ua', 'uum', 'ibus', 'ua', 'ibus', 'ua']);
      }
      if (!endsWith(nom, 'us')) return { skip: `4th declension lemma "${nom}" does not end in -us` };
      const stem = nom.slice(0, -2);
      return caseCells(
        [],
        stem,
        ['us', 'ūs', 'uī|ū', 'um', 'ū', 'us'],
        ['ūs', 'uum', 'ibus|ubus', 'ūs', 'ibus|ubus', 'ūs']
      );
    }
    case '5': {
      if (!endsWith(nom, 'ēs')) return { skip: `5th declension lemma "${nom}" does not end in -ēs` };
      const stem = nom.slice(0, -2);
      return caseCells([], stem, ['ēs', 'eī|ēī', 'eī|ēī', 'em', 'ē', 'ēs'], ['ēs', 'ērum', 'ēbus', 'ēs', 'ēbus', 'ēs']);
    }
    default:
      return { skip: `declension ${declension} not checked` };
  }
}

// ---------- adjectives ----------

// Pronominal adjectives: genitive -īus, dative -ī.
const PRONOMINAL = new Set([
  'unus',
  'ullus',
  'nullus',
  'solus',
  'totus',
  'alius',
  'alter',
  'uter',
  'neuter',
  'uterque',
]);

function firstSecond(prefix, mascNom, femNom) {
  let stem;
  let mascSingular;
  if (endsWith(mascNom, 'us')) {
    stem = mascNom.slice(0, -2);
    const voc = endsWith(stem, 'i') ? `=${stem.slice(0, -1)}ī|e` : 'e';
    mascSingular = ['us', 'ī', 'ō', 'um', 'ō', voc];
  } else if (femNom && endsWith(femNom, 'a')) {
    stem = femNom.slice(0, -1);
    mascSingular = [`=${mascNom}`, 'ī', 'ō', 'um', 'ō', `=${mascNom}`];
  } else return null;
  return {
    ...caseCells([...prefix, 'masculine'], stem, mascSingular, ['ī', 'ōrum', 'īs', 'ōs', 'īs', 'ī']),
    ...caseCells(
      [...prefix, 'feminine'],
      stem,
      ['a', 'ae', 'ae', 'am', 'ā', 'a'],
      ['ae', 'ārum', 'īs', 'ās', 'īs', 'ae']
    ),
    ...caseCells([...prefix, 'neuter'], stem, ['um', 'ī', 'ō', 'um', 'ō', 'um'], ['a', 'ōrum', 'īs', 'a', 'īs', 'a']),
  };
}

/** Table cells are degrees_table.<degree>.<case>.<gender>.<number>; rearranged here to match. */
function regender(cells) {
  const out = {};
  for (const [key, value] of Object.entries(cells)) {
    const parts = key.split('.');
    const [degree, gender, kase, number] = parts;
    out[[degree, kase, gender, number].join('.')] = value;
  }
  return out;
}

export function adjectiveCells({ word, declension, degrees }) {
  if (PRONOMINAL.has(strip(word))) return { skip: 'pronominal adjective (-īus genitive) not checked' };
  const first = (degree, kase, gender) => degrees?.[degree]?.[kase]?.[gender]?.singular?.[0];
  const cells = {};
  const notes = [];

  const mascNom = first('positive', 'nominative', 'masculine');
  if (declension === '1-2') {
    const built = mascNom && firstSecond(['positive'], mascNom, first('positive', 'nominative', 'feminine'));
    if (built) Object.assign(cells, regender(built));
    else notes.push(`1st/2nd declension positive "${mascNom}" has no regular stem`);
  } else if (declension === '3') {
    const gen = first('positive', 'genitive', 'masculine');
    if (gen && endsWith(gen, 'is')) {
      const stem = gen.slice(0, -2);
      for (const gender of ['masculine', 'feminine', 'neuter']) {
        const neuter = gender === 'neuter';
        const nom = first('positive', 'nominative', gender);
        Object.assign(
          cells,
          regender(
            caseCells(
              ['positive', gender],
              stem,
              [null, 'is', 'ī', neuter ? `=${nom}` : 'em', 'ī|e', null],
              [neuter ? 'ia' : 'ēs', 'ium', 'ibus', neuter ? 'ia' : 'ēs|īs', 'ibus', neuter ? 'ia' : 'ēs']
            )
          )
        );
      }
    } else notes.push(`3rd declension positive genitive "${gen}" does not end in -is`);
  }

  const compNom = first('comparative', 'nominative', 'masculine');
  if (compNom && endsWith(compNom, 'ior')) {
    const base = compNom.slice(0, -3);
    const mf = ['ior', 'iōris', 'iōrī', 'iōrem', 'iōre|iōrī', 'ior'];
    const pl = ['iōrēs', 'iōrum', 'iōribus', 'iōrēs|iōrīs', 'iōribus', 'iōrēs'];
    Object.assign(
      cells,
      regender(caseCells(['comparative', 'masculine'], base, mf, pl)),
      regender(caseCells(['comparative', 'feminine'], base, mf, pl)),
      regender(
        caseCells(
          ['comparative', 'neuter'],
          base,
          ['ius', 'iōris', 'iōrī', 'ius', 'iōre|iōrī', 'ius'],
          ['iōra', 'iōrum', 'iōribus', 'iōra', 'iōribus', 'iōra']
        )
      )
    );
  } else if (compNom) notes.push(`comparative "${compNom}" does not end in -ior`);

  const supNom = first('superlative', 'nominative', 'masculine');
  if (supNom) {
    const built = firstSecond(['superlative'], supNom, first('superlative', 'nominative', 'feminine'));
    if (built) Object.assign(cells, regender(built));
  }

  return { cells, notes };
}

// ---------- verbs ----------

const PRESENT_ACTIVE = {
  'indicative.active.present': {
    1: 'ō,ās,at,āmus,ātis,ant',
    2: 'eō,ēs,et,ēmus,ētis,ent',
    3: 'ō,is,it,imus,itis,unt',
    '3io': 'iō,is,it,imus,itis,iunt',
    4: 'iō,īs,it,īmus,ītis,iunt',
  },
  'indicative.active.imperfect': {
    1: 'ābam,ābās,ābat,ābāmus,ābātis,ābant',
    2: 'ēbam,ēbās,ēbat,ēbāmus,ēbātis,ēbant',
    3: 'ēbam,ēbās,ēbat,ēbāmus,ēbātis,ēbant',
    '3io': 'iēbam,iēbās,iēbat,iēbāmus,iēbātis,iēbant',
    4: 'iēbam,iēbās,iēbat,iēbāmus,iēbātis,iēbant',
  },
  'indicative.active.future': {
    1: 'ābō,ābis,ābit,ābimus,ābitis,ābunt',
    2: 'ēbō,ēbis,ēbit,ēbimus,ēbitis,ēbunt',
    3: 'am,ēs,et,ēmus,ētis,ent',
    '3io': 'iam,iēs,iet,iēmus,iētis,ient',
    4: 'iam,iēs,iet,iēmus,iētis,ient',
  },
  'subjunctive.active.present': {
    1: 'em,ēs,et,ēmus,ētis,ent',
    2: 'eam,eās,eat,eāmus,eātis,eant',
    3: 'am,ās,at,āmus,ātis,ant',
    '3io': 'iam,iās,iat,iāmus,iātis,iant',
    4: 'iam,iās,iat,iāmus,iātis,iant',
  },
  'subjunctive.active.imperfect': {
    1: 'ārem,ārēs,āret,ārēmus,ārētis,ārent',
    2: 'ērem,ērēs,ēret,ērēmus,ērētis,ērent',
    3: 'erem,erēs,eret,erēmus,erētis,erent',
    '3io': 'erem,erēs,eret,erēmus,erētis,erent',
    4: 'īrem,īrēs,īret,īrēmus,īrētis,īrent',
  },
};

const PRESENT_PASSIVE = {
  'indicative.passive.present': {
    1: 'or,āris|āre,ātur,āmur,āminī,antur',
    2: 'eor,ēris|ēre,ētur,ēmur,ēminī,entur',
    3: 'or,eris|ere,itur,imur,iminī,untur',
    '3io': 'ior,eris|ere,itur,imur,iminī,iuntur',
    4: 'ior,īris|īre,ītur,īmur,īminī,iuntur',
  },
  'indicative.passive.imperfect': {
    1: 'ābar,ābāris|ābāre,ābātur,ābāmur,ābāminī,ābantur',
    2: 'ēbar,ēbāris|ēbāre,ēbātur,ēbāmur,ēbāminī,ēbantur',
    3: 'ēbar,ēbāris|ēbāre,ēbātur,ēbāmur,ēbāminī,ēbantur',
    '3io': 'iēbar,iēbāris|iēbāre,iēbātur,iēbāmur,iēbāminī,iēbantur',
    4: 'iēbar,iēbāris|iēbāre,iēbātur,iēbāmur,iēbāminī,iēbantur',
  },
  'indicative.passive.future': {
    1: 'ābor,āberis|ābere,ābitur,ābimur,ābiminī,ābuntur',
    2: 'ēbor,ēberis|ēbere,ēbitur,ēbimur,ēbiminī,ēbuntur',
    3: 'ar,ēris|ēre,ētur,ēmur,ēminī,entur',
    '3io': 'iar,iēris|iēre,iētur,iēmur,iēminī,ientur',
    4: 'iar,iēris|iēre,iētur,iēmur,iēminī,ientur',
  },
  'subjunctive.passive.present': {
    1: 'er,ēris|ēre,ētur,ēmur,ēminī,entur',
    2: 'ear,eāris|eāre,eātur,eāmur,eāminī,eantur',
    3: 'ar,āris|āre,ātur,āmur,āminī,antur',
    '3io': 'iar,iāris|iāre,iātur,iāmur,iāminī,iantur',
    4: 'iar,iāris|iāre,iātur,iāmur,iāminī,iantur',
  },
  'subjunctive.passive.imperfect': {
    1: 'ārer,ārēris|ārēre,ārētur,ārēmur,ārēminī,ārentur',
    2: 'ērer,ērēris|ērēre,ērētur,ērēmur,ērēminī,ērentur',
    3: 'erer,erēris|erēre,erētur,erēmur,erēminī,erentur',
    '3io': 'erer,erēris|erēre,erētur,erēmur,erēminī,erentur',
    4: 'īrer,īrēris|īrēre,īrētur,īrēmur,īrēminī,īrentur',
  },
};

const PERFECT_ACTIVE = {
  'indicative.active.perfect': 'ī,istī,it,imus,istis,ērunt|ēre',
  'indicative.active.pluperfect': 'eram,erās,erat,erāmus,erātis,erant',
  'indicative.active.future_perfect': 'erō,eris,erit,erimus,eritis,erint',
  'subjunctive.active.perfect': 'erim,erīs,erit,erīmus,erītis,erint',
  'subjunctive.active.pluperfect': 'issem,issēs,isset,issēmus,issētis,issent',
};

// Perfect passive system: participle + sum. The first form of each cell (masculine) is the one stored.
const PERFECT_PASSIVE = {
  'indicative.passive.perfect': 'sum,es,est,sumus,estis,sunt',
  'indicative.passive.pluperfect': 'eram,erās,erat,erāmus,erātis,erant',
  'indicative.passive.future_perfect': 'erō,eris,erit,erimus,eritis,erunt',
  'subjunctive.passive.perfect': 'sim,sīs,sit,sīmus,sītis,sint',
  'subjunctive.passive.pluperfect': 'essem,essēs,esset,essēmus,essētis,essent',
};

const ACTIVE_LEMMA_ENDING = { 1: 'ō', 2: 'eō', 3: 'ō', '3io': 'iō', 4: 'iō' };
const DEPONENT_LEMMA_ENDING = { 1: 'or', 2: 'eor', 3: 'or', '3io': 'ior', 4: 'ior' };

function personCells(prefix, stem, spec) {
  const cells = {};
  spec.split(',').forEach((cell, i) => {
    const [number, person] = PERSONS[i];
    cells[`${prefix}.${number}.${person}`] = alts(cell).map(ending => ({ stem, ending }));
  });
  return cells;
}

// Present-system vowel per conjugation for imperatives, gerunds and participles.
const IMPERATIVE = {
  'imperative.active.present.singular.second': { 1: 'ā', 2: 'ē', 3: 'e', '3io': 'e', 4: 'ī' },
  'imperative.active.present.plural.second': { 1: 'āte', 2: 'ēte', 3: 'ite', '3io': 'ite', 4: 'īte' },
  'imperative.active.future.singular.second': { 1: 'ātō', 2: 'ētō', 3: 'itō', '3io': 'itō', 4: 'ītō' },
  'imperative.active.future.singular.third': { 1: 'ātō', 2: 'ētō', 3: 'itō', '3io': 'itō', 4: 'ītō' },
  'imperative.active.future.plural.second': { 1: 'ātōte', 2: 'ētōte', 3: 'itōte', '3io': 'itōte', 4: 'ītōte' },
  'imperative.active.future.plural.third': { 1: 'antō', 2: 'entō', 3: 'untō', '3io': 'iuntō', 4: 'iuntō' },
};
const IMPERATIVE_PASSIVE = {
  'present.singular.second': { 1: 'āre', 2: 'ēre', 3: 'ere', '3io': 'ere', 4: 'īre' },
  'present.plural.second': { 1: 'āminī', 2: 'ēminī', 3: 'iminī', '3io': 'iminī', 4: 'īminī' },
  'future.singular.second': { 1: 'ātor', 2: 'ētor', 3: 'itor', '3io': 'itor', 4: 'ītor' },
  'future.singular.third': { 1: 'ātor', 2: 'ētor', 3: 'itor', '3io': 'itor', 4: 'ītor' },
  'future.plural.third': { 1: 'antor', 2: 'entor', 3: 'untor', '3io': 'iuntor', 4: 'iuntor' },
};
const THEME = { 1: 'a', 2: 'e', 3: 'e', '3io': 'ie', 4: 'ie' };
const PRESENT_PASSIVE_INFINITIVE = { 1: 'ārī', 2: 'ērī', 3: 'ī', '3io': 'ī', 4: 'īrī' };

/** A 1st/2nd declension participle table: keys <prefix>.<case>.<gender>.<number>. */
function participleCells(prefix, base) {
  const built = firstSecond([], `${base}us`);
  const out = {};
  for (const [key, value] of Object.entries(built)) {
    const [gender, kase, number] = key.split('.');
    out[`${prefix}.${kase}.${gender}.${number}`] = value;
  }
  return out;
}

/** Present participle, 3rd declension i-stem with one nominative for all genders: amāns, amant-. */
function presentParticipleCells(prefix, nom, oblique) {
  const out = {};
  for (const gender of ['masculine', 'feminine', 'neuter']) {
    const neuter = gender === 'neuter';
    const cells = caseCells(
      [],
      oblique,
      [`=${nom}`, 'is', 'ī', neuter ? `=${nom}` : 'em', 'e|ī', `=${nom}`],
      [neuter ? 'ia' : 'ēs', 'ium', 'ibus', neuter ? 'ia' : 'ēs|īs', 'ibus', neuter ? 'ia' : 'ēs']
    );
    for (const [key, value] of Object.entries(cells)) {
      const [kase, number] = key.split('.');
      out[`${prefix}.${kase}.${gender}.${number}`] = value;
    }
  }
  return out;
}

/** The participle base (versum → vers-, persecūtus sum → persecūt-), or null. */
function supineBase(principalParts, isDeponent) {
  if (isDeponent) {
    const perfect = principalParts?.[2]?.full_form?.split(/\s+/)[0];
    return perfect && endsWith(perfect, 'us') ? perfect.slice(0, -2) : null;
  }
  const supine = principalParts?.[3]?.full_form;
  // A verb without a supine lists its future participle instead (āfutūrus, adfutūrum).
  if (supine && (endsWith(supine, 'ūrus') || endsWith(supine, 'ūrum'))) return supine.slice(0, -4);
  if (supine && endsWith(supine, 'um')) return supine.slice(0, -2);
  return null;
}

const one = (stem, ending) => ({ stem, ending });

const gerundCells = nd => ({
  'gerund.genitive': [one(nd, 'ī')],
  'gerund.dative': [one(nd, 'ō')],
  'gerund.accusative': [one(nd, 'um')],
  'gerund.ablative': [one(nd, 'ō')],
});

/**
 * The forms every verb builds regularly from its third and fourth principal parts, whatever
 * its conjugation: the perfect active system, and everything on the supine stem.
 */
function principalPartCells(principalParts, isDeponent) {
  const cells = {};
  const perfect = principalParts?.[2]?.full_form;
  if (!isDeponent && perfect && endsWith(perfect, 'ī')) {
    const perfectStem = perfect.slice(0, -1);
    for (const [prefix, spec] of Object.entries(PERFECT_ACTIVE))
      Object.assign(cells, personCells(prefix, perfectStem, spec));
    cells['nonFinite.infinitive.perfect.active'] = [one(perfectStem, 'isse')];
  }
  const base = supineBase(principalParts, isDeponent);
  if (!base) return cells;
  // Compound infinitives. Deponents store theirs under active.
  cells[`nonFinite.infinitive.perfect.${isDeponent ? 'active' : 'passive'}`] = alts('us esse|um esse|a esse').map(e =>
    one(base, e)
  );
  cells['nonFinite.infinitive.future.active'] = alts('ūrus esse|ūrum esse|ūra esse').map(e => one(base, e));
  if (!isDeponent) cells['nonFinite.infinitive.future.passive'] = [one(base, 'um īrī')];
  for (const [prefix, spec] of Object.entries(PERFECT_PASSIVE))
    spec.split(',').forEach((auxiliary, i) => {
      const [number, person] = PERSONS[i];
      cells[`${prefix}.${number}.${person}`] = (number === 'singular' ? ['us', 'um', 'a'] : ['ī', 'a', 'ae']).map(
        ending => one(base, `${ending} ${auxiliary}`)
      );
    });
  cells['supine.accusative'] = [one(base, 'um')];
  cells['supine.ablative'] = [one(base, 'ū')];
  Object.assign(cells, participleCells('nonFinite.participle.perfect.passive', base));
  Object.assign(cells, participleCells('nonFinite.participle.future.active', `${base}ūr`));
  return cells;
}

/**
 * For a verb without a regular conjugation: the present participle, gerundive and gerund
 * are still declined regularly, so each is checked against its own first form.
 */
function selfDeclinedCells(table) {
  const cells = {};
  const first = (path, kase) => {
    const cell = path.split('.').reduce((node, key) => node?.[key], table)?.[kase];
    return (cell?.masculine?.singular ?? cell)?.[0];
  };
  const nom = first('nonFinite.participle.present.active', 'nominative');
  const gen = first('nonFinite.participle.present.active', 'genitive');
  if (nom && gen && endsWith(nom, 'ns') && endsWith(gen, 'ntis'))
    Object.assign(cells, presentParticipleCells('nonFinite.participle.present.active', nom, gen.slice(0, -2)));
  const gerundive = first('nonFinite.participle.future.passive', 'nominative');
  if (gerundive && endsWith(gerundive, 'ndus'))
    Object.assign(cells, participleCells('nonFinite.participle.future.passive', gerundive.slice(0, -2)));
  const gerund = table?.gerund?.genitive?.[0];
  if (gerund && endsWith(gerund, 'ndī')) Object.assign(cells, gerundCells(gerund.slice(0, -1)));
  return cells;
}

/** `table` is the stored conjugation table; it is only read for verbs without a regular conjugation. */
export function verbCells({ conjugation, principalParts, isDeponent, table }) {
  if (!ACTIVE_LEMMA_ENDING[conjugation])
    return {
      cells: { ...principalPartCells(principalParts, isDeponent), ...selfDeclinedCells(table) },
      notes: [`conjugation ${conjugation}: only the perfect system, supine forms and participle endings are checked`],
    };
  const lemma = principalParts?.[0]?.full_form;
  if (!lemma) return { skip: 'no first principal part' };
  const lemmaEnding = (isDeponent ? DEPONENT_LEMMA_ENDING : ACTIVE_LEMMA_ENDING)[conjugation];
  if (!endsWith(lemma, lemmaEnding))
    return { skip: `lemma "${lemma}" does not end in -${lemmaEnding} for conjugation ${conjugation}` };
  const stem = lemma.slice(0, lemma.length - lemmaEnding.length);

  const cells = {};
  if (!isDeponent) {
    for (const [prefix, byConj] of Object.entries(PRESENT_ACTIVE))
      Object.assign(cells, personCells(prefix, stem, byConj[conjugation]));
  }
  for (const [prefix, byConj] of Object.entries(PRESENT_PASSIVE))
    Object.assign(cells, personCells(prefix, stem, byConj[conjugation]));

  // Imperatives. Deponents store their (passive-form) imperatives under both voices.
  if (!isDeponent)
    for (const [path, byConj] of Object.entries(IMPERATIVE))
      cells[path] = alts(byConj[conjugation]).map(e => one(stem, e));
  for (const voice of isDeponent ? ['active', 'passive'] : ['passive'])
    for (const [path, byConj] of Object.entries(IMPERATIVE_PASSIVE))
      cells[`imperative.${voice}.${path}`] = [one(stem, byConj[conjugation])];

  // Present infinitives. Deponents store theirs under active.
  const infinitive = principalParts?.[1]?.full_form;
  if (isDeponent) {
    if (infinitive) cells['nonFinite.infinitive.present.active'] = [one(stem, PRESENT_PASSIVE_INFINITIVE[conjugation])];
  } else {
    if (infinitive) cells['nonFinite.infinitive.present.active'] = [one('', infinitive)];
    cells['nonFinite.infinitive.present.passive'] = [one(stem, PRESENT_PASSIVE_INFINITIVE[conjugation])];
  }

  // Gerund, present participle, gerundive.
  const nd = `${stem}${THEME[conjugation]}nd`;
  Object.assign(cells, gerundCells(nd));
  Object.assign(
    cells,
    presentParticipleCells(
      'nonFinite.participle.present.active',
      `${stem}${{ 1: 'āns', 2: 'ēns', 3: 'ēns', '3io': 'iēns', 4: 'iēns' }[conjugation]}`,
      `${stem}${{ 1: 'ant', 2: 'ent', 3: 'ent', '3io': 'ient', 4: 'ient' }[conjugation]}`
    )
  );
  Object.assign(cells, participleCells('nonFinite.participle.future.passive', nd));
  return { cells: { ...cells, ...principalPartCells(principalParts, isDeponent) } };
}
