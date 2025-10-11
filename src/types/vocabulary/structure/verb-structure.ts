import {
  IndicativeTense,
  SubjunctiveTense,
  ImperativeTense,
  Voice,
  Person,
  GrammaticalNumber,
  InfinitiveForm,
  ParticipleForm,
  GerundCase,
  SupineCase,
} from '../verb-conjugation';

export const VERB_STRUCTURE = {
  conjugationTable: {
    indicative: {
      voices: Object.values(Voice) as Voice[],
      tenses: Object.values(IndicativeTense) as IndicativeTense[],
      numbers: Object.values(GrammaticalNumber) as GrammaticalNumber[],
      persons: Object.values(Person) as Person[],
    },
    subjunctive: {
      voices: Object.values(Voice) as Voice[],
      tenses: Object.values(SubjunctiveTense) as SubjunctiveTense[],
      numbers: Object.values(GrammaticalNumber) as GrammaticalNumber[],
      persons: Object.values(Person) as Person[],
    },
    imperative: {
      voices: Object.values(Voice) as Voice[],
      tenses: {
        [ImperativeTense.Present]: {
          numbers: Object.values(GrammaticalNumber) as GrammaticalNumber[],
          persons: [Person.Second] as const,
        },
        [ImperativeTense.Future]: {
          [Voice.Active]: {
            numbers: Object.values(GrammaticalNumber) as GrammaticalNumber[],
            persons: [Person.Second, Person.Third] as const,
          },
          [Voice.Passive]: {
            numbers: Object.values(GrammaticalNumber) as GrammaticalNumber[],
            persons: [Person.Third] as const,
          },
        },
      },
    },
    nonFinite: {
      infinitive: Object.values(InfinitiveForm) as InfinitiveForm[],
      participle: Object.values(ParticipleForm) as ParticipleForm[],
    },
    gerund: Object.values(GerundCase) as GerundCase[],
    supine: Object.values(SupineCase) as SupineCase[],
  },
} as const;
