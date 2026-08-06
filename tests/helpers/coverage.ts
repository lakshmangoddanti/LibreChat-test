// QTRACE_PLAYWRIGHT_HELPER
import fs from 'fs';
import path from 'path';
import type { APIRequestContext, Page } from '@playwright/test';
import { remapCoverage } from './remapCoverage';

const API_URL = 'http://13.62.40.184:3000/v1';
const COVERAGE_DIR = path.join(process.cwd(), 'coverage');

const COVERAGE_RESET_URL = `${API_URL}/coverage/reset`;
const COVERAGE_GET_URL = `${API_URL}/coverage`;

function sanitize(name: string) {
  return (
    name.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') ||
    'unnamed'
  );
}

export async function resetBackendCoverage(request: APIRequestContext) {
  const res = await request.post(COVERAGE_RESET_URL);
  if (!res.ok()) {
    console.warn(`[coverage] reset returned ${res.status()}`);
  }
}

export async function resetFrontendCoverage(page: Page) {
  await page.evaluate(() => {
    const coverage = (window as any).__coverage__;
    if (!coverage) return;

    for (const file of Object.keys(coverage)) {
      const fc = coverage[file];
      if (fc?.s) for (const k of Object.keys(fc.s)) fc.s[k] = 0;
      if (fc?.f) for (const k of Object.keys(fc.f)) fc.f[k] = 0;
      if (fc?.b) {
        for (const k of Object.keys(fc.b)) {
          fc.b[k] = fc.b[k].map(() => 0);
        }
      }
    }
  });
}

export async function saveCoverage(opts: {
  request: APIRequestContext;
  page: Page;
  project: string;
  scriptName: string;
  testCaseName: string;
}) {
  const folderName = `${sanitize(opts.scriptName)}_${sanitize(
    opts.testCaseName
  )}`;
  const dir = path.join(COVERAGE_DIR, sanitize(opts.project), folderName);
  fs.mkdirSync(dir, { recursive: true });

  try {
    const frontend = await opts.page.evaluate(
      () => (window as any).__coverage__ || {}
    );
    fs.writeFileSync(
      path.join(dir, 'frontend.json'),
      JSON.stringify(remapCoverage(frontend), null, 2)
    );
  } catch (err) {
    console.warn(
      `[coverage] frontend failed for "${opts.testCaseName}":`,
      err
    );
  }

  try {
    const res = await opts.request.get(COVERAGE_GET_URL);
    if (!res.ok()) {
      throw new Error(`GET coverage returned ${res.status()}`);
    }
    const backend = await res.json();
    fs.writeFileSync(
      path.join(dir, 'backend.json'),
      JSON.stringify(remapCoverage(backend), null, 2)
    );
  } catch (err) {
    console.warn(
      `[coverage] backend failed for "${opts.testCaseName}":`,
      err
    );
  }
}
