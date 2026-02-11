# Datadog Browser SDK

Browser SDK for collecting Real User Monitoring (RUM) and logging data from web applications.

## Package Manager

This project uses Yarn workspaces (v4.12.0). Never use `npm` or `npx`.

## Key Commands

```bash
# Development server
yarn dev

# Build all packages
yarn build

# build test apps (for E2E and performance testing)
yarn build:apps

# Run unit tests
yarn test:unit

# Run specific test file
yarn test:unit --spec packages/core/src/path/to/feature.spec.ts

# Run tests on a specific seed
yarn test:unit --seed 123

# setup E2E tests (installs Playwright and builds test apps)
yarn test:e2e:init

# Run E2E tests
yarn test:e2e

# Run specific E2E test which names match “unhandled rejections”
yarn test:e2e -g "unhandled rejections"

# Type checking
yarn typecheck

# Linting
yarn lint

# Format code
yarn format
```

## Monorepo Structure

```
packages/
├── core/           # Shared utilities (Observable, configuration, transport)
├── rum-core/       # Core RUM functionality
├── rum/            # Full RUM package
├── rum-slim/       # Lightweight RUM
├── rum-react/      # React integration
├── logs/           # Browser logging
└── worker/         # Web Worker support

developer-extension/ # Chrome DevTools extension

test/
├── apps/            # Test apps for E2E and performance testing
├── e2e/             # Playwright E2E test scenarios
├── performance/     # Performance benchmarking tests
└── unit/            # Karma/Jasmine unit test configuration

scripts/             # Build, deploy, release automation
```

## Critical Patterns

### Test-Driven Development

- Spec files co-located with implementation: `feature.ts` → `feature.spec.ts`
- Use `registerCleanupTask()` for cleanup, NOT `afterEach()`
- Test framework: Jasmine + Karma
- Prefer `collectAsyncCalls(spy, n)` over `waitFor(() => spy.calls.count() > 0)` for waiting on spy calls
- Don't destructure methods from `spy.calls` (e.g., `argsFor`, `mostRecent`) - use `calls.argsFor()` to avoid `@typescript-eslint/unbound-method` errors

## Commit Messages

Use gitmoji conventions (based on actual usage in this repo):

### User-Facing Changes

- ✨ **New feature** - New public API, behavior, event, property
- 🐛 **Bug fix** - Fix bugs, regressions, crashes
- ⚡️ **Performance** - Improve performance, reduce bundle size
- 💥 **Breaking change** - Breaking API changes
- 📝 **Documentation** - User-facing documentation
- ⚗️ **Experimental** - New public feature behind a feature flag

### Internal Changes

- 👷 **Build/CI** - Dependencies, tooling, deployment, CI config
- ♻️ **Refactor** - Code restructuring, architectural changes
- 🎨 **Code structure** - Improve code structure, formatting
- ✅ **Tests** - Add/fix/improve tests
- 🔧 **Configuration** - Config files, project setup
- 🔥 **Removal** - Remove code, features, deprecated items
- 👌 **Code review** - Address code review feedback
- 🚨 **Linting** - Add/fix linter rules
- 🧹 **Cleanup** - Minor cleanup, housekeeping
- 🔊 **Logging** - Add/modify debug logs, telemetry

## Git Workflow

- Branch naming: `<username>/<feature>` (e.g., `john.doe/fix-session-bug`)
- Always branch from `main` unless explicitly decided otherwise
- PR title follows commit message convention (used when squashing to main)
- PR template at `.github/PULL_REQUEST_TEMPLATE.md` - use it for all PRs
