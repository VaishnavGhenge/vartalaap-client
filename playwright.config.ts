import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    permissions: ['camera', 'microphone'],
    // Provide fake camera/mic streams in headless mode (no hardware needed).
    // The autoplay-policy flag lets remote audio's AudioContext start running
    // without a user gesture, which is necessary for the audio RMS assertion
    // in e2e/helpers/webrtc.ts. Headless mode also defaults to muted audio
    // output (we don't want speakers blasting in CI), so the flag only affects
    // the AudioContext path used for measurement.
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      name: 'signaling',
      command: 'sh ./run.sh',
      cwd: '../vartalaap-server',
      url: 'http://localhost:8080/healthz',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      name: 'frontend',
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
