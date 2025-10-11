import { GrammaticalNumber, ImperativeTense, Person, Voice } from '@/src/types/vocabulary/verb-conjugation';
import { VERB_STRUCTURE } from '@/src/types/vocabulary/structure';

export const personLabel: Record<Person, string> = {
  [Person.First]: '1st',
  [Person.Second]: '2nd',
  [Person.Third]: '3rd',
};

export const numberLabel: Record<GrammaticalNumber, string> = {
  [GrammaticalNumber.Singular]: 'Sing.',
  [GrammaticalNumber.Plural]: 'Plur.',
};

export const cross = <A, B>(a: A[], b: B[]) => a.flatMap(x => b.map(y => [x, y] as [A, B]));

export const buildFiniteColumns = (config: { numbers: GrammaticalNumber[]; persons: Person[] }) =>
  cross(config.numbers, config.persons).map(([n, p]) => ({
    number: n,
    person: p,
    label: `${personLabel[p]} ${numberLabel[n]}`,
  }));

type PresentSpec = { numbers: GrammaticalNumber[]; persons: readonly Person[] };
type FutureSpec = Record<Voice, { numbers: GrammaticalNumber[]; persons: readonly Person[] }>;

export const buildImperativeColumns = (voice: Voice, tense: ImperativeTense) => {
  const t = VERB_STRUCTURE.conjugationTable.imperative.tenses;
  if (tense === ImperativeTense.Present) {
    const pres = t[ImperativeTense.Present] as PresentSpec;
    return buildFiniteColumns({ numbers: pres.numbers, persons: pres.persons as Person[] });
  }
  const fut = t[ImperativeTense.Future] as FutureSpec;
  const spec = fut[voice];
  return buildFiniteColumns({ numbers: spec.numbers, persons: spec.persons as Person[] });
};

export const getByPath = <T>(obj: unknown, path: ReadonlyArray<string | number>): T | undefined => {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[String(key)];
    else return undefined;
  }
  return cur as T | undefined;
};

export const makePath = (...segments: Array<string | number>) => segments.join('.');
