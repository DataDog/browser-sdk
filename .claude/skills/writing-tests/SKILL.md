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

- Test framework: Jasmine API on Vitest Browser Mode (via a shim in `test/unit-vitest/`). Spec files co-located with implementation: `feature.ts` → `feature.spec.ts`
- Focus tests with `fit()` / `fdescribe()`, skip with `xit()` / `xdescribe()`
- Specs are being migrated from the Jasmine API to the Vitest API. Write new specs with the Vitest API (`import { describe, expect, it, vi } from 'vitest'`), unless they depend on a test helper that still returns Jasmine spies. Convert existing specs with `node scripts/test/jasmine-to-vitest.ts <files or directories>`, fix what it reports, then add the paths to `VITEST_API_SPEC_FILES` in `eslint.config.ts`
- Use `registerCleanupTask()` for cleanup, NOT `afterEach()`
- Prefer `collectAsyncCalls(spy, n)` over `waitFor(() => spy.calls.count() > 0)` for waiting on spy calls
- Don't destructure methods from `spy.calls` (e.g., `argsFor`, `mostRecent`) - use `calls.argsFor()` to avoid `@typescript-eslint/unbound-method` errors
- Mock values/functions: wrap with `mockable()` in source, use `replaceMockable()` or `replaceMockableWithSpy()` in tests (auto-cleanup)

## e2e Tests

- Use E2E tests selectively for critical user journeys or failures that lower-level tests cannot catch.
- Before adding an E2E test, check whether an existing one covers the same workflow. Extend it when the new assertion fits its purpose.
