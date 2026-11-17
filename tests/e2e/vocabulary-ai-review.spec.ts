import { expect, test, type Page } from '@playwright/test';
import {
  VOCABULARY_AI_GUIDANCE_COLLECTION,
  VOCABULARY_AI_GUIDANCE_DOCUMENT,
  VOCABULARY_WORDS_COLLECTION,
} from '@/shared/constants/firestore';
import { buildEmptyWord } from '@/src/utils/vocabulary-defaults';
import { signIn } from './fixtures/journeys';
import { E2E_USERS, getE2EAdmin, seedAcceptanceData } from './fixtures/seed';

const WORD_ID = 'e2e-rosa';
const row = (singular: string, plural: string) => ({ singular: [singular], plural: [plural] });
const etymologyQuestion = {
  field: 'etymology',
  question: 'Is rosa native Latin or a loan from Greek?',
  explanation: 'I wrote a native derivation, but rosa looks like Greek rhódon.',
  options: ['It is a loan from Greek rhódon.', 'It is native Latin.'],
};
const tableQuestion = {
  field: 'declension_table',
  question: 'Does rosa have locative forms?',
  explanation: 'I filled rosae / rosīs, which is unusual for a common noun.',
};
const PICKED = etymologyQuestion.options[0];
const RULE = 'Give locative forms only for nouns with an attested locative.';

/**
 * The AI is mocked at the browser's callable request, so no model is called;
 * the word, its notes, the learned rule and the save run against the emulators.
 */
