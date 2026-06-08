import { test, expect } from '@playwright/test';

test.describe('Main Application Flow', () => {
  test('should load the dashboard successfully', async ({ page }) => {
    await page.goto('/');
    
    // The app title
    await expect(page).toHaveTitle(/TravelPlatform/i);
    
    // We should be logged in, so we expect to see the "Create new trip" button
    const createBtn = page.locator('text=צור טיול חדש');
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test('should toggle dark/light mode', async ({ page }) => {
    await page.goto('/');
    
    // Go to settings tab
    const settingsTab = page.locator('button:has-text("הגדרות")').or(page.locator('button[id="tab-settings"]'));
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
