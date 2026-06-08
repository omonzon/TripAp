import { test as setup } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const authFile = path.resolve('playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  // If the auth file already exists, we skip logging in again
  // (unless it's expired, but for now we assume it's good if it exists)
  if (fs.existsSync(authFile)) {
    console.log('Auth state already exists. Skipping manual login.');
    return;
  }

  setup.setTimeout(120000); // 2 minutes to log in

  console.log('\n======================================================');
  console.log('🔒 AUTOMATED LOGIN 🔒');
  console.log('Logging in via Firebase Email/Password backdoor...');
  console.log('======================================================\n');

  await page.goto('/');

  // Click the hidden developer login button
  await page.waitForSelector('#e2e-test-login', { state: 'attached' });
  await page.click('#e2e-test-login', { force: true });

  // Wait for the main dashboard element that signifies a successful login
  await page.waitForSelector('text=צור טיול חדש', { timeout: 30000 });

  // Save the authentication state
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Login state successfully saved!');
});
