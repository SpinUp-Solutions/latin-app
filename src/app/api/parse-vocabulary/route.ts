import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface ParsedEntry {
  id: number;
  originalText: string;
  wordForm: string;
  grammaticalInfo: string;
  translation: string;
  section: string;
  subsection: string;
  wordType:
    | 'noun'
    | 'verb'
    | 'adjective'
    | 'adverb'
    | 'preposition'
    | 'pronoun'
    | 'conjunction'
    | 'interjection'
    | 'enclitic'
    | 'number';
  declensionClass?: string;
  conjugationClass?: string;
  isDeponent?: boolean;
  gender?: string;
}

interface ParseResult {
  totalEntries: number;
  sections: Record<string, ParsedEntry[]>;
  summary: Record<string, number>;
}

// Helper function to determine declension class for nouns
function getDeclensionClass(grammaticalInfo: string, section: string): string | undefined {
  if (section.includes('1st Declension')) return '1st';
  if (section.includes('2nd Declension')) return '2nd';
  if (section.includes('3rd Declension')) return '3rd';
  if (section.includes('4th Declension')) return '4th';
  if (section.includes('5th Declension')) return '5th';
  return undefined;
}

// Helper function to determine conjugation class for verbs
function getConjugationClass(section: string): string | undefined {
  if (section.includes('1st Conjugation')) return '1st';
  if (section.includes('2nd Conjugation')) return '2nd';
  if (section.includes('3rd Conjugation')) return '3rd';
  if (section.includes('4th Conjugation')) return '4th';
  return undefined;
}

// Helper function to extract gender from grammatical info
function extractGender(grammaticalInfo: string): string | undefined {
  if (grammaticalInfo.includes(' f:') || grammaticalInfo.includes(' f') || grammaticalInfo.endsWith(' f')) return 'f';
  if (grammaticalInfo.includes(' m:') || grammaticalInfo.includes(' m') || grammaticalInfo.endsWith(' m')) return 'm';
  if (grammaticalInfo.includes(' n:') || grammaticalInfo.includes(' n') || grammaticalInfo.endsWith(' n')) return 'n';
  if (grammaticalInfo.includes(' m/f:') || grammaticalInfo.includes(' m/f') || grammaticalInfo.endsWith(' m/f'))
    return 'm/f';
  return undefined;
}

// Parse noun entries like "1. adulescentia, -ae f: youth, young people"
function parseNounEntry(line: string, section: string, subsection: string): ParsedEntry | null {
  const match = line.match(/^(\d+)\.\s*([^:]+):\s*(.+)$/);
  if (!match) return null;

  const [, id, leftPart, translation] = match;

  // Extract word form and grammatical info
  // Example: "adulescentia, -ae f" -> wordForm: "adulescentia", grammaticalInfo: "-ae f"
  const parts = leftPart.split(',').map(part => part.trim());
  const wordForm = parts[0];
  const grammaticalInfo = parts.slice(1).join(', ');

  return {
    id: parseInt(id),
    originalText: line,
    wordForm,
    grammaticalInfo,
    translation: translation.trim(),
    section,
    subsection,
    wordType: 'noun',
    declensionClass: getDeclensionClass(grammaticalInfo, section),
    gender: extractGender(grammaticalInfo),
  };
}

// Parse verb entries like "1. admiror, admirari, admiratus sum: to admire, wonder at, be surprised at"
function parseVerbEntry(
  line: string,
  section: string,
  subsection: string,
  isDeponent: boolean = false
): ParsedEntry | null {
  const match = line.match(/^(\d+)\.\s*([^:]+):\s*(.+)$/);
  if (!match) return null;

  const [, id, leftPart, translation] = match;

  // Extract principal parts
  const parts = leftPart.split(',').map(part => part.trim());
  const wordForm = parts[0]; // First principal part
  const grammaticalInfo = leftPart; // All principal parts

  return {
    id: parseInt(id),
    originalText: line,
    wordForm,
    grammaticalInfo,
    translation: translation.trim(),
    section,
    subsection,
    wordType: 'verb',
    conjugationClass: getConjugationClass(subsection),
    isDeponent,
  };
}

// Parse adjective entries like "1. acerbus, -a, -um: bitter, harsh, sour, unripe, cruel, premature, rough"
function parseAdjectiveEntry(line: string, section: string, subsection: string): ParsedEntry | null {
  const match = line.match(/^(\d+)\.\s*([^:]+):\s*(.+)$/);
  if (!match) return null;

  const [, id, leftPart, translation] = match;

  // Extract word form and grammatical info
  const parts = leftPart.split(',').map(part => part.trim());
  const wordForm = parts[0];
  const grammaticalInfo = leftPart;

  return {
    id: parseInt(id),
    originalText: line,
    wordForm,
    grammaticalInfo,
    translation: translation.trim(),
    section,
    subsection,
    wordType: 'adjective',
    declensionClass: subsection.includes('3rd Declension') ? '3rd' : '1st/2nd',
  };
}

