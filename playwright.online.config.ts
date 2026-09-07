import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8787';
export default defineConfig({
  ...base,
  testMatch: '**/online/*.spec.ts',
  testIgnore: [],
  timeout: 90_000,
  use: { ...base.use, baseURL },
  projects: base.projects,
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1' ? undefined : {
    command: 'npm run cf:dev', url: `${baseURL}/api/health`, reuseExistingServer: false, timeout: 60_000,
  },
});
