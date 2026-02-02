# Scripts and Automation

The `scripts/` directory contains TypeScript scripts for CI automation and developer tools.

## Directory Structure

```
scripts/
├── build/           # Build automation
├── deploy/          # Deployment (CI only)
├── performance/     # Performance benchmarking (CI only)
├── release/         # Release automation (CI only)
├── test/            # Test infrastructure (CI only)
└── lib/             # Shared utilities
```

**Pattern**: Each subdirectory has a `lib/` folder for domain-specific utilities.

## Writing Scripts

### TypeScript & Node.js Version

Scripts run on the **latest Node.js version** (see `volta.node` in `package.json`):

- Use modern TypeScript and latest Node.js APIs
- Prefer built-in Node.js modules over dependencies
- Always use `node:` prefix for Node.js imports

```typescript
// ✅ Good - built-in Node.js APIs
import { globSync } from 'node:fs'
import { parseArgs } from 'node:util'
import * as path from 'node:path'

// ❌ Bad - unnecessary dependencies
import glob from 'glob'
import minimist from 'minimist'
```

### Basic Structure

All scripts follow this pattern:

```typescript
import { printLog, runMain } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'

runMain(async () => {
  printLog('Starting task...')

  // Script logic here
  command`yarn build`.run()

  printLog('Task completed.')
})
```

**Key conventions:**

- Use `runMain()` wrapper for proper async handling and error reporting
- Use `printLog()` for console output
- Use `command` template literal for shell commands
- Import with `.ts` extension (required for Node.js ESM)

## Testing Scripts

Scripts can have spec files using Node.js built-in test runner:

```typescript
// deploy.spec.ts
import { test } from 'node:test'
import assert from 'node:assert'

test('should deploy to staging', () => {
  // Test logic
  assert.strictEqual(actual, expected)
})
```

```
scripts/deploy/
├── deploy.ts
└── deploy.spec.ts  # Tests using node:test
```

Run script tests:

```bash
yarn test:script
```

## Shared Utilities (`scripts/lib/`)

Core utilities available to all scripts:

- `executionUtils.ts` - `runMain()`, `printLog()`, error handling
- `command.ts` - Shell command builder with fluent API
- `filesUtils.ts` - File operations (read, write, modify, iterate)
- `gitUtils.ts` - Git operations (branches, tags, commits, PRs)
- `buildEnv.ts` - Detect environment (CI, local, staging, production)
- `datacenter.ts` - Datadog datacenter configuration
- `packagesDirectoryNames.ts` - Package directory listing
