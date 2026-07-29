import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should display main content', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Latin' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Start Your Journey/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /I have an account/i })).toBeVisible();
  });

  test('should navigate to auth pages from CTA buttons', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /I have an account/i }).click();
    await page.waitForURL('**/login');
    await page.goto('/');
    await page.getByRole('link', { name: /Start Your Journey/i }).click();
    await page.waitForURL('**/register');
  });

  test('should display all feature cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Smart Lessons' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Classical Texts' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Track Progress' })).toBeVisible();
  });
});
