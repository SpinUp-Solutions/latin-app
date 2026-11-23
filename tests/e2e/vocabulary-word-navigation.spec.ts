import { expect, test, type Page } from '@playwright/test';
import { VOCABULARY_WORD_REQUESTS_COLLECTION, VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
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

const heading = (page: Page, word: string) => page.getByRole('heading', { name: word, level: 2 });

test.describe('Moving between vocabulary words', () => {
  test.beforeEach(async ({ page }) => {
    await seedAcceptanceData();
    await seedNoun('e2e-rosa', 'rosa', 'rose', 0.4);
    await seedNoun('e2e-silva', 'silva', 'forest', 0.6);
    await signIn(page, E2E_USERS.admin, '/admin');
    await page.goto('/admin/vocabulary');
  });

  test('the selected word survives every reload, and Back returns to the previous word', async ({ page }) => {
    await page.getByText('rosa', { exact: true }).click();
    await expect(heading(page, 'rosa')).toBeVisible();
    // It used to fail on every second reload: the first reload reopened the word but cleared it from the URL.
    for (let reload = 1; reload <= 3; reload += 1) {
      await page.reload();
      await expect(heading(page, 'rosa')).toBeVisible();
      await expect(page).toHaveURL(/#word-e2e-rosa$/);
    }

    await page.getByText('silva', { exact: true }).click();
    await expect(heading(page, 'silva')).toBeVisible();
    await expect(page).toHaveURL(/#word-e2e-silva$/);
    await page.goBack();
    await expect(heading(page, 'rosa')).toBeVisible();
    await expect(page).toHaveURL(/#word-e2e-rosa$/);
  });

  test('Back and a filter keep unsaved edits: Back asks first, a filter leaves the word open', async ({ page }) => {
    await page.getByText('rosa', { exact: true }).click();
    await page.getByText('silva', { exact: true }).click();
    await expect(heading(page, 'silva')).toBeVisible();
    const translation = page.getByLabel('Translation', { exact: true });
    await translation.fill('a dark forest');

    // Back would open rosa: it asks, and the URL stays on silva until the admin decides.
    await page.goBack();
    const discard = page.getByRole('alertdialog');
    await expect(discard).toBeVisible();
    await expect(page).toHaveURL(/#word-e2e-silva$/);
    await discard.getByRole('button', { name: 'Keep editing' }).click();
    await expect(heading(page, 'silva')).toBeVisible();
    await expect(translation).toHaveValue('a dark forest');
    // rosa's history entry is still there: Back reaches it again, and Discard changes opens it.
    await page.goBack();
    await expect(discard).toBeVisible();
    await expect(page).toHaveURL(/#word-e2e-silva$/);
    await discard.getByRole('button', { name: 'Discard changes' }).click();
    await expect(heading(page, 'rosa')).toBeVisible();
    await expect(page).toHaveURL(/#word-e2e-rosa$/);

    // Back on silva with a fresh edit, for the filter check.
    await page.getByText('silva', { exact: true }).click();
    await expect(heading(page, 'silva')).toBeVisible();
    await translation.fill('a dark forest');

    // A search that leaves silva out of the list does not close it.
    await page.getByRole('textbox', { name: 'Search words' }).fill('rosa');
    await expect(page.getByRole('button', { name: /details for silva/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /details for rosa/ }).first()).toBeVisible();
    await expect(heading(page, 'silva')).toBeVisible();
    await expect(translation).toHaveValue('a dark forest');
  });

  test('Save and next saves the word, then opens the next one in the list', async ({ page }) => {
    await page.getByText('rosa', { exact: true }).click();
    await expect(heading(page, 'rosa')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveAttribute(
      'title',
      'Ctrl+Enter or ⌘+Enter: apply, then open silva'
    );

    const translation = page.getByLabel('Translation', { exact: true });
    await translation.fill('a rose');
    await translation.press('Control+Enter');
    await expect(heading(page, 'silva')).toBeVisible();
    await expect(page).toHaveURL(/#word-e2e-silva$/);
    // The save had succeeded, so there was nothing for the unsaved-changes prompt to ask about.
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect
      .poll(async () => (await getE2EAdmin().db.collection(VOCABULARY_WORDS_COLLECTION).doc('e2e-rosa').get()).data())
      .toMatchObject({ translation: 'a rose' });

    // silva is the last word in the list: Ctrl+Enter there stays on it.
    await page.getByLabel('Translation', { exact: true }).press('Control+Enter');
    await expect(heading(page, 'silva')).toBeVisible();
  });
});

test.describe('Approving a requested word', () => {
  test('Approve waits until the draft is saved, so the word holds every edit', async ({ page }) => {
    await seedAcceptanceData();
    const { id: _placeholderId, ...draftWord } = buildEmptyWord('noun');
    const now = new Date().toISOString();
    const candidate = { word: 'aqua', part_of_speech: 'noun', confidence: 'high' };
    await getE2EAdmin()
      .db.collection(VOCABULARY_WORD_REQUESTS_COLLECTION)
      .doc('e2e-aqua-request')
      .set({
        status: 'pending',
        sourceText: 'aquam',
        selectedCandidate: candidate,
        candidates: [candidate],
        draftWord: {
          ...draftWord,
          word: 'aqua',
          translation: 'water',
          definitions: ['water'],
          gender: 'feminine',
          declension: '1',
          sort_key: 'aqua',
        },
        createdBy: 'e2e',
        createdAt: now,
        updatedAt: now,
      });
    await signIn(page, E2E_USERS.admin, '/admin');
    await page.goto('/admin/vocabulary/pending');
    await expect(heading(page, 'aqua')).toBeVisible();

    const approve = page.getByRole('button', { name: 'Approve', exact: true });
    await expect(approve).toBeEnabled();
    await page.getByLabel('Translation', { exact: true }).fill('water, a body of water');
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAttribute(
      'title',
      'Save the draft first: Approve creates the word from the saved draft.'
    );

    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(approve).toBeEnabled();
    await expect
      .poll(async () =>
        (await getE2EAdmin().db.collection(VOCABULARY_WORD_REQUESTS_COLLECTION).doc('e2e-aqua-request').get()).data()
      )
      .toMatchObject({ draftWord: { translation: 'water, a body of water' } });
  });
});
