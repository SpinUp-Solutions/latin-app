import { expect, test } from '@playwright/test';
import { dashboardCard, recordFillAnswer, signIn, submitCurrentTest } from './fixtures/journeys';
import { E2E_IDS, E2E_USERS, getE2EAdmin, parentMockId, seedAcceptanceData } from './fixtures/seed';

test.describe('Assessment acceptance', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async () => {
    await seedAcceptanceData();
  });

  test('score-only normal submission completes the Learning Path unit', async ({ page }) => {
    await signIn(page, E2E_USERS.scoreOnly);
    const card = dashboardCard(page, 'Score-only checkpoint');
    await expect(card).toContainText('Score only · cannot fail');
    await card.getByRole('button', { name: 'Start Test' }).click();

    await expect(page.getByText('Score only — this test cannot be failed')).toBeVisible();
    await page.getByRole('button', { name: 'Start Test' }).click();
    await recordFillAnswer(page, 'love');
    await submitCurrentTest(page);

    await expect(page.getByRole('heading', { name: 'Test complete' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to dashboard' }).click();
    await expect(dashboardCard(page, 'Score-only checkpoint')).toContainText('Latest: Completed');
    await expect(dashboardCard(page, 'Required-pass checkpoint').getByRole('button')).not.toBeDisabled();
  });

  test('required-pass failure gates and nudges, then pass and a failed retake never relock', async ({ page }) => {
    await signIn(page, E2E_USERS.requiredPass);
    await dashboardCard(page, 'Required-pass checkpoint').getByRole('button', { name: 'Start Test' }).click();
    await expect(page.getByText('Passing requirement: 100%')).toBeVisible();
    await page.getByRole('button', { name: 'Start Test' }).click();
    await recordFillAnswer(page, 'wrong');
    await submitCurrentTest(page);

    await expect(page.getByRole('heading', { name: 'Keep going' })).toBeVisible();
    await expect(page.getByText(/100 percentage points away/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Practice with the Required-pass practice Mock Test/ })).toBeVisible();
    await page.getByRole('link', { name: 'Back to dashboard' }).click();
    await expect(
      dashboardCard(page, 'Refresh and resume checkpoint').getByRole('button', { name: 'Locked' })
    ).toBeDisabled();
    await expect(dashboardCard(page, 'Required-pass checkpoint')).toContainText('Latest: Not passed');

    await dashboardCard(page, 'Required-pass checkpoint').getByRole('button', { name: 'Retake Test' }).click();
    await page.getByRole('button', { name: 'Start Retake' }).click();
    await recordFillAnswer(page, 'love');
    await submitCurrentTest(page);
    await expect(page.getByRole('heading', { name: 'Test passed' })).toBeVisible();

    await page.getByRole('button', { name: 'Retake Test' }).click();
    await page.getByRole('button', { name: 'Start Retake' }).click();
    await recordFillAnswer(page, 'wrong again');
    await submitCurrentTest(page);
    await expect(page.getByRole('heading', { name: 'Keep going' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to dashboard' }).click();

    await expect(dashboardCard(page, 'Required-pass checkpoint')).toContainText(
      'Latest: Not passed · completion retained'
    );
    await expect(
      dashboardCard(page, 'Refresh and resume checkpoint').getByRole('button', { name: 'Start Test' })
    ).not.toBeDisabled();
  });

  test('refresh resumes the frozen generated delivery, selected version, and committed answer', async ({ page }) => {
    await signIn(page, E2E_USERS.resume);
    await dashboardCard(page, 'Refresh and resume checkpoint').getByRole('button', { name: 'Start Test' }).click();
    await page.waitForURL(`**/test/${E2E_IDS.resumeTest}`);
    await page.getByRole('button', { name: 'Start Test' }).click();

    await expect(page.getByText('amo, amare', { exact: true })).toBeVisible();
    await recordFillAnswer(page, 'love');
    const { db } = getE2EAdmin();
    await db
      .collection('testVersions')
      .doc(E2E_IDS.resumeVersion)
      .update({
        pages: [
          {
            id: 'changed-after-start-page',
            title: 'Changed after start',
            items: [
              {
                id: 'changed-after-start-exercise',
                type: 'fill',
                title: 'Changed',
                instructions: '',
                maxPoints: 1,
                feedbackConfig: { escalationLevels: [] },
                data: { items: [{ text: 'changed-source-prompt', answer: 'changed-source-answer' }] },
              },
            ],
          },
        ],
      });
    await db.collection('vocabulary_words_v5').doc('e2e-amo').update({
      word: 'mutated',
      root_word: 'mutated',
      selected_form: 'mutated',
      translation: 'changed',
    });

    await page.reload();
    await expect(page.getByText('Score only — this test cannot be failed')).toBeVisible();
    await page.getByRole('button', { name: 'Continue Test' }).click();
    await expect(page.getByText('amo, amare', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Type your answer...')).toHaveValue('love');
    await expect(page.getByText('changed-source-prompt')).toHaveCount(0);

    const attempts = await db
      .collection('testAttempts')
      .where('studentId', '==', E2E_USERS.resume.uid)
      .where('status', '==', 'in-progress')
      .get();
    expect(attempts.size).toBe(1);
    expect(attempts.docs[0].data()).toMatchObject({
      versionId: E2E_IDS.resumeVersion,
      answers: {
        'e2e-generated-translation': {
          type: 'generated-translation',
          answers: ['love'],
        },
      },
      deliveryState: {
        versionId: E2E_IDS.resumeVersion,
      },
    });
  });

  test('admin mock assignment transfers ownership into an ordered fixed-version student flow', async ({
    browser,
    page,
  }) => {
    await signIn(page, E2E_USERS.admin, '/admin');
    await page.goto(`/admin/tests/edit/${E2E_IDS.mockParentTest}/versions/${E2E_IDS.mockAssignableVersion}/edit`);
    await expect(page.getByRole('heading', { name: 'Test Version Editor' })).toBeVisible();
    await page.getByLabel('Version name').fill('Unsaved mock assignment draft');
    await expect(page.getByRole('button', { name: 'Assign as mock' })).toBeDisabled();
    await expect(
      page.getByText('Save or discard your version changes before transferring it out of rotation.')
    ).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByLabel('Version name')).toHaveValue('Mock assignment B');
    await expect(page.getByRole('button', { name: 'Assign as mock' })).toBeEnabled();
    await page.getByRole('button', { name: 'Assign as mock' }).click();
    const dialog = page.getByRole('dialog', { name: 'Assign version as a mock card' });
    await expect(dialog).toContainText('This transfers the version out of normal-test rotation.');
    await dialog.getByLabel('Student-facing mock title').fill('Ordered fixed-version mock');
    await dialog.getByLabel('Require a passing score').check();
    await dialog.getByLabel('Passing percentage').fill('80');
    await dialog.getByLabel('Make mock live to students').check();
    await dialog.getByRole('button', { name: 'Confirm mock assignment' }).click();
    const assignedMockId = parentMockId(E2E_IDS.mockParentTest, E2E_IDS.mockAssignableVersion);
    await page.waitForURL(`**/admin/mock-tests/${assignedMockId}`);
    await expect(page.getByRole('heading', { name: 'Ordered fixed-version mock' })).toBeVisible();
    await expect(page.getByText('Live to students.')).toBeVisible();
    await expect(page.getByLabel('Require a passing score')).toBeChecked();
    await expect(page.getByLabel('Passing percentage')).toHaveValue('80');
    await page.getByRole('button', { name: 'View parent test' }).click();
    await page.waitForURL(`**/admin/tests/edit/${E2E_IDS.mockParentTest}`);

    const rotation = page.getByRole('region', { name: 'In rotation' });
    const mockCards = page.getByRole('region', { name: 'Mock cards' });
    await expect(rotation.getByRole('heading', { name: 'Normal rotation A' })).toBeVisible();
    await expect(rotation.getByRole('heading', { name: 'Mock assignment B' })).toHaveCount(0);
    await expect(mockCards.getByRole('heading', { name: 'Mock assignment B' })).toBeVisible();
    await expect(mockCards).toContainText('Ordered fixed-version mock');
    await expect(mockCards).toContainText('Pass ≥ 80%');
    await expect(mockCards.getByRole('link', { name: 'Manage mock' })).toHaveAttribute(
      'href',
      `/admin/mock-tests/${assignedMockId}`
    );

    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await signIn(studentPage, E2E_USERS.mock);
    const mockSection = studentPage.getByRole('region', { name: 'Mock Tests' });
    await expect(mockSection.getByRole('heading', { level: 3 })).toHaveText([
      'Required-pass practice',
      'Ordered fixed-version mock',
    ]);
    const mockCard = dashboardCard(studentPage, 'Ordered fixed-version mock');
    await mockCard.getByRole('button', { name: 'Start Mock Test' }).click();
    await expect(studentPage.getByText('Practice target: 80% — informational only')).toBeVisible();
    await studentPage.getByRole('button', { name: 'Start Mock Test' }).click();
    await expect(studentPage.getByText('fixed-version-prompt')).toBeVisible();
    await recordFillAnswer(studentPage, 'fixed-answer');
    await submitCurrentTest(studentPage);
    await expect(studentPage.getByRole('heading', { name: 'Test passed' })).toBeVisible();
    await studentPage.getByRole('link', { name: 'Back to dashboard' }).click();

    const completedMockCard = dashboardCard(studentPage, 'Ordered fixed-version mock');
    await expect(completedMockCard).toContainText('Best');
    await expect(completedMockCard).toContainText('100%');
    await expect(completedMockCard).toContainText('1 practice attempt');
    await expect(completedMockCard).toContainText('Recent scores: 100%');
    await studentContext.close();
  });
});
