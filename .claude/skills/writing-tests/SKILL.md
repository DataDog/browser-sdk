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

- Test framework: Vitest Browser Mode (config in `test/unit-vitest/`). Import the test functions from Vitest (`import { describe, expect, it, vi } from 'vitest'`), they are not globals. Spec files co-located with implementation: `feature.ts` → `feature.spec.ts`
- Focus tests with `it.only()` / `describe.only()`, skip with `it.skip()` / `describe.skip()`, or at runtime with the test context: `it('...', (ctx) => { if (!supported) ctx.skip() })`
- To port a spec written with the Jasmine API (e.g. from an old branch), run `node scripts/test/jasmine-to-vitest.ts <files or directories>` and fix what it reports
- Use `registerCleanupTask()` for cleanup, NOT `afterEach()`
- Prefer `collectAsyncCalls(spy, n)` over `waitFor(() => spy.mock.calls.length > 0)` for waiting on spy calls
- Mock values/functions: wrap with `mockable()` in source, use `replaceMockable()` or `replaceMockableWithSpy()` in tests (auto-cleanup)

## e2e Tests

- Use E2E tests selectively for critical user journeys or failures that lower-level tests cannot catch.
- Before adding an E2E test, check whether an existing one covers the same workflow. Extend it when the new assertion fits its purpose.
