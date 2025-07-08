export interface Word {
  id: string;
  word: string;
  wordType: string;
  translation: string;
  section: string;
  subsection?: string;
  grammaticalInfo: string;
  definitions?: string[];
  etymology?: string;
  pronunciation?: string;
  gender?: string;
  declensionClass?: string;
  conjugationClass?: string;
  isDeponent?: boolean;
  principalParts?: string[];
  declensionTable?: Array<{
    case: string;
    singular: string[];
    plural: string[];
  }>;
  adjectiveDeclensionTable?: Array<{
    case: string;
    masculine: { singular: string[]; plural: string[] };
    feminine: { singular: string[]; plural: string[] };
    neuter: { singular: string[]; plural: string[] };
  }>;
  conjugationTable?: ConjugationTable;
  createdAt?: Date;
  updatedAt?: Date;
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

export interface WordsResponse {
  success: boolean;
  data: {
    words: Word[];
    hasMore: boolean;
    lastWordId: string | null;
    wordTypeCounts?: Record<string, number>;
    filters: {
      wordType?: string;
      section?: string;
      search?: string;
    };
  };
}

export interface VocabularyFilters {
  wordType: string;
  section: string;
  search: string;
}

export interface EditingCell {
  rowIndex: number;
  cellKey: string;
  tableType: string;
}
