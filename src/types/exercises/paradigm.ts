import type { FormIdentificationStep } from './schemas/form-identification';
import type { TableType } from '@/src/utils/schema-helpers';
import type { GeneratorFilters } from './base';

export type FormParadigm =
  | 'verb-conjugation'
  | 'noun-declension'
  | 'adjective-declension'
  | 'pronoun-personal'
  | 'pronoun-gendered';

export interface ParadigmConfig {
  enabled: boolean;
  steps: FormIdentificationStep[];
  filters: Omit<GeneratorFilters, 'partOfSpeech'>;
  formSelection?: {
    tableType: TableType;
    selectedCellPaths: string[];
  };
}

export type ParadigmConfigs = Partial<Record<FormParadigm, ParadigmConfig>>;
