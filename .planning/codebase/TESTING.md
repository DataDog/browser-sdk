# Testing Patterns

**Analysis Date:** 2026-01-21

## Test Framework

**Runner:**

- Karma 6.4.4
- Config: `test/unit/karma.base.conf.js`, `test/unit/karma.local.conf.js`, `test/unit/karma.bs.conf.js`

**Assertion Library:**

- Jasmine 3.99.1 (built-in with Karma)

**Run Commands:**

```bash
yarn test                       # Run unit tests in watch mode
yarn test:unit                  # Run all unit tests once
yarn test:unit:watch            # Run tests in watch mode
yarn test:unit:bs               # Run tests on BrowserStack
yarn test:e2e                   # Run E2E tests with Playwright
yarn test:e2e:init              # Build and prepare E2E tests
```

## Test File Organization

**Location:**

- Co-located with source files: `packages/*/src/**/*.spec.ts`
- Dedicated test utilities: `packages/core/test/**/*.ts`
- E2E tests: `test/e2e/**/*.ts` (Playwright)
- Performance tests: `test/performance/**/*.ts`

**Naming:**

- Unit tests: `*.spec.ts` or `*.spec.tsx` (React components)
- Test helpers: camelCase without `.spec` suffix (e.g., `mockClock.ts`, `fakeSessionStoreStrategy.ts`)

**Structure:**

```
packages/core/
├── src/
│   ├── domain/
│   │   ├── session/
│   │   │   ├── sessionStore.ts
│   │   │   └── sessionStore.spec.ts       # Co-located test
│   └── tools/
│       ├── observable.ts
│       └── observable.spec.ts
└── test/
    ├── index.ts                            # Barrel export of utilities
    ├── emulate/
    │   ├── mockClock.ts                    # Test utility
    │   └── mockFetch.ts
    └── wait.ts
```

## Test Structure

**Suite Organization:**

```typescript
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { functionToTest } from './moduleUnderTest'

describe('module name', () => {
  let clock: Clock
  let dependency: jasmine.Spy

  beforeEach(() => {
    clock = mockClock()
    dependency = jasmine.createSpy('dependency name')
  })

  afterEach(() => {
    // Cleanup handled automatically by registerCleanupTask
  })

  describe('nested feature', () => {
    it('should do something specific', () => {
      const result = functionToTest()
      expect(result).toBe(expectedValue)
    })

    it('should handle edge case', () => {
      // Test implementation
    })
  })
})
```

**Patterns:**

- Use `describe()` to group related tests by module/feature
- Nested `describe()` blocks for sub-features or scenarios
- `beforeEach()` for test setup
- `afterEach()` for cleanup (though `registerCleanupTask` auto-cleanup is preferred)
- One assertion focus per `it()` block when possible

## Mocking

**Framework:** Jasmine spies (built-in)

**Patterns:**

**Spy Creation:**

```typescript
// Basic spy
const callback = jasmine.createSpy('callback name')
expect(callback).toHaveBeenCalled()

// Spy on existing object method
const displaySpy = spyOn(display, 'error')
expect(displaySpy).toHaveBeenCalledWith('message', error)

// Spy with return value
const mockFunction = jasmine.createSpy('fn').and.returnValue(42)

// Spy with callback
const mockWithCallback = jasmine.createSpy('fn').and.callFake((arg) => {
  return arg * 2
})

// Spy on object property
spyOn(performance, 'now').and.callFake(() => Date.now() - timeOrigin)
```

**Clock Mocking:**

```typescript
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'

beforeEach(() => {
  clock = mockClock()
})

it('advances time', () => {
  const startTime = clock.relative(0)
  clock.tick(1000)
  const endTime = clock.relative(1000)
})
```

**XHR/Fetch Mocking:**

```typescript
import { mockFetch } from '@datadog/browser-core/test'

const fetch = mockFetch()
// Fetch will return controlled responses
```

**Event Target Mocking:**

```typescript
import { mockEventTarget } from '@datadog/browser-core/test'

const eventTarget = mockEventTarget()
eventTarget.addEventListener('click', handler)
```

**What to Mock:**

