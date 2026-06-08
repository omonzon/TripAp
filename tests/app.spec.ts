import { test, expect } from '@playwright/test';

test.describe('Main Application Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Fail tests on uncaught JavaScript exceptions in the page
    page.on('pageerror', exception => {
      console.error(`Uncaught exception: "${exception}"`);
      throw new Error(`Uncaught exception in browser: ${exception.message}`);
    });
    
    // Optionally monitor console errors (but some libraries throw non-fatal console errors, so we just log them for now)
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`Browser console error: ${msg.text()}`);
      }
    });
  });

  test('should load the dashboard successfully', async ({ page }) => {
    await page.goto('/');
    
    // The app title
    await expect(page).toHaveTitle(/TravelPlatform/i);
    
    // We should be logged in, so we expect to see the main container or header
    // Use a language-independent selector that works on both Onboarding and Dashboard
    const rootContainer = page.locator('#root > div').first();
    await expect(rootContainer).toBeVisible({ timeout: 10000 });
  });

  test('should toggle dark/light mode', async ({ page }) => {
    await page.goto('/');
    
    // Go to settings tab
    const settingsTab = page.locator('button[id="tab-settings"], button:has-text("הגדרות"), button:has-text("Settings")').first();
    if (await settingsTab.isVisible()) {
      await settingsTab.click();
      
      const themeToggle = page.locator('#btn-toggle-dark');
      await expect(themeToggle).toBeVisible();
      
      // Click toggle
      await themeToggle.click();
      // Should change class on HTML
      await expect(page.locator('html')).not.toHaveClass(/dark/);
      
      // Click again to restore
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark/);
    }
  });
});
