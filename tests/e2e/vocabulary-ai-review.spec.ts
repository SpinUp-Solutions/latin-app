import { expect, test, type Page } from '@playwright/test';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { buildEmptyWord } from '@/src/utils/vocabulary-defaults';
import { signIn } from './fixtures/journeys';
import { E2E_USERS, getE2EAdmin, seedAcceptanceData } from './fixtures/seed';

const WORD_ID = 'e2e-rosa';
const row = (singular: string, plural: string) => ({ singular: [singular], plural: [plural] });
const doubts = [
  { field: 'etymology', explanation: 'I am not sure whether rosa is native Latin or a loan from Greek.' },
  { field: 'declension_table', explanation: 'The locative forms are unusual for this noun.' },
];

/**
 * The AI is mocked at the browser's callable request, so no model is called;
 * the word, its review metadata and the save run against the Firestore emulator.
 */
async function mockAutocomplete(page: Page, result: Record<string, unknown>) {
  const requests: unknown[] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  await page.route('**/autocompleteWord', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    requests.push(route.request().postDataJSON()?.data);
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify({ result }),
    });
  });
  return requests;
}

test.describe('Vocabulary AI review', () => {
  test.beforeEach(async ({ page }) => {
    await seedAcceptanceData();
    const { id: _placeholderId, ...noun } = buildEmptyWord('noun');
    await getE2EAdmin()
      .db.collection(VOCABULARY_WORDS_COLLECTION)
      .doc(WORD_ID)
      .set({
        ...noun,
        word: 'rosa',
        translation: 'rose',
        definitions: ['rose'],
        etymology: 'Native Latin.',
        gender: 'feminine',
        declension: '1',
        sort_key: 'rosa',
        random_index: 0.4,
        declension_table: {
          nominative: row('rosa', 'rosae'),
          genitive: row('rosae', 'rosārum'),
          dative: row('rosae', 'rosīs'),
          accusative: row('rosam', 'rosās'),
          ablative: row('rosā', 'rosīs'),
          vocative: row('rosa', 'rosae'),
          locative: row('rosae', 'rosīs'),
        },
        ai_review: { uncertainties: doubts, guidance: [] },
      });
    await signIn(page, E2E_USERS.admin, '/admin');
  });

  test('an admin answers a doubt with a note, and the value and note are saved with the word', async ({
    page,
  }, testInfo) => {
    const requests = await mockAutocomplete(page, {
      success: true,
      data: { part_of_speech: 'noun', etymology: 'Borrowed from Greek rhódon, probably through an Italic language.' },
      reviewAnswer: 'Rewrote the etymology as a Greek loan.',
      uncertainties: [],
    });
    await page.goto('/admin/vocabulary');
    await page.getByText('rosa', { exact: true }).click();

    const summary = page.getByRole('region', { name: 'AI review' });
    await expect(summary).toContainText('AI is unsure about 2 fields');
    const etymologyDoubt = page.getByRole('group', { name: 'AI doubt about Etymology' });
    await expect(etymologyDoubt).toContainText(doubts[0].explanation);
    await expect(page.getByRole('group', { name: 'AI doubt about Declension table' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('1-doubts.png') });

    await summary.getByRole('button', { name: 'Etymology' }).click();
    await expect(etymologyDoubt.getByLabel('Your note for the AI about Etymology')).toBeFocused();
    await page.keyboard.type('It is a loan from Greek rhódon.');
    await etymologyDoubt.getByRole('button', { name: 'Fix with AI' }).click();
    await expect(etymologyDoubt).toContainText('Rewrote the etymology as a Greek loan.');
    await expect(page.getByLabel('Etymology', { exact: true })).toHaveValue('Native Latin.');
    expect(requests[0]).toMatchObject({
      followUp: { field: 'etymology', note: 'It is a loan from Greek rhódon.', doubt: doubts[0].explanation },
    });
    await etymologyDoubt.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('2-proposal.png') });

    await etymologyDoubt.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByLabel('Etymology', { exact: true })).toHaveValue(
      'Borrowed from Greek rhódon, probably through an Italic language.'
    );
    await expect(summary).toContainText('AI is unsure about 1 field');
    await page
      .getByRole('group', { name: 'AI doubt about Declension table' })
      .getByRole('button', { name: 'Keep current value' })
      .click();
    await expect(summary).toBeHidden();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();

    await expect
      .poll(async () => (await getE2EAdmin().db.collection(VOCABULARY_WORDS_COLLECTION).doc(WORD_ID).get()).data())
      .toMatchObject({
        etymology: 'Borrowed from Greek rhódon, probably through an Italic language.',
        ai_review: {
          uncertainties: [],
          guidance: [{ instruction: 'It is a loan from Greek rhódon.', field: 'etymology' }],
        },
      });

    // The selected word is kept in the URL hash, so the reload reopens it from Firestore.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'rosa' })).toBeVisible();
    await expect(page.getByText('It is a loan from Greek rhódon.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'AI review' })).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('3-saved-note.png') });
  });

  test('rules for all words open from the editor and save on their own', async ({ page }, testInfo) => {
    await page.goto('/admin/vocabulary');
    await page.getByText('rosa', { exact: true }).click();
    await page.getByRole('button', { name: 'AI rules' }).click();
    const dialog = page.getByRole('dialog', { name: 'AI rules for all words' });
    await dialog.getByRole('button', { name: 'Add rule' }).click();
    await dialog.getByLabel('Rule 1', { exact: true }).fill('Prefer Classical Latin senses; label postclassical ones.');
    await page.screenshot({ path: testInfo.outputPath('4-rules.png') });
    await dialog.getByRole('button', { name: 'Save rules' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'AI rules' }).click();
    await expect(page.getByRole('dialog').getByLabel('Rule 1', { exact: true })).toHaveValue(
      'Prefer Classical Latin senses; label postclassical ones.'
    );
  });
});
