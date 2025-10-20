export type TableType = 'conjugation' | 'declension' | 'adjective-declension' | undefined;

export const deriveTableTypeFromPOS = (partOfSpeech?: string): TableType => {
  if (!partOfSpeech || partOfSpeech === 'all') return undefined;
  switch (partOfSpeech) {
    case 'verb':
      return 'conjugation';
    case 'noun':
      return 'declension';
    case 'adjective':
      return 'adjective-declension';
    default:
      return undefined;
  }
};
