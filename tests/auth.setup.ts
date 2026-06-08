import { test as setup } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  // If the auth file already exists, we skip logging in again
  // (unless it's expired, but for now we assume it's good if it exists)
  if (fs.existsSync(authFile)) {
    console.log('Auth state already exists. Skipping manual login.');
    return;
  }

  setup.setTimeout(120000); // 2 minutes to log in

  console.log('\n======================================================');
  console.log('🔒 MANUAL LOGIN REQUIRED 🔒');
  console.log('A browser window should open. Please log in with:');
  console.log('Email: omon.test.mail@gmail.com');
  console.log('Wait until you see the main dashboard ("צור טיול חדש").');
  console.log('======================================================\n');

  await page.goto('/');

  // Wait for the main dashboard element that signifies a successful login
  await page.waitForSelector('text=צור טיול חדש', { timeout: 120000 });

  // Save the authentication state
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Login state successfully saved!');
});