- External dependencies (APIs, browser APIs)
- Time-dependent functions (use `mockClock()`)
- Global objects that change state
- Callbacks to verify invocation
- Browser APIs not available in test environment

**What NOT to Mock:**

- Pure utility functions
- Simple data transformations
- Type definitions
- Constants
- Internal implementation details of the module under test

## Fixtures and Factories

**Test Data:**

```typescript
// Inline fixture data
const FAKE_CSP_VIOLATION_EVENT = {
  type: 'securitypolicyviolation',
  // ... properties
}

// Factory functions for test data
function createFakeSessionStoreStrategy(): SessionStoreStrategy {
  return {
    persistSession: jasmine.createSpy('persistSession'),
    retrieveSession: jasmine.createSpy('retrieveSession'),
    expireSession: jasmine.createSpy('expireSession'),
  }
}

// Test builders
function buildLocation(url: string): Location {
  const urlObject = new URL(url)
  return {
    href: urlObject.href,
    pathname: urlObject.pathname,
    // ... other properties
  }
}
```

**Location:**

- Shared fixtures in `packages/core/test/` directory
- Inline fixtures for test-specific data
- Factory functions prefixed with `create*`, `build*`, `fake*`, or `mock*`

## Coverage

**Requirements:** Not explicitly enforced (no minimum threshold configured)

**View Coverage:**

```bash
# Coverage is collected via karma-coverage-istanbul-reporter
# Reports generated in coverage/ directory when tests run
yarn test:unit
```

**Configuration:**

- Istanbul coverage via `@jsdevtools/coverage-istanbul-loader`
- Configured in `test/unit/karma.base.conf.js`
- Coverage for source files only (excludes test files)

## Test Types

**Unit Tests:**

- Scope: Individual functions, modules, and classes
- Located: Co-located with source files (`*.spec.ts`)
- Approach: Isolated testing with mocked dependencies
- Fast execution, no external dependencies
- Run via Karma in actual browsers (Chrome by default)

**Integration Tests:**

- Scope: Module interactions within packages
- Approach: Testing multiple modules together with minimal mocking
- Located: Same as unit tests but with broader scope
- Test real observable patterns, event lifecycle, session management flows

**E2E Tests:**

- Framework: Playwright 1.57.0
- Scope: Full browser scenarios, user flows
- Located: `test/e2e/**/*.ts`
- Config: `test/e2e/playwright.local.config.ts`, `test/e2e/playwright.bs.config.ts`
- Run against built test applications

## Common Patterns

**Async Testing:**

```typescript
import { waitNextMicrotask } from '@datadog/browser-core/test'

it('handles async operations', async () => {
  observable.notify('data')

  // Wait for microtask queue to flush
  await waitNextMicrotask()

  expect(observer).toHaveBeenCalledWith('data')
})

// Using done callback (less common)
it('handles callbacks', (done) => {
  asyncOperation(() => {
    expect(result).toBe(expected)
    done()
  })
})
```

**Error Testing:**

```typescript
it('throws error for invalid input', () => {
  expect(() => {
    dangerousFunction(invalidInput)
  }).toThrow()
})

it('catches and handles errors', () => {
  const error = new Error('test error')
  const displaySpy = spyOn(display, 'error')

  functionThatCatchesError(error)

  expect(displaySpy).toHaveBeenCalledWith('Error message', error)
})

// Testing error properties
it('formats error correctly', () => {
  const result = computeRawError({
    originalError: new TypeError('oh snap!'),
    handling: ErrorHandling.HANDLED,
  })

  expect(result.message).toEqual('oh snap!')
  expect(result.type).toEqual('TypeError')
  expect(result.stack).toEqual(jasmine.stringMatching('TypeError: oh snap!'))
})
```

**Observable Testing:**

```typescript
import { Observable } from './observable'

it('notifies subscribers', () => {
  const observable = new Observable<string>()
  const subscriber = jasmine.createSpy('subscriber')

  observable.subscribe(subscriber)
  observable.notify('test data')

  expect(subscriber).toHaveBeenCalledWith('test data')
  expect(subscriber).toHaveBeenCalledTimes(1)
})

it('allows unsubscribe', () => {
  const subscription = observable.subscribe(subscriber)
  subscription.unsubscribe()

  observable.notify('data')
  expect(subscriber).not.toHaveBeenCalled()
})
```

