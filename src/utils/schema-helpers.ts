export const TABLE_TYPES = {
  DECLENSION: 'declension',
  ADJECTIVE_DECLENSION: 'adjective-declension',
  CONJUGATION: 'conjugation',
  PRONOUN_DECLENSION: 'pronoun-declension',
  PRONOUN_ADJECTIVE_DECLENSION: 'pronoun-adjective-declension',
} as const;

export type TableType = (typeof TABLE_TYPES)[keyof typeof TABLE_TYPES];

export const TABLE_TYPE_CONFIG: Record<TableType, string> = {
  conjugation: 'conjugation_table',
  declension: 'declension_table',
  'adjective-declension': 'degrees_table',
  'pronoun-declension': 'declension_table',
  'pronoun-adjective-declension': 'declension_table',
};

export const getTableFieldName = (tableType: TableType): string => {
  return TABLE_TYPE_CONFIG[tableType];
};

export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const formatEnumLabel = (value: string): string => {
  if (value === '1-2') return 'First/Second';
  if (value === '3-istem') return 'Third i-stem';
  if (value === 'masculine-feminine') return 'Masculine/Feminine';

  const numberMap: Record<string, string> = {
    '1': 'First',
    '2': 'Second',
    '3': 'Third',
    '4': 'Fourth',
    '5': 'Fifth',
    '3io': '3rd io',
  };

  if (numberMap[value]) {
    return numberMap[value];
  }

  return capitalize(value);
};
