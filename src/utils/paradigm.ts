import type { FormParadigm } from '@/src/types/exercises/paradigm';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import type { GeneratorFilters } from '@/src/types/exercises/base';

export function deriveParadigm(
  partOfSpeech: PartOfSpeech,
  pronounType?: PronounType | null,
  person?: PronounPerson | null
): FormParadigm | undefined {
  switch (partOfSpeech) {
    case 'verb':
      return 'verb-conjugation';
    case 'noun':
      return 'noun-declension';
    case 'adjective':
      return 'adjective-declension';
    case 'pronoun':
      if (pronounType === 'personal' && (person === '1st' || person === '2nd')) {
        return 'pronoun-personal';
      }
      return 'pronoun-gendered';
    default:
      return undefined;
  }
}

export function getParadigmsForPOS(pos: PartOfSpeech): FormParadigm[] {
  switch (pos) {
    case 'verb':
      return ['verb-conjugation'];
    case 'noun':
      return ['noun-declension'];
    case 'adjective':
      return ['adjective-declension'];
    case 'pronoun':
      return ['pronoun-personal', 'pronoun-gendered'];
    default:
      return [];
  }
}

export function getParadigmsFromFilters(filters: GeneratorFilters): FormParadigm[] {
  const pos = filters.partOfSpeech;

  if (!pos || pos === 'all') {
    return ['verb-conjugation', 'noun-declension', 'adjective-declension', 'pronoun-personal', 'pronoun-gendered'];
  }

  if (pos === 'pronoun') {
    const pronounType = filters.pronounType;
    const pronounPerson = filters.pronounPerson;

    if (pronounType === 'personal' && (pronounPerson === '1st' || pronounPerson === '2nd')) {
      return ['pronoun-personal'];
    }
    if (pronounType === 'personal' && pronounPerson === '3rd') {
      return ['pronoun-gendered'];
    }
    if (pronounType && pronounType !== 'all' && pronounType !== 'personal') {
      return ['pronoun-gendered'];
    }
    return ['pronoun-personal', 'pronoun-gendered'];
  }

  const paradigm = deriveParadigm(pos as PartOfSpeech, null, null);
  return paradigm ? [paradigm] : [];
}

export function isPronounParadigm(paradigm: FormParadigm): boolean {
  return paradigm === 'pronoun-personal' || paradigm === 'pronoun-gendered';
}

export function getParadigmPOS(paradigm: FormParadigm): PartOfSpeech {
  switch (paradigm) {
    case 'verb-conjugation':
      return 'verb';
    case 'noun-declension':
      return 'noun';
    case 'adjective-declension':
      return 'adjective';
    case 'pronoun-personal':
    case 'pronoun-gendered':
      return 'pronoun';
  }
}
