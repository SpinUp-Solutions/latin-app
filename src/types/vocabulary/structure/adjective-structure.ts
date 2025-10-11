import { Case, Gender, Number as NumberEnum } from '../declension';

export const ADJECTIVE_STRUCTURE = {
  declensionTable: {
    cases: Object.values(Case) as Case[],
    genders: Object.values(Gender) as Gender[],
    numbers: Object.values(NumberEnum) as NumberEnum[],
  },
} as const;
