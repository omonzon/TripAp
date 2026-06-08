import { test, expect } from '@playwright/test';

test.describe('Navigation & UI Integrity', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for page errors to catch UI crashes
    page.on('pageerror', exception => {
      throw new Error(`Uncaught exception in browser: ${exception.message}`);
    });
  });

  test('should navigate between main tabs successfully', async ({ page }) => {
    await page.goto('/');

    // Ensure we are logged in and the root container is visible
    await expect(page.locator('#root > div').first()).toBeVisible({ timeout: 15000 });

    // Check if the user is in the onboarding view (no bottom nav) or dashboard
    const hasBottomNav = await page.locator('nav').isVisible();
    
    if (!hasBottomNav) {
      // If we are in onboarding, we skip the tab navigation test because tabs aren't available yet
      console.log('User is in onboarding flow. Skipping tab navigation.');
      return;
    }

    // Define the tabs to click
    const tabs = [
      { id: 'tab-trips', urlRegex: /\/$/ },
      { id: 'tab-discover', urlRegex: /\/discover$/ },
      { id: 'tab-group', urlRegex: /\/group$/ },
      { id: 'tab-settings', urlRegex: /\/settings$/ },
    ];

    for (const tab of tabs) {
      const tabButton = page.locator(`button[id="${tab.id}"]`).first();
      await expect(tabButton).toBeVisible();
      
      // Click the tab (this ensures it's not overlapped by anything)
      await tabButton.click();
      
      // Verify URL changed correctly
      await expect(page).toHaveURL(tab.urlRegex);
      
      // Ensure the page content rendered without error
      await expect(page.locator('#root > div').first()).toBeVisible();
    }
  });
});
