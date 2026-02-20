# Codebase Structure

**Analysis Date:** 2026-01-21

## Directory Layout

```
browser-sdk/
├── packages/                # 8 npm packages (monorepo)
│   ├── core/               # Foundation library
│   ├── rum-core/           # RUM business logic
│   ├── rum/                # Full RUM with replay
│   ├── rum-slim/           # Lightweight RUM
│   ├── logs/               # Logs SDK
│   ├── rum-react/          # React integration
│   ├── worker/             # Web worker for compression
│   └── flagging/           # Feature flagging
├── test/                   # Test infrastructure
│   ├── unit/               # Karma unit tests
│   ├── e2e/                # Playwright E2E tests
│   ├── performance/        # Performance benchmarks
│   └── apps/               # Test applications
├── scripts/                # Build and release automation
├── developer-extension/    # Browser DevTools extension
├── rum-events-format/      # JSON schemas (submodule)
├── sandbox/                # Development playground
└── remote-configuration/   # Remote config schemas
```

## Directory Purposes

**packages/core:**

- Purpose: Shared foundation library for all SDK products
- Contains: Browser API wrappers, observables, transport layer, session management, configuration, utilities
- Key files: `src/index.ts` (exports), `src/transport/batch.ts`, `src/domain/session/sessionManager.ts`, `src/browser/xhrObservable.ts`

**packages/rum-core:**

- Purpose: RUM business logic without product-specific features
- Contains: Event collections (views, actions, errors, resources, long tasks, vitals), assembly, contexts, tracing
- Key files: `src/index.ts` (exports), `src/boot/startRum.ts`, `src/domain/lifeCycle.ts`, `src/domain/assembly.ts`

**packages/rum:**

- Purpose: Full RUM SDK with Session Replay and Real User Profiling
- Contains: Public API, recorder integration, profiler integration, deflate encoder
- Key files: `src/entries/main.ts` (entry point), `src/boot/recorderApi.ts`, `src/boot/profilerApi.ts`

**packages/rum-slim:**

- Purpose: Lightweight RUM without replay for smaller bundle size
- Contains: Public API with recorder stub
- Key files: `src/entries/main.ts` (entry point)

**packages/logs:**

- Purpose: Browser log collection SDK
- Contains: Log assembly, log handlers, log context management
- Key files: `src/entries/main.ts` (entry point), `src/domain/logsAssembly.ts`

**packages/rum-react:**

- Purpose: React-specific RUM enhancements
- Contains: Error boundary, React Router integration, performance hooks
- Key files: `src/entries/main.ts`, `src/domain/error/errorBoundary.ts`, `src/domain/reactRouter/index.ts`

**packages/worker:**

- Purpose: Web Worker for background compression
- Contains: Deflate implementation for worker context
- Key files: `src/entries/main.ts`, `src/boot/startWorker.ts`

**packages/flagging:**

- Purpose: Feature flag integration (experimental)
- Contains: Feature flag context management
- Key files: `src/entries/main.ts`

**test/unit:**

- Purpose: Karma-based unit tests
- Contains: Test configuration and fixtures
- Key files: `karma.local.conf.js`, `karma.bs.conf.js`

**test/e2e:**

- Purpose: Playwright end-to-end tests
- Contains: Test scenarios, helpers, test apps
- Key files: `playwright.local.config.ts`, `scenario/rum/`, `scenario/recorder/`

**test/performance:**

- Purpose: Performance benchmarks
- Contains: Profilers, scenarios, reporters
- Key files: `playwright.config.ts`, `scenarios/`, `profilers/`

**test/apps:**

- Purpose: Test applications for E2E and manual testing
- Contains: Vanilla JS, React, React Router test apps
- Key files: `vanilla/`, `react-heavy-spa/`, `react-router-v6-app/`

**scripts:**

- Purpose: Build, release, and deployment automation
- Contains: Package builder, changelog generator, deployment scripts, CLI
- Key files: `build/build-package.ts`, `release/`, `deploy/`, `cli`

**developer-extension:**

- Purpose: Chrome/Firefox DevTools panel for debugging SDK
- Contains: Extension UI, background scripts, content scripts
- Key files: `src/panel/`, `src/background/`, `manifest.json`

**rum-events-format:**

- Purpose: JSON schemas for RUM/Log events (Git submodule)
- Contains: Schema definitions for event validation
- Key files: `schemas/`

## Key File Locations

**Entry Points:**

- `packages/rum/src/entries/main.ts`: Full RUM SDK entry
- `packages/rum-slim/src/entries/main.ts`: Slim RUM SDK entry
- `packages/logs/src/entries/main.ts`: Logs SDK entry
- `packages/rum-react/src/entries/main.ts`: React plugin entry
- `packages/rum-react/src/entries/reactRouterV6.ts`: React Router v6 integration
- `packages/rum-react/src/entries/reactRouterV7.ts`: React Router v7 integration
- `packages/worker/src/entries/main.ts`: Worker entry

**Configuration:**

- `package.json`: Root workspace config
- `lerna.json`: Lerna monorepo config
- `tsconfig.base.json`: Base TypeScript config with path aliases
- `tsconfig.json`: Root TypeScript project config
- `eslint.config.mjs`: ESLint configuration
- `.prettierrc.yml`: Prettier formatting config
- `webpack.base.ts`: Webpack configuration for bundling

**Core Logic:**

