export enum VerbConjugation {
  First = '1',
  Second = '2',
  Third = '3',
  ThirdIO = '3io',
  Fourth = '4',
}

export enum IndicativeTense {
  Present = 'present',
  Imperfect = 'imperfect',
  Future = 'future',
  Perfect = 'perfect',
  Pluperfect = 'pluperfect',
  FuturePerfect = 'future_perfect',
}

export enum SubjunctiveTense {
  Present = 'present',
  Imperfect = 'imperfect',
  Perfect = 'perfect',
  Pluperfect = 'pluperfect',
}

export enum ImperativeTense {
  Present = 'present',
  Future = 'future',
}

export enum Voice {
  Active = 'active',
  Passive = 'passive',
}

export enum Person {
  First = 'first',
  Second = 'second',
  Third = 'third',
}

export enum GrammaticalNumber {
  Singular = 'singular',
  Plural = 'plural',
}

export enum InfinitiveForm {
  ActivePresent = 'active_present',
  ActivePerfect = 'active_perfect',
  ActiveFuture = 'active_future',
  PassivePresent = 'passive_present',
  PassivePerfect = 'passive_perfect',
  PassiveFuture = 'passive_future',
}

export enum ParticipleForm {
  PresentActive = 'present_active',
  PerfectPassive = 'perfect_passive',
  FutureActive = 'future_active',
  FuturePassive = 'future_passive',
}

export enum GerundCase {
  Genitive = 'genitive',
  Dative = 'dative',
  Accusative = 'accusative',
  Ablative = 'ablative',
}

export enum SupineCase {
  Accusative = 'accusative',
  Ablative = 'ablative',
}

export type PersonForms = {
  [K in Person]?: string[];
};

export type VerbNumberForms = {
  [K in GrammaticalNumber]?: PersonForms;
};

export type IndicativeVoice = {
  [K in IndicativeTense]?: VerbNumberForms;
};

export type SubjunctiveVoice = {
  [K in SubjunctiveTense]?: VerbNumberForms;
};

export type PresentImperativeForms = {
  [GrammaticalNumber.Singular]?: {
    [Person.Second]?: string[];
  };
  [GrammaticalNumber.Plural]?: {
    [Person.Second]?: string[];
  };
};

export type FutureImperativeActiveForms = {
  [GrammaticalNumber.Singular]?: {
    [Person.Second]?: string[];
    [Person.Third]?: string[];
  };
  [GrammaticalNumber.Plural]?: {
    [Person.Second]?: string[];
    [Person.Third]?: string[];
  };
};

export type FutureImperativePassiveForms = {
  [GrammaticalNumber.Singular]?: {
    [Person.Third]?: string[];
  };
  [GrammaticalNumber.Plural]?: {
    [Person.Third]?: string[];
  };
};

export interface ImperativeTable {
  active?: {
    [ImperativeTense.Present]?: PresentImperativeForms;
    [ImperativeTense.Future]?: FutureImperativeActiveForms;
  };
  passive?: {
    [ImperativeTense.Present]?: PresentImperativeForms;
    [ImperativeTense.Future]?: FutureImperativePassiveForms;
  };
}

export type InfinitiveTable = {
  [K in InfinitiveForm]?: string[];
};

export type ParticipleTable = {
  [K in ParticipleForm]?: import('./declension').AdjectiveDeclensionTable;
};

export type GerundTable = {
  [K in GerundCase]?: string[];
};

export type SupineTable = {
  [K in SupineCase]?: string[];
};

export interface ConjugationTable {
  indicative?: {
    active?: IndicativeVoice;
    passive?: IndicativeVoice;
  };
  subjunctive?: {
    active?: SubjunctiveVoice;
    passive?: SubjunctiveVoice;
  };
  imperative?: ImperativeTable;
  nonFinite?: {
    infinitive?: InfinitiveTable;
    participle?: ParticipleTable;
  };
  gerund?: GerundTable;
  supine?: SupineTable;
}
