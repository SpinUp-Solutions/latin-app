import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import {
  findIndeclinableCandidates,
  formatReport,
  parseArgs,
  reportIndeclinableWords,
} from '../scripts/report-indeclinable-words.mjs';

const doc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

describe('read-only indeclinable words report script', () => {
  it('reads only VOCABULARY_WORDS_COLLECTION, writes nothing, and flags one-cell māne, nēquam, and uniform quattuor', async () => {
    const docs = [
      doc('w-mane', {
        word: 'māne',
        part_of_speech: 'noun',
        declension: '3',
        declension_table: {
          nominative: { singular: ['māne'], plural: null },
          accusative: { singular: null, plural: null },
        },
      }),
      doc('w-mane-adv', {
        word: 'māne',
        part_of_speech: 'adverb',
      }),
      doc('w-nequam', {
        word: 'nēquam',
        part_of_speech: 'adjective',
        declension: '3',
        degrees_table: {
          positive: {
            nominative: {
              masculine: { singular: ['nēquam'], plural: ['nēquam'] },
            },
          },
          comparative: {
            nominative: {
              masculine: { singular: ['nēquior'], plural: ['nēquiōrēs'] },
            },
          },
          superlative: {},
        },
      }),
      doc('w-quattuor', {
        word: 'quattuor',
        part_of_speech: 'adjective',
        declension: null,
        degrees_table: {
          positive: {
            nominative: {
              masculine: { singular: null, plural: ['quattuor'] },
              feminine: { singular: null, plural: ['quattuor'] },
            },
          },
          comparative: {},
          superlative: {},
        },
      }),
      doc('w-unlisted-uniform', {
        word: 'beta',
        part_of_speech: 'noun',
        declension: '1',
        declension_table: {
          nominative: { singular: ['beta'], plural: null },
          accusative: { singular: ['beta'], plural: null },
        },
      }),
      doc('w-puella', {
        word: 'puella',
        part_of_speech: 'noun',
        declension: '1',
        declension_table: {
          nominative: { singular: ['puella'], plural: ['puellae'] },
          accusative: { singular: ['puellam'], plural: ['puellās'] },
        },
      }),
      doc('w-already-marked', {
        word: 'fās',
        part_of_speech: 'noun',
        declension: 'indeclinable',
        declension_table: {
          nominative: { singular: ['fās'], plural: null },
          accusative: { singular: ['fās'], plural: null },
        },
      }),
      doc('w-deleting', {
        word: 'nefās',
        part_of_speech: 'noun',
        declension: '3',
        _deletionPending: true,
        declension_table: {},
      }),
    ];

    const collectionMock = jest.fn((name: string) => {
      expect(name).toBe(VOCABULARY_WORDS_COLLECTION);
      return {
        get: jest.fn(async () => ({ docs })),
        doc: () => {
          throw new Error('Read-only report must never access document references for writing');
        },
        add: () => {
          throw new Error('Read-only report must never add documents');
        },
      };
    });
    const fakeDb = {
      collection: collectionMock,
      batch: () => {
        throw new Error('Read-only report must never open a write batch');
      },
      runTransaction: () => {
        throw new Error('Read-only report must never open a transaction');
      },
    };

    const flagged = await reportIndeclinableWords(fakeDb);
    expect(collectionMock).toHaveBeenCalledTimes(1);
    expect(flagged).toEqual([
      {
        id: 'w-unlisted-uniform',
        word: 'beta',
        partOfSpeech: 'noun',
        declension: '1',
        reasons: ['uniform-table'],
      },
      {
        id: 'w-mane',
        word: 'māne',
        partOfSpeech: 'noun',
        declension: '3',
        reasons: ['headword'],
      },
      {
        id: 'w-nequam',
        word: 'nēquam',
        partOfSpeech: 'adjective',
        declension: '3',
        reasons: ['headword', 'uniform-table'],
      },
      {
        id: 'w-quattuor',
        word: 'quattuor',
        partOfSpeech: 'adjective',
        declension: null,
        reasons: ['headword', 'uniform-table'],
      },
    ]);

    const output = formatReport(flagged);
    expect(output).toContain('w-mane\tmāne\tnoun\t3\theadword');
    expect(output).toContain('w-nequam\tnēquam\tadjective\t3\theadword, uniform-table');
    expect(output).toContain('w-quattuor\tquattuor\tadjective\t(none)\theadword, uniform-table');

    const withMarked = await reportIndeclinableWords(fakeDb, { includeMarked: true });
    expect(withMarked.some(entry => entry.id === 'w-already-marked')).toBe(true);
  });

  it('matches cardinals 4-100, compounds, and singular mīlle while excluding declined numerals', () => {
    const docs = [
      doc('c-4', { word: 'quattuor', part_of_speech: 'adjective', declension: '3' }),
      doc('c-18', { word: 'duodēvīgintī', part_of_speech: 'adjective', declension: '3' }),
      doc('c-24', { word: 'vīgintī quattuor', part_of_speech: 'adjective', declension: '3' }),
      doc('c-100', { word: 'centum', part_of_speech: 'adjective', declension: '3' }),
      doc('c-1000', { word: 'mīlle', part_of_speech: 'adjective', declension: '3' }),
      doc('c-21', { word: 'vīgintī ūnus', part_of_speech: 'adjective', declension: '1-2' }),
      doc('c-200', { word: 'ducentī', part_of_speech: 'adjective', declension: '1-2' }),
      doc('c-milia', { word: 'mīlia', part_of_speech: 'noun', declension: '3-istem' }),
      doc('n-fas-no-macron', { word: 'fas', part_of_speech: 'noun', declension: '3' }),
      doc('n-nequam-wrong-pos', { word: 'nēquam', part_of_speech: 'noun', declension: '3' }),
    ];

    expect(
      findIndeclinableCandidates(docs)
        .map(entry => entry.id)
        .sort()
    ).toEqual(['c-100', 'c-1000', 'c-18', 'c-24', 'c-4', 'n-fas-no-macron']);
  });

  it('parses CLI flags and rejects unknown arguments', () => {
    expect(parseArgs([])).toEqual({ projectId: null, includeMarked: false, json: false, help: false });
    expect(parseArgs(['--project', 'latin-app-dev', '--include-marked', '--json'])).toEqual({
      projectId: 'latin-app-dev',
      includeMarked: true,
      json: true,
      help: false,
    });
    expect(() => parseArgs(['--apply'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--project'])).toThrow(/requires a project ID/);
  });
});
