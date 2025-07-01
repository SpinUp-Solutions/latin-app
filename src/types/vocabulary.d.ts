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

export interface WiktionaryData {
  word: string;
  gender?: string;
  declension?: string;
  definitions: string[];
  declensionTable?: DeclensionData[];
  etymology?: string;
  pronunciation?: string;
}

export interface ScrapedResult {
  word: string;
  parsedData: ParsedEntry;
  wiktionaryData: WiktionaryData | null;
  error?: string;
}

export interface WordResponse {
  word: string;
  grammaticalInfo: string;
  gender?: string;
  translation: string;
  type: string;
  declensionClass?: number;
  etymology?: string;
  pronunciation?: string;
  declensionTable?: DeclensionData[];
  conjugationTable?: any; // To be defined when conjugation tables are implemented
  // Additional fields from parsed data
  id: number;
  section: string;
  subsection: string;
  conjugationClass?: string;
  isDeponent?: boolean;
  originalText: string;
  // Wiktionary additional data
  definitions?: string[];
  partOfSpeech?: string;
  declension?: string;
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
