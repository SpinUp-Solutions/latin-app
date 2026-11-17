import { expect, test } from '@playwright/test';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { buildEmptyWord } from '@/src/utils/vocabulary-defaults';
import { signIn } from './fixtures/journeys';
import { E2E_USERS, getE2EAdmin, seedAcceptanceData } from './fixtures/seed';

const seedNoun = async (id: string, word: string, translation: string, random_index: number) => {
  const { id: _placeholderId, ...noun } = buildEmptyWord('noun');
  await getE2EAdmin()
    .db.collection(VOCABULARY_WORDS_COLLECTION)
    .doc(id)
    .set({
      ...noun,
      word,
      translation,
      definitions: [translation],
      gender: 'feminine',
      declension: '1',
      sort_key: word,
      random_index,
    });
};

test('the selected word survives every reload, and Back returns to the previous word', async ({ page }) => {
  await seedAcceptanceData();
  await seedNoun('e2e-rosa', 'rosa', 'rose', 0.4);
  await seedNoun('e2e-silva', 'silva', 'forest', 0.6);
  await signIn(page, E2E_USERS.admin, '/admin');
  await page.goto('/admin/vocabulary');
  const heading = (word: string) => page.getByRole('heading', { name: word, level: 2 });

  await page.getByText('rosa', { exact: true }).click();
  await expect(heading('rosa')).toBeVisible();
  // It used to fail on every second reload: the first reload reopened the word but cleared it from the URL.
  for (let reload = 1; reload <= 3; reload += 1) {
    await page.reload();
    await expect(heading('rosa')).toBeVisible();
    await expect(page).toHaveURL(/#word-e2e-rosa$/);
  }

  await page.getByText('silva', { exact: true }).click();
  await expect(heading('silva')).toBeVisible();
  await expect(page).toHaveURL(/#word-e2e-silva$/);
  await page.goBack();
  await expect(heading('rosa')).toBeVisible();
  await expect(page).toHaveURL(/#word-e2e-rosa$/);
});
