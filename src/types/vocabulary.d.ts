import { ContentItem } from './content';

export interface VocabularyItem {
  id: string;
  latin: string;
  english: string;
  pronunciation?: string;
  audioPath?: string | null;
  example?: string;
  partOfSpeech?: string;
  notes?: string;
}

export interface VocabularyContent extends ContentItem {
  type: 'vocabulary';
  vocabularyItems: VocabularyItem[];
  studyMode?: 'flashcards' | 'list' | 'quiz';
}

export interface ParsedEntry {
  id: number;
  originalText: string;
  wordForm: string;
  alternateForm?: string;
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
  principalParts?: string[];
}

export interface ParseResult {
  totalEntries: number;
  sections: Record<string, ParsedEntry[]>;
  summary: Record<string, number>;
}

export interface DeclensionData {
  case: string;
  singular: string[];
  plural: string[];
}

export interface PersonForms {
  singular: {
    first?: string[];
    second?: string[];
    third?: string[];
  };
  plural: {
    first?: string[];
    second?: string[];
    third?: string[];
  };
}

export interface CompoundForms {
  // For perfect tenses that use participle + auxiliary (e.g., "admiratus sum")
  participle?: string[];
  auxiliary?: string; // "sum", "eram", etc.
  // Or as a combined form for simpler handling
  combined?: string[];
}

export interface ImperativeForms {
  singular: {
    second?: string[];
    third?: string[];
  };
  plural: {
    second?: string[];
    third?: string[];
  };
}

export interface ConjugationTable {
  indicative?: {
    active?: {
      present?: PersonForms;
      imperfect?: PersonForms;
      future?: PersonForms;
      perfect?: CompoundForms;
      pluperfect?: CompoundForms;
      futurePerfect?: CompoundForms;
    };
    passive?: {
      present?: PersonForms;
      imperfect?: PersonForms;
      future?: PersonForms;
      perfect?: CompoundForms;
      pluperfect?: CompoundForms;
      futurePerfect?: CompoundForms;
    };
  };
  subjunctive?: {
    active?: {
      present?: PersonForms;
      imperfect?: PersonForms;
      perfect?: CompoundForms;
      pluperfect?: CompoundForms;
    };
    passive?: {
      present?: PersonForms;
      imperfect?: PersonForms;
      perfect?: CompoundForms;
      pluperfect?: CompoundForms;
    };
  };
  imperative?: {
    active?: {
      present?: ImperativeForms;
      future?: ImperativeForms;
    };
    passive?: {
      present?: ImperativeForms;
      future?: ImperativeForms;
    };
  };
  nonFinite?: {
    infinitive?: {
      active?: {
        present?: string[];
        future?: string[];
        perfect?: string[];
        futurePerfect?: string[];
        perfectPotential?: string[];
      };
      passive?: {
        present?: string[];
        future?: string[];
        perfect?: string[];
        futurePerfect?: string[];
        perfectPotential?: string[];
      };
    };
    participle?: {
      active?: {
        present?: string[];
        future?: string[];
      };
      passive?: {
        perfect?: string[];
        future?: string[];
      };
    };
  };
  verbalNouns?: {
    gerund?: {
      genitive?: string[];
      dative?: string[];
      accusative?: string[];
      ablative?: string[];
    };
    supine?: {
      accusative?: string[];
      ablative?: string[];
    };
  };
}

export interface WiktionaryData {
  word: string;
  gender?: string;
  declension?: string;
  conjugation?: string;
  definitions: string[];
  declensionTable?: DeclensionData[];
  conjugationTable?: ConjugationTable;
  etymology?: string;
  pronunciation?: string;
  isDeponent?: boolean;
}

export interface ScrapedResult {
  word: string;
  parsedData: ParsedEntry;
  wiktionaryData: WiktionaryData | null;
  error?: string;
}

export interface WordResponse {
  word: string;
  alternateForm?: string;
  grammaticalInfo: string;
  gender?: string;
  translation: string;
  type: string;
  declensionClass?: number;
  etymology?: string;
  pronunciation?: string;
  declensionTable?: DeclensionData[];
  conjugationTable?: ConjugationTable;
  // Additional fields from parsed data
  id: number;
  section: string;
  subsection: string;
  conjugationClass?: string;
  isDeponent?: boolean;
  principalParts?: string[];
  originalText: string;
  // Wiktionary deponent info (overrides parsed data if available)
  isDeponentFromWiktionary?: boolean;
  // Wiktionary additional data
  definitions?: string[];
  partOfSpeech?: string;
  declension?: string;
  conjugation?: string;
  // Scraping metadata
  scrapingError?: string;
  hasWiktionaryData: boolean;
}

export interface FailedWord {
  word: string;
  grammaticalInfo: string;
  translation: string;
  error: string;
  originalText: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  timestamp: string;
  performance: {
    totalDurationMs: number;
    totalDurationSeconds: number;
    averageTimePerWordMs: number;
    wordsPerSecond: number;
  };
  stats: {
    totalParsedEntries: number;
    secondDeclensionNounsFound: number;
    scraped: number;
    successful: number;
    failed: number;
  };
  words: WordResponse[];
  failedWords: FailedWord[];
}
