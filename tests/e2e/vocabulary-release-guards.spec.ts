import { expect, test } from '@playwright/test';
import {
  VOCABULARY_AI_GUIDANCE_COLLECTION,
  VOCABULARY_AI_GUIDANCE_DOCUMENT,
  VOCABULARY_WORD_REQUESTS_COLLECTION,
  VOCABULARY_WORDS_COLLECTION,
} from '@/shared/constants/firestore';
import { buildEmptyWord } from '@/src/utils/vocabulary-defaults';
import { signIn } from './fixtures/journeys';
import { E2E_USERS, getE2EAdmin, seedAcceptanceData } from './fixtures/seed';

const word = (name: string) => {
  const { id: _id, ...base } = buildEmptyWord('conjunction');
  return { ...base, word: name, sort_key: name, translation: 'and', definitions: ['and'] };
};

test.beforeEach(async ({ page }) => {
  await seedAcceptanceData();
  await signIn(page, E2E_USERS.admin, '/admin');
});

test('a shared link beyond page one survives reload, and sidebar navigation protects its draft', async ({ page }) => {
  const words = getE2EAdmin().db.collection(VOCABULARY_WORDS_COLLECTION);
  await Promise.all(Array.from({ length: 21 }, (_, i) => words.doc(`before-${i}`).set(word(`before-${i}`))));
  await words.doc('linked').set(word('zelus'));
  await page.goto('/admin/vocabulary#word-linked');
  const heading = page.getByRole('heading', { name: 'zelus', exact: true });
  await expect(heading).toBeVisible();
  await page.reload();
  await expect(heading).toBeVisible();
  const translation = page.getByLabel('Translation', { exact: true });
  await translation.fill('not saved yet');
  const link = page.getByRole('link', { name: 'Pending Review', exact: true });
  await link.click();
  const prompt = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
  await prompt.getByRole('button', { name: 'Keep editing' }).click();
  await expect(translation).toHaveValue('not saved yet');
  await expect(page).toHaveURL(/#word-linked$/);
  await link.click();
  await prompt.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/admin\/vocabulary\/pending$/);
  expect((await words.doc('linked').get()).data()?.translation).toBe('and');
});

test('new requests guard request, status, tab and link switches; approving a legacy homograph requires confirmation', async ({
  page,
}) => {
  const { db } = getE2EAdmin();
  const requests = db.collection(VOCABULARY_WORD_REQUESTS_COLLECTION);
  const words = db.collection(VOCABULARY_WORDS_COLLECTION);
  await words.doc('legacy').set(word(' RoMA '));
  for (const [i, name] of ['rōma', 'sed'].entries()) {
    await requests.doc(name).set({
      status: 'pending',
      sourceText: name,
      selectedCandidate: { word: name, confidence: 'high' },
      draftWord: word(name),
      updatedAt: new Date(1000 - i),
    });
  }
  await page.goto('/admin/vocabulary/pending');
  const translation = page.getByLabel('Translation', { exact: true });
  await translation.fill('changes in progress');
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  const prompt = page.getByRole('alertdialog', { name: 'Leave without saving?' });
  const keep = async () => {
    await prompt.getByRole('button', { name: 'Cancel' }).click();
    await expect(translation).toHaveValue('changes in progress');
  };
  await page.getByRole('button', { name: /^sed / }).click();
  await keep();
  const status = page.locator('main aside').getByRole('combobox');
  await status.click();
  await page.getByRole('option', { name: 'Approved' }).click();
  await keep();
  await page.getByRole('button', { name: /^Updates/ }).click();
  await keep();
  await page.getByRole('link', { name: 'View All Words' }).click();
  await keep();
  await page.getByRole('button', { name: /^sed / }).click();
  await prompt.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page.getByRole('heading', { name: 'sed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^rōma / }).click();
  await expect(translation).toHaveValue('and');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  const duplicate = page.getByRole('alertdialog', { name: 'This word is already in the vocabulary' });
  await expect(duplicate).toBeVisible();
  expect((await requests.doc('rōma').get()).data()?.status).toBe('pending');
  await duplicate.getByRole('button', { name: 'Approve homograph' }).click();
  await expect.poll(async () => (await requests.doc('rōma').get()).data()?.status).toBe('approved');
  const approvedId = (await requests.doc('rōma').get()).get('approvedWordId');
  expect((await words.doc(approvedId).get()).data()).toMatchObject({
    word: 'rōma',
    sort_key: 'roma',
    _headwordKey: 'roma',
    translation: 'and',
  });
  await status.click();
  await page.getByRole('option', { name: 'Approved' }).click();
  await expect(page.getByText(/Read-only draft/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
});

test('all twenty AI rules can be reviewed and saved in a short viewport', async ({ page }) => {
  const settings = getE2EAdmin().db.collection(VOCABULARY_AI_GUIDANCE_COLLECTION).doc(VOCABULARY_AI_GUIDANCE_DOCUMENT);
  await settings.set({
    revision: 1,
    rules: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, instruction: `Guidance ${i + 1}` })),
    updatedAt: null,
    updatedBy: null,
  });
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto('/admin/vocabulary');
  await page.getByRole('button', { name: 'AI rules' }).click();
  const dialog = page.getByRole('dialog', { name: 'AI rules for all words' });
  const last = dialog.getByLabel('Rule 20', { exact: true });
  await last.fill('Corrected final rule');
  const save = dialog.getByRole('button', { name: 'Save rules' });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport({ ratio: 1 });
  await save.click();
  await expect(dialog).toBeHidden();
  expect((await settings.get()).get('rules')[19].instruction).toBe('Corrected final rule');
});
