const mockGetIdToken = jest.fn();

jest.mock('@/src/services/firebase', () => ({
  auth: { currentUser: { getIdToken: (...args: unknown[]) => mockGetIdToken(...args) } },
}));

import { fetchVocabularyBackup } from '@/src/services/vocabularyBackupService';

describe('vocabulary backup service', () => {
  it('downloads through the authenticated admin route and keeps the server filename', async () => {
    mockGetIdToken.mockResolvedValue('firebase-token');
    const blob = new Blob(['[]'], { type: 'application/json' });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-disposition': 'attachment; filename="vocabulary-backup.json"' }),
      blob: async () => blob,
    } as Response);

    await expect(fetchVocabularyBackup('vocabulary_words_v5')).resolves.toEqual({
      blob,
      filename: 'vocabulary-backup.json',
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/words/backup?collection=vocabulary_words_v5', {
      headers: { authorization: 'Bearer firebase-token' },
    });
    fetchSpy.mockRestore();
  });
});
