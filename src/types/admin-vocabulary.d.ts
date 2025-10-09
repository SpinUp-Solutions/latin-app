export type { ConjugationTable, DeclensionTableRow, AdjectiveDeclensionTableRow } from './vocabulary-new';

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
  declensionType?: string;
  conjugationClass?: string;
  isDeponent?: boolean;
  principalParts?: string[];
  alternateForm?: string;
  declensionTable?: DeclensionTableRow[];
  adjectiveDeclensionTable?: AdjectiveDeclensionTableRow[];
  conjugationTable?: ConjugationTable;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface VocabularyFilters {
  wordType: string;
  search: string;
}

export interface EditingCell {
  rowIndex: number;
  cellKey: string;
  tableType: string;
}
