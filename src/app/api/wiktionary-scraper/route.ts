import { NextRequest, NextResponse } from 'next/server';
import { chromium, Locator } from 'playwright';

interface DeclensionData {
  case: string;
  singular: string;
  plural: string;
}

interface WiktionaryData {
  word: string;
  partOfSpeech: string;
  gender?: string;
  declension?: string;
  definitions: string[];
  declensionTable?: DeclensionData[];
  etymology?: string;
  pronunciation?: string;
}

export async function GET(req: NextRequest) {
  const word = new URL(req.url).searchParams.get('word');
  if (!word) return NextResponse.json({ error: 'word param required' }, { status: 400 });
  const data = await scrapeWiktionary(word);
  if (!data) return NextResponse.json({ error: `no Latin data for “${word}”` }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { words } = await req.json();
  if (!Array.isArray(words)) return NextResponse.json({ error: 'words[] required' }, { status: 400 });
  const out: WiktionaryData[] = [];
  for (const w of words) {
    const d = await scrapeWiktionary(w);
    if (d) out.push(d);
    await new Promise(r => setTimeout(r, 1_000));
  }
  return NextResponse.json({
    totalProcessed: words.length,
    successful: out.length,
    data: out,
  });
}

async function scrapeWiktionary(word: string): Promise<WiktionaryData | null> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`https://en.wiktionary.org/wiki/${word}`, { waitUntil: 'networkidle' });

    const latinDiv = page.locator('div.mw-heading.mw-heading2:has(> h2#Latin)').first();
    if (!(await latinDiv.count())) return null;

    const result: WiktionaryData = { word, partOfSpeech: '', definitions: [] };

    const ety = latinDiv
      .locator(
        'xpath=following-sibling::div[contains(@class,"mw-heading3")][.//*[@id and starts-with(@id,"Etymology")]][1]/following-sibling::p[1]'
      )
      .first();
    if (await ety.isVisible()) result.etymology = (await ety.textContent())!.trim();

    const pron = latinDiv
      .locator(
        'xpath=following-sibling::div[contains(@class,"mw-heading3")][.//*[@id and starts-with(@id,"Pronunciation")]][1]/following-sibling::ul[1]/li[1]'
      )
      .first();
    if (await pron.isVisible()) result.pronunciation = (await pron.textContent())!.trim();

    const headPara = latinDiv.locator('xpath=following-sibling::p[1]').first();
    if (await headPara.isVisible()) {
      const txt = (await headPara.textContent())!;
      const g = txt.match(/\b([mfn])\b/);
      const dc = txt.match(/(first|second|third|fourth|fifth)\s+declension/i);
      if (g) result.gender = g[1];
      if (dc) {
        result.declension = dc[0];
        result.partOfSpeech = 'noun';
      }
    }

    const nounDiv = latinDiv
      .locator('xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Noun")]][1]')
      .first();
    const defLis = await nounDiv.locator('xpath=following-sibling::ol[1]/li').all();
    for (const li of defLis) {
      const t = (await li.textContent())?.trim();
      if (t) result.definitions.push(t);
    }

    const declDiv = latinDiv
      .locator(
        'xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Declension")]][1]'
      )
      .first();
    const tableLoc = declDiv
      .locator(
        'xpath=following-sibling::div[contains(@class,"inflection-table-wrapper")]//table[contains(@class,"inflection-table")]'
      )
      .first();
    if (await tableLoc.count()) result.declensionTable = await extractDeclensionTable(tableLoc);

    return result;
  } finally {
    if (browser) await browser.close();
  }
}

async function extractDeclensionTable(table: Locator): Promise<DeclensionData[]> {
  const rows = await table.locator('tr').all();
  const out: DeclensionData[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = await rows[i].locator('th, td').all();
    if (cells.length < 3) continue;
    const [c, s, p] = await Promise.all(cells.slice(0, 3).map(el => el.textContent()));
    if (c && s && p) {
      out.push({ case: c.trim(), singular: s.trim(), plural: p.trim() });
    }
  }
  return out;
}