async function mockAI(page: Page, result: Record<string, unknown>) {
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

const readDoc = async (collection: string, id: string) =>
  (await getE2EAdmin().db.collection(collection).doc(id).get()).data();

test.describe('Vocabulary AI assistant', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

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
        ai_review: { uncertainties: [etymologyQuestion, tableQuestion], guidance: [] },
      });
    await signIn(page, E2E_USERS.admin, '/admin');
  });

  test('an admin answers the AI in words; the change, what it remembers and the rule it learned are kept', async ({
    page,
  }, testInfo) => {
    const requests = await mockAI(page, {
      success: true,
      data: { part_of_speech: 'noun', etymology: 'Borrowed from Greek rhódon, probably through an Italic language.' },
      uncertainties: [],
      reply: {
        message: 'Thanks. I rewrote the etymology as a loan from Greek rhódon.',
        answered: ['etymology'],
        remember: [{ field: 'etymology', note: 'rosa is a loan from Greek rhódon.' }],
        rule: RULE,
      },
    });
    await page.goto('/admin/vocabulary');
    await page.getByText('rosa', { exact: true }).click();

    const assistant = page.getByRole('region', { name: 'AI assistant' });
    await expect(assistant).toContainText("I'm not sure about 2 things in rosa.");
    const etymology = assistant.getByRole('group', { name: 'AI question about Etymology' });
    await expect(etymology).toContainText(etymologyQuestion.question);
    await expect(etymology).toContainText('Now: Native Latin.');
    await expect(assistant.getByRole('group', { name: 'AI question about Declension table' })).toBeVisible();
    await assistant.screenshot({ path: testInfo.outputPath('1-questions.png') });

    // The field the AI asked about is marked, and its marker leads back to the question and the reply box.
    const marker = page.getByRole('button', { name: 'AI question about Etymology' });
    await marker.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('2-field-marker.png') });
    await marker.click();
    await expect(assistant.getByLabel('Message to the AI')).toBeFocused();

    await etymology.getByRole('button', { name: PICKED }).click();
    const composer = assistant.getByLabel('Message to the AI');
    await expect(composer).toHaveValue(`Etymology: ${PICKED}`);
    await composer.press('Enter');
    await expect(assistant).toContainText('Thanks. I rewrote the etymology as a loan from Greek rhódon.');
    expect(requests[0]).toMatchObject({
      word: 'rosa',
      conversation: { message: `Etymology: ${PICKED}`, history: [] },
    });
    // Proposed, not applied, until the admin accepts.
    await expect(page.getByLabel('Etymology', { exact: true })).toHaveValue('Native Latin.');
    await expect(assistant.getByRole('list', { name: 'Proposed changes' })).toContainText(
      'Borrowed from Greek rhódon, probably through an Italic language.'
    );
    await expect(assistant).toContainText(`“${RULE}”`);
    await assistant.screenshot({ path: testInfo.outputPath('3-reply.png') });

    await assistant.getByRole('button', { name: 'Accept change' }).click();
    await expect(page.getByLabel('Etymology', { exact: true })).toHaveValue(
      'Borrowed from Greek rhódon, probably through an Italic language.'
    );
    // The rule is saved through the admin route as soon as the answer is accepted.
    await expect(assistant).toContainText('Saved. The AI follows it for every word.');
    await expect
      .poll(async () => (await readDoc(VOCABULARY_AI_GUIDANCE_COLLECTION, VOCABULARY_AI_GUIDANCE_DOCUMENT))?.rules)
      .toEqual([
        {
          id: expect.any(String),
          instruction: RULE,
          learnedFrom: { word: 'rosa', message: `Etymology: ${PICKED}` },
        },
      ]);

    await assistant
      .getByRole('group', { name: 'AI question about Declension table' })
      .getByRole('button', { name: 'Keep as is' })
      .click();
    await expect(assistant.getByRole('group')).toHaveCount(0);
    await assistant.screenshot({ path: testInfo.outputPath('4-answered.png') });
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();

    await expect
      .poll(async () => readDoc(VOCABULARY_WORDS_COLLECTION, WORD_ID))
      .toMatchObject({
        etymology: 'Borrowed from Greek rhódon, probably through an Italic language.',
        ai_review: {
          uncertainties: [],
          guidance: [
            { instruction: 'rosa is a loan from Greek rhódon.', field: 'etymology' },
            {
              instruction: `When asked “${tableQuestion.question}”, an admin confirmed the current value.`,
              field: 'declension_table',
            },
          ],
        },
      });

    // The selected word is kept in the URL hash, so the reload reopens it from Firestore.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'rosa' })).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'What the AI remembers about rosa' })
        .getByText('rosa is a loan from Greek rhódon.')
    ).toBeVisible();
    await expect(page.getByRole('group', { name: /AI question about/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'AI rules' }).click();
    const dialog = page.getByRole('dialog', { name: 'AI rules for all words' });
    await expect(dialog.getByLabel('Rule 1', { exact: true })).toHaveValue(RULE);
    await expect(dialog).toContainText('Learned from an answer about rosa');
    await dialog.screenshot({ path: testInfo.outputPath('5-rules.png') });
  });

  test('an admin asks the AI about a word it had no questions on, and edits the learned rule', async ({ page }) => {
    await getE2EAdmin()
      .db.collection(VOCABULARY_WORDS_COLLECTION)
      .doc(WORD_ID)
      .update({ ai_review: { uncertainties: [], guidance: [] } });
    await getE2EAdmin()
      .db.collection(VOCABULARY_AI_GUIDANCE_COLLECTION)
      .doc(VOCABULARY_AI_GUIDANCE_DOCUMENT)
      .set({
        revision: 1,
        rules: [{ id: 'learned', instruction: RULE, learnedFrom: { word: 'silva', message: 'No locative.' } }],
        updatedAt: null,
        updatedBy: null,
      });
    const requests = await mockAI(page, {
      success: true,
      data: { part_of_speech: 'noun' },
      uncertainties: [],
      reply: { message: 'Because rosa, rosae follows the first declension.', answered: [], remember: [], rule: null },
    });
    await page.goto('/admin/vocabulary');
    await page.getByText('rosa', { exact: true }).click();

    const assistant = page.getByRole('region', { name: 'AI assistant' });
    const composer = assistant.getByLabel('Message to the AI');
    await composer.fill('Why first declension?');
    await assistant.getByRole('button', { name: 'Send to the AI' }).click();
    await expect(assistant).toContainText('Because rosa, rosae follows the first declension.');
    await expect(assistant.getByRole('button', { name: /^Accept/ })).toHaveCount(0);
    expect(requests).toHaveLength(1);

    await page.getByRole('button', { name: 'AI rules' }).click();
    const dialog = page.getByRole('dialog', { name: 'AI rules for all words' });
    await dialog.getByLabel('Rule 1', { exact: true }).fill('Give locative forms only for towns and small islands.');
    await dialog.getByRole('button', { name: 'Save rules' }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => (await readDoc(VOCABULARY_AI_GUIDANCE_COLLECTION, VOCABULARY_AI_GUIDANCE_DOCUMENT))?.rules)
      .toEqual([
        {
          id: 'learned',
          instruction: 'Give locative forms only for towns and small islands.',
          learnedFrom: { word: 'silva', message: 'No locative.' },
        },
      ]);
  });
});
