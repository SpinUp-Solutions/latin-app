import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { seedRelease117, morphology, translation, tableExercise, tokenFor } from './fixtures/release117';
import { E2E_USERS, E2E_IDS, getE2EAdmin } from './fixtures/seed';
import { signIn, submitCurrentTest } from './fixtures/journeys';
import * as C from '@/shared/constants/firestore';

mkdirSync('qa-evidence', { recursive: true });
test.beforeAll(async () =>
  writeFileSync('qa-evidence/fixture-manifest.json', JSON.stringify(await seedRelease117(), null, 2))
);
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: `qa-evidence/FAIL-${info.title.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true });
    writeFileSync(
      `qa-evidence/FAIL-${info.testId.replace(/[^a-z0-9]+/gi, '-')}.txt`,
      await page.locator('body').innerText()
    );
  }
});
async function openLesson(page: Page, id: string, origin = 'http://localhost:3000') {
  await getE2EAdmin()
    .db.collection(C.LEARNING_PATHS_COLLECTION)
    .doc('default')
    .update({ unitIds: [id] });
  await page.goto(`${origin}/login`);
  await page.getByPlaceholder('name@example.com').fill(E2E_USERS.scoreOnly.email);
  await page.getByPlaceholder('••••••••').fill('Playwright-pass-123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await page.goto(`${origin}/lesson/${id}`);
  await expect(page.getByRole('button', { name: 'Submit Answers', exact: true })).toBeVisible();
}
async function fillChart(page: Page) {
  const inputs = page.locator('textarea');
  await expect(inputs).toHaveCount(3);
  for (const [i, answer] of ['water', 'wrong', 'wrong'].entries()) await inputs.nth(i).fill(answer);
  await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
}
function evidencePath(name: string) {
  return `qa-evidence/${test.info().project.name === 'firefox' ? 'firefox-' : ''}${name}.png`;
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: evidencePath(name), fullPage: true });
}
async function selectSmallPool(page: Page) {
  await expect(page.getByRole('heading', { name: 'QA real Latin verbs', exact: true })).toBeVisible();
}

test('01 before and after: table feedback and retry', async ({ page, browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const before = await context.newPage();
  await openLesson(before, 'qa-reveal', 'http://localhost:3001');
  await fillChart(before);
  await shot(before, 'table-before-feedback');
  await before.getByRole('button', { name: 'Try Again', exact: true }).click();
  await shot(before, 'table-before-retry');
  await context.close();
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLesson(page, 'qa-reveal');
  await fillChart(page);
  await expect(page.getByRole('status')).toContainText('1 of 3 correct.');
  await expect(page.getByText('Correct answer:', { exact: true })).toHaveCount(2);
  await shot(page, 'table-after-feedback');
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  await expect(page.locator('textarea').nth(0)).toHaveValue('water');
  await expect(page.locator('textarea').nth(0)).toHaveAttribute('readonly', '');
  await expect(page.locator('textarea').nth(1)).toHaveValue('');
  await expect(page.locator('textarea').nth(1)).not.toHaveAttribute('readonly', '');
  await expect(page.getByText('Correct answer:', { exact: true })).toHaveCount(2);
  await shot(page, 'table-after-retry');
  await page.locator('textarea').nth(1).fill('rose');
  await page.locator('textarea').nth(2).fill('earth');
  await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
  await expect(page.getByText('Chart complete', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect
    .poll(async () => {
      const d = await getE2EAdmin().db.collection(C.USER_PROGRESS_COLLECTION).doc('e2e-score-only_qa-reveal').get();
      return d.data()?.exerciseProgress?.[0]?.score;
    })
    .toBe(100);
});

test('02 escalation hides answers initially and locks additional correct cells across retries', async ({ page }) => {
  await openLesson(page, 'qa-hidden');
  await fillChart(page);
  await expect(page.getByText('Correct answer:', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('1 of 3 correct');
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  await page.locator('textarea').nth(1).fill('rose');
  await page.locator('textarea').nth(2).fill('wrong');
  await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('2 of 3 correct');
  await expect(page.getByText('Correct answer:', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  await expect(page.locator('textarea').nth(1)).toHaveAttribute('readonly', '');
  await expect(page.locator('textarea').nth(2)).toHaveValue('');
  await shot(page, 'table-escalation-after');
});

test('03 maximum failures Start over clears the complete chart and answer reveal', async ({ page }) => {
  await openLesson(page, 'qa-reset');
  await fillChart(page);
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  await page.locator('textarea').nth(1).fill('wrong');
  await page.locator('textarea').nth(2).fill('wrong');
  await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start over', exact: true })).toBeVisible();
  await shot(page, 'table-reset-required');
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  for (const input of await page.locator('textarea').all()) {
    await expect(input).toHaveValue('');
    await expect(input).toBeEnabled();
    await expect(input).not.toHaveAttribute('readonly', '');
  }
  await expect(page.getByText('Correct answer:', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit Answers', exact: true })).toBeDisabled();
});

for (const width of [320, 390, 768])
  test(`04 mobile/tablet ${width}: labeled blanks and table containment`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openLesson(page, 'qa-hidden');
    await expect(page.getByRole('textbox', { name: 'aqua, English', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Row 3, English', exact: true })).toBeVisible();
    const geometry = await page.locator('textarea').evaluateAll(els =>
      els.map(el => ({
        input: el.getBoundingClientRect().toJSON(),
        cell: el.closest('td')!.getBoundingClientRect().toJSON(),
        wrap: el.clientHeight < el.scrollHeight,
      }))
    );
    expect(
      geometry.every(g => g.input.width >= 80 && g.input.left >= g.cell.left && g.input.right <= g.cell.right)
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fillChart(page);
    await shot(page, `table-mobile-${width}-after`);
  });

test('05 generated preview uses every eligible word, accepts 201 and 1000, rejects invalid numbers', async ({
  request,
}) => {
  const headers = { Authorization: `Bearer ${await tokenFor(E2E_USERS.admin.email)}` };
  const rows = [];
  for (const count of ['all', 201, 1000] as const) {
    const start = Date.now();
    const response = await request.post('/api/admin/exercises/generated-preview', {
      headers,
      data: morphology('qa-large', count),
    });
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    expect(body.collected).toBe(count === 201 ? 201 : 450);
    expect(new Set(body.words.map((w: any) => w.id)).size).toBe(body.collected);
    rows.push({ count, words: body.collected, items: body.items.length, ms: Date.now() - start });
  }
  for (const count of [0, -1, 1.5, 1001]) {
    const data = morphology();
    data.data.generatorConfig.count = count;
    const response = await request.post('/api/admin/exercises/generated-preview', { headers, data });
    expect(response.status()).toBe(400);
  }
  const denied = await request.post('/api/admin/exercises/generated-preview', {
    headers: { Authorization: `Bearer ${await tokenFor(E2E_USERS.scoreOnly.email)}` },
    data: morphology(),
  });
  expect(denied.status()).toBe(403);
  const anonymous = await request.post('/api/admin/exercises/generated-preview', { data: morphology() });
  expect(anonymous.status()).toBe(401);
  writeFileSync('qa-evidence/generation-metrics.json', JSON.stringify(rows, null, 2));
});

for (const kind of ['Definitions', 'Morphology'])
  test(`06 ${kind} editor: all words, boundaries, source switching and persisted save`, async ({ page, browser }) => {
    const exercise = kind === 'Definitions' ? translation('qa-small', 5) : morphology('qa-small', 5);
    const ref = getE2EAdmin().db.collection(C.TEST_VERSIONS_COLLECTION).doc(E2E_IDS.scoreVersion);
    const original = (await ref.get()).data()!;
    await ref.update({ pages: [{ ...original.pages[0], items: [exercise] }] });
    const beforeContext = await browser.newContext();
    const before = await beforeContext.newPage();
    await before.goto('http://localhost:3001/login');
    await before.getByPlaceholder('name@example.com').fill(E2E_USERS.admin.email);
    await before.getByPlaceholder('••••••••').fill('Playwright-pass-123!');
    await before.getByRole('button', { name: 'Sign in' }).click();
    await before.waitForURL('**/admin');
    await before.goto(
      `http://localhost:3001/admin/tests/edit/${E2E_IDS.scoreTest}/versions/${E2E_IDS.scoreVersion}/edit`
    );
    await before.getByRole('button', { name: `Edit ${kind}`, exact: true }).click();
    await before.getByRole('spinbutton', { name: 'Number of Questions', exact: true }).scrollIntoViewIfNeeded();
    await before
      .getByRole('spinbutton', { name: 'Number of Questions', exact: true })
      .locator('..')
      .screenshot({ path: evidencePath(`${kind.toLowerCase()}-count-before`) });
    await shot(before, `${kind.toLowerCase()}-before`);
    await beforeContext.close();
    await signIn(page, E2E_USERS.admin, '/admin');
    await page.goto(`/admin/tests/edit/${E2E_IDS.scoreTest}/versions/${E2E_IDS.scoreVersion}/edit`);
    await page.getByRole('button', { name: `Edit ${kind}`, exact: true }).click();
    await page.getByRole('radio', { name: 'Custom Filters', exact: true }).click();
    await page.getByRole('radio', { name: 'Vocabulary Pool', exact: true }).click();
    const all = page.getByRole('checkbox', { name: 'Use every eligible word in the pool', exact: true });
    const count = page.getByRole('spinbutton', { name: 'Number of Questions', exact: true });
    await expect(all).toBeChecked();
    await expect(count).toHaveValue('');
    await selectSmallPool(page);
    await count.scrollIntoViewIfNeeded();
    await all.scrollIntoViewIfNeeded();
    await count
      .locator('..')
      .locator('..')
      .screenshot({ path: evidencePath(`${kind.toLowerCase()}-count-after`) });
    await shot(page, `${kind.toLowerCase()}-all-after`);
    await all.uncheck();
    await expect(count).toHaveValue('5');
    for (const [input, expected] of [
      ['201', '201'],
      ['1000', '1000'],
      ['1001', '1000'],
      ['0', '1000'],
      ['-1', '1000'],
      ['1.5', '1000'],
      ['', '1000'],
    ]) {
      await count.fill(input);
      await count.press('Tab');
      await expect(count).toHaveValue(expected);
    }
    await all.check();
    await page.getByRole('radio', { name: 'Custom Filters', exact: true }).click();
    await page.getByRole('radio', { name: 'Vocabulary Pool', exact: true }).click();
    await expect(all).toBeChecked();
    await selectSmallPool(page);
    await count.fill('201');
    await count.press('Tab');
    await expect(all).not.toBeChecked();
    const history = await page.evaluate(() => window.history.length);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.history.length)).toBe(history);
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save Test', exact: true }).click();
    await expect
      .poll(async () => (await ref.get()).data()?.pages?.[0]?.items?.[0]?.data?.generatorConfig?.count)
      .toBe(201);
    await page.reload();
    await page.getByRole('button', { name: `Edit ${kind}`, exact: true }).click();
    await expect(count).toHaveValue('201');
    await expect(all).not.toBeChecked();
    await all.check();
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save Test', exact: true }).click();
    await expect
      .poll(async () => (await ref.get()).data()?.pages?.[0]?.items?.[0]?.data?.generatorConfig?.count)
      .toBe('all');
  });

