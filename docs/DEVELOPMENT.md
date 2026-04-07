# Development

## Commit messages and Pull Request titles

Messages should be concise but explanatory. We are using a convention inspired by [gitmoji][1], to
label our Commit messages and Pull Request titles:

### User-facing changes

- 💥 **Breaking change** - Breaking API changes
- ✨ **New feature** - New public API, behavior, event, property
- 🐛 **Bug fix** - Fix bugs, regressions, crashes
- ⚡️ **Performance** - Improve performance, reduce bundle size
- 📝 **Documentation** - User-facing documentation
- ⚗️ **Experimental** - New public feature behind a feature flag

### Internal changes

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

## REF Integration

[rum-events-format](https://github.com/DataDog/rum-events-format) is consumed as a git dependency pinned in `package.json`. Browser-SDK imports the REF TypeScript surface directly and does not commit local copies of REF-owned types.

## Generated Types

```bash
yarn json-schemas:generate  # Regenerate remote configuration types
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

[1]: https://gitmoji.carloscuesta.me/
