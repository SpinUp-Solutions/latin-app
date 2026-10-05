import { expect, test } from '@playwright/test';
import { dashboardCard, recordFillAnswerAndReview, signIn, submitCurrentTest } from './fixtures/journeys';
import { E2E_IDS, E2E_USERS, getE2EAdmin, seedAcceptanceData } from './fixtures/seed';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

test.beforeEach(async () => seedAcceptanceData());

test('mock retake keeps answers when its delayed detail refresh arrives', async ({ page }) => {
  await signIn(page, E2E_USERS.mock);
  await dashboardCard(page, 'Required-pass practice').getByRole('button', { name: 'Start Mock Test' }).click();
  await page.getByRole('button', { name: 'Start Mock Test', exact: true }).click();
  await recordFillAnswerAndReview(page, 'love');
  await submitCurrentTest(page);
  await expect(page.getByRole('button', { name: 'Retake Mock Test' })).toBeVisible();

  let releaseDetail!: () => void;
  let detailArrived!: () => void;
  const heldDetail = new Promise<void>(resolve => {
    releaseDetail = resolve;
  });
  const fetchedDetail = new Promise<void>(resolve => {
    detailArrived = resolve;
  });
  await page.route(`**/api/mock-tests/${E2E_IDS.nudgeMock}`, async route => {
    const response = await route.fetch();
    detailArrived();
    await heldDetail;
    await route.fulfill({ response });
  });
  let startRequests = 0;
  page.on('request', request => {
    if (request.url().endsWith('/api/test-attempts/start')) startRequests++;
  });
  await page.getByRole('button', { name: 'Retake Mock Test' }).click();
  await page.getByPlaceholder(/Type your answer/).fill('my retake answer');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await fetchedDetail;
  releaseDetail();
  await expect(page.getByRole('status')).toContainText('Answers saved.');
  await page.getByRole('button', { name: 'Review section', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('my retake answer');
  expect(startRequests).toBe(1);
  await page.screenshot({ path: 'test-results/qa112-retake-review.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Mock Test', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('my retake answer');
});

test('morphology editor accepts repeated POS changes and explains an empty exercise on save', async ({ page }) => {
  const { db } = getE2EAdmin();
  const versionRef = db.collection('testVersions').doc(E2E_IDS.scoreVersion);
  const original = (await versionRef.get()).data()!;
  await versionRef.update({
    pages: [
      {
        ...original.pages[0],
        items: [
          {
            id: 'qa-morphology',
            type: 'generated-form-identification',
            title: 'Morphology',
            maxPoints: 1,
            instructions: '',
            feedbackConfig: { escalationLevels: [] },
            data: {
              mode: 'single-field',
              generatorConfig: {
                collection: VOCABULARY_WORDS_COLLECTION,
                wordSource: 'filters',
                count: 5,
                filters: { partOfSpeech: 'noun' },
              },
              paradigmConfigs: {
                'noun-declension': {
                  enabled: true,
                  filters: {},
                  steps: ['case'],
                  formSelection: { tableType: 'declension', selectedCellPaths: [] },
                },
              },
            },
          },
        ],
      },
    ],
  });
  await signIn(page, E2E_USERS.admin, '/admin');
  await page.goto(`/admin/tests/edit/${E2E_IDS.scoreTest}/versions/${E2E_IDS.scoreVersion}/edit`);
  await page.getByRole('button', { name: 'Edit Morphology', exact: true }).click();
  for (const pos of ['Verb', 'Adjective', 'Noun']) {
    await page.getByRole('combobox', { name: 'Part of Speech', exact: true }).click();
    await page.getByRole('option', { name: pos, exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Part of Speech', exact: true })).toHaveText(pos);
  }
  await page.getByText('Timing Configuration', { exact: true }).click();
  await expect(page.getByPlaceholder('2000', { exact: true })).toHaveValue('2000');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save Test', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The test could not be saved' })).toContainText(
    'Enabled morphology paradigms require at least one selected form'
  );
  await expect(page.locator('[data-sonner-toast]')).toContainText('morphology');
  await page.screenshot({ path: 'test-results/qa112-editor-validation.png', fullPage: true });
});
