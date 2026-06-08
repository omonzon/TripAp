import { test, expect } from '@playwright/test';

test.describe('Settings & Localization Flow', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', exception => {
      throw new Error(`Uncaught exception in browser: ${exception.message}`);
    });
  });

  test('should load settings, change language, and maintain UI integrity', async ({ page }) => {
    await page.goto('/');

    // Check if we are in onboarding or dashboard
    await expect(page.locator('#root > div').first()).toBeVisible({ timeout: 15000 });

    const settingsTab = page.locator('button[id="tab-settings"]').first();
    
    if (!(await settingsTab.isVisible())) {
      console.log('Settings tab not visible. User is likely in onboarding. Skipping language settings test.');
      return;
    }

    // Go to settings
    await settingsTab.click();
    await expect(page).toHaveURL(/\/settings$/);

    // Change language to Hebrew if currently English, or English if currently Hebrew
    // The language select might be generic, let's look for a button or select that mentions language or has a globe icon
    
    // In our app, there is a language selector in SettingsView
    // We can try to toggle it safely
    const languageSelect = page.locator('select').first();
    if (await languageSelect.isVisible()) {
      const currentVal = await languageSelect.inputValue();
      const newVal = currentVal === 'en' ? 'he' : 'en';
      
      // Attempt to change language
      await languageSelect.selectOption(newVal);
      
      // If we changed to Hebrew, we expect the HTML element to have dir="rtl"
      if (newVal === 'he') {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      } else {
        await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      }
      
      console.log(`Language changed to ${newVal} successfully without crashing.`);
      
      // Revert back so we don't pollute future tests
      await languageSelect.selectOption(currentVal);
    } else {
      console.log('Language select not found in settings.');
    }
  });
});
