import { ParsedEntry, ParseResult } from '@/src/types/vocabulary';

export class WordFilters {
  static getAllEntries(parseResult: ParseResult): ParsedEntry[] {
    return Object.values(parseResult.sections).flat();
  }

  static filterByWordType(parseResult: ParseResult, wordType: ParsedEntry['wordType']): ParsedEntry[] {
    const allEntries = this.getAllEntries(parseResult);
    return allEntries.filter(entry => entry.wordType === wordType);
  }

  static filterAllNouns(parseResult: ParseResult): ParsedEntry[] {
    return this.filterByWordType(parseResult, 'noun');
  }

  static filterFirstDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = this.getAllEntries(parseResult);
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '1st');
  }

  static filterSecondDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = this.getAllEntries(parseResult);
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '2nd');
  }

  static filterThirdDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = this.getAllEntries(parseResult);
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '3rd');
  }

  static filterFourthDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = this.getAllEntries(parseResult);
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '4th');
  }

  static filterFifthDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = this.getAllEntries(parseResult);
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '5th');
  }

  static filterNounsByDeclension(parseResult: ParseResult, declension: string): ParsedEntry[] {
    const allEntries = this.getAllEntries(parseResult);
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === declension);
  }

  // === VERB FILTERS ===
  static filterVerbs(parseResult: ParseResult): ParsedEntry[] {
    return this.filterByWordType(parseResult, 'verb');
  }

  static filterVerbsByConjugation(parseResult: ParseResult, conjugation: string): ParsedEntry[] {
    const allEntries = this.getAllEntries(parseResult);
    return allEntries.filter(entry => entry.wordType === 'verb' && entry.conjugationClass === conjugation);
  }

  // === OTHER WORD TYPE FILTERS ===
  static filterAdjectives(parseResult: ParseResult): ParsedEntry[] {
    return this.filterByWordType(parseResult, 'adjective');
  }

  static filterAdverbs(parseResult: ParseResult): ParsedEntry[] {
    return this.filterByWordType(parseResult, 'adverb');
  }

  static filterPrepositions(parseResult: ParseResult): ParsedEntry[] {
    return this.filterByWordType(parseResult, 'preposition');
  }

  static filterPronouns(parseResult: ParseResult): ParsedEntry[] {
    return this.filterByWordType(parseResult, 'pronoun');
  }

  static filterConjunctions(parseResult: ParseResult): ParsedEntry[] {
    return this.filterByWordType(parseResult, 'conjunction');
  }

  static filterInterjections(parseResult: ParseResult): ParsedEntry[] {
    return this.filterByWordType(parseResult, 'interjection');
  }
}