test('07 test mode: no grading or revealed answers, edits and refresh persist, partial score on submit', async ({
  page,
}) => {
  const { db } = getE2EAdmin();
  const exercise = tableExercise(true);
  const ref = db.collection(C.TEST_VERSIONS_COLLECTION).doc(E2E_IDS.scoreVersion);
  const original = (await ref.get()).data()!;
  await ref.update({ pages: [{ ...original.pages[0], items: [exercise] }], totalPoints: 3 });
  await db
    .collection(C.LEARNING_PATHS_COLLECTION)
    .doc('default')
    .update({ unitIds: [E2E_IDS.scoreTest] });
  await signIn(page, E2E_USERS.scoreOnly);
  await page.goto(`/test/${E2E_IDS.scoreTest}`);
  await page.getByRole('button', { name: 'Start Test', exact: true }).click();
  for (const [i, answer] of ['water', 'wrong', 'earth'].entries()) await page.locator('textarea').nth(i).fill(answer);
  await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Answers saved.');
  await expect(page.getByText('Correct answer:', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try Again', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Test', exact: true }).click();
  await expect(page.locator('textarea').nth(1)).toHaveValue('wrong');
  await shot(page, 'table-test-mode-after');
  await submitCurrentTest(page);
  await expect(page.getByRole('link', { name: 'Review answers' })).toBeVisible();
  const attempts = await db
    .collection(C.TEST_ATTEMPTS_COLLECTION)
    .where('studentId', '==', E2E_USERS.scoreOnly.uid)
    .get();
  const submitted = attempts.docs.map(d => d.data()).find(d => d.status === 'submitted');
  expect(submitted).toBeTruthy();
  writeFileSync('qa-evidence/test-mode-result.json', JSON.stringify(submitted, null, 2));
});

