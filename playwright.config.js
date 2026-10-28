import { defineConfig } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import process from 'node:process'
const browserCache = path.resolve('../../../outputs/playwright-browsers')
if (fs.existsSync(browserCache)) process.env.PLAYWRIGHT_BROWSERS_PATH ||= browserCache
const evidence = process.env.PLAYWRIGHT_OUTPUT_DIR || 'playwright-report'
const downloads = path.join(os.tmpdir(), 'loanledger-pw-downloads')
fs.mkdirSync(downloads, { recursive: true })
export default defineConfig({
  testDir: './tests/e2e', workers: 1, fullyParallel: false, timeout: 60000,
  outputDir: path.join(evidence, 'artifacts'),
  reporter: [['list'], ['html', { outputFolder: path.join(evidence,'report'), open: 'never' }], ['json', { outputFile: path.join(evidence,'results.json') }]],
  use: { baseURL: process.env.APP_TEST_URL || 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, acceptDownloads: true, launchOptions: { downloadsPath: downloads }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'Chromium', use: { browserName: 'chromium' } }, { name: 'Firefox', use: { browserName: 'firefox' } }, { name: 'WebKit', use: { browserName: 'webkit' } }],
})
