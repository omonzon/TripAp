# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.setup.ts >> authenticate
- Location: tests\auth.setup.ts:7:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 120000ms exceeded.
Call log:
  - waiting for locator('text=צור טיול חדש') to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - button "English" [ref=e5] [cursor=pointer]:
        - img [ref=e6]
      - button "Font Size" [ref=e13] [cursor=pointer]:
        - img [ref=e14]
      - button "מצב בהיר" [ref=e18] [cursor=pointer]:
        - img [ref=e19]
    - generic [ref=e29]:
      - img [ref=e31]
      - heading "TravelPlatform" [level=1] [ref=e35]
      - paragraph [ref=e36]: ארגן טיולים בצורה חכמה ומאובטחת
    - generic [ref=e37]:
      - generic [ref=e38]:
        - generic [ref=e39]: 🗺️
        - heading "AI Itinerary Builder" [level=3] [ref=e40]
        - paragraph [ref=e41]: Semantic trip planning from your bookings
      - generic [ref=e42]:
        - generic [ref=e43]: 📍
        - heading "Real-time Group Tracking" [level=3] [ref=e44]
        - paragraph [ref=e45]: See where everyone is, instantly
      - generic [ref=e46]:
        - generic [ref=e47]: 💸
        - heading "Smart Expense Scanner" [level=3] [ref=e48]
        - paragraph [ref=e49]: Scan receipts with AI precision
      - generic [ref=e50]:
        - generic [ref=e51]: ✈️
        - heading "Works Offline" [level=3] [ref=e52]
        - paragraph [ref=e53]: Full airplane mode support
    - generic [ref=e54]:
      - generic [ref=e55]:
        - img [ref=e56]
        - generic [ref=e58]: Secured by Google Firebase
      - img [ref=e59]
      - heading "התחבר לחשבון" [level=2] [ref=e64]
      - paragraph [ref=e65]: ארגן טיולים בצורה חכמה ומאובטחת
      - generic [ref=e66]: "Firebase: Error (auth/popup-closed-by-user)."
      - button "Sign in with Google" [ref=e67]:
        - img [ref=e68]
        - text: Sign in with Google
  - iframe [ref=e73]:
    
```

# Test source

```ts
  1  | import { test as setup } from '@playwright/test';
  2  | import * as path from 'path';
  3  | import * as fs from 'fs';
  4  | 
  5  | const authFile = path.resolve('playwright/.auth/user.json');
  6  | 
  7  | setup('authenticate', async ({ page }) => {
  8  |   // If the auth file already exists, we skip logging in again
  9  |   // (unless it's expired, but for now we assume it's good if it exists)
  10 |   if (fs.existsSync(authFile)) {
  11 |     console.log('Auth state already exists. Skipping manual login.');
  12 |     return;
  13 |   }
  14 | 
  15 |   setup.setTimeout(120000); // 2 minutes to log in
  16 | 
  17 |   console.log('\n======================================================');
  18 |   console.log('🔒 MANUAL LOGIN REQUIRED 🔒');
  19 |   console.log('A browser window should open. Please log in with:');
  20 |   console.log('Email: omon.test.mail@gmail.com');
  21 |   console.log('Wait until you see the main dashboard ("צור טיול חדש").');
  22 |   console.log('======================================================\n');
  23 | 
  24 |   await page.goto('/');
  25 | 
  26 |   // Wait for the main dashboard element that signifies a successful login
> 27 |   await page.waitForSelector('text=צור טיול חדש', { timeout: 120000 });
     |              ^ Error: page.waitForSelector: Test timeout of 120000ms exceeded.
  28 | 
  29 |   // Save the authentication state
  30 |   await page.context().storageState({ path: authFile });
  31 |   
  32 |   console.log('✅ Login state successfully saved!');
  33 | });
  34 | 
```