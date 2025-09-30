import { Lesson, TextContent, EmphasisContent, TableContent, VocabularyContent } from '../types/lesson';

const TEST_AUDIO = '/assets/audio/test.mp3';

const lessons: Lesson[] = [
  {
    id: 'lesson-1',
    title: 'The Verb',
    description: 'Lesson 1',
    isLive: false,
    liveOrder: null,
    publishedAt: null,
    publishedBy: null,
    pages: [
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
            feedbackConfig: {
              escalationLevels: [],
              successMessage: {
                completion: "Excellent! You've mastered verb endings!",
                showExplanation: true,
              },
            },
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
            itemProgressionDelay: 1800,
            feedbackConfig: {
              escalationLevels: [
                { message: 'Not quite right. Try again.' },
                {
                  message: 'Look carefully at the verb ending to determine the person and number.',
                  showHint: true,
                },
                {
                  message: 'Remember: -mus = we, -tis = you plural, -nt/-erunt = they',
                  showHint: true,
                },
                { showAnswer: true },
              ],
            },
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
            itemProgressionDelay: 600,
            feedbackConfig: {
              escalationLevels: [
                { message: 'Check the verb ending again.' },
                {
                  message: 'Look at the specific ending and match it to the pronoun chart.',
                  showHint: true,
                },
                { showAnswer: true },
              ],
              successMessage: {
                default: 'Correct!',
                advance: 'Well done! Moving to the next one.',
                completion: 'Perfect! You understand Latin verb endings!',
                showExplanation: true,
              },
            },
            data: {
              items: [
                {
                  text: 'audimus',
                  answer: 'we / nos',
                  hint: 'The ending -mus indicates first person plural',
                  explanation: 'First person plural present tense: "we hear"',
                },
                {
                  text: 'laudatis',
                  answer: "you (y'all) / vos",
                  hint: 'The ending -tis indicates second person plural',
                  explanation: 'Second person plural present tense: "you all praise"',
                },
                {
                  text: 'moneo',
                  answer: 'I / ego',
                  hint: 'The ending -o indicates first person singular',
                  explanation: 'First person singular present tense: "I warn"',
                },
                {
                  text: 'credit',
                  answer: 'he, she, it / is, ea, id',
                  hint: 'The ending -t indicates third person singular',
                  explanation: 'Third person singular present tense: "he/she/it believes"',
                },
                {
                  text: 'fecerunt',
                  answer: 'they / ei (ii), eae, ea',
                  hint: 'The ending -erunt indicates third person plural',
                  explanation: 'Third person plural perfect tense: "they have done/made"',
                },
                {
                  text: 'monui',
                  answer: 'I / ego',
                  hint: 'The ending -i indicates first person singular (perfect tense)',
                  explanation: 'First person singular perfect tense: "I have warned"',
                },
                {
                  text: 'das',
                  answer: 'you / tu',
                  hint: 'The ending -s indicates second person singular',
                  explanation: 'Second person singular present tense: "you give"',
                },
                {
                  text: 'laudavisti',
                  answer: 'you / tu',
                  hint: 'The ending -sti indicates second person singular (perfect tense)',
                  explanation: 'Second person singular perfect tense: "you have praised"',
                },
                {
                  text: 'amavistis',
                  answer: "you (y'all) / vos",
                  hint: 'The ending -stis indicates second person plural (perfect tense)',
                  explanation: 'Second person plural perfect tense: "you all have loved"',
                },
                {
                  text: 'audiunt',
                  answer: 'they / ei (ii), eae, ea',
                  hint: 'The ending -nt indicates third person plural',
                  explanation: 'Third person plural present tense: "they hear"',
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
            itemProgressionDelay: 2000,
            feedbackConfig: {
              escalationLevels: [
                { message: 'Not quite. Try another word.' },
                {
                  message:
                    'Look for a pronoun that could be removed because the verb ending already shows the subject.',
                  showHint: false,
                },
                { showAnswer: true },
              ],
              successMessage: {
                default: 'Correct!',
                showExplanation: true,
              },
            },
            data: {
              passage:
                'Nam et si ambulavero in valle umbrae mortis, non timebo mala, quoniam tu mecum es… Parasti in conspectu meo mensam adversus eos, qui tribulant me; impinguasti in oleo caput meum, et calix meus redundat.',
              questions: [
                {
                  id: 'q1',
                  text: 'Look at the Latin passage carefully. Click on the unnecessary pronoun.',
                  correctWordIndex: 12,
                  hint: 'The pronoun "tu" is unnecessary because the verb "es" already indicates "you" through its ending.',
                  explanation: '',
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
            type: 'fill-embolded-text',
            title: 'Level 4 Exercise: Verb Analysis',
            instructions:
              "When a verb becomes bold, click on it and enter the English pronoun that applies to that verb's ending.",
            audioPath: null,
            itemProgressionDelay: 1700,
            feedbackConfig: {
              escalationLevels: [
                { message: 'Try again. Look at the verb ending carefully.' },
                {
                  message: 'Think about the person and number that this ending represents.',
                  showHint: true,
                },
                { showAnswer: true },
              ],
              successMessage: {
                default: 'Correct',
                completion: 'Congratulations! You have completed the exercise.',
                showExplanation: true,
              },
            },
            data: {
              passage:
                'Nam et si ambulavero in valle umbrae mortis, non timebo mala, quoniam tu mecum es … Parasti in conspectu meo mensam adversus eos, qui tribulant me; impinguasti in oleo caput meum, et calix meus redundat.',
              verbs: [
                {
                  wordIndex: 4,
                  correctPronoun: 'I',
                  hint: 'The ending -ero indicates first person singular future tense',
                  explanation: 'First person singular perfect tense',
                },
                {
                  wordIndex: 14,
                  correctPronoun: 'I',
                  hint: 'The ending -bo indicates first person singular future tense',
                  explanation: 'First person singular future tense',
                },
                {
                  wordIndex: 20,
                  correctPronoun: 'you',
                  hint: 'The verb "es" is second person singular',
                  explanation: 'Second person singular present tense',
                },
                {
                  wordIndex: 22,
                  correctPronoun: 'you',
                  hint: 'The ending -sti indicates second person singular perfect tense',
                  explanation: 'Second person singular perfect tense',
                },
                {
                  wordIndex: 30,
                  correctPronoun: 'they',
                  hint: 'The ending -nt indicates third person plural',
                  explanation: 'Third person plural present tense',
                },
                {
                  wordIndex: 32,
                  correctPronoun: 'you',
                  hint: 'The ending -sti indicates second person singular perfect tense',
                  explanation: 'Second person singular perfect tense',
                },
                {
                  wordIndex: 39,
                  correctPronoun: 'it',
                  hint: 'The ending -t indicates third person singular',
                  explanation: 'Third person singular present tense',
                },
              ],
            },
          },
        ],
      },
    ],
  },
];

export default lessons;
