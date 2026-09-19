import { randomUUID } from 'node:crypto';
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

    await expect(page.getByText('Complete this test to continue — any score counts')).toBeVisible();
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
    await expect(page.getByText('Score 100% or higher to continue along your Learning Path')).toBeVisible();
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
    await expect(page.getByText('Complete this test to continue — any score counts')).toBeVisible();
    await page.getByRole('button', { name: 'Continue Test' }).click();
    await expect(page.getByText('amo, amare', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review section', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveValue('love');
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

  for (const mock of [false, true]) {
    test(`MC drafts survive refresh and the last submitted answer opens review (${mock ? 'mock/mobile' : 'normal'})`, async ({
      page,
    }) => {
      const { db } = getE2EAdmin();
      const versionRef = db.collection('testVersions').doc(mock ? E2E_IDS.nudgeVersion : E2E_IDS.scoreVersion);
      const original = (await versionRef.get()).data()!;
      const firstPage = original.pages[0];
      const choice = {
        ...firstPage.items[0],
        id: 'choice',
        type: 'multiple-choice',
        title: 'Choose the verbs',
        data: {
          question: 'Choose every verb.',
          allowMultipleSelections: true,
          options: [
            { id: 'a', text: 'amo', isCorrect: true },
            { id: 'b', text: 'video', isCorrect: true },
            { id: 'c', text: 'puella', isCorrect: false },
          ],
        },
      };
      await versionRef.update({
        pages: [{ ...firstPage, items: [...firstPage.items, choice] }],
        totalItems: 2,
        totalExercises: 2,
        totalPoints: original.totalPoints * 2,
      });
      if (mock) await page.setViewportSize({ width: 390, height: 844 });
      await signIn(page, mock ? E2E_USERS.mock : E2E_USERS.scoreOnly);
      await dashboardCard(page, mock ? 'Required-pass practice' : 'Score-only checkpoint')
        .getByRole('button', { name: mock ? 'Start Mock Test' : 'Start Test' })
        .click();
      await page.waitForURL(url => url.pathname === `/test/${mock ? E2E_IDS.nudgeMock : E2E_IDS.scoreTest}`);
      await page.getByRole('button', { name: mock ? 'Start Mock Test' : 'Start Test', exact: true }).click();
      await page.getByPlaceholder(/Type your answer/).fill('love');
      await page.getByRole('button', { name: 'Check', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Answers saved.');

      const savedSelection = page.waitForResponse(
        response => response.url().endsWith('/answers') && Boolean(response.request().postDataJSON()?.answers?.choice)
      );
      await page.getByRole('button', { name: /amo/ }).click();
      await expect(page.getByRole('status')).not.toContainText('Answers saved.');
      expect((await (await savedSelection).json()).attempt.answers.choice.selectedOptionIds).toEqual(['a']);
      await expect(page.getByRole('status')).toContainText('Answers saved.');
      await expect(page.getByRole('heading', { name: 'Review section', exact: true })).toHaveCount(0);
      await page.reload();
      await page.getByRole('button', { name: mock ? 'Continue Mock Test' : 'Continue Test', exact: true }).click();
      await expect(page.getByRole('button', { name: /amo/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: /amo/ })).toBeEnabled();
      await page.getByRole('button', { name: /video/ }).focus();
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: /video/ })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Submit Answer', exact: true }).click();
      // Do not click Review section: exercise completion must open it itself.
      await expect(page.getByRole('heading', { name: 'Review section', exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Answers saved.');
      await page.reload();
      await page.getByRole('button', { name: mock ? 'Continue Mock Test' : 'Continue Test', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Review section', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Return to section' }).click();
      await expect(page.getByRole('button', { name: 'Submit Answer', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Review section', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Review section', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm section and submit' }).click();
      await page.getByRole('link', { name: 'Review answers' }).click();
      const triggers = page.getByRole('button', { name: /^Exercise \d+:/ });
      await expect(triggers).toHaveCount(2);
      await expect(triggers.nth(0)).toContainText('Hide answers');
      await expect(triggers.nth(1)).toContainText('Show answers');
      await triggers.nth(1).click();
      await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'false');
      await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
      await expect(triggers.nth(1)).toContainText('Hide answers');
      const choicePanel = page.getByTestId('review-exercise-choice');
      await expect(choicePanel.getByText('Your choice', { exact: true })).toHaveCount(2);
      await expect(choicePanel.getByText('Your answer is marked above.')).toBeVisible();
      await triggers.nth(1).press('Enter');
      await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'false');
      await expect(triggers.nth(1)).toContainText('Show answers');
      await expect(choicePanel.getByText('Your answer is marked above.')).not.toBeVisible();
      await triggers.nth(1).click();
      await page.screenshot({
        path: `test-results/result-controls-${mock ? 'mobile' : 'desktop'}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    });

    test(`sections lock, resume, preserve edits, and submit with omissions (${mock ? 'mock/mobile' : 'normal'})`, async ({
      page,
    }) => {
      const { db } = getE2EAdmin();
      const versionId = mock ? E2E_IDS.nudgeVersion : E2E_IDS.scoreVersion;
      const versionRef = db.collection('testVersions').doc(versionId);
      const original = (await versionRef.get()).data()!;
      const firstPage = original.pages[0];
      const secondExercise = {
        ...firstPage.items[0],
        id: 'section-two-exercise',
        title: 'Future section question',
        data: { items: [{ text: 'future-prompt', answer: 'future-answer' }] },
      };
      await versionRef.update({
        pages: [firstPage, { id: 'section-two', title: 'Second section', items: [secondExercise] }],
        totalPages: 2,
        totalItems: 2,
        totalExercises: 2,
        totalPoints: original.totalPoints * 2,
      });
      if (mock) await page.setViewportSize({ width: 390, height: 844 });
      await signIn(page, mock ? E2E_USERS.mock : E2E_USERS.scoreOnly);
      await dashboardCard(page, mock ? 'Required-pass practice' : 'Score-only checkpoint')
        .getByRole('button', { name: mock ? 'Start Mock Test' : 'Start Test' })
        .click();
      const startResponse = page.waitForResponse(response => response.url().endsWith('/api/test-attempts/start'));
      await page.getByRole('button', { name: mock ? 'Start Mock Test' : 'Start Test', exact: true }).click();
      const start = await startResponse;
      const first = (await start.json()).attempt;
      expect(JSON.stringify(first)).not.toContain('future-prompt');
      expect(first).not.toHaveProperty('translationGrades');
      const authorization = start.request().headers()['authorization'];
      await recordFillAnswer(page, 'love');
      await page.getByRole('textbox').fill('edited answer');
      await expect(page.getByRole('status')).toContainText('Answers saved.');
      await page.getByRole('button', { name: 'Return to section' }).click();
      await expect(page.getByRole('textbox', { name: /Type your answer/ })).toHaveValue('edited answer');
      await expect(page.getByRole('button', { name: 'Review section' })).toBeVisible();
      await page.getByRole('button', { name: 'Review section' }).click();
      await expect(page.getByRole('textbox')).toHaveValue('edited answer');
      await page.screenshot({ path: `test-results/section-review-${mock ? 'mobile' : 'desktop'}.png`, fullPage: true });
      const confirmationResponse = page.waitForResponse(response =>
        response.url().endsWith(`/sections/${firstPage.id}/confirm`)
      );
      await page.getByRole('button', { name: 'Confirm section and continue' }).click();
      const confirmation = await confirmationResponse;
      const next = (await confirmation.json()).attempt;
      expect(next.delivery.pages.map((p: { id: string }) => p.id)).toEqual(['section-two']);
      expect(next.answers).toEqual({});
      await expect(page.getByText('future-prompt')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Previous page' })).toHaveCount(0);
      const stale = await page.request.patch(`/api/test-attempts/${first.id}/answers`, {
        headers: { authorization },
        data: {
          section: { pageId: firstPage.id, expectedRevision: 1, mutationId: randomUUID() },
          answers: { [firstPage.items[0].id]: { type: 'fill', answers: ['overwrite locked answer'] } },
        },
      });
      expect(stale.status()).toBe(409);
      await page.reload();
      await page.getByRole('button', { name: mock ? 'Continue Mock Test' : 'Continue Test', exact: true }).click();
      await expect(page.getByText('future-prompt')).toBeVisible();
      await page.getByRole('button', { name: 'Review section' }).click();
      await expect(page.getByRole('button', { name: 'Confirm section and submit' })).toBeDisabled();
      await page.getByRole('checkbox', { name: /I understand this section/ }).check();
      await page.getByRole('button', { name: 'Confirm section and submit' }).click();
      await page.getByRole('link', { name: 'Review answers' }).click();
      await expect(page.getByRole('link', { name: 'Back to summary' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
      const open = page.locator('[data-testid="test-result-accordion"] button[aria-expanded="true"]');
      await expect(open).toHaveCount(1);
      await open.click();
      await expect(open).toHaveCount(0);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/test/${mock ? E2E_IDS.nudgeMock : E2E_IDS.scoreTest}`));
    });
  }

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
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await page
      .getByRole('alertdialog', { name: 'Discard unsaved changes?' })
      .getByRole('button', {
        name: 'Discard changes',
      })
      .click();
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
    const mockGrid = studentPage.getByTestId('mock-test-grid');
    await expect(mockGrid.getByRole('heading', { level: 3 })).toHaveText([
      'Required-pass practice',
      'Ordered fixed-version mock',
    ]);
    const mockCard = dashboardCard(studentPage, 'Ordered fixed-version mock');
    await mockCard.getByRole('button', { name: 'Start Mock Test' }).click();
    await expect(
      studentPage.getByText('Aim for 80% — this is practice and will not affect your Learning Path')
    ).toBeVisible();
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
