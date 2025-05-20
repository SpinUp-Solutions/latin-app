import { Lesson, TextContent, EmphasisContent, TableContent } from '../types/lesson';

const TEST_AUDIO = '/assets/audio/test.mp3';

const lessons: Lesson[] = [
  {
    id: 'lesson-1',
    title: 'The Verb',
    description: 'Lesson 1',
    introduction: [
      {
        id: 'intro-page-1',
        title: 'Welcome to Your First Lesson',
        audioPath: TEST_AUDIO,
        items: [
          {
            id: 'intro-welcome',
            type: 'text',
            title: 'Welcome to Latin',
            content:
              'The verb is the heart of any language. As we know from the introductory lessons, Latin is an inflected language, so a Latin verb has various endings which reveal "who" the "actor" of the verb is, along with other aspects we will uncover later',
            audioPath: TEST_AUDIO,
          } as TextContent,
          {
            id: 'intro-second',
            type: 'text',
            title: 'Focus of this Lesson',
            content:
              'In this lesson we will learn the endings of Verbs that tell us the "person" who is governing the verb..',
            audioPath: null,
          } as TextContent,
        ],
      },
      {
        id: 'intro-page-2',
        title: 'Verb Basics and Importance',
        audioPath: null,
        items: [
          {
            id: 'intro-importance',
            type: 'emphasis',
            title: 'Tip',
            content:
              'The ENDING will always reveal "who" is doing the verb. The pronoun is not necessary, but is sometimes added for emphasis.',
            audioPath: TEST_AUDIO,
          } as EmphasisContent,
          {
            id: 'verb-conjugation-table',
            type: 'table',
            title: 'Verb Conjugation',
            audioPath: null,
            tableData: {
              title: 'Latin Verb Endings',
              columns: [
                { id: 'singularSubject', header: 'Singular Subject Pronoun' },
                { id: 'singularEnding', header: 'Verb Ending', className: 'font-bold' },
                { id: 'pluralSubject', header: 'Plural Subject Pronoun' },
                { id: 'pluralEnding', header: 'Verb Ending', className: 'font-bold' },
              ],
              rows: [
                {
                  id: 'first-person',
                  rowHeader: 'First Person',
                  cells: {
                    singularSubject: 'I / ego',
                    singularEnding: '-o -m or -i',
                    pluralSubject: 'we / nos',
                    pluralEnding: '-mus',
                  },
                },
                {
                  id: 'second-person',
                  rowHeader: 'Second Person',
                  cells: {
                    singularSubject: 'you / tu',
                    singularEnding: '-s or -sti',
                    pluralSubject: "you (y'all) / vos",
                    pluralEnding: '-tis or -stis',
                  },
                },
                {
                  id: 'third-person',
                  rowHeader: 'Third Person',
                  cells: {
                    singularSubject: 'he, she, it',
                    singularEnding: '-t',
                    pluralSubject: 'They / ei (ii), eae, ea',
                    pluralEnding: '-nt or -erunt',
                  },
                },
              ],
            },
          } as TableContent,
          {
            id: 'verb-examples-table',
            type: 'table',
            title: 'Examples of Latin Verbs',
            audioPath: null,
            tableData: {
              title: 'Latin Verb Forms and Their Meanings',
              columns: [
                { id: 'latinVerb', header: 'Latin', className: 'font-serif italic' },
                { id: 'meaning', header: 'Meaning', className: 'font-medium' },
              ],
              rows: [
                {
                  id: 'dedi',
                  cells: {
                    latinVerb: 'dedi',
                    meaning: 'I gave',
                  },
                },
                {
                  id: 'laudatis',
                  cells: {
                    latinVerb: 'laudatis',
                    meaning: "y'all praise",
                  },
                },
                {
                  id: 'laudavisti',
                  cells: {
                    latinVerb: 'laudavisti',
                    meaning: 'you praised',
                  },
                },
                {
                  id: 'monebam',
                  cells: {
                    latinVerb: 'monebam',
                    meaning: 'I was advising',
                  },
                },
                {
                  id: 'credo',
                  cells: {
                    latinVerb: 'credo',
                    meaning: 'I believe',
                  },
                },
                {
                  id: 'monebis',
                  cells: {
                    latinVerb: 'monebis',
                    meaning: 'you will advise',
                  },
                },
                {
                  id: 'dedistis',
                  cells: {
                    latinVerb: 'dedistis',
                    meaning: "y'all gave",
                  },
                },
                {
                  id: 'credidit',
                  cells: {
                    latinVerb: 'credidit',
                    meaning: 'he/she/it believed',
                  },
                },
              ],
            },
          } as TableContent,
        ],
      },
    ],
    exercises: [
      {
        id: 'ex-matching-1',
        type: 'matching',
        title: 'Verb Ending-Pronoun Matching',
        instructions:
          'Match each Latin verb ending with its corresponding pronoun. This will help you identify who is doing the action in a Latin verb.',
        audioPath: null,
        data: {
          leftColumn: ['-mus', '-tis', '-o', '-t', '-erunt', '-i', '-s', '-sti', '-stis', '-nt'],
          rightColumn: [
            'we / nos',
            "you (y'all) / vos",
            'I / ego',
            'he, she, it / is, ea, id',
            'they / ei (ii), eae, ea',
            'I / ego',
            'you / tu',
            'you / tu',
            "you (y'all) / vos",
            'they / ei (ii), eae, ea',
          ],
          answers: {
            '-mus': 'we / nos',
            '-tis': "you (y'all) / vos",
            '-o': 'I / ego',
            '-t': 'he, she, it / is, ea, id',
            '-erunt': 'they / ei (ii), eae, ea',
            '-i': 'I / ego',
            '-s': 'you / tu',
            '-sti': 'you / tu',
            '-stis': "you (y'all) / vos",
            '-nt': 'they / ei (ii), eae, ea',
          },
        },
      },

      {
        id: 'ex-matching-2',
        type: 'matching',
        title: 'Level 2 Exercise: Verb-Pronoun Matching',
        instructions: 'Match the Latin word with the appropriate English / Latin pronoun that is governing the verb.',
        audioPath: null,
        data: {
          leftColumn: [
            'audimus',
            'laudatis',
            'moneo',
            'credit',
            'fecerunt',
            'monui',
            'das',
            'laudavisti',
            'amavistis',
            'audiunt',
          ],
          rightColumn: [
            'we / nos',
            "you (y'all) / vos",
            'I / ego',
            'he, she, it / is, ea, id',
            'they / ei (ii), eae, ea',
            'I / ego',
            'you / tu',
            'you / tu',
            "you (y'all) / vos",
            'they / ei (ii), eae, ea',
          ],
          answers: {
            audimus: 'we / nos',
            laudatis: "you (y'all) / vos",
            moneo: 'I / ego',
            credit: 'he, she, it / is, ea, id',
            fecerunt: 'they / ei (ii), eae, ea',
            monui: 'I / ego',
            das: 'you / tu',
            laudavisti: 'you / tu',
            amavistis: "you (y'all) / vos",
            audiunt: 'they / ei (ii), eae, ea',
          },
        },
      },
      {
        id: 'ex-fill-1',
        type: 'fill',
        title: 'Complete the Verb Forms',
        instructions: 'Fill in the correct pronoun for each verb.',
        audioPath: null,
        data: {
          items: [
            {
              text: 'audimus',
              answer: 'we / nos',
            },
            {
              text: 'laudatis',
              answer: "you (y'all) / vos",
            },
            {
              text: 'moneo',
              answer: 'I / ego',
            },
            {
              text: 'credit',
              answer: 'he, she, it / is, ea, id',
            },
            {
              text: 'fecerunt',
              answer: 'they / ei (ii), eae, ea',
            },
            {
              text: 'monui',
              answer: 'I / ego',
            },
            {
              text: 'das',
              answer: 'you / tu',
            },
            {
              text: 'laudavisti',
              answer: 'you / tu',
            },
            {
              text: 'amavistis',
              answer: "you (y'all) / vos",
            },
            {
              text: 'audiunt',
              answer: 'they / ei (ii), eae, ea',
            },
          ],
        },
      },
      {
        id: 'ex-text-selection-1',
        type: 'text-selection',
        title: 'Level 4 Exercise: Text Analysis',
        instructions: 'Click on the unnecessary pronoun in the passage.',
        audioPath: null,
        data: {
          passage:
            'Nam et si ambulavero in valle umbrae mortis, non timebo mala, quoniam tu mecum es… Parasti in conspectu meo mensam adversus eos, qui tribulant me; impinguasti in oleo caput meum, et calix meus redundat.',
          questions: [
            {
              id: 'q1',
              text: 'Look at the Latin passage carefully. Click on the unnecessary pronoun.',
              correctWord: 'tu',
              explanation:
                'The pronoun "tu" is unnecessary here because the verb ending already indicates the subject.',
            },
          ],
        },
      },
      {
        id: 'ex-verb-analysis-1',
        type: 'verb-analysis',
        title: 'Level 4 Exercise: Verb Analysis',
        instructions:
          "When a verb becomes bold, click on it and enter the English pronoun that applies to that verb's ending.",
        audioPath: null,
        data: {
          passage:
            'Nam et si ambulavero in valle umbrae mortis, non timebo mala, quoniam tu mecum es … Parasti in conspectu meo mensam adversus eos, qui tribulant me; impinguasti in oleo caput meum, et calix meus redundat.',
          verbs: [
            {
              word: 'ambulavero',
              correctPronoun: 'I',
              explanation: 'First person singular perfect tense',
            },
            {
              word: 'timebo',
              correctPronoun: 'I',
              explanation: 'First person singular future tense',
            },
            {
              word: 'es',
              correctPronoun: 'you',
              explanation: 'Second person singular present tense',
            },
            {
              word: 'Parasti',
              correctPronoun: 'you',
              explanation: 'Second person singular perfect tense',
            },
            {
              word: 'tribulant',
              correctPronoun: 'they',
              explanation: 'Third person plural present tense',
            },
            {
              word: 'impinguasti',
              correctPronoun: 'you',
              explanation: 'Second person singular perfect tense',
            },
            {
              word: 'redundat',
              correctPronoun: 'it',
              explanation: 'Third person singular present tense',
            },
          ],
        },
      },
      {
        id: 'ex-verb-conjugation-1',
        type: 'verb-conjugation',
        title: 'Level 5 Exercise: Advanced Verb Conjugation',
        instructions: 'Study the passage and complete the conjugation tasks.',
        data: {
          passage: {
            latin: 'Nisi quid mi opis di dant, disperii, neque unde auxilium expetam habeo.',
            translation:
              'Unless the gods give something of help to me, I have perished, nor do I have from where I might seek help.',
            specialVocab: {
              quid: '(accusative/direct object form) something',
              mi: 'alternate form of mihi',
              opis: 'of help',
            },
          },
          conjugationTask: {
            instructions:
              'Change the person endings on the verbs to say in Latin (keep the same order of words): "Unless we give something of help, you [pl use the T4 special ending] have died. Therefore you [pl] do not have from where [pl] might seek help."',
            answer: 'Nisi quid opis damus, disperiistis. Neque unde auxilium expetatis habetis.',
          },
          livingLatinPractice: {
            examples: [
              {
                latin: 'Sis felix semper!',
                translation: 'May you always be happy!',
              },
              {
                latin: 'Latinam bene discit!',
                translation: 'he/she/it is learning Latin well!',
              },
            ],
            exercises: [
              {
                english: 'May she always be happy!',
                answer: 'Sit felix semper',
              },
              {
                english: 'May I always be happy!',
                answer: 'Sim felix semper',
              },
              {
                english: 'We are learning Latin well!',
                answer: 'Latinam bene discimus',
              },
              {
                english: "Y'all are learning Latin well!",
                answer: 'Latinam bene discitis',
              },
            ],
          },
        },
      },
    ],
  },
];

export default lessons;