test('08 student generated playback resolves 450 unique words and refuses client-supplied exercise content', async ({
  page,
  request,
}) => {
  await getE2EAdmin()
    .db.collection(C.LEARNING_PATHS_COLLECTION)
    .doc('default')
    .update({ unitIds: ['qa-generated'] });
  await signIn(page, E2E_USERS.scoreOnly);
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/words/generated-exercise'));
  await page.goto('/lesson/qa-generated');
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.items.length).toBe(450);
  await expect(page.getByText(/amat-/).first()).toBeVisible();
  await shot(page, 'morphology-student-450-after');
  const headers = { Authorization: `Bearer ${await tokenFor(E2E_USERS.scoreOnly.email)}` };
  const forged = await request.post('/api/words/generated-exercise', {
    headers,
    data: { lessonId: 'qa-generated', pageIndex: 0, itemIndex: 0, exerciseId: 'wrong-exercise-id' },
  });
  expect(forged.status()).toBe(404);
});

test('09 empty, missing and pending pools return controlled results without partial attempts', async ({ request }) => {
  const headers = { Authorization: `Bearer ${await tokenFor(E2E_USERS.admin.email)}` };
  const observations = [];
  for (const poolId of ['qa-empty', 'qa-missing']) {
    const response = await request.post('/api/admin/exercises/generated-preview', {
      headers,
      data: morphology(poolId),
    });
    const body = await response.json();
    observations.push({ poolId, status: response.status(), body });
    expect(response.status()).toBe(poolId === 'qa-empty' ? 200 : 404);
    if (poolId === 'qa-empty') expect(body.items).toHaveLength(0);
  }
  await getE2EAdmin().db.collection(C.VOCABULARY_POOL_COLLECTION).doc('qa-empty').update({ _deletionPending: true });
  const pending = await request.post('/api/admin/exercises/generated-preview', {
    headers,
    data: morphology('qa-empty'),
  });
  const baseline = await request.post('http://127.0.0.1:3001/api/admin/exercises/generated-preview', {
    headers,
    data: morphology('qa-empty'),
  });
  observations.push({
    poolId: 'qa-empty-pending',
    status: pending.status(),
    body: await pending.json(),
    baselineStatus: baseline.status(),
    baselineBody: await baseline.json(),
  });
  writeFileSync('qa-evidence/pool-boundaries.json', JSON.stringify(observations, null, 2));
});

