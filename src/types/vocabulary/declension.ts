export enum Case {
  Nominative = 'nominative',
  Genitive = 'genitive',
  Dative = 'dative',
  Accusative = 'accusative',
  Ablative = 'ablative',
  Vocative = 'vocative',
  Locative = 'locative',
}

export enum Gender {
  Masculine = 'masculine',
  Feminine = 'feminine',
  Neuter = 'neuter',
}

export enum Number {
  Singular = 'singular',
  Plural = 'plural',
}

export enum NounDeclension {
  First = '1',
  Second = '2',
  Third = '3',
  ThirdIStem = '3-istem',
  Fourth = '4',
  Fifth = '5',
}

export enum AdjectiveDeclension {
  FirstSecond = '1-2',
  Third = '3',
}

export type NumberForms = {
  [Number.Singular]: string[];
  [Number.Plural]: string[];
};

export type GenderForms = {
  [Gender.Masculine]: NumberForms;
  [Gender.Feminine]: NumberForms;
  [Gender.Neuter]: NumberForms;
};

export type DeclensionTable = {
  [K in Case]?: {
    singular: string[];
    plural: string[];
  };
};

export type AdjectiveDeclensionTable = {
  [K in Case]?: GenderForms;
};

export interface DeclensionTableRow {
  case: Case;
  singular: string[];
  plural: string[];
}

export interface AdjectiveDeclensionTableRow {
  case: Case;
  masculine: NumberForms;
  feminine: NumberForms;
  neuter: NumberForms;
}
