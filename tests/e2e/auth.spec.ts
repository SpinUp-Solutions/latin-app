import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
  });

  test('should show registration page', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByPlaceholder('Password (min 8 characters)')).toBeVisible();
    await expect(page.getByPlaceholder('Confirm password')).toBeVisible();
  });

  test('should navigate between auth pages', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /sign up/i }).click();
    await page.waitForURL('**/register');
    await page.getByRole('link', { name: /sign in/i }).click();
    await page.waitForURL('**/login');
    await page.getByRole('link', { name: /forgot.*password/i }).click();
    await page.waitForURL('**/forgot-password');
  });
});
