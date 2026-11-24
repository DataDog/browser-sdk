import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validatePrTitle } from './check-pr-title.ts'

function assertValid(title: string) {
  assert.deepEqual(validatePrTitle(title), [], `expected "${title}" to be valid`)
}

function assertInvalid(title: string, expectedError: RegExp) {
  const errors = validatePrTitle(title)
  assert.ok(
    errors.some((error) => expectedError.test(error)),
    `expected "${title}" to fail with ${expectedError}, got ${JSON.stringify(errors)}`
  )
}

describe('validatePrTitle', () => {
  it('accepts public types with package scopes', () => {
    assertValid('feat(rum): Add view name API')
    assertValid('fix(rum,logs): Drop empty context')
    assertValid('fix(rum, logs): Drop empty context')
    assertValid('perf(core): Reduce bundle size')
    assertValid('docs(react): Document the router integration')
    assertValid('exp(rum): Collect soft navigations')
  })

  it('accepts internal types with any scope', () => {
    assertValid('ci(e2e): Quarantine flaky test')
    assertValid('chore(deps): Update vite to v8.4')
    assertValid('refactor(rum): Split the view collection')
    assertValid('test(rum,e2e): Cover the view name API')
    assertValid('revert(rum): Add view name API')
  })

  it('accepts the release-please release PR title', () => {
    assertValid('chore(release): v7.17.0')
  })

  it('accepts breaking changes on package scopes', () => {
    assertValid('feat(react)!: Require React 18')
    assertValid('feat(core,js-core)!: Rename the context API')
  })

  it('rejects titles that are not Conventional Commits', () => {
    assertInvalid('✨ Add new feature', /must match/)
    assertInvalid('Add new feature', /must match/)
    assertInvalid('feat(rum):Add view name API', /must match/)
    assertInvalid('', /must match/)
  })

  it('requires a scope', () => {
    assertInvalid('feat: Add view name API', /scope is required/)
    assertInvalid('feat!: Add view name API', /scope is required/)
    assertInvalid('feat(): Add view name API', /scope is required/)
  })

  it('rejects unknown types and scopes', () => {
    assertInvalid('feature(rum): Add view name API', /Unknown type `feature`/)
    assertInvalid('feat(rum-core): Add view name API', /Unknown scope: `rum-core`/)
    assertInvalid('chore(foo,bar): Clean up', /Unknown scopes: `foo`, `bar`/)
  })

  it('rejects public types with internal scopes', () => {
    assertInvalid('fix(e2e): Fix flaky test', /public type and needs package scopes/)
    assertInvalid('feat(rum,ci): Add view name API', /public type and needs package scopes/)
  })

  it('rejects breaking changes on internal scopes or on js-core alone', () => {
    assertInvalid('ci(release)!: Change the release process', /only allowed with package scopes/)
    assertInvalid('refactor(js-core)!: Rename exports', /not allowed with `js-core` alone/)
  })

  it('rejects Jira keys in the title', () => {
    assertInvalid('feat(rum): [RUM-123] Add view name API', /Jira keys are not allowed/)
    assertInvalid('✨ [RUM-123] Add view name API', /Jira keys are not allowed/)
  })

  it('does not mistake other uppercase tokens for Jira keys', () => {
    assertValid('fix(core): Support UTF-8 in ES-2015 targets')
  })

  it('suggests retitling GitHub revert PRs', () => {
    assertInvalid('Revert "feat(rum): Add view name API"', /revert\(scope\)/)
  })

  it('rejects empty descriptions', () => {
    assertInvalid('feat(rum): ', /description is empty/)
  })
})
