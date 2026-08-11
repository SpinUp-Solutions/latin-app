const getIdToken = jest.fn();

jest.mock('@/src/services/firebase', () => ({
  auth: { currentUser: { getIdToken: (...args: unknown[]) => getIdToken(...args) } },
}));

import { WordLookupService } from '@/src/services/wordLookupService';

describe('WordLookupService authenticated API lookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIdToken.mockResolvedValue('student-token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          words: [
            { id: 'word-1', word: 'ā', translation: 'from', part_of_speech: 'preposition' },
            { id: 'word-2', word: 'ab', translation: 'from', part_of_speech: 'preposition' },
          ],
        },
      }),
    });
  });

  it('uses a bearer-authenticated server route and supports one-letter lookups', async () => {
    const result = await WordLookupService.searchWord('a');

    expect(global.fetch).toHaveBeenCalledWith('/api/words/search?search=a&limit=5', {
      headers: { authorization: 'Bearer student-token' },
    });
    expect(result).toEqual({
      found: true,
      word: expect.objectContaining({ id: 'word-1', word: 'ā' }),
    });
  });
});
