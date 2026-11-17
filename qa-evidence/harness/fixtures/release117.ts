import { seedAcceptanceData, getE2EAdmin, E2E_USERS, E2E_PASSWORD } from './seed';
import { generatedPoolFixture } from '../../../tests/helpers/generatedPoolFixture';
import { buildEmptyWord } from '@/src/utils/vocabulary-defaults';
import * as C from '@/shared/constants/firestore';
import { lessonUnitDocumentSchema } from '@/src/lib/learning-units/schemas';
import { saveLesson } from '@/src/lib/learning-units/lesson-save.server';

export const audit = {
  createdAt: '2026-11-17T08:00:00.000Z',
  updatedAt: '2026-11-17T08:00:00.000Z',
  createdBy: E2E_USERS.admin.uid,
  updatedBy: E2E_USERS.admin.uid,
};
export function tableExercise(reveal = true, maxFailures = 5) {
  return {
    id: 'qa-table',
    type: 'table-fill',
    title: 'Latin noun translations',
    instructions: 'Translate each noun. Correct cells should stay locked on retry.',
    maxPoints: 3,
    feedbackConfig: {
      successMessage: { default: 'Correct!', completion: 'Chart complete', showExplanation: true },
      escalationLevels: [
        {
          message: reveal ? 'Compare the marked cells with their answers.' : 'Check the nouns again.',
          showAnswer: reveal,
        },
        { message: 'The answers are now available.', showAnswer: true },
      ],
      maxLevelFailures: maxFailures,
      progressionRules: { autoAdvanceOnCorrect: false, pauseForExplanation: true, showProgress: true },
    },
    data: {
      columns: [
        { id: 'latin', header: '<strong>Latin</strong>' },
        { id: 'english', header: 'English' },
      ],
      rows: [
        {
          id: 'aqua',
          cells: {
            latin: { content: '<strong>aqua</strong>', isBlank: false },
            english: { content: '', isBlank: true, answer: 'water' },
          },
        },
        {
          id: 'rosa',
          cells: {
            latin: { content: 'rosa', isBlank: false },
            english: { content: '', isBlank: true, answer: 'rose' },
          },
        },
        {
          id: 'terra',
          cells: { latin: { content: '', isBlank: false }, english: { content: '', isBlank: true, answer: 'earth' } },
        },
      ],
      explanation: 'Aqua means water, rosa means rose, and terra means earth.',
    },
  };
}
export function adjectiveChart() {
  const chart = tableExercise(true);
  const names = [
    'Case',
    'Masc. singular',
    'Fem. singular',
    'Neut. singular',
    'Masc. plural',
    'Fem. plural',
    'Neut. plural',
  ];
  const forms = [
    ['Nominative', 'bonus', 'bona', 'bonum', 'boni', 'bonae', 'bona'],
    ['Genitive', 'boni', 'bonae', 'boni', 'bonorum', 'bonarum', 'bonorum'],
    ['Dative', 'bono', 'bonae', 'bono', 'bonis', 'bonis', 'bonis'],
    ['Accusative', 'bonum', 'bonam', 'bonum', 'bonos', 'bonas', 'bona'],
    ['Ablative', 'bono', 'bona', 'bono', 'bonis', 'bonis', 'bonis'],
    ['Vocative', 'bone', 'bona', 'bonum', 'boni', 'bonae', 'bona'],
  ];
  return {
    ...chart,
    id: 'qa-adjective-chart',
    title: 'Bonus: full adjective declension',
    data: {
      ...chart.data,
      columns: names.map((header, i) => ({ id: `col-${i}`, header })),
      rows: forms.map((row, i) => ({
        id: `row-${i}`,
        cells: Object.fromEntries(
          row.map((answer, j) => [
            `col-${j}`,
            j ? { content: '', isBlank: true, answer } : { content: answer, isBlank: false },
          ])
        ),
      })),
    },
  };
}
export function morphology(poolId = 'qa-large', count: number | 'all' = 'all') {
  const exercise = generatedPoolFixture().exercise;
  return {
    ...exercise,
    id: 'qa-morphology',
    title: 'Morphology',
    maxPoints: 1,
    data: { ...exercise.data, generatorConfig: { ...exercise.data.generatorConfig, poolId, count } },
  };
}
export function translation(poolId = 'qa-small', count: number | 'all' = 5) {
  return {
    id: 'qa-definitions',
    type: 'generated-translation',
    title: 'Definitions',
    instructions: 'Translate the selected verb.',
    maxPoints: 1,
    translationDirection: 'latin-to-english',
    feedbackConfig: { escalationLevels: [] },
    data: {
      generatorConfig: { collection: C.VOCABULARY_WORDS_COLLECTION, wordSource: 'pool', poolId, count },
      posConfigs: {
        verb: {
          enabled: true,
          filters: {},
          formSelection: { tableType: 'conjugation', selectedCellPaths: ['indicative.active.present.singular.third'] },
        },
      },
    },
  };
}
export async function seedRelease117() {
  await seedAcceptanceData();
  const { db } = getE2EAdmin();
  const { words } = generatedPoolFixture(450, 500);
  // Synthetic stress entries are explicitly labeled; small-pool entries below use real Latin forms.
  for (let start = 0; start < words.length; start += 200) {
    const batch = db.batch();
    for (const [offset, entry] of words.slice(start, start + 200).entries()) {
      const { id: _, ...base } = buildEmptyWord('verb');
      batch.set(db.collection(C.VOCABULARY_WORDS_COLLECTION).doc(entry.id), {
        ...base,
        ...entry.data,
        translation: 'love',
        dictionary_entry: 'amo, amare, amavi, amatum',
        type: 'core',
        sort_key: entry.data.word,
        random_index: (start + offset + 1) / 501,
        ...audit,
      });
    }
    await batch.commit();
  }
  const real = [
    ['amo', 'amat', 'love'],
    ['video', 'videt', 'see'],
    ['audio', 'audit', 'hear'],
    ['porto', 'portat', 'carry'],
    ['laudo', 'laudat', 'praise'],
  ];
  for (const [word, form, meaning] of real) {
    const { id: _, ...base } = buildEmptyWord('verb');
    await db
      .collection(C.VOCABULARY_WORDS_COLLECTION)
      .doc(`qa-${word}`)
      .set({
        ...base,
        word,
        translation: meaning,
        dictionary_entry: word,
        sort_key: word,
        random_index: 0.4,
        conjugation_table: { indicative: { active: { present: { singular: { third: [form] } } } } },
        ...audit,
      });
  }
  const pools = [
    ['qa-small', 'QA real Latin verbs', real.map(([w]) => `qa-${w}`)],
    ['qa-large', 'QA synthetic stress: 450 eligible of 500', words.map(w => w.id)],
    ['qa-empty', 'QA empty pool', []],
  ] as const;
  for (const [id, name, ids] of pools)
    await db
      .collection(C.VOCABULARY_POOL_COLLECTION)
      .doc(id)
      .set({
        id,
        name,
        description: 'Isolated release 1.1.7 QA fixture',
        wordDocIds: ids,
        sourcePoolIds: [],
        metadata: { ...audit, wordCount: ids.length, isActive: true, tags: ['qa117'], difficulty: 'beginner' },
      });
  const lessons = [
    ['qa-reveal', tableExercise(true)],
    ['qa-hidden', tableExercise(false)],
    ['qa-reset', tableExercise(true, 2)],
    ['qa-generated', morphology()],
    ['qa-authoring', translation()],
    ['qa-adjective', adjectiveChart()],
  ] as const;
  for (const [id, exercise] of lessons) {
    await saveLesson(
      {
        id,
        kind: 'lesson',
        title: `QA ${id}`,
        description: 'Release 1.1.7 emulator-only fixture',
        type: 'normal',
        pages: [{ id: `${id}-page`, title: 'QA exercise', items: [exercise] }],
      },
      E2E_USERS.admin.uid,
      'create'
    );
    // Placement/publish state is fixture setup; authored lesson content used the production save service.
    await db
      .collection(C.LEARNING_UNITS_COLLECTION)
      .doc(id)
      .update({
        isLive: true,
        liveOrder: lessons.findIndex(([key]) => key === id),
        publishedAt: audit.createdAt,
        publishedBy: E2E_USERS.admin.uid,
      });
    lessonUnitDocumentSchema.parse((await db.collection(C.LEARNING_UNITS_COLLECTION).doc(id).get()).data());
  }
  await db
    .collection(C.LEARNING_PATHS_COLLECTION)
    .doc('default')
    .update({ unitIds: lessons.map(([id]) => id) });
  // Independent student paths are completed by production progress APIs during tests where needed.
  return {
    wordCount: 506,
    poolCount: 3,
    eligibleStressWords: 450,
    excludedStressWords: 50,
    users: Object.keys(E2E_USERS),
  };
}
export async function tokenFor(email: string) {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: E2E_PASSWORD, returnSecureToken: true }),
    }
  );
  const data = await response.json();
  if (!data.idToken) throw new Error(JSON.stringify(data));
  return data.idToken as string;
}
