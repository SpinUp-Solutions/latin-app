// Seeds the local Firebase emulators (demo-latin-app) with the e2e acceptance fixture plus one large
// lesson for scripts/perf/react-benchmark.mjs. Never point this at a deployed project.
import { seedAcceptanceData, getE2EAdmin, E2E_USERS } from '../../tests/e2e/fixtures/seed.ts';

export const PERF_LESSON_ID = 'perf-lesson';
const PAGES = Number(process.env.PERF_PAGES ?? 12);
const feedbackConfig = { escalationLevels: [{ showHint: true }, { showAnswer: true }] };
const words = ['amo', 'moneo', 'rego', 'audio', 'capio', 'sum', 'possum', 'fero', 'eo', 'volo', 'nolo', 'malo'];
const glosses = ['love', 'warn', 'rule', 'hear', 'take', 'be', 'be able', 'carry', 'go', 'want', 'not want', 'prefer'];

function page(p: number) {
  const id = (s: string) => `perf-p${p}-${s}`;
  const w = (i: number) => words[(p + i) % words.length];
  const g = (i: number) => glosses[(p + i) % glosses.length];
  return {
    id: id('page'),
    title: `Page ${p + 1}: ${w(0)} and friends`,
    items: [
      {
        id: id('text'),
        type: 'text',
        content: `<p>Read carefully. <strong>${w(0)}</strong> means <em>${g(0)}</em>. ${'Latin verbs change their endings to show person and number. '.repeat(6)}</p>`,
      },
      {
        id: id('mc'),
        type: 'multiple-choice',
        title: 'Choose the meaning',
        instructions: 'Pick one',
        maxPoints: 1,
        feedbackConfig,
        data: {
          question: `What does <strong>${w(1)}</strong> mean?`,
          allowMultipleSelections: false,
          hint: 'Think of the English derivative.',
          explanation: `${w(1)} = ${g(1)}`,
          options: [0, 1, 2, 3].map(i => ({ id: id(`mc-o${i}`), text: g(1 + i * 3), isCorrect: i === 0 })),
        },
      },
      {
        id: id('fill'),
        type: 'fill',
        title: 'Translate',
        instructions: '',
        maxPoints: 3,
        feedbackConfig,
        data: {
          items: [0, 1, 2].map(i => ({
            text: `${w(i + 2)} = ___`,
            answer: g(i + 2),
            hint: 'English infinitive without "to"',
          })),
        },
      },
      {
        id: id('match'),
        type: 'matching',
        title: 'Match',
        instructions: '',
        maxPoints: 1,
        feedbackConfig,
        data: {
          leftColumn: [0, 1, 2, 3, 4].map(i => ({ id: id(`l${i}`), value: w(i + 5) })),
          rightColumn: [0, 1, 2, 3, 4].map(i => ({ id: id(`r${i}`), value: g(i + 5) })),
          answers: Object.fromEntries([0, 1, 2, 3, 4].map(i => [id(`l${i}`), id(`r${i}`)])),
        },
      },
      {
        id: id('odd'),
        type: 'odd-one-out',
        title: 'Odd one out',
        instructions: '',
        maxPoints: 1,
        feedbackConfig,
        data: {
          question: 'Which is not a verb?',
          items: [0, 1, 2, 3].map(i => ({ id: id(`odd${i}`), text: i === 3 ? 'puella' : w(i), isOddOneOut: i === 3 })),
        },
      },
      {
        id: id('table'),
        type: 'table-fill',
        title: 'Conjugate',
        instructions: '',
        maxPoints: 1,
        feedbackConfig,
        data: {
          columns: [
            { id: 'person', header: 'Person' },
            { id: 'sg', header: 'Singular' },
            { id: 'pl', header: 'Plural' },
          ],
          rows: ['1st', '2nd', '3rd'].map((person, r) => ({
            id: id(`row${r}`),
            cells: {
              person: { content: person, isBlank: false },
              sg: { content: '', isBlank: true, answer: ['amo', 'amas', 'amat'][r] },
              pl: { content: ['amamus', 'amatis', 'amant'][r], isBlank: false },
            },
          })),
        },
      },
    ],
  };
}

const timestamp = '2026-07-28T10:00:00.000Z';
await seedAcceptanceData();
const { db } = getE2EAdmin();
const pages = Array.from({ length: PAGES }, (_, p) => page(p));
await db
  .collection('lessons')
  .doc(PERF_LESSON_ID)
  .set({
    id: PERF_LESSON_ID,
    kind: 'lesson',
    type: 'normal',
    title: 'Performance benchmark lesson',
    description: 'Seeded by the React performance benchmark',
    pages,
    totalPages: pages.length,
    totalItems: pages.length * 6,
    totalExercises: pages.length * 5,
    isLive: true,
    liveOrder: 0,
    publishedAt: timestamp,
    publishedBy: E2E_USERS.admin.uid,
    createdAt: timestamp,
    createdBy: E2E_USERS.admin.uid,
    updatedAt: timestamp,
    updatedBy: E2E_USERS.admin.uid,
  });
const pathRef = db.collection('learningPaths').doc('default');
const path = (await pathRef.get()).data()!;
await pathRef.set({ ...path, unitIds: [PERF_LESSON_ID, ...path.unitIds], revision: path.revision + 1 });
console.log(`seeded ${PERF_LESSON_ID} with ${pages.length} pages`);