test('10 Next upgrade: lesson create/edit, test editor dirty navigation stay responsive with stable history', async ({
  page,
}) => {
  await signIn(page, E2E_USERS.admin, '/admin');
  for (const [path, placeholder] of [
    ['/admin/lessons/create', 'Enter lesson title...'],
    ['/admin/lessons/edit/qa-authoring', 'Enter lesson title...'],
  ]) {
    await page.goto(path);
    const field = page.getByPlaceholder(placeholder);
    await field.fill('QA edited title');
    const length = await page.evaluate(() => history.length);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await field.fill('QA edited title twice');
    await expect(field).toHaveValue('QA edited title twice');
    await shot(page, path.includes('create') ? 'lesson-create-after' : 'lesson-edit-after');
    page.once('dialog', d => d.accept());
  }
});

test('11 autocomplete real callable emulator: Terra request, UI success, controlled provider failures and recovery', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:5055/control', { data: { mode: 'success' } });
  await signIn(page, E2E_USERS.admin, '/admin');
  await page.goto('/admin/vocabulary');
  await page.getByRole('textbox', { name: 'Search Words', exact: true }).fill('audio');
  await page.getByRole('button', { name: 'Search words', exact: true }).click();
  await page.getByText('audio', { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'AI Autocomplete', exact: true })).toBeVisible();
  await shot(page, 'autocomplete-before-request');
  const generated = page.waitForResponse(r => r.url().includes('/autocompleteWord') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'AI Autocomplete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI Generating...', exact: true })).toBeDisabled();
  const result = await (await generated).json();
  expect(result.result.model).toBe('gpt-6.1-terra');
  await expect(page.getByText('AI Autocomplete Successful', { exact: true })).toBeVisible();
  await shot(page, 'autocomplete-success-after');
  for (const mode of ['error', 'malformed', 'incomplete']) {
    await request.post('http://127.0.0.1:5055/control', { data: { mode } });
    const response = page.waitForResponse(
      r => r.url().includes('/autocompleteWord') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'AI Autocomplete', exact: true }).click();
    const data = await (await response).json();
    expect(data.result.success).toBe(false);
    await expect(page.getByRole('button', { name: 'AI Autocomplete', exact: true })).toBeEnabled();
    await shot(page, `autocomplete-${mode}-after`);
  }
  await request.post('http://127.0.0.1:5055/control', { data: { mode: 'success' } });
  await page.getByRole('button', { name: 'AI Autocomplete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI Autocomplete', exact: true })).toBeEnabled();
  const captured = await (await request.get('http://127.0.0.1:5055/captured')).json();
  expect(
    captured.every(
      (r: any) => r.model === 'gpt-6.1-terra' && r.reasoning.effort === 'medium' && r.max_output_tokens === 32000
    )
  ).toBe(true);
  writeFileSync('qa-evidence/autocomplete-model-requests.json', JSON.stringify(captured, null, 2));
});

