import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import type { FakeDocument } from './fakeGeneratedWordFirestore';

export function generatedPoolFixture(eligibleCount = 55, totalCount = 100) {
  const words: FakeDocument[] = Array.from({ length: totalCount }, (_, index) => {
    const eligible = index < eligibleCount;
    const form = eligible ? `amat-${index}` : ['—', ' ', ''][index % 3];
    return {
      id: `${eligible ? 'valid' : 'invalid'}-${index}`,
      data: {
        word: `amo-${index}`,
        part_of_speech: 'verb',
        conjugation_table: {
          indicative: { active: { present: { singular: { third: [form, '—', ''] } } } },
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
            selectedCellPaths: ['indicative.active.present.singular.third'],
          },
        },
      },
    },
  };
  return { words, pool, exercise };
}