// Parse simple entries like adverbs, prepositions, etc.
function parseSimpleEntry(
  line: string,
  section: string,
  subsection: string,
  wordType: ParsedEntry['wordType']
): ParsedEntry | null {
  const match = line.match(/^(\d+)\.\s*([^:]+):\s*(.+)$/);
  if (!match) return null;

  const [, id, leftPart, translation] = match;

  // For simple entries, the word form is usually the first word
  const wordForm = leftPart.split(/[,\s]+/)[0];
  const grammaticalInfo = leftPart;

  return {
    id: parseInt(id),
    originalText: line,
    wordForm,
    grammaticalInfo,
    translation: translation.trim(),
    section,
    subsection,
    wordType,
  };
}

// Helper function to combine multi-line entries
function combineMultiLineEntries(content: string): string {
  const lines = content.split('\n');
  const combinedLines: string[] = [];
  let currentEntry = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // If this is a section header or empty line, end current entry
    if (
      !trimmedLine ||
      trimmedLine.match(
        /^(Nouns:|Verbs:|Irregular Verbs|Adverbs|Prepositions|Pronouns|Conjunctions|Interjections|Enclitic|Numbers)/
      ) ||
      trimmedLine.match(/^\d+(st|nd|rd|th)\s+(Declension|Conjugation)/) ||
      trimmedLine.match(/^(1st\/2nd Declension|3rd Declension).*Adjectives/) ||
      trimmedLine.includes('(Deponents italicized)')
    ) {
      if (currentEntry) {
        combinedLines.push(currentEntry);
        currentEntry = '';
      }

      if (trimmedLine) {
        combinedLines.push(trimmedLine);
      }
      continue;
    }

    // If this starts a new numbered entry, save previous and start new
    if (trimmedLine.match(/^\d+\./)) {
      if (currentEntry) {
        combinedLines.push(currentEntry);
      }
      currentEntry = trimmedLine;
    } else if (currentEntry) {
      // Continue building current entry
      currentEntry += ' ' + trimmedLine;
    } else {
      // Line that doesn't belong to an entry
      combinedLines.push(trimmedLine);
    }
  }

  // Don't forget the last entry
  if (currentEntry) {
    combinedLines.push(currentEntry);
  }

  return combinedLines.join('\n');
}