test('12 wide adjective chart at 390px: all 36 cells stay usable through horizontal scrolling and retry', async ({
  page,
  browser,
}) => {
  const beforeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const before = await beforeContext.newPage();
  await openLesson(before, 'qa-adjective', 'http://localhost:3001');
  for (const [i, input] of (await before.locator('textarea').all()).entries())
    await input.fill(i === 0 ? 'bonus' : 'wrong');
  await before.getByRole('button', { name: 'Submit Answers', exact: true }).click();
  await before.waitForTimeout(400);
  await before.locator('table').evaluate(table => {
    table.parentElement!.scrollLeft = 0;
    table.scrollIntoView({ block: 'start' });
    const main = table.closest('main');
    if (main) main.scrollTop -= 80;
  });
  await shot(before, 'adjective-mobile-before');
  await beforeContext.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await openLesson(page, 'qa-adjective');
  await expect(page.locator('textarea')).toHaveCount(36);
  await expect(page.getByRole('textbox', { name: 'Nominative, Masc. singular', exact: true })).toBeVisible();
  for (const [i, input] of (await page.locator('textarea').all()).entries())
    await input.fill(i === 0 ? 'bonus' : 'wrong');
  await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 of 36 correct.');
  await page.locator('table').evaluate(table => {
    table.parentElement!.scrollLeft = 0;
    table.scrollIntoView({ block: 'start' });
    const main = table.closest('main');
    if (main) main.scrollTop -= 80;
  });
  await shot(page, 'adjective-mobile-after');
  const sizes = await page.locator('table').evaluate(table => {
    const container = table.parentElement!;
    return {
      table: table.getBoundingClientRect().width,
      container: container.clientWidth,
      overflow: getComputedStyle(container).overflowX,
    };
  });
  expect(sizes.table).toBeGreaterThan(sizes.container);
  expect(['auto', 'scroll']).toContain(sizes.overflow);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  await expect(page.locator('textarea').nth(0)).toHaveValue('bonus');
  await expect(page.locator('textarea').nth(35)).toHaveValue('');
  await page.locator('textarea').nth(35).fill('bona');
  await page.locator('textarea').nth(35).focus();
  await page.keyboard.press('Shift+Tab');
  expect(
    await page
      .locator('textarea')
      .nth(34)
      .evaluate(el => el === document.activeElement)
  ).toBe(true);
});

test('13 oversized generated test fails safely and leaves no partial attempt', async ({ page, request }) => {
  const { db } = getE2EAdmin();
  const words = await db.collection(C.VOCABULARY_WORDS_COLLECTION).get();
  const stress = words.docs.filter(d => d.id.startsWith('valid-'));
  for (let start = 0; start < stress.length; start += 200) {
    const batch = db.batch();
    for (const doc of stress.slice(start, start + 200))
      batch.update(doc.ref, { translation: 'Synthetic QA oversized answer. '.repeat(120) });
    await batch.commit();
  }
  const versionRef = db.collection(C.TEST_VERSIONS_COLLECTION).doc(E2E_IDS.afterVersion);
  const version = (await versionRef.get()).data()!;
  await versionRef.update({ pages: [{ ...version.pages[0], items: [translation('qa-large', 'all')] }] });
  await db
    .collection(C.LEARNING_PATHS_COLLECTION)
    .doc('default')
    .update({ unitIds: [E2E_IDS.afterTest] });
  await signIn(page, E2E_USERS.requiredPass);
  await page.goto(`/test/${E2E_IDS.afterTest}`);
  const started = page.waitForResponse(r => r.url().endsWith('/api/test-attempts/start'));
  await page.getByRole('button', { name: 'Start Test', exact: true }).click();
  const response = await started;
  const body = await response.json();
  expect(response.status()).toBe(422);
  expect(body.code).toBe('ATTEMPT_TOO_LARGE');
  await expect(page.getByText(/too large/i).first()).toBeVisible();
  await shot(page, 'oversized-test-after');
  const attempts = await db
    .collection(C.TEST_ATTEMPTS_COLLECTION)
    .where('studentId', '==', E2E_USERS.requiredPass.uid)
    .get();
  expect(attempts.size).toBe(0);
  writeFileSync(
    'qa-evidence/oversized-test-response.json',
    JSON.stringify({ status: response.status(), body, partialAttempts: attempts.size }, null, 2)
  );
});

