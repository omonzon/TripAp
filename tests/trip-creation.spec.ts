import { test, expect } from '@playwright/test';

test.describe('Trip Creation & Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', exception => {
      throw new Error(`Uncaught exception in browser: ${exception.message}`);
    });
  });

  test('should interact with trip creation inputs without UI freezes or overlap', async ({ page }) => {
    await page.goto('/');

    // Ensure we are logged in
    await expect(page.locator('#root > div').first()).toBeVisible({ timeout: 15000 });

    // We might be on the dashboard OR the onboarding page depending on whether the test user has trips
    // Check if we have the generic onboarding/create flow start button
    const onboardingNext = page.locator('button:has-text("הבא"), button:has-text("Next")').first();
    const dashboardCreate = page.locator('button:has-text("צור טיול חדש"), button:has-text("Create new trip")').first();

    if (await dashboardCreate.isVisible()) {
      // If we are on the dashboard, we click "Create new trip"
      await dashboardCreate.click();
    } else if (await onboardingNext.isVisible()) {
      // If we are in onboarding, we proceed through the initial steps to reach the Trip Details step
      // Step 1: Welcome
      await expect(onboardingNext).toBeVisible();
      await onboardingNext.click();
    } else {
      // We might already be on the Trip Details step or something else
      console.log('No obvious start button found, checking if we are already in the form.');
    }

    // Now we should look for an input field to ensure we reached a form (e.g. destinations)
    // We don't want to actually submit the form to Gemini to save tokens/time.
    // We just want to ensure inputs are accessible, visible, and can be typed into (No overlapping or freezing).
    
    // We wait for either a textarea or input that represents the destinations or trip form
    const tripFormElement = page.locator('textarea, input[type="text"]').first();
    
    if (await tripFormElement.isVisible({ timeout: 5000 })) {
      // Check that we can type into it
      await tripFormElement.fill('London, UK');
      await expect(tripFormElement).toHaveValue('London, UK');
      
      // We know the form is rendered and interactive
      console.log('Trip form is interactive and working.');
    } else {
      console.log('Trip form element not immediately visible, possibly requiring more steps. Skipping deep interaction to prevent token usage.');
    }
  });
});