- `packages/core/src/index.ts`: Core library exports
- `packages/core/src/tools/observable.ts`: Observable implementation
- `packages/core/src/transport/batch.ts`: Batch transport
- `packages/core/src/domain/session/sessionManager.ts`: Session lifecycle
- `packages/rum-core/src/boot/startRum.ts`: RUM initialization
- `packages/rum-core/src/domain/lifeCycle.ts`: Event bus
- `packages/rum-core/src/domain/assembly.ts`: Event enrichment
- `packages/rum-core/src/boot/rumPublicApi.ts`: Public API builder

**Testing:**

- `test/unit/karma.local.conf.js`: Local unit test runner
- `test/e2e/playwright.local.config.ts`: Local E2E test config
- `packages/*/test/`: Package-specific test files (co-located with `*.spec.ts`)

## Naming Conventions

**Files:**

- `*.ts`: TypeScript source files
- `*.spec.ts`: Unit test files (co-located with source)
- `*.types.ts`: Type definition files
- `index.ts`: Package entry point or barrel file
- `main.ts`: Primary entry point in `entries/` directories
- `*.config.ts`/`*.config.js`: Configuration files

**Directories:**

- `src/`: Source code
- `test/`: Test files
- `domain/`: Domain logic modules
- `boot/`: Initialization/startup code
- `browser/`: Browser API integrations
- `transport/`: Data transmission layer
- `tools/`: Utilities and helpers
- `entries/`: Package entry points
- `contexts/`: Context management modules

## Where to Add New Code

**New RUM Event Type:**

- Primary code: `packages/rum-core/src/domain/{event-type}/`
- Create collection module following pattern in `domain/action/actionCollection.ts`
- Add event type to `rawRumEvent.types.ts` and `rumEvent.types.ts`
- Register in `boot/startRum.ts` to wire up LifeCycle
- Tests: `packages/rum-core/src/domain/{event-type}/*.spec.ts`

**New Browser Observable:**

- Implementation: `packages/core/src/browser/{feature}Observable.ts`
- Export from: `packages/core/src/index.ts`
- Tests: `packages/core/src/browser/{feature}Observable.spec.ts`

**New Context Type:**

- Implementation: `packages/core/src/domain/contexts/{context}Context.ts` or `packages/rum-core/src/domain/contexts/{context}Context.ts`
- Wire up in: `packages/rum-core/src/boot/startRum.ts`
- Tests: Co-located `*.spec.ts` file

**New Transport Feature:**

- Implementation: `packages/core/src/transport/{feature}.ts`
- Export from: `packages/core/src/transport/index.ts`
- Tests: `packages/core/src/transport/{feature}.spec.ts`

**New Configuration Option:**

- Type definitions: `packages/core/src/domain/configuration/configuration.ts` or `packages/rum-core/src/domain/configuration/configuration.ts`
- Validation: Same file, in `validateAndBuildConfiguration()`
- Tests: `*.spec.ts` in same directory

**New Public API Method:**

- For RUM: `packages/rum-core/src/boot/rumPublicApi.ts`
- For Logs: `packages/logs/src/boot/logsPublicApi.ts`
- Add to type definition and implementation
- Export types from package `index.ts`

**Utilities:**

- Shared helpers: `packages/core/src/tools/` (organized by category: `utils/`, `serialisation/`, `stackTrace/`)
- Domain-specific: In relevant domain module directory

## Special Directories

**node_modules:**

- Purpose: Dependency storage (Yarn v4 with PnP)
- Generated: Yes
- Committed: No (.gitignored)

**cjs/ and esm/:**

- Purpose: Compiled output directories for CommonJS and ES modules
- Generated: Yes (by `scripts/build/build-package.ts`)
- Committed: No (build artifacts)

**docs:**

- Purpose: Generated TypeDoc API documentation
- Generated: Yes (by `typedoc`)
- Committed: No

**.planning:**

- Purpose: GSD codebase analysis and planning documents
- Generated: Yes (by /gsd commands)
- Committed: Depends on team workflow

**rum-events-format:**

- Purpose: JSON schemas for event format validation
- Generated: No (Git submodule, external repository)
- Committed: Submodule reference committed

**bundle/:**

- Purpose: Webpack bundled output for CDN distribution
- Generated: Yes (by build scripts)
- Committed: No

**developer-extension/dist:**

- Purpose: Built browser extension
- Generated: Yes
- Committed: No

## Package Internal Structure

Each SDK package follows a consistent structure:

```
packages/{package}/
├── src/
│   ├── entries/          # Entry points (main.ts, internal.ts, etc.)
│   ├── boot/             # Initialization logic
│   ├── domain/           # Business logic modules
│   ├── browser/          # Browser API wrappers (rum-core only)
│   ├── transport/        # Transport layer (if package-specific)
│   └── types/            # Type definitions
├── test/                 # Package-specific test utilities
├── package.json          # Package manifest
└── tsconfig.json         # Package TypeScript config (extends base)
```

**Typical domain module structure:**

- `{feature}Collection.ts`: Main collection logic
- `track{Feature}.ts`: Specific tracking implementations
- `{feature}.types.ts`: Type definitions
- `*.spec.ts`: Unit tests (co-located)

## Build Output Structure

After build, packages contain:

```
packages/{package}/
├── cjs/                  # CommonJS output (Node.js)
│   ├── index.js
│   ├── index.d.ts
│   └── ...
├── esm/                  # ES Module output (bundlers)
│   ├── index.js
│   └── ...
└── bundle/               # Webpack bundle (CDN) - rum/logs only
    └── datadog-{product}.js
```

---

_Structure analysis: 2026-01-21_
