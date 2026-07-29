import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, type E2E_USERS } from './seed';

type SeededUser = (typeof E2E_USERS)[keyof typeof E2E_USERS];

export async function signIn(page: Page, user: SeededUser, destination: '/dashboard' | '/admin' = '/dashboard') {
  await page.goto('/login');
  await page.getByPlaceholder('name@example.com').fill(user.email);
  await page.getByPlaceholder('••••••••').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**${destination}`);
}

export function dashboardCard(page: Page, title: string) {
  return page
    .getByRole('heading', { name: title, exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
}

export async function recordFillAnswer(page: Page, answer: string) {
  await page.getByPlaceholder(/Type your answer/).fill(answer);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Answer recorded.', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Answer saved.');
}

export async function submitCurrentTest(page: Page) {
  await page.getByRole('button', { name: 'Review answers' }).click();
  await expect(page.getByRole('heading', { name: 'Review before submitting' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit Test' }).click();
}
