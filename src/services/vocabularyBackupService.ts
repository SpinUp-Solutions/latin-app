import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { auth } from '@/src/services/firebase';

export async function fetchVocabularyBackup(collection = VOCABULARY_WORDS_COLLECTION) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to download a vocabulary backup');

  const token = await user.getIdToken();
  const response = await fetch(`/api/admin/words/backup?collection=${encodeURIComponent(collection)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Vocabulary backup failed');
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'vocabulary-backup.json';
  return { blob: await response.blob(), filename };
}
