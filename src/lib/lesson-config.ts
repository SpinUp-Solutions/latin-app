import { Lesson, TextContent, EmphasisContent, TableContent } from '../types/lesson';
import { ContentItem } from '../types/lesson';

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
        title: 'Latin-English Matching',
        instructions:
          'Match each Latin word with its correct English translation. Select a word from each column and click "Match" to create a pair.',
        audioPath: null,
        data: {
          leftColumn: ['domus', 'puer', 'puella', 'canis', 'feles'],
          rightColumn: ['house', 'boy', 'girl', 'dog', 'cat'],
          answers: {
            domus: 'house',
            puer: 'boy',
            puella: 'girl',
            canis: 'dog',
            feles: 'cat',
          },
        },
      },
    ],
  },
];

export default lessons;
