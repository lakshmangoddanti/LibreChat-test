// QTRACE_PLAYWRIGHT_HELPER
import { test as base, expect } from '@playwright/test';
import path from 'path';
import {
  resetBackendCoverage,
  resetFrontendCoverage,
  saveCoverage,
} from './coverage';

const BASE_URL = 'http://13.62.40.184:4000';

type Fixtures = {
  authenticated: boolean;
};

export const test = base.extend<Fixtures>({
  authenticated: [true, { option: true }],

  page: async ({ page, request, authenticated }, use, testInfo) => {
    const project = testInfo.project.name;
    const scriptName = path.basename(testInfo.file, path.extname(testInfo.file));

    try {
      await page.goto(BASE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      if (!authenticated) {
        // e.g. await page.goto(`${BASE_URL}/login`);
      }

      await resetBackendCoverage(request);
      await resetFrontendCoverage(page);
    } catch (err) {
      console.warn(`[fixture] Setup failed for "${testInfo.title}":`, err);
    }

    try {
      await use(page);
    } finally {
      try {
        await saveCoverage({
          request,
          page,
          project,
          scriptName,
          testCaseName: testInfo.title,
        });
      } catch (err) {
        console.warn(`[coverage] save failed for "${testInfo.title}":`, err);
      }
    }
  },
});

export { expect };
