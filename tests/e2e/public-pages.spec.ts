import { test, expect } from '@playwright/test';

// Signing in through /login is exercised by every acceptance journey; these
// cover the signed-out pages that no journey visits.
test.describe('Public pages', () => {
  test('home page calls to action lead to sign-in and registration', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /I have an account/i }).click();
    await page.waitForURL('**/login');

    await page.goto('/');
    await page.getByRole('link', { name: /Start Your Journey/i }).click();
    await page.waitForURL('**/register');
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await expect(page.getByPlaceholder('Password (min 8 characters)')).toBeVisible();
    await expect(page.getByPlaceholder('Confirm password')).toBeVisible();
  });

  test('auth pages link to each other', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /sign up/i }).click();
    await page.waitForURL('**/register');
    await page.getByRole('link', { name: /sign in/i }).click();
    await page.waitForURL('**/login');
    await page.getByRole('link', { name: /forgot.*password/i }).click();
    await page.waitForURL('**/forgot-password');
  });

  test('dashboard redirects to login when signed out', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login');
  });
});
