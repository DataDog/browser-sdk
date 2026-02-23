# End-to-End Testing

E2E tests use Playwright to test the SDK in real browser environments.

## Running E2E Tests

```bash
# First time setup (builds packages, apps, installs or updates Playwright browsers)
yarn test:e2e:init

# Run E2E tests locally
yarn test:e2e

# Run tests matching specific pattern
yarn test:e2e -g "unhandled rejections"
```

**Important**: `yarn test:e2e` does not build the SDK automatically. Run `yarn build:bundle` if you have made changes to the source code and `yarn build:apps` to rebuild the test Apps (because some of them are bundled with the SDK).

## Test Apps

Located in `test/apps/`:

### E2E Test Apps

```
test/apps/
├── vanilla/              # Plain JavaScript app for basic E2E tests
├── react-router-v6-app/  # React Router v6 integration tests
└── base-extension/       # Browser extension testing
```

### Generated Test Apps

Running `yarn build:apps` generates additional test apps from the source apps:

```
test/apps/ (generated)
├── react-router-v7-app/   # Generated from react-router-v6-app with RR v7
├── cdn-extension/         # Generated from base-extension (CDN variant)
└── appendChild-extension/ # Generated from base-extension (appendChild variant)
```

**Note**: Generated apps are not checked into Git.

E2E test apps are served by the dev server and loaded in Playwright tests.

## Test Organization

### File Naming Convention

All E2E test files follow this pattern:

- Located in `test/e2e/scenario/` directory (or subdirectories)
- Named with `.scenario.ts` suffix
- Examples:
  - `test/e2e/scenario/logs.scenario.ts`
  - `test/e2e/scenario/rum/errors.scenario.ts`
  - `test/e2e/scenario/recorder/shadowDom.scenario.ts`

### Configuration Files

- `playwright.local.config.ts` - Local development
- `playwright.bs.config.ts` - BrowserStack cloud testing
- `playwright.base.config.ts` - Base configuration

## Writing E2E Tests

### Test Structure

E2E tests use a custom `createTest()` builder pattern instead of raw Playwright:

```typescript
import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('feature name', () => {
  createTest('should track user interactions')
    .withRum() // Initialize RUM SDK
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Interact with page
      await page.click('button')

      // Wait for SDK to flush events
      await flushEvents()

      // Assert on captured events
      expect(intakeRegistry.rumEvents).toHaveLength(1)
      expect(intakeRegistry.rumEvents[0].type).toBe('action')
    })
})
```

### Key `createTest()` Methods

**SDK Configuration:**

- `.withRum(config?)` - Initialize RUM SDK with optional config
- `.withLogs(config?)` - Initialize Logs SDK with optional config
- `.withRumSlim()` - Also test with rum-slim variant
- `.withWorker(worker)` - Test with Service Worker (pass a `createWorker()` builder)

**Custom Initialization:**

- `.withRumInit(fn)` - Custom RUM initialization logic
- `.withLogsInit(fn)` - Custom Logs initialization logic

**Page Customization:**

- `.withHead(html)` - Add content to `<head>`
- `.withBody(html)` - Add content to `<body>`
- `.withReactApp(name)` - Use a React test app
- `.withExtension(ext)` - Test with browser extension

**Configuration:**

- `.withRemoteConfiguration(config)` - Simulate remote config
- `.withEventBridge()` - Enable event bridge (for mobile/React Native)
- `.withBasePath(path)` - Change base URL path

### Test Setups

By default, each test runs with multiple SDK integration setups:

- **CDN** - SDK loaded via `<script>` tag (CDN bundle)
- **npm** - SDK imported as ES module (npm package)

This ensures the SDK works correctly in both integration methods. Tests appear as multiple test cases in the Playwright UI.

To use only one setup (not recommended):

```typescript
createTest('should work with custom setup')
  .withRum()
  .withSetup(cdnSetup) // Only test CDN setup
  .run(async ({ intakeRegistry, flushEvents }) => {
    // Test code
  })
```

### Test Context

The `.run()` callback receives a `TestContext` object:

```typescript
{
  // Event capture
  intakeRegistry: IntakeRegistry  // Captured SDK events
  flushEvents: () => Promise<void>  // Wait for SDK to flush

  // Playwright objects
  page: Page
  browserContext: BrowserContext
  browserName: 'chromium' | 'firefox' | 'webkit' | 'msedge'

  // Test servers
  servers: Servers
  baseUrl: string

  // Browser logs
  withBrowserLogs: (cb) => void  // Access browser console logs
  flushBrowserLogs: () => void   // Clear browser logs

  // Utilities
  deleteAllCookies: () => Promise<void>
  sendXhr: (url, headers?) => Promise<string>
  evaluateInWorker: (fn) => Promise<void>  // Execute code inside the service worker
  getExtensionId: () => Promise<string>
}
```

