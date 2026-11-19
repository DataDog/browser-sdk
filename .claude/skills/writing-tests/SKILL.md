---
name: writing-tests
description: Use when you write or change unit tests or end-to-end tests in browser-sdk.
---

# Writing tests in browser-sdk

## What to test

- Focus testing on critical paths and complex logic instead of every edge case.

## Naming convention

- Use should <expected behavior> when <condition>, e.g. it('should return link when replay is forced', …). Omit the condition when unnecessary.

## Unit Tests

- Test framework: Jasmine API on Vitest Browser Mode (via a shim in `test/unit-vitest/`), Karma for BrowserStack. Spec files co-located with implementation: `feature.ts` → `feature.spec.ts`
- Focus tests with `fit()` / `fdescribe()`, skip with `xit()` / `xdescribe()`
- Use `registerCleanupTask()` for cleanup, NOT `afterEach()`
- Prefer `collectAsyncCalls(spy, n)` over `waitFor(() => spy.calls.count() > 0)` for waiting on spy calls
- Don't destructure methods from `spy.calls` (e.g., `argsFor`, `mostRecent`) - use `calls.argsFor()` to avoid `@typescript-eslint/unbound-method` errors
- Mock values/functions: wrap with `mockable()` in source, use `replaceMockable()` or `replaceMockableWithSpy()` in tests (auto-cleanup)

## e2e Tests

- Use E2E tests selectively for critical user journeys or failures that lower-level tests cannot catch.
- Before adding an E2E test, check whether an existing one covers the same workflow. Extend it when the new assertion fits its purpose.
