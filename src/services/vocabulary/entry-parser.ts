import { ParsedEntry } from '@/src/types/vocabulary';
import { NounParser } from './noun-parser';
import { VerbParser } from './verb-parser';

export class EntryParser {
  static parseEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    const wordType = this.determineWordType(section);
    if (!wordType) return null;

    switch (wordType) {
      case 'noun':
        return NounParser.parseNounEntry(line, section, subsection);

      case 'verb':
        return VerbParser.parseVerbEntry(line, section, subsection);

      case 'adjective':
      case 'adverb':
      case 'preposition':
      case 'pronoun':
      case 'conjunction':
      case 'interjection':
        return this.parseSimpleEntry(line, section, subsection, wordType);

      default:
        return this.parseGenericEntry(line);
    }
  }

  private static determineWordType(section: string): ParsedEntry['wordType'] | null {
    if (section.includes('Adjectives')) return 'adjective';
    if (section.includes('Nouns') || section.includes('Declension')) return 'noun';
    if (section.includes('Verbs') || section.includes('Conjugation')) return 'verb';
    if (section.includes('Adverbs')) return 'adverb';
    if (section.includes('Prepositions')) return 'preposition';
    if (section.includes('Pronouns')) return 'pronoun';
    if (section.includes('Conjunctions')) return 'conjunction';
    if (section.includes('Interjections')) return 'interjection';
    return null;
  }

  private static parseSimpleEntry(
    line: string,
    section: string,
    subsection: string,
    wordType: ParsedEntry['wordType']
  ): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (!match) return null;

    const [, idStr, content] = match;
    const id = parseInt(idStr);

    // Split by colon to separate word info from translation
    const colonIndex = content.lastIndexOf(':');
    if (colonIndex === -1) return null;

    const wordInfo = content.substring(0, colonIndex).trim();
    const translation = content.substring(colonIndex + 1).trim();

    const { wordForm, alternateForm } = this.extractWordAndAlternateForm(wordInfo);

    return {
      id,
      wordForm,
      alternateForm,
      grammaticalInfo: wordInfo,
      translation,
      wordType,
      section,
      subsection,
      originalText: line,
    };
  }

  private static extractWordAndAlternateForm(wordInfo: string): { wordForm: string; alternateForm?: string } {
    // Handle alternative forms separated by "/" - take the first word before comma/space
    if (wordInfo.includes('/')) {
      const [mainForm, altForm] = wordInfo.split('/').map(w => w.trim());
      return {
        wordForm: mainForm.split(/[,\s]/)[0].trim(),
        alternateForm: altForm.split(/[,\s]/)[0].trim(),
      };
    }

    return {
      wordForm: this.extractWordForm(wordInfo),
      alternateForm: undefined,
    };
  }

  private static parseGenericEntry(line: string): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (!match) return null;

    const [, idStr, content] = match;
    parseInt(idStr);

    // Split by colon to separate word info from translation
    const colonIndex = content.lastIndexOf(':');
    if (colonIndex === -1) return null;

    const wordInfo = content.substring(0, colonIndex).trim();
    content.substring(colonIndex + 1).trim();

    this.extractWordForm(wordInfo);

    return null;
  }

  private static extractWordForm(wordInfo: string): string {
    // Handle alternative forms separated by "/" - take only the first form
    if (wordInfo.includes('/')) {
      const mainForm = wordInfo.split('/')[0].trim();
      return mainForm.split(/[,\s]/)[0].trim();
    }

    const parts = wordInfo.split(/[,\s]/);
    return parts[0].trim();
  }

  static isValidEntry(line: string): boolean {
    return line.match(/^\d+\./) !== null;
  }

  static extractEntryId(line: string): number | null {
    const match = line.match(/^(\d+)\./);
    return match ? parseInt(match[1]) : null;
  }

  static splitEntryContent(content: string): { wordInfo: string; translation: string } | null {
    const colonIndex = content.lastIndexOf(':');
    if (colonIndex === -1) return null;

    return {
      wordInfo: content.substring(0, colonIndex).trim(),
      translation: content.substring(colonIndex + 1).trim(),
    };
  }
}
