import { expect, test, type Page } from '@playwright/test';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { buildEmptyWord } from '@/src/utils/vocabulary-defaults';
import { signIn } from './fixtures/journeys';
import { E2E_USERS, getE2EAdmin, seedAcceptanceData } from './fixtures/seed';

// The admin shell fills the viewport and scrolls inside its own panels. Radix renders an absolutely
// positioned native input for every Select and Switch in a <form>; when the panel they sit in is not
// their containing block they are laid out against the page and make the whole document scroll.
const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

test.describe('Admin forms stay inside their scroll panel', () => {
  test.beforeAll(async () => {
    await seedAcceptanceData();
    const { id: _placeholderId, ...word } = buildEmptyWord('adjective');
    await getE2EAdmin()
      .db.collection(VOCABULARY_WORDS_COLLECTION)
      .doc('e2e-acer')
      .set({ ...word, word: 'acer', translation: 'sharp', sort_key: 'acer', random_index: 0.25 });
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, E2E_USERS.admin, '/admin');
  });

  test('selecting a word in All Words does not make the page scroll', async ({ page }) => {
    await page.goto('/admin/vocabulary');
    await page.getByText('acer', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
    expect(await pageOverflow(page)).toBe(0);

    await page.getByText('Search Words').hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('the vocabulary pool form does not make the page scroll', async ({ page }) => {
    await page.goto('/admin/vocabulary-pools/create');
    await expect(page.getByText('Select Direct Words for Pool (Optional)')).toBeVisible();
    await expect(page.getByText('amo', { exact: true })).toBeVisible();
    expect(await pageOverflow(page)).toBe(0);
  });
});