function parseVocabularyFile(content: string): ParseResult {
  // First, combine multi-line entries
  const combinedContent = combineMultiLineEntries(content);
  const lines = combinedContent.split('\n');

  const sections: Record<string, ParsedEntry[]> = {};
  const summary: Record<string, number> = {};

  let currentSection = '';
  let currentSubsection = '';
  let totalEntries = 0;
  let isInDeponentSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Check for main section headers
    if (line.startsWith('Nouns:')) {
      currentSection = line;
      currentSubsection = '';
      isInDeponentSection = false;
      continue;
    }
    if (line.startsWith('Verbs:')) {
      currentSection = line;
      currentSubsection = '';
      isInDeponentSection = false;
      continue;
    }
    if (line.match(/^(Irregular Verbs|Adverbs|Prepositions|Pronouns|Conjunctions|Interjections|Enclitic|Numbers)/)) {
      currentSection = line;
      currentSubsection = '';
      isInDeponentSection = false;
      continue;
    }

    // Check for subsection headers (like "2nd Declension (110)")
    if (line.match(/^\d+(st|nd|rd|th)\s+Declension\s*\(\d+\)$/)) {
      currentSubsection = line;
      continue;
    }

    // Check for specific noun declension headers (like "3rd Declension Nouns (181)")
    if (line.match(/^\d+(st|nd|rd|th)\s+Declension\s+Nouns\s*\(\d+\)$/)) {
      currentSubsection = line;
      continue;
    }

    // Check for conjugation headers (like "2nd Conjugation (51)")
    if (line.match(/^\d+(st|nd|rd|th)\s+Conjugation\s*\(\d+\)$/)) {
      currentSubsection = line;
      continue;
    }

    // Check for adjective subsection headers
    if (line.match(/^(1st\/2nd Declension|3rd Declension).*Adjectives/)) {
      currentSection = line;
      currentSubsection = '';
      continue;
    }

    // Check for deponent indicator
    if (line.includes('(Deponents italicized)')) {
      isInDeponentSection = true;
      continue;
    }

    // Parse numbered entries
    if (line.match(/^\d+\./)) {
      let entry: ParsedEntry | null = null;

      // Determine entry type based on current section
      if (currentSection.startsWith('Nouns')) {
        entry = parseNounEntry(line, currentSection, currentSubsection);
      } else if (currentSection.startsWith('Verbs') || currentSection.startsWith('Irregular Verbs')) {
        entry = parseVerbEntry(line, currentSection, currentSubsection, isInDeponentSection);
      } else if (currentSection.includes('Adjectives')) {
        entry = parseAdjectiveEntry(line, currentSection, currentSubsection);
      } else if (currentSection.startsWith('Adverbs')) {
        entry = parseSimpleEntry(line, currentSection, currentSubsection, 'adverb');
      } else if (currentSection.startsWith('Prepositions')) {
        entry = parseSimpleEntry(line, currentSection, currentSubsection, 'preposition');
      } else if (currentSection.startsWith('Pronouns')) {
        entry = parseSimpleEntry(line, currentSection, currentSubsection, 'pronoun');
      } else if (currentSection.startsWith('Conjunctions')) {
        entry = parseSimpleEntry(line, currentSection, currentSubsection, 'conjunction');
      } else if (currentSection.startsWith('Interjections')) {
        entry = parseSimpleEntry(line, currentSection, currentSubsection, 'interjection');
      } else if (currentSection.startsWith('Enclitic')) {
        entry = parseSimpleEntry(line, currentSection, currentSubsection, 'enclitic');
      } else if (currentSection.startsWith('Numbers')) {
        entry = parseSimpleEntry(line, currentSection, currentSubsection, 'number');
      }

      if (entry) {
        const sectionKey = currentSubsection || currentSection;
        if (!sections[sectionKey]) {
          sections[sectionKey] = [];
        }
        sections[sectionKey].push(entry);
        totalEntries++;

        // Update summary
        const summaryKey = `${currentSection} - ${currentSubsection || 'General'}`;
        summary[summaryKey] = (summary[summaryKey] || 0) + 1;
      }
    }
  }

  return {
    totalEntries,
    sections,
    summary,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');
    const format = searchParams.get('format') || 'json';

    // Read the text file
    const filePath = path.join(process.cwd(), 'public', '1400.txt');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse the content
    const result = parseVocabularyFile(content);

    // Get all entries flattened
    const allEntries = Object.values(result.sections).flat();

    // If specific section requested, filter results
    if (section) {
      const filteredEntries = allEntries.filter(
        entry =>
          entry.section.toLowerCase().includes(section.toLowerCase()) ||
          entry.subsection.toLowerCase().includes(section.toLowerCase())
      );

      return NextResponse.json({
        totalEntries: filteredEntries.length,
        entries: filteredEntries,
        summary: { [section]: filteredEntries.length },
      });
    }

    // Format response based on requested format
    if (format === 'csv') {
      const csvContent = [
        'ID,Word Form,Grammatical Info,Translation,Section,Subsection,Word Type,Declension Class,Conjugation Class,Gender,Is Deponent',
        ...allEntries.map(
          entry =>
            `${entry.id},"${entry.wordForm}","${entry.grammaticalInfo}","${entry.translation}","${entry.section}","${entry.subsection}","${entry.wordType}","${entry.declensionClass || ''}","${entry.conjugationClass || ''}","${entry.gender || ''}","${entry.isDeponent || false}"`
        ),
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="latin-vocabulary.csv"',
        },
      });
    }

    // Return all entries in a flat array by default
    return NextResponse.json({
      totalEntries: allEntries.length,
      entries: allEntries,
      summary: result.summary,
    });
  } catch (error) {
    console.error('Error parsing vocabulary:', error);
    return NextResponse.json({ error: 'Failed to parse vocabulary file' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { section, wordType, declensionClass, conjugationClass } = await request.json();

    // Read the text file
    const filePath = path.join(process.cwd(), 'public', '1400.txt');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse the content
    const result = parseVocabularyFile(content);

    // Filter based on provided criteria
    let filteredEntries = Object.values(result.sections).flat();

    if (section) {
      filteredEntries = filteredEntries.filter(
        entry =>
          entry.section.toLowerCase().includes(section.toLowerCase()) ||
          entry.subsection.toLowerCase().includes(section.toLowerCase())
      );
    }

    if (wordType) {
      filteredEntries = filteredEntries.filter(entry => entry.wordType === wordType);
    }

    if (declensionClass) {
      filteredEntries = filteredEntries.filter(entry => entry.declensionClass === declensionClass);
    }

    if (conjugationClass) {
      filteredEntries = filteredEntries.filter(entry => entry.conjugationClass === conjugationClass);
    }

    return NextResponse.json({
      totalEntries: filteredEntries.length,
      entries: filteredEntries,
      filters: { section, wordType, declensionClass, conjugationClass },
    });
  } catch (error) {
    console.error('Error filtering vocabulary:', error);
    return NextResponse.json({ error: 'Failed to filter vocabulary' }, { status: 500 });
  }
}
