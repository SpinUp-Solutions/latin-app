// Deterministic Latin syllable weight and stress, from a macronized word, and
// a reader for the stress and vowel lengths in a stored pronunciation.

const LONG = 'āēīōūȳ';
const SHORT = 'aeiouy';
const MUTE = 'bcdgptf';
const LIQUID = 'lr';

// Syllable nuclei of a macronized word: [{ long, cluster }], cluster = consonants up to the next nucleus.
export function nuclei(word) {
  const w = word
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-zāēīōūȳ]/g, '');
  const out = [];
  let i = 0;
  let pending = '';
  let prevVowel = false;
  const isVowel = c => SHORT.includes(c) || LONG.includes(c);
  while (i < w.length) {
    const c = w[i];
    const next = w[i + 1];
    // Consonantal u after q, and after ng (lingua, sanguis).
    if (c === 'u' && i > 0 && (w[i - 1] === 'q' || (w[i - 1] === 'g' && w[i - 2] === 'n')) && next && isVowel(next)) {
      pending += 'w';
      prevVowel = false;
      i++;
      continue;
    }
    // Consonantal i: word-initial before a vowel, or between vowels (where it is doubled: maior = mai-ior).
    if (c === 'i' && next && isVowel(next) && (i === 0 || prevVowel)) {
      pending += i === 0 ? 'j' : 'jj';
      prevVowel = false;
      i++;
      continue;
    }
    if (isVowel(c)) {
      if (out.length) out.at(-1).cluster = pending;
      pending = '';
      const pair = c + (next ?? '');
      if (['ae', 'au', 'oe'].includes(pair) && !(next && LONG.includes(next))) {
        out.push({ long: true, cluster: '' });
        i += 2;
      } else {
        out.push({ long: LONG.includes(c), cluster: '' });
        i++;
      }
      prevVowel = true;
      continue;
    }
    pending += c;
    prevVowel = false;
    i++;
  }
  if (out.length) out.at(-1).cluster = pending;
  return out;
}

// 'heavy' | 'light' | 'either' (vowel before mute + liquid).
function weight(n) {
  if (n.long) return 'heavy';
  const cl = n.cluster.replace(/h/g, '').replace(/(ch|ph|th|qu|qw)/g, 'C');
  const count = [...cl].reduce((sum, c) => sum + (c === 'x' || c === 'z' ? 2 : 1), 0);
  if (count >= 2) {
    if (count === 2 && MUTE.includes(cl[0]) && LIQUID.includes(cl[1])) return 'either';
    return 'heavy';
  }
  return 'light';
}

// Allowed stressed syllable positions, counted from the end (1 = last).
export function expectedStress(word) {
  const ns = nuclei(word);
  if (ns.length <= 2) return new Set([ns.length || 1]);
  const enclitic = /que$/i.test(word);
  const penult = weight(ns[ns.length - 2]);
  const allowed = new Set(penult === 'heavy' ? [2] : penult === 'light' ? [3] : [2, 3]);
  if (enclitic) [1, 2, 3].forEach(n => allowed.add(n));
  return allowed;
}

// Reads a stored pronunciation. Returns { syllables: [{ text, long }], stressFromEnd } or null
// when the notation shows neither syllables nor stress. long is null where the notation hides length.
const DIPH = ['ae', 'au', 'oe'];
function vowelGroups(chunk) {
  const groups = [];
  const s = chunk.normalize('NFD');
  let cur = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const base = ch.toLowerCase();
    if ('aeiouyɛɪɔʊæœʏəɐ'.includes(base)) {
      const nonSyllabic = s[i + 1] === '̯';
      if (cur && (nonSyllabic || (cur.end === i - 1 && DIPH.includes((cur.last + base).toLowerCase())))) {
        cur.text += ch;
        cur.diph = true;
        cur.end = i;
        cur.last = base;
      } else {
        cur = { text: ch, start: i, end: i, last: base, diph: false, marks: '' };
        groups.push(cur);
      }
    } else if (cur && /[̀-ͯː]/.test(ch) && cur.end >= i - 2) {
      cur.marks += ch;
      if (ch !== '̯') cur.end = i;
    } else cur = cur && /[̀-ͯ]/.test(ch) ? cur : null;
  }
  return groups;
}
export function readPronunciation(pron) {
  if (!pron) return null;
  const p = pron
    .normalize('NFC')
    .replace(/^[^:[/]*:\s*/, '')
    .replace(/[[\]/]/g, '')
    .trim();
  if (/\s/.test(p) || (!/[-.ˈˌ]/.test(p) && !/[A-ZĀĒĪŌŪ]/.test(p))) return null;
  const hyphen = p.includes('-');
  const chunks = hyphen ? p.split('-') : p.split(/(?=[ˈˌ])|\./);
  const syllables = [];
  let stressedIndex = null;
  for (const raw of chunks.filter(Boolean)) {
    const stressed = raw.startsWith('ˈ') || (hyphen && /[A-ZĀĒĪŌŪ]/.test(raw) && raw === raw.toUpperCase());
    const text = raw.replace(/^[ˈˌ]/, '');
    // A respelled chunk ("kwi", "TOO", "lee") is one syllable; IPA chunks may hold several.
    const all = vowelGroups(text);
    const groups =
      hyphen && all.length > 1 ? [{ ...all[0], diph: false, marks: all.map(g => g.marks + g.text).join('') }] : all;
    if (stressed) stressedIndex = syllables.length;
    for (const g of groups) {
      const respelled = /^(oh|oo|ah|ay|ee|eh|aw)$/i.test(text.replace(/[^a-zA-Z]/g, '').replace(/^[^aeiouAEIOU]+/, ''));
      if (/[\u0303]/.test(g.marks + g.text.normalize('NFD'))) {
        syllables.push({ text, long: null }); // nasalized final -um/-im
        continue;
      }
      const long =
        g.diph || /[ː̄]/.test(g.marks) || /[̄]/.test(g.text)
          ? true
          : respelled
            ? null
            : hyphen && !/[ːāēīōūĀĒĪŌŪ]/.test(p)
              ? null
              : false;
      syllables.push({ text, long });
    }
  }
  if (!syllables.length) return null;
  return { syllables, stressFromEnd: stressedIndex == null ? null : syllables.length - stressedIndex };
}

export function checkPronunciation(word, pron) {
  if (!word || /\s/.test(word)) return [];
  const read = readPronunciation(pron);
  if (!read) return [];
  const ns = nuclei(word);
  const issues = [];
  const allowed = expectedStress(word);
  if (read.syllables.length !== ns.length) {
    issues.push({
      check: 'pron-syllables',
      note: `${read.syllables.length} syllables in pronunciation, ${ns.length} in ${word}`,
    });
    return issues;
  }
  if (read.stressFromEnd != null && ns.length > 1 && !allowed.has(read.stressFromEnd))
    issues.push({
      check: 'pron-stress',
      note: `stress on syllable ${read.stressFromEnd} from the end; ${word} needs ${[...allowed].join(' or ')}`,
    });
  read.syllables.forEach(({ text, long }, i) => {
    if (long == null || long === ns[i].long) return;
    issues.push({
      check: 'pron-length',
      note: `syllable ${i + 1} "${text}" is ${long ? 'long' : 'short'} in the pronunciation but ${ns[i].long ? 'long' : 'short'} in ${word}`,
    });
  });
  return issues;
}
