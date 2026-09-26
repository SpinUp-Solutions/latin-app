import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/journeys';
import { E2E_PASSWORD, E2E_USERS, getE2EAdmin, seedAcceptanceData } from './fixtures/seed';
import { FEEDBACK_LESSON_ID, FEEDBACK_PAGE_ID, feedbackBucket, seedFeedbackLesson } from './fixtures/feedback';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('Integrated feedback acceptance', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    await seedAcceptanceData();
    await seedFeedbackLesson();
  });

  test('login return, standalone submission with an attachment, lesson draft, and admin review', async ({ browser, request }) => {
    test.setTimeout(180_000);
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await student.goto('/feedback');
    await student.waitForURL('**/login?return=%2Ffeedback');
    await student.getByPlaceholder('name@example.com').fill(E2E_USERS.scoreOnly.email);
    await student.getByPlaceholder('••••••••').fill(E2E_PASSWORD);
    await student.getByRole('button', { name: 'Sign in' }).click();
    await student.waitForURL('**/feedback');
    await expect(student.getByRole('heading', { name: 'Share your feedback' })).toBeVisible();

    const fileInput = student.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'screen.png', mimeType: 'image/png', buffer: PNG });
    const attachments = student.getByRole('list', { name: 'Attachments' });
    await expect(attachments.getByRole('listitem').filter({ hasText: 'screen.png' })).toContainText('Ready', { timeout: 30_000 });
    await fileInput.setInputFiles({ name: 'remove.png', mimeType: 'image/png', buffer: PNG });
    await expect(attachments.getByRole('listitem').filter({ hasText: 'remove.png' })).toContainText('Ready', { timeout: 30_000 });
    await student.getByRole('button', { name: 'Remove remove.png' }).click();
    await expect(attachments.getByRole('listitem')).toHaveCount(1);

    await student.getByLabel('General feedback').check();
    await student.getByLabel('Dashboard & progress').check();
    await student.getByLabel('Tell us more').fill('The dashboard could show more progress detail.');
    await student.getByRole('button', { name: 'Send feedback' }).click();
    await expect(student.getByText(/Reference:/)).toBeVisible({ timeout: 30_000 });
    const standaloneId = (await student.locator('.font-mono').textContent())?.trim() ?? '';
    await expect(student.getByRole('button', { name: 'Send more feedback' })).toBeVisible();

    const signInToken = async (email: string) => {
      const result = await request.post(
        'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
        { data: { email, password: E2E_PASSWORD, returnSecureToken: true } }
      );
      expect(result.ok()).toBe(true);
      return (await result.json()).idToken as string;
    };
    const studentToken = await signInToken(E2E_USERS.scoreOnly.email);
    const adminToken = await signInToken(E2E_USERS.admin.email);
    const forbiddenList = await request.get('http://127.0.0.1:3000/api/admin/feedback', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(forbiddenList.status()).toBe(403);
    const hijack = await request.post('http://127.0.0.1:3000/api/feedback', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        draftId: standaloneId,
        type: 'general',
        areas: ['other'],
        otherAreaExplanation: 'Takeover',
        description: 'Reusing another student’s report ID',
        attachments: [],
        diagnostics: { entryPoint: 'standalone' },
      },
    });
    expect(hijack.status()).toBe(409);

    await student.goto(`/lesson/${FEEDBACK_LESSON_ID}`);
    const feedbackButton = student.getByRole('button', { name: 'Feedback', exact: true });
    await expect(feedbackButton).toBeVisible();
    await feedbackButton.click();
    const panel = student.getByRole('dialog', { name: 'Share feedback' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('combobox')).toContainText('Page 1');
    await panel.getByLabel('Tell us more').fill('My lesson draft survives closing.');
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await feedbackButton.click();
    await expect(panel.getByLabel('Tell us more')).toHaveValue('My lesson draft survives closing.');
    await panel.getByLabel('Bug report').check();
    await panel.getByLabel('Minor').check();
    await panel.getByLabel('Lessons').check();
    await panel.getByRole('button', { name: 'Send feedback' }).click();
    await expect(panel.getByText(/Reference:/)).toBeVisible();
    await panel.getByRole('button', { name: 'Back to lesson' }).click();
    await expect(student.getByText('Page 1 of 2')).toBeVisible();

    const { db } = getE2EAdmin();
    const studentReports = await db.collection('studentFeedback').where('submitter.uid', '==', E2E_USERS.scoreOnly.uid).get();
    expect(studentReports.size).toBe(2);
    const reports = studentReports.docs.map(doc => doc.data());
    const lessonReport = reports.find(data => data.lesson?.id === FEEDBACK_LESSON_ID);
    expect(lessonReport?.lesson?.pageId).toBe(FEEDBACK_PAGE_ID);
    const standaloneReport = reports.find(data => data.id === standaloneId);
    expect(standaloneReport?.attachments).toEqual([expect.objectContaining({ name: 'screen.png', contentType: 'image/png' })]);
    const bucket = feedbackBucket();
    const attachmentId = standaloneReport?.attachments[0].id;
    const [copied] = await bucket.file(`student-feedback/reports/${standaloneId}/${attachmentId}`).exists();
    expect(copied).toBe(true);
    const [leftover] = await bucket.file(`student-feedback/uploads/${E2E_USERS.scoreOnly.uid}/${standaloneId}/${attachmentId}`).exists();
    expect(leftover).toBe(false);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, E2E_USERS.admin, '/admin');
    await admin.goto('/admin/feedback');
    await expect(admin.getByRole('heading', { name: 'Feedback', exact: true })).toBeVisible();
    await admin.getByText('My lesson draft survives closing.').click();
    await expect(admin.getByText('Opening page')).toBeVisible();
    await expect(admin.getByRole('link', { name: 'Preview lesson' })).toBeVisible();
    await admin.getByLabel('Private note').fill('Investigating the lesson page.');
    await admin.getByRole('button', { name: 'Add note' }).click();
    await expect(admin.getByText('Investigating the lesson page.')).toBeVisible();
    await admin.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(admin.getByRole('button', { name: 'Reopen' })).toBeVisible();
    await admin.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(admin.getByRole('button', { name: 'Unarchive' })).toBeVisible();
    await admin.getByRole('button', { name: 'Reopen' }).click();
    await admin.getByRole('button', { name: 'Unarchive' }).click();
    await expect(admin.getByRole('button', { name: 'Mark resolved' })).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
    await expect(admin.getByText('marked it resolved')).toBeVisible();

    await student.setViewportSize({ width: 390, height: 844 });
    await student.goto('/feedback');
    await expect(student.getByRole('heading', { name: 'Share your feedback' })).toBeVisible();
    await adminContext.close();
    await studentContext.close();
  });
});
