import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import type { FakeDocument } from './fakeGeneratedWordFirestore';

const EXTRA_FORM_CELLS = [
  ['singular', 'first'],
  ['singular', 'second'],
  ['plural', 'first'],
  ['plural', 'second'],
  ['plural', 'third'],
] as const;

/** `formsPerWord` > 1 gives each eligible word further distinct forms in additional selected cells. */
export function generatedPoolFixture(eligibleCount = 55, totalCount = 100, formsPerWord = 1) {
  const extraCells = EXTRA_FORM_CELLS.slice(0, Math.max(0, formsPerWord - 1));
  const words: FakeDocument[] = Array.from({ length: totalCount }, (_, index) => {
    const eligible = index < eligibleCount;
    const form = eligible ? `amat-${index}` : ['—', ' ', ''][index % 3];
    const present: Record<string, Record<string, string[]>> = { singular: { third: [form, '—', ''] } };
    extraCells.forEach(([number, person], cellIndex) => {
      present[number] = { ...present[number], [person]: [eligible ? `${form}-${cellIndex}` : '—'] };
    });
    return {
      id: `${eligible ? 'valid' : 'invalid'}-${index}`,
      data: {
        word: `amo-${index}`,
        part_of_speech: 'verb',
        conjugation_table: {
          indicative: { active: { present } },
        },
      },
    };
  });
  const pool = { id: 'form-pool', wordDocIds: words.map(word => word.id) };
  const exercise: GeneratedFormIdentificationExercise = {
    id: 'exercise-1',
    type: 'generated-form-identification',
    title: 'Pool morphology',
    instructions: '',
    feedbackConfig: { escalationLevels: [] },
    data: {
      mode: 'single-field',
      generatorConfig: {
        collection: VOCABULARY_WORDS_COLLECTION,
        wordSource: 'pool',
        poolId: pool.id,
        count: 30,
      },
      paradigmConfigs: {
        'verb-conjugation': {
          enabled: true,
          filters: {},
          steps: ['person', 'number'],
          formSelection: {
            tableType: 'conjugation',
            selectedCellPaths: [
              'indicative.active.present.singular.third',
              ...extraCells.map(([number, person]) => `indicative.active.present.${number}.${person}`),
            ],
          },
        },
      },
    },
  };
  return { words, pool, exercise };
}
