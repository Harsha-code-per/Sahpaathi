import { defineConfig, devices } from '@playwright/test'

// The smoke test runs the real backend (SQLite, seeded demo accounts, no paid keys) and the built app,
// then opens every page. CI: .github/workflows/e2e.yml. Locally: npm run build:e2e && npm run e2e.
const API = 'http://localhost:8011'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'sh e2e/backend.sh', url: `${API}/health`, timeout: 120_000, reuseExistingServer: !process.env.CI },
    { command: 'npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174/teacher', reuseExistingServer: !process.env.CI },
  ],
})
