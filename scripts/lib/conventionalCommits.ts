// Conventional Commits convention for PR titles (= squash commits on main), read by release-please to
// compute versions and changelogs. Must stay in sync with docs/DEVELOPMENT.md.

export interface CommitType {
  type: string
  description: string
}

export interface CommitScope {
  scope: string
  description: string
}

/** Types listed in the public changelog sections. They require package scopes. */
export const PUBLIC_TYPES: readonly CommitType[] = [
  { type: 'feat', description: 'New public API, behavior, event or property (minor version)' },
  { type: 'fix', description: 'Bug, regression or crash fix' },
  { type: 'perf', description: 'Performance or bundle size improvement' },
  { type: 'docs', description: 'User-facing documentation' },
  { type: 'exp', description: 'Experimental public feature behind a feature flag' },
]

/** Types listed in the "Internal Changes" changelog section. */
export const INTERNAL_TYPES: readonly CommitType[] = [
  { type: 'build', description: 'Build system, bundling, packaging' },
  { type: 'chore', description: 'Dependencies, configuration, housekeeping' },
  { type: 'ci', description: 'CI config, deployment, release tooling' },
  { type: 'refactor', description: 'Code restructuring without behavior change' },
  { type: 'test', description: 'Add, fix or improve tests' },
  { type: 'style', description: 'Formatting, linting' },
]

export const REVERT_TYPE: CommitType = { type: 'revert', description: 'Revert a previous change' }

/** Scopes naming a published package. */
export const PACKAGE_SCOPES: readonly CommitScope[] = [
  { scope: 'core', description: '@datadog/browser-core' },
  { scope: 'rum', description: '@datadog/browser-rum, browser-rum-core, browser-rum-slim' },
  { scope: 'logs', description: '@datadog/browser-logs' },
  { scope: 'worker', description: '@datadog/browser-worker' },
  { scope: 'react', description: '@datadog/browser-rum-react' },
  { scope: 'angular', description: '@datadog/browser-rum-angular' },
  { scope: 'vue', description: '@datadog/browser-rum-vue' },
  { scope: 'nextjs', description: '@datadog/browser-rum-nextjs' },
  { scope: 'nuxt', description: '@datadog/browser-rum-nuxt' },
  { scope: 'shopify', description: '@datadog/browser-rum-shopify' },
  { scope: 'debugger', description: '@datadog/browser-debugger' },
  { scope: 'wasm', description: '@datadog/browser-plugin-wasm' },
  { scope: 'js-core', description: '@datadog/js-core' },
  { scope: 'extension', description: 'Browser SDK developer extension' },
]

/** Scopes for repository internals. They require internal types. */
export const INTERNAL_SCOPES: readonly CommitScope[] = [
  { scope: 'ci', description: 'CI and deployment' },
  { scope: 'deps', description: 'Dependencies' },
  { scope: 'e2e', description: 'E2E tests' },
  { scope: 'benchmark', description: 'Performance benchmarks' },
  { scope: 'test', description: 'Unit test setup' },
  { scope: 'sandbox', description: 'Local dev sandbox' },
  { scope: 'scripts', description: 'Repository scripts' },
  { scope: 'release', description: 'Release process' },
  { scope: 'repo', description: 'Repository setup, docs, agents' },
]
