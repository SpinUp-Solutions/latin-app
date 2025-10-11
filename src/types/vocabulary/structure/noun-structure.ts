import { Case, Number as NumberEnum } from '../declension';

export const NOUN_STRUCTURE = {
  declensionTable: {
    cases: Object.values(Case) as Case[],
    numbers: Object.values(NumberEnum) as NumberEnum[],
  },
} as const;