### Common Patterns

#### Checking Captured Events

```typescript
createTest('should send logs')
  .withLogs()
  .run(async ({ intakeRegistry, flushEvents, page }) => {
    await page.evaluate(() => {
      window.DD_LOGS!.logger.log('hello')
    })

    await flushEvents()

    // Check captured events
    expect(intakeRegistry.logsEvents).toHaveLength(1)
    expect(intakeRegistry.logsEvents[0].message).toBe('hello')
  })
```

#### Console Logs Validation

```typescript
createTest('should display logs in console when using console handler')
  .withLogs()
  .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
    await page.evaluate(() => {
      window.DD_LOGS!.logger.setHandler('console')
      window.DD_LOGS!.logger.warn('hello')
    })

    await flushEvents()

    // Check console logs
    withBrowserLogs((logs) => {
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('warning')
      expect(logs[0].message).toEqual(expect.stringContaining('hello'))
    })
  })
```

**Note**: The test teardown automatically validates that there are no console errors. Use `withBrowserLogs()` to check for specific warning messages or console output.

#### Conditional Tests

```typescript
createTest('should work in chromium only')
  .withRum()
  .run(async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium-only feature')

    // Test chromium-specific behavior
  })
```

### Service Worker Testing

Use `createWorker()` to configure a service worker with SDK products:

```typescript
import { createTest, createWorker } from '../lib/framework'

createTest('worker with logs')
  .withWorker(createWorker().withLogs({ forwardConsoleLogs: 'all' }))
  .run(async ({ evaluateInWorker, flushEvents, intakeRegistry }) => {
    await evaluateInWorker(() => {
      DD_LOGS!.logger.log('hello from worker')
    })
    await flushEvents()
    expect(intakeRegistry.logsEvents[0].message).toBe('hello from worker')
  })
```

- `createWorker({ importScripts: true })` - Use `importScripts` instead of ES modules
- `.withLogs(config?)` - Initialize Logs SDK in the worker
- `.withRum(config?)` - Initialize RUM SDK in the worker
- `evaluateInWorker(fn)` - Execute a function inside the service worker scope
- ESM workers only work in Chromium; use `test.skip` for other browsers

### IntakeRegistry

The `intakeRegistry` object captures all events sent by the SDK:

```typescript
intakeRegistry.rumEvents // All RUM events
intakeRegistry.rumViewEvents // View events
intakeRegistry.rumActionEvents // Action events
intakeRegistry.rumErrorEvents // Error events
intakeRegistry.rumResourceEvents // Resource events
intakeRegistry.rumLongTaskEvents // Long task events

intakeRegistry.logsEvents // All log events

intakeRegistry.telemetryEvents // Telemetry events
intakeRegistry.telemetryErrorEvents // Telemetry errors

intakeRegistry.rumRequests // Raw HTTP requests (RUM)
intakeRegistry.logsRequests // Raw HTTP requests (Logs)
```

### Test Isolation

Each test automatically:

- Starts with a fresh page
- Clears cookies between tests
- Flushes events after test completion
- Validates no telemetry errors occurred
- Validates no console errors occurred
- Validates RUM event format

## Best Practices

### Better Assertions

```typescript
// ✅ Good - shows actual array content on failure
expect([1, 2, 3]).toHaveLength(3)

// ❌ Less helpful - only shows length mismatch
expect([1, 2, 3].length).toBe(3)
```

## Common Pitfalls

❌ **Don't** use `page.waitForRequest()` - use `intakeRegistry` instead  
❌ **Don't** forget `await flushEvents()` before checking `intakeRegistry`  
❌ **Don't** test SDK internals - test observable behavior (captured events)  
❌ **Don't** use `.withRumInit()` AND `.withRum()` config together (init overrides config)  
❌ **Don't** create tests without the `.scenario.ts` suffix

✅ **Do** use `createTest()` builder pattern  
✅ **Do** use `intakeRegistry` to check captured events  
✅ **Do** test real user workflows  
✅ **Do** validate event structure and content  
✅ **Do** check browser logs with `withBrowserLogs()`  
✅ **Do** use `test.skip()` for browser-specific tests