**Parameterized Tests:**

```typescript
;[
  {
    testCase: 'an error instance',
    error: new Error('foo'),
    message: 'foo',
    type: 'Error',
  },
  {
    testCase: 'a string',
    error: 'foo',
    message: 'Provided "foo"',
    type: undefined,
  },
].forEach(({ testCase, error, message, type }) => {
  it(`handles ${testCase}`, () => {
    const result = computeRawError({ originalError: error })
    expect(result.message).toEqual(message)
    expect(result.type).toEqual(type)
  })
})
```

**Jasmine Matchers:**

```typescript
// Common matchers used in codebase
expect(value).toBe(expected) // Strict equality
expect(value).toEqual(expected) // Deep equality
expect(value).toBeDefined()
expect(value).toBeUndefined()
expect(fn).toHaveBeenCalled()
expect(fn).toHaveBeenCalledTimes(3)
expect(fn).toHaveBeenCalledWith(arg1, arg2)
expect(fn).toHaveBeenCalledOnceWith(arg)
expect(str).toMatch(/regex/)
expect(str).toEqual(jasmine.stringMatching('pattern'))
expect(obj).toEqual(jasmine.objectContaining({ key: value }))
expect(value).toEqual(jasmine.any(String))
```

## Test Utilities

**Available in `@datadog/browser-core/test`:**

- `mockClock()` - Mock time and Date functions
- `mockFetch()` - Mock fetch API
- `mockXhr()` - Mock XMLHttpRequest
- `mockEventTarget()` - Create fake event target
- `mockZoneJs()` - Mock Zone.js patched globals
- `mockNavigator()` - Mock navigator object
- `mockEventBridge()` - Mock event bridge for extensions
- `buildLocation(url)` - Create Location object from URL
- `createNewEvent(type)` - Create DOM events
- `waitNextMicrotask()` - Wait for microtask queue
- `registerCleanupTask(fn)` - Auto-cleanup after test
- `collectAsyncCalls(fn)` - Track async function calls
- `interceptRequests()` - Intercept HTTP requests
- `fakeSessionStoreStrategy()` - Mock session storage

**Usage Example:**

```typescript
import { mockClock, registerCleanupTask, waitNextMicrotask } from '@datadog/browser-core/test'

beforeEach(() => {
  const clock = mockClock()
  // Cleanup registered automatically

  registerCleanupTask(() => {
    // Custom cleanup if needed
  })
})
```

## Webpack Configuration

**Test Build:**

- Mode: development
- Module bundling: Each spec gets own bundle (no shared dependencies)
- Source maps: Enabled via `karma-sourcemap-loader`
- TypeScript: Transpiled with `ts-loader` (transpileOnly: true for speed)
- No type checking during test runs (done separately)

## Karma Configuration

**Special Features:**

- Random test execution order (`jasmine.random: true`)
- Stop on first failure (`stopSpecOnExpectationFailure: true`)
- Custom reporters:
  - `jasmine-seed` - Reports random seed for reproducibility
  - `karma-skipped-failed` - Reports skipped/failed tests
  - `karma-duplicate-test-name` - Detects duplicate test names
- Extended timeouts for BrowserStack (60s)
- Suppressed passed/skipped output (only shows failures)

## Best Practices

**Test Organization:**

- Group tests logically with nested `describe()` blocks
- Use descriptive test names that explain behavior
- Keep tests focused on single behavior
- Use `beforeEach()` for common setup

**Assertions:**

- Prefer specific matchers over generic ones
- One logical assertion per test (can have multiple expect calls)
- Use `jasmine.objectContaining()` for partial object matches
- Use `jasmine.any(Type)` for type checking unknown values

**Cleanup:**

- Use `registerCleanupTask()` from test utilities for automatic cleanup
- Unsubscribe from observables in tests
- Clear timers and intervals
- Reset spies if reused

**Performance:**

- Avoid unnecessary waits or delays
- Mock time-dependent code with `mockClock()`
- Keep tests fast (unit tests < 100ms each)
- Use `transpileOnly: true` for faster TypeScript compilation

---

_Testing analysis: 2026-01-21_
