import { Lesson, TextContent, EmphasisContent, TableContent, VocabularyContent } from '../types/lesson';
import { MatchingItem } from '../types/exercises/matching';

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
      {
        id: 'intro-page-vocab',
        title: 'Essential Vocabulary',
        audioPath: null,
        items: [
          {
            id: 'lesson-vocab',
            type: 'vocabulary',
            title: 'Key Latin Verbs',
            studyMode: 'flashcards',
            vocabularyItems: [
              {
                id: 'vocab-1',
                latin: 'do',
                english: 'I give',
                pronunciation: 'doh',
                partOfSpeech: 'verb',
                example: 'Ego tibi librum do. (I give you a book.)',
                notes: 'First conjugation verb, present tense',
              },
              {
                id: 'vocab-2',
                latin: 'moneo',
                english: 'I warn, I advise',
                pronunciation: 'moh-NEH-oh',
                partOfSpeech: 'verb',
                example: 'Te moneo. (I warn you.)',
                notes: 'Second conjugation verb',
              },
              {
                id: 'vocab-3',
                latin: 'credo',
                english: 'I believe',
                pronunciation: 'KREH-doh',
                partOfSpeech: 'verb',
                example: 'Credo in te. (I believe in you.)',
                notes: 'Third conjugation verb',
              },
              {
                id: 'vocab-4',
                latin: 'laudo',
                english: 'I praise',
                pronunciation: 'LAH-oo-doh',
                partOfSpeech: 'verb',
                example: 'Magistrum laudo. (I praise the teacher.)',
                notes: 'First conjugation verb',
              },
              {
                id: 'vocab-5',
                latin: 'video',
                english: 'I see',
                pronunciation: 'WEE-deh-oh',
                partOfSpeech: 'verb',
                example: 'Stellas video. (I see the stars.)',
                notes: 'Second conjugation verb',
              },
            ],
          } as VocabularyContent,
        ],
      },
    ],
    exercises: [
      {
        id: 'exercise-page-1',
        title: 'Verb Ending Practice',
        audioPath: null,
        items: [
          {
            id: 'ex-matching-1',
            type: 'matching',
            title: 'Verb Ending-Pronoun Matching',
            instructions:
              'Match each Latin verb ending with its corresponding pronoun. This will help you identify who is doing the action in a Latin verb.',
            audioPath: null,
            data: {
              leftColumn: [
                { id: 'mus', value: '-mus' },
                { id: 'tis', value: '-tis' },
                { id: 'o', value: '-o' },
                { id: 't', value: '-t' },
                { id: 'erunt', value: '-erunt' },
                { id: 'i', value: '-i' },
                { id: 's', value: '-s' },
                { id: 'sti', value: '-sti' },
                { id: 'stis', value: '-stis' },
                { id: 'nt', value: '-nt' },
              ],
              rightColumn: [
                { id: 'we', value: 'we / nos' },
                { id: 'you-plural-1', value: "you (y'all) / vos" },
                { id: 'i-1', value: 'I / ego' },
                { id: 'he-she-it', value: 'he, she, it / is, ea, id' },
                { id: 'they-1', value: 'they / ei (ii), eae, ea' },
                { id: 'i-2', value: 'I / ego' },
                { id: 'you-singular-1', value: 'you / tu' },
                { id: 'you-singular-2', value: 'you / tu' },
                { id: 'you-plural-2', value: "you (y'all) / vos" },
                { id: 'they-2', value: 'they / ei (ii), eae, ea' },
              ],
              answers: {
                mus: 'we',
                tis: 'you-plural-1',
                o: 'i-1',
                t: 'he-she-it',
                erunt: 'they-1',
                i: 'i-2',
                s: 'you-singular-1',
                sti: 'you-singular-2',
                stis: 'you-plural-2',
                nt: 'they-2',
              },
            },
          },
        ],
      },
      {
        id: 'exercise-page-2',
        title: 'Level 2: Verb-Pronoun Practice',
        audioPath: null,
        items: [
          {
            id: 'instruction-text-1',
            type: 'text',
            title: 'Instructions',
            content: "Now that you understand the basic endings, let's practice with complete Latin verbs.",
            audioPath: null,
          } as TextContent,
          {
            id: 'ex-matching-2',
            type: 'matching',
            title: 'Level 2 Exercise: Verb-Pronoun Matching',
            instructions:
              'Match the Latin word with the appropriate English / Latin pronoun that is governing the verb.',
            audioPath: null,
            data: {
              leftColumn: [
                { id: 'audimus', value: 'audimus' },
                { id: 'laudatis', value: 'laudatis' },
                { id: 'moneo', value: 'moneo' },
                { id: 'credit', value: 'credit' },
                { id: 'fecerunt', value: 'fecerunt' },
                { id: 'monui', value: 'monui' },
                { id: 'das', value: 'das' },
                { id: 'laudavisti', value: 'laudavisti' },
                { id: 'amavistis', value: 'amavistis' },
                { id: 'audiunt', value: 'audiunt' },
              ],
              rightColumn: [
                { id: 'we-2', value: 'we / nos' },
                { id: 'you-plural-3', value: "you (y'all) / vos" },
                { id: 'i-3', value: 'I / ego' },
                { id: 'he-she-it-2', value: 'he, she, it / is, ea, id' },
                { id: 'they-3', value: 'they / ei (ii), eae, ea' },
                { id: 'i-4', value: 'I / ego' },
                { id: 'you-singular-3', value: 'you / tu' },
                { id: 'you-singular-4', value: 'you / tu' },
                { id: 'you-plural-4', value: "you (y'all) / vos" },
                { id: 'they-4', value: 'they / ei (ii), eae, ea' },
              ],
              answers: {
                audimus: 'we-2',
                laudatis: 'you-plural-3',
                moneo: 'i-3',
                credit: 'he-she-it-2',
                fecerunt: 'they-3',
                monui: 'i-4',
                das: 'you-singular-3',
                laudavisti: 'you-singular-4',
                amavistis: 'you-plural-4',
                audiunt: 'they-4',
              },
            },
          },
        ],
      },
      {
        id: 'exercise-page-3',
        title: 'Fill in the Blanks',
        audioPath: null,
        items: [
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
        ],
      },
      {
        id: 'exercise-page-4',
        title: 'Text Analysis',
        audioPath: null,
        items: [
          {
            id: 'analysis-intro',
            type: 'text',
            title: 'Text Analysis Exercise',
            content:
              "Now we'll analyze a real Latin text. Look for unnecessary pronouns that could be removed because the verb ending already tells us who is doing the action.",
            audioPath: null,
          } as TextContent,
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
                  correctWordIndex: 12,
                  explanation:
                    'The pronoun "tu" is unnecessary here because the verb ending already indicates the subject.',
                },
              ],
            },
          },
        ],
      },
      {
        id: 'exercise-page-5',
        title: 'Verb Analysis Practice',
        audioPath: null,
        items: [
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
                  wordIndex: 4,
                  correctPronoun: 'I',
                  explanation: 'First person singular perfect tense',
                },
                {
                  wordIndex: 14,
                  correctPronoun: 'I',
                  explanation: 'First person singular future tense',
                },
                {
                  wordIndex: 20,
                  correctPronoun: 'you',
                  explanation: 'Second person singular present tense',
                },
                {
                  wordIndex: 22,
                  correctPronoun: 'you',
                  explanation: 'Second person singular perfect tense',
                },
                {
                  wordIndex: 30,
                  correctPronoun: 'they',
                  explanation: 'Third person plural present tense',
                },
                {
                  wordIndex: 32,
                  correctPronoun: 'you',
                  explanation: 'Second person singular perfect tense',
                },
                {
                  wordIndex: 39,
                  correctPronoun: 'it',
                  explanation: 'Third person singular present tense',
                },
              ],
            },
          },
        ],
      },
      {
        id: 'exercise-page-6',
        title: 'Advanced Verb Conjugation',
        audioPath: null,
        items: [
          {
            id: 'advanced-intro',
            type: 'emphasis',
            title: 'Advanced Challenge',
            content:
              'This final exercise will test your understanding of verb conjugation in context. Pay close attention to the passage and the conjugation task.',
            audioPath: null,
          } as EmphasisContent,
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
    ],
  },
];

export default lessons;
