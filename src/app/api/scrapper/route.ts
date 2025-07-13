import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
// @ts-expect-error - no types in pdf-parse
import pdf from 'pdf-parse';

interface BaseEntry {
  section: string;
  lemma: string;
  definition: string;
}

interface VerbEntry extends BaseEntry {
  principalParts: string[];
}

interface AdverbEntry extends BaseEntry {
  forms: string[];
}

interface GenericEntry extends BaseEntry {
  extra?: string;
}

type Entry = VerbEntry | AdverbEntry | GenericEntry;

// Helper functions
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function scanEntries(block: string) {
  // Split the block into lines and process sequentially
  const lines = block.split('\n');
  const entries: { lhs: string; rhs: string }[] = [];
  let currentEntry: { number: string; lhs: string; rhs: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this line starts a new numbered entry
    const match = trimmed.match(/^(\d+)\.?\s*([^:]+):\s*(.*)$/);

    if (match) {
      // Save previous entry if it exists
      if (currentEntry) {
        entries.push({
          lhs: currentEntry.lhs,
          rhs: clean(currentEntry.rhs.join(' ')),
        });
      }

      // Start new entry
      currentEntry = {
        number: match[1],
        lhs: clean(match[2]),
        rhs: [match[3]],
      };
    } else if (currentEntry && trimmed && !trimmed.match(/^\d+\./)) {
      // Continue the definition of current entry
      currentEntry.rhs.push(trimmed);
    }
  }

  // Don't forget the last entry
  if (currentEntry) {
    entries.push({
      lhs: currentEntry.lhs,
      rhs: clean(currentEntry.rhs.join(' ')),
    });
  }

  return entries;
}

// Specific parsers
function parseVerbs(block: string, section: string): VerbEntry[] {
  return scanEntries(block).map(({ lhs, rhs }) => ({
    section,
    lemma: lhs.split(',')[0].trim(),
    principalParts: lhs.split(',').map(clean),
    definition: rhs,
  }));
}

function parseAdverbs(block: string, section: string): AdverbEntry[] {
  return scanEntries(block).map(({ lhs, rhs }) => ({
    section,
    lemma: lhs.split(/[,/]/)[0].trim(),
    forms: lhs.split(/[,/]/).map(clean),
    definition: rhs,
  }));
}

function parseGeneric(block: string, section: string): GenericEntry[] {
  return scanEntries(block).map(({ lhs, rhs }) => ({
    section,
    lemma: lhs.split(/[,\s]/)[0].trim(),
    extra: lhs,
    definition: rhs,
  }));
}

// Updated heading matcher to catch all sections - simplified and comprehensive
const HEAD_RE =
  /^(Nouns: 1st Declension \(\d+\)|2nd Declension \(\d+\)|3rd Declension Nouns \(\d+\)|4th Declension \(\d+\)|5th Declension \(\d+\)|Verbs: 1st Conjugation \(\d+\)|2nd Conjugation \(\d+\)|3rd Conjugation \(\d+\)|3rd -IO Conjugation \(\d+\)|4th Conjugation \(\d+\)|Irregular Verbs \(\d+\)|1st\/2nd Declension: Adjectives \(\d+\)|3rd Declension Adjectives \(\d+\)|Adverbs \(\d+\)|Pronouns \(\d+\)|Prepositions \(\d+\)|Conjunctions \(\d+\)|Interjections \(\d+\)|Enclitic \(\d+\)|Numbers).*$/gim;

function parseAllSections(text: string): Entry[] {
  const heads = Array.from(text.matchAll(HEAD_RE));
  const entries: Entry[] = [];

  heads.forEach((match, i) => {
    const section = clean(match[1]);
    const start = match.index! + match[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index! : text.length;
    const block = text.slice(start, end);

    let parsed: Entry[];

    // Special handling for Interjections and Enclitic sections
    if (/interjections/i.test(section) || /enclitic/i.test(section)) {
      // These sections don't use numbered entries, parse them differently
      const lines = block.split('\n').filter(line => line.trim());
      parsed = lines
        .map(line => {
          const trimmed = line.trim();
          if (trimmed.includes(':')) {
            const [lhs, rhs] = trimmed.split(':', 2);
            return {
              section,
              lemma: clean(lhs),
              extra: clean(lhs),
              definition: clean(rhs),
            };
          }
          return null;
        })
        .filter(Boolean) as GenericEntry[];
    } else if (/verb/i.test(section) && !/adverb/i.test(section)) {
      parsed = parseVerbs(block, section);
    } else if (/adverb/i.test(section)) {
      parsed = parseAdverbs(block, section);
    } else {
      parsed = parseGeneric(block, section);
    }

    entries.push(...parsed);
  });

  return entries;
}

// API Handler
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pdfPath = path.join(process.cwd(), 'public/assets/pdf', '1400.pdf');
    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json({ error: 'PDF file not found.' }, { status: 404 });
    }

    const buffer = fs.readFileSync(pdfPath);
    const { text } = await pdf(buffer);
    const entries = parseAllSections(text);

    return NextResponse.json({
      count: entries.length,
      entries,
    });
  } catch (error) {
    console.error('Parsing error:', error);
    return NextResponse.json({ error: 'Failed to parse PDF.' }, { status: 500 });
  }
}
