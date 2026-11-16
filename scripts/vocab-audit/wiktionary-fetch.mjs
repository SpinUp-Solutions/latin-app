// Downloads the Latin section of each word's English Wiktionary page to out/wiktionary/<id>.json,
// as a reference to compare macrons and forms against. Reads only Wiktionary; skips cached words.
// Usage: node scripts/vocab-audit/wiktionary-fetch.mjs [--refresh]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strip } from './paradigms.mjs';
import { OUT } from './paths.mjs';

const dir = join(OUT, 'wiktionary');
mkdirSync(dir, { recursive: true });
const refresh = process.argv.includes('--refresh');
const { words } = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8'));

function current(id) {
  const edited = join(OUT, 'edited', `${id}.json`);
  return JSON.parse(readFileSync(existsSync(edited) ? edited : join(OUT, 'docs', `${id}.json`), 'utf8')).data;
}

// Keeps the Latin section only: from its h2 to the next h2.
function latinSection(html) {
  const start = html.search(/<h2 id="Latin"/);
  if (start < 0) return null;
  const end = html.indexOf('<h2', start + 10);
  return html.slice(start, end > 0 ? end : undefined);
}

async function fetchPage(title) {
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&formatversion=2&redirects=1`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'latin-vocab-audit/1.0 (one-off dictionary comparison script)' },
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) || 10 * (attempt + 1);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    const body = await res.json();
    if (body.error) return null;
    return { title: body.parse.title, latin: latinSection(body.parse.text) };
  }
  throw new Error(`Wiktionary kept failing for ${title}`);
}

let fetched = 0;
const missing = [];
for (const { id } of words) {
  const file = join(dir, `${id}.json`);
  if (existsSync(file) && !refresh) continue;
  const word = current(id).word;
  const base = strip(word).replace(/[^A-Za-z ]/g, '');
  const titles = [...new Set([base, base.toLowerCase(), base[0].toUpperCase() + base.slice(1).toLowerCase()])];
  let page = null;
  for (const title of titles) {
    const result = await fetchPage(title);
    if (result?.latin) {
      page = result;
      break;
    }
  }
  writeFileSync(file, JSON.stringify({ id, word, page: page?.title ?? null, latin: page?.latin ?? null }));
  if (!page) missing.push(`${word} (${id})`);
  fetched++;
  await new Promise(r => setTimeout(r, 1500));
}
console.log(
  `fetched ${fetched}, no Latin entry for ${missing.length}${missing.length ? `:\n  ${missing.join('\n  ')}` : ''}`
);
