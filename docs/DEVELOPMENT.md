# Development

## Commit messages and Pull Request titles

PRs are squash-merged, so the PR title becomes the commit on `main`. [release-please][1] reads these
commits to compute the next version and the changelog, so PR titles follow [Conventional Commits][2]
with a **mandatory scope**:

```
type(scope[,scope])[!]: Description
```

Examples: `feat(rum): Add view name API` · `fix(rum,logs): Drop empty context` ·
`ci(e2e): Quarantine flaky test` · `chore(deps): Update vite to v8.4`

The "Lint PR title" check (`scripts/check-pr-title.ts`) enforces it. Types and scopes are defined in
`scripts/lib/conventionalCommits.ts`.

### Public types

They appear in the public changelog sections, and require package scopes.

- `feat` - New public API, behavior, event or property (minor version). Making an experimental feature always on is `feat`
- `fix` - Bug, regression or crash fix
- `perf` - Performance or bundle size improvement
- `docs` - User-facing documentation
- `exp` - Experimental public feature behind a feature flag

### Internal types

They appear under "Internal Changes", and accept any scope.

- `build` - Build system, bundling, packaging
- `chore` - Dependencies, configuration, housekeeping
- `ci` - CI config, deployment, release tooling
- `refactor` - Code restructuring without behavior change
- `test` - Add, fix or improve tests
- `style` - Formatting, linting
- `revert` - Revert a previous change (listed under "Reverts"). Retitle GitHub's default `Revert "…"` title

### Scopes

- Package scopes: `core`, `rum` (rum, rum-core, rum-slim), `logs`, `worker`, `react`, `angular`,
  `vue`, `nextjs`, `nuxt`, `shopify`, `debugger`, `wasm`, `js-core`, `extension`
- Internal scopes, only with internal types: `ci`, `deps`, `e2e`, `benchmark`, `test`, `sandbox`,
  `scripts`, `release`, `repo`

A change to an E2E test is `test(e2e): …`, not `fix(e2e): …`.

### Breaking changes

Add `!` after the scope (e.g. `feat(react)!: Require React 18`). It bumps the major version of the
whole Browser SDK, so it is only allowed with package scopes, and not with `js-core` alone. Removing a
public API, even deprecated, is a breaking change.

### Jira tickets

Keep Jira keys out of the title: it becomes the public changelog entry. Instead:

- add a `Refs: RUM-123` line to the PR description;
- put the key in the branch name: `<username>/<JIRA-KEY>-<feature>` (e.g. `john.doe/RUM-123-fix-session-bug`), which links the PR in Jira.

## Dependency Management

### Adding Dependencies

When adding a new dependency, you must update `LICENSE-3rdparty.csv`:

1. Add entry with format: `Component,Origin,License,Copyright`
2. Use `dev` prefix for all devDependencies (including playground)
3. **Do not include version numbers** - list package name only
4. Maintain alphabetical order by package name
5. Fetch license info from GitHub raw LICENSE file

**Example:**

```csv
dev,chokidar,MIT,Copyright (c) 2012 Paul Miller / Elan Shanker
```

### License Information Sources

- Check package repository's LICENSE or package.json
- GitHub: `https://raw.githubusercontent.com/{org}/{repo}/master/LICENSE`
- Extract copyright holder from license file header

### Updating Dependencies

Always use latest stable versions for new dependencies. Check with:

```bash
npm view <package>@latest version
```

## RUM Events Schema Management

Types auto-generated from [rum-events-format](https://github.com/DataDog/rum-events-format) (Yarn GitHub dependency) → `src/rumEvent.types.ts` (committed).

```bash
yarn json-schemas:sync      # Bump @datadog/rum-events-format to latest master commit + regenerate types
yarn json-schemas:generate  # Regenerate types only

# Try a specific branch of rum-events-format (e.g. while iterating on schema changes)
node scripts/json-schemas.ts --update YOUR_RUM_EVENTS_FORMAT_BRANCH --build
```

**Fork dependency**: Uses `bcaudan/json-schema-to-typescript#bcaudan/add-readonly-support` (v11.0.1) for `readonly` modifier support. Built lazily when generating types (not during `yarn install`) to avoid CI rate limiting.

⚠️ Never edit generated types manually.

## TypeScript 3.8.2 compatibility

the CI fails with an error like this:

```
Script exited with error: Error: TypeScript 3.8.2 compatibility compatibility broken
    ...
  node_modules/@datadog/browser-rum-core/cjs/index.d.ts(15,46): error TS1005: ',' expected.
```

Reproduce locally with `yarn test:compat:tsc`.

Check the file mentioned in the error (e.g. `node_modules/@datadog/browser-rum-core/cjs/index.d.ts`). The likely cause is using TypeScript syntax too recent for 3.8.2. For example, combining type and non-type exports on a single line:

```typescript
// ❌ not supported in TS 3.8.2
export { createProfilingContextManager, type ProfilingContextManager } from './domain/contexts/profilingContext'
```

Split into two separate lines:

```typescript
// ✅
export type { ProfilingContextManager } from './domain/contexts/profilingContext'
export { createProfilingContextManager } from './domain/contexts/profilingContext'
```

[1]: https://github.com/googleapis/release-please
[2]: https://www.conventionalcommits.org/
