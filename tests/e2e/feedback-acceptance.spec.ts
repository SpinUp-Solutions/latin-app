import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { signIn } from './fixtures/journeys';
import { E2E_PASSWORD, E2E_USERS, getE2EAdmin, seedAcceptanceData } from './fixtures/seed';
import { FEEDBACK_LESSON_ID, FEEDBACK_PAGE_ID, seedFeedbackLesson } from './fixtures/feedback';

test.describe('Integrated feedback acceptance', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    await seedAcceptanceData();
    await seedFeedbackLesson();
  });

  test('login return, standalone submission, lesson draft, and admin review', async ({ browser, request }, testInfo) => {
    test.setTimeout(180_000);
    const screenshotDir = '/tmp/latin-feedback-screenshots';
    mkdirSync(screenshotDir, { recursive: true });
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await student.goto('/feedback');
    await student.waitForURL('**/login?return=%2Ffeedback');
    await student.getByPlaceholder('name@example.com').fill(E2E_USERS.scoreOnly.email);
    await student.getByPlaceholder('••••••••').fill(E2E_PASSWORD);
    await student.getByRole('button', { name: 'Sign in' }).click();
    await student.waitForURL('**/feedback');
    await expect(student.getByRole('heading', { name: 'Share your feedback' })).toBeVisible();
    await expect(student.getByText('Loading accessible lessons…')).toHaveCount(0);
    await expect(student.getByText('Successfully logged in!')).toHaveCount(0);
    await student.screenshot({ path: `${screenshotDir}/student-form.png`, fullPage: true });

    const storageWrites: Array<{ method: string; status: number; url: string }> = [];
    const finalizeStatuses: number[] = [];
    student.on('response', response => {
      if (response.url().includes(':9199/') && ['POST', 'PUT'].includes(response.request().method())) {
        storageWrites.push({ method: response.request().method(), status: response.status(), url: response.url() });
      }
      if (response.url().endsWith('/finalize') && response.request().method() === 'POST') finalizeStatuses.push(response.status());
    });
    const reservation = student.waitForResponse(response =>
      response.url().includes('/api/feedback/sessions/') && response.url().endsWith('/attachments') && response.request().method() === 'POST');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
    await student.locator('#feedback-attachments').setInputFiles({
      name: 'screen.png',
      mimeType: 'image/png',
      buffer: png,
    });
    const reserveResponse = await reservation;
    expect(reserveResponse.status(), await reserveResponse.text()).toBe(201);
    const reserved = await reserveResponse.json();
    expect(reserved.stagingPath).toMatch(/^student-feedback\/staging\//);
    const attachment = student.getByRole('list', { name: 'Attachments' }).getByRole('listitem');
    await expect(attachment).toContainText(/Ready|Failed:/, { timeout: 30_000 });
    expect(storageWrites.some(write => write.status >= 200 && write.status < 300 && write.url.includes('student-feedback')), JSON.stringify(storageWrites)).toBe(true);
    let uploadReady = (await attachment.innerText()).includes('Ready');
    if (!uploadReady) {
      await expect(student.getByRole('button', { name: 'Submit feedback' })).toBeDisabled();
      const finalizeAttemptsBefore = finalizeStatuses.length;
      await attachment.getByRole('button', { name: 'Retry' }).click();
      await expect(attachment).toContainText(/Ready|Failed:/, { timeout: 30_000 });
      await expect.poll(() => finalizeStatuses.length).toBeGreaterThan(finalizeAttemptsBefore);
      uploadReady = (await attachment.innerText()).includes('Ready');
    }
    if (uploadReady) {
      await student.locator('#feedback-attachments').setInputFiles({ name: 'remove.png', mimeType: 'image/png', buffer: png });
      const secondAttachment = student.getByRole('list', { name: 'Attachments' }).getByRole('listitem').filter({ hasText: 'remove.png' });
      await expect(secondAttachment).toContainText(/Ready|Failed:/, { timeout: 30_000 });
      await secondAttachment.getByRole('button', { name: 'Remove' }).click();
      await expect(secondAttachment).toHaveCount(0);
      await expect(attachment).toHaveCount(1);
    } else {
      expect(finalizeStatuses.some(status => status >= 400), JSON.stringify(finalizeStatuses)).toBe(true);
      await attachment.getByRole('button', { name: 'Remove' }).click();
      await expect(student.getByRole('list', { name: 'Attachments' })).toHaveCount(0);
    }
    console.info(`Feedback attachment finalization: ${uploadReady ? 'ready' : `failed and retried (${finalizeStatuses.join(', ')})`}`);

    await student.getByLabel('General feedback').check();
    await student.getByLabel('Dashboard / progress tracking').check();
    await student.getByLabel(/Describe the issue or suggestion/).fill('The dashboard could show more progress detail.');
    await student.getByRole('button', { name: 'Submit feedback' }).click();
    const reference = await student.getByText(/Reference:/).textContent();
    expect(reference).toBeTruthy();
    await expect(student.getByRole('button', { name: 'Submit another' })).toBeVisible();

    const signInToken = async (email: string) => {
      const result = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', {
        data: { email, password: E2E_PASSWORD, returnSecureToken: true },
      });
      expect(result.ok()).toBe(true);
      return (await result.json()).idToken as string;
    };
    const studentToken = await signInToken(E2E_USERS.scoreOnly.email);
    const adminToken = await signInToken(E2E_USERS.admin.email);
    const forbiddenList = await request.get('http://127.0.0.1:3000/api/admin/feedback', { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(forbiddenList.status()).toBe(403);
    const sessionId = randomUUID();
    const ownSession = await request.post('http://127.0.0.1:3000/api/feedback/sessions', { headers: { Authorization: `Bearer ${studentToken}` }, data: { sessionId } });
    expect(ownSession.ok()).toBe(true);
    const crossOwnerSession = await request.get(`http://127.0.0.1:3000/api/feedback/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect([403, 404]).toContain(crossOwnerSession.status());

    await student.goto(`/lesson/${FEEDBACK_LESSON_ID}`);
    await expect(student.getByRole('button', { name: 'Feedback', exact: true })).toBeVisible();
    await student.getByRole('button', { name: 'Feedback', exact: true }).click();
    await expect(student.getByRole('dialog', { name: 'Share feedback' })).toBeVisible();
    await student.screenshot({ path: `${screenshotDir}/lesson-dialog.png`, fullPage: true });
    await student.getByLabel(/Describe the issue or suggestion/).fill('My lesson draft survives closing.');
    await student.getByRole('button', { name: 'Close feedback' }).click();
    await expect(student.getByRole('dialog', { name: 'Share feedback' })).toHaveCount(0);
    await student.getByRole('button', { name: 'Feedback', exact: true }).click();
    await expect(student.getByLabel(/Describe the issue or suggestion/)).toHaveValue('My lesson draft survives closing.');
    await student.getByLabel('Bug report').check();
    await student.getByLabel('Minor (visual/usability)').check();
    await student.getByLabel('Lessons / lesson content').check();
    await student.getByRole('button', { name: 'Submit feedback' }).click();
    await expect(student.getByText(/Reference:/)).toBeVisible();
    await student.getByRole('button', { name: 'Return to lesson' }).click();
    await expect(student.getByText('Page 1 of 2')).toBeVisible();

    const { db } = getE2EAdmin();
    const studentReports = await db.collection('studentFeedback').where('submitter.uid', '==', E2E_USERS.scoreOnly.uid).get();
    expect(studentReports.size).toBe(2);
    const lessonReport = studentReports.docs.map(doc => doc.data()).find(data => data.lesson?.id === FEEDBACK_LESSON_ID);
    expect(lessonReport?.lesson?.pageId).toBe(FEEDBACK_PAGE_ID);
    const standaloneReport = studentReports.docs.map(doc => doc.data()).find(data => data.diagnostics?.entryPoint === 'standalone');
    expect(standaloneReport?.attachments).toHaveLength(uploadReady ? 1 : 0);

    const adminListResponse = await request.get('http://127.0.0.1:3000/api/admin/feedback', { headers: { Authorization: `Bearer ${adminToken}` } });
    const adminListBody = await adminListResponse.text();
    expect(adminListResponse.status(), adminListBody).toBe(200);
    expect(adminListBody).toContain('My lesson draft survives closing.');

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, E2E_USERS.admin, '/admin');
    await admin.goto('/admin/feedback');
    await expect(admin.getByRole('heading', { name: 'Feedback', exact: true })).toBeVisible();
    await expect(admin.getByText('My lesson draft survives closing.')).toBeVisible();
    await admin.screenshot({ path: `${screenshotDir}/admin-feedback.png`, fullPage: true });
    await admin.getByText('My lesson draft survives closing.').click();
    await expect(admin.getByText('Opening page')).toBeVisible();
    await expect(admin.getByRole('link', { name: 'Preview lesson' })).toBeVisible();
    await admin.getByLabel('Add a private admin note').fill('Investigating the lesson page.');
    await admin.getByRole('button', { name: 'Add note' }).click();
    await expect(admin.getByText('Investigating the lesson page.')).toBeVisible();
    await admin.getByRole('button', { name: 'Resolve' }).click();
    await expect(admin.getByText('resolved', { exact: true })).toBeVisible();
    await admin.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(admin.getByText('resolved · archived')).toBeVisible();
    await admin.getByRole('button', { name: 'Reopen' }).click();
    await expect(admin.getByText('unresolved · archived')).toBeVisible();
    await admin.getByRole('button', { name: 'Unarchive' }).click();
    await expect(admin.getByText('unresolved', { exact: true })).toBeVisible();

    await student.setViewportSize({ width: 390, height: 844 });
    await student.goto('/feedback');
    await expect(student.getByRole('heading', { name: 'Share your feedback' })).toBeVisible();
    await testInfo.attach('feedback-mobile', { body: await student.screenshot({ path: `${screenshotDir}/student-form-mobile.png`, fullPage: true }), contentType: 'image/png' });
    await adminContext.close();
    await studentContext.close();
  });
});