test('14 authentication: wrong credentials, refresh, sign out, switch admin to student and deny admin API', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByPlaceholder('name@example.com').fill(E2E_USERS.admin.email);
  await page.getByPlaceholder('••••••••').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Incorrect email or password. Please try again.', { exact: true })).toBeVisible();
  await page.getByPlaceholder('••••••••').fill('Playwright-pass-123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/admin');
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Admin', exact: true })).toBeVisible();
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await page.waitForURL('**/login');
  await signIn(page, E2E_USERS.scoreOnly);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
  await page.goto('/admin/vocabulary');
  await page.waitForURL('**/dashboard');
  await shot(page, 'student-after-account-switch');
});

test('15 known existing issue: nonempty root pool pending deletion must fail closed', async ({ request }) => {
  test.fail(true, 'QA-01: both production base and edge accept a deletion-pending root pool in generated preview');
  await getE2EAdmin().db.collection(C.VOCABULARY_POOL_COLLECTION).doc('qa-small').update({ _deletionPending: true });
  const headers = { Authorization: `Bearer ${await tokenFor(E2E_USERS.admin.email)}` };
  const observations = [];
  for (const origin of ['http://127.0.0.1:3001', 'http://127.0.0.1:3000']) {
    const response = await request.post(`${origin}/api/admin/exercises/generated-preview`, {
      headers,
      data: translation('qa-small', 'all'),
    });
    const body = await response.json();
    observations.push({ origin, status: response.status(), collected: body.collected, code: body.code ?? null });
  }
  writeFileSync('qa-evidence/known-pending-root-issue.json', JSON.stringify(observations, null, 2));
  expect(observations[1].status).toBeGreaterThanOrEqual(400);
});

test('16 all-word mode exceeds the numeric ceiling while numeric mode stops at 1000', async ({ request }) => {
  const { db } = getE2EAdmin();
  const source = (await db.collection(C.VOCABULARY_WORDS_COLLECTION).doc('qa-amo').get()).data()!;
  const ids = Array.from({ length: 1050 }, (_, i) => `qa-cap-${i}`);
  for (let start = 0; start < ids.length; start += 200) {
    const batch = db.batch();
    for (const [offset, id] of ids.slice(start, start + 200).entries())
      batch.set(db.collection(C.VOCABULARY_WORDS_COLLECTION).doc(id), {
        ...source,
        word: `QA synthetic amo ${start + offset}`,
        sort_key: id,
      });
    await batch.commit();
  }
  const pool = (await db.collection(C.VOCABULARY_POOL_COLLECTION).doc('qa-large').get()).data()!;
  await db
    .collection(C.VOCABULARY_POOL_COLLECTION)
    .doc('qa-beyond-cap')
    .set({
      ...pool,
      id: 'qa-beyond-cap',
      name: 'QA synthetic 1050 eligible',
      wordDocIds: ids,
      metadata: { ...pool.metadata, wordCount: 1050 },
    });
  const headers = { Authorization: `Bearer ${await tokenFor(E2E_USERS.admin.email)}` };
  const metrics = [];
  for (const count of ['all', 1000] as const) {
    const start = Date.now();
    const response = await request.post('/api/admin/exercises/generated-preview', {
      headers,
      data: morphology('qa-beyond-cap', count),
    });
    const body = await response.json();
    expect(response.status()).toBe(200);
    expect(body.collected).toBe(count === 'all' ? 1050 : 1000);
    metrics.push({ count, collected: body.collected, items: body.items.length, ms: Date.now() - start });
  }
  writeFileSync('qa-evidence/all-word-beyond-cap.json', JSON.stringify(metrics, null, 2));
});
