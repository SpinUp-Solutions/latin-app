import { Timestamp } from 'firebase/firestore';

export interface BaseWord {
  word: string;
  part_of_speech: 'noun' | 'verb' | 'pronoun' | 'adjective' | 'adverb' | 'preposition' | 'conjunction' | 'interjection';
  translation: string;
  definitions: string[];
  etymology?: string;
  pronunciation?: string;
  principal_parts?: string[];
  type: string;
  alternate_form?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DeclensionTableRow {
  case: string;
  singular: string[];
  plural: string[];
}

export interface AdjectiveDeclensionTableRow {
  case: string;
  masculine: { singular: string[]; plural: string[] };
  feminine: { singular: string[]; plural: string[] };
  neuter: { singular: string[]; plural: string[] };
}

export interface ConjugationTable {
  indicative?: {
    active?: {
      [tense: string]: {
        singular?: {
          first?: string[];
          second?: string[];
          third?: string[];
        };
        plural?: {
          first?: string[];
          second?: string[];
          third?: string[];
        };
      };
    };
    passive?: {
      [tense: string]: {
        singular?: {
          first?: string[];
          second?: string[];
          third?: string[];
        };
        plural?: {
          first?: string[];
          second?: string[];
          third?: string[];
        };
      };
    };
  };
  subjunctive?: {
    active?: {
      [tense: string]: {
        singular?: {
          first?: string[];
          second?: string[];
          third?: string[];
        };
        plural?: {
          first?: string[];
          second?: string[];
          third?: string[];
        };
      };
    };
    passive?: {
      [tense: string]: {
        singular?: {
          first?: string[];
          second?: string[];
          third?: string[];
        };
        plural?: {
          first?: string[];
          second?: string[];
          third?: string[];
        };
      };
    };
  };
  imperative?: {
    [form: string]: string[];
  };
  nonFinite?: {
    infinitive?: {
      [form: string]: string[];
    };
    participle?: {
      [form: string]: string[];
    };
  };
}

export interface Noun extends BaseWord {
  part_of_speech: 'noun';
  gender?: 'masculine' | 'feminine' | 'neuter';
  declension: '1' | '2' | '3' | '3-istem' | '4' | '5';
  declension_table?: DeclensionTableRow[];
}

export interface Verb extends BaseWord {
  part_of_speech: 'verb';
  conjugation: '1' | '2' | '3' | '3io' | '4';
  conjugation_table?: ConjugationTable;
  is_deponent?: boolean;
}

export interface Pronoun extends BaseWord {
  part_of_speech: 'pronoun';
  pronoun_type:
    | 'personal'
    | 'reflexive'
    | 'possessive'
    | 'demonstrative'
    | 'intensive'
    | 'relative'
    | 'interrogative'
    | 'indefinite';
  declension_table?: DeclensionTableRow[];
}

export interface Adjective extends BaseWord {
  part_of_speech: 'adjective';
  declension?: '1-2' | '3';
  adjective_declension_table?: AdjectiveDeclensionTableRow[];
}

export interface Adverb extends BaseWord {
  part_of_speech: 'adverb';
}

export interface Preposition extends BaseWord {
  part_of_speech: 'preposition';
}

export interface Conjunction extends BaseWord {
  part_of_speech: 'conjunction';
}

export interface Interjection extends BaseWord {
  part_of_speech: 'interjection';
}

export type VocabularyWord = Noun | Verb | Pronoun | Adjective | Adverb | Preposition | Conjunction | Interjection;

export type VocabularyWordWithId = VocabularyWord & { id: string };
