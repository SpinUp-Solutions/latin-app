import type { Word } from '@/src/types/admin-vocabulary';
import type { VocabularyPoolStudyItem } from '@/src/types/vocabulary';

type StudyWord = Partial<Word> & {
  id: string;
  part_of_speech?: string;
};

const selectDefinitionLine = (word: StudyWord) => {
  const definitionLines = (word.definitions ?? [])
    .flatMap(definition => definition.split('\n'))
    .map(line => line.trim())
    .filter(line => line && line !== '/' && line !== '-');

  const filteredLines = definitionLines.filter(
    line => !/(ipa|classical latin|ecclesiastical|modern italianate)/i.test(line)
  );
  const firstLine = (filteredLines[0] || definitionLines[0] || '').trim();
  if (!firstLine) return undefined;

  const firstClause = firstLine.split(';')[0].trim();
  return firstClause || undefined;
};

export function toVocabularyPoolStudyItems(words: StudyWord[]): VocabularyPoolStudyItem[] {
  return words.map(word => ({
    id: word.id,
    latin: word.dictionary_entry || word.word || '',
    english: word.translation || '',
    pronunciation: word.pronunciation,
    partOfSpeech: word.wordType || word.part_of_speech,
    notes: selectDefinitionLine(word),
  }));
}
