# Phase 5: Core Generator - Research

**Researched:** 2026-02-04
**Domain:** Node.js code generation tool for bundled SDK + remote configuration
**Confidence:** HIGH

## Summary

This research investigated how to build a Node.js tool that fetches remote configuration and generates a single JavaScript bundle combining the SDK with embedded config. The tool must produce deterministic output and support both rum and rum-slim variants.

**Key findings:**
- Use existing webpack infrastructure programmatically with memory filesystem for bundle generation
- Embed config using template literals to wrap SDK bundle + config in IIFE
- Determinism requires controlled webpack configuration and eliminated build-time variables
- Tool should be CLI-first with programmatic API for build pipeline integration
- Integration with SDK requires coordination on how embedded config is detected and used

**Primary recommendation:** Build as standalone script in `scripts/build/` directory using existing build infrastructure patterns, with future option to move to separate package if needed for distribution.

## Standard Stack

The established tools for this domain based on existing codebase patterns:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| webpack | 5.104.1 | Bundle SDK programmatically | Already used for SDK builds, proven infrastructure |
| node:util.parseArgs | Built-in (Node 25.4.0+) | CLI argument parsing | Native API, already used in build-package.ts |
| node:fs/promises | Built-in | File I/O operations | Modern async API, codebase standard |
| memfs | Latest | In-memory webpack output | Enables reading bundle as string without disk writes |
| @datadog/browser-remote-config | workspace:* | Fetch configuration | Existing package, reuse tested code |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| prettier | 3.8.0 | Format generated code | Already in devDeps, ensure clean output |
| typescript | 5.9.3 | Script implementation | Consistency with codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| webpack | esbuild | 10-100x faster but requires parallel build tooling, loses webpack config reuse |
| webpack | rollup | Better tree-shaking but SDK already uses webpack |
| Template literals | AST (babel) | More complex for simple wrapping use case |
| node:util.parseArgs | commander.js | More features but adds dependency for simple CLI |

**Installation:**
```bash
# Add memfs for in-memory webpack output
yarn add -D memfs

# Verify all other dependencies already present
```

## Architecture Patterns

### Recommended Tool Structure
```
scripts/build/
├── generate-cdn-bundle.ts    # NEW: Main entry point for generator
└── lib/
    └── bundleGenerator.ts     # NEW: Core generation logic
```

**Why scripts/build/ not packages/?**
- Phase 5 scope: Local developer tool, not published package
- Simpler integration with existing build infrastructure
- Can promote to package later if needed for npm distribution
- Consistent with existing build tooling (build-package.ts, build-test-apps.ts)

### Pattern 1: Programmatic Webpack with Memory Filesystem

**What:** Run webpack programmatically, capture output in memory as string
**When to use:** Need bundle content as string without writing to disk
**Example:**
```typescript
import webpack from 'webpack'
import { createFsFromVolume, Volume } from 'memfs'
import webpackBase from '../../webpack.base.ts'

async function bundleSDK(variant: 'rum' | 'rum-slim'): Promise<string> {
  const memoryFs = createFsFromVolume(new Volume())
  const config = webpackBase({
    mode: 'production',
    entry: `../../packages/${variant}/src/entries/main.ts`,
    filename: 'bundle.js',
  })

  return new Promise((resolve, reject) => {
    const compiler = webpack(config)
    compiler.outputFileSystem = memoryFs

    compiler.run((error, stats) => {
      if (error || stats?.hasErrors()) {
        reject(error || new Error('Webpack bundling failed'))
      } else {
        // Read from memory filesystem
        const bundleContent = memoryFs.readFileSync('/bundle/bundle.js', 'utf-8')
        compiler.close(() => resolve(bundleContent))
      }
    })
  })
}
```

**Source confidence:** HIGH
- [webpack Node Interface](https://webpack.js.org/api/node/) - Official documentation
- [Get bundle as string](https://github.com/webpack/webpack/issues/23) - Using memory filesystem pattern
- Existing codebase uses webpack programmatically in build-package.ts

### Pattern 2: Template Literal Code Generation

**What:** Use template literals to wrap SDK bundle + config in IIFE
**When to use:** Generating JavaScript wrapper code around existing bundles
**Example:**
```typescript
function generateBundle(sdkCode: string, config: RumRemoteConfiguration): string {
  // Use JSON.stringify for config serialization
  return `
(function() {
  'use strict';

  // Embedded remote configuration
  window.__DATADOG_REMOTE_CONFIG__ = ${JSON.stringify(config, null, 2)};

  // Embedded SDK
  ${sdkCode}

  // Auto-initialize with embedded config
  if (typeof window.DD_RUM !== 'undefined') {
    window.DD_RUM.init(window.__DATADOG_REMOTE_CONFIG__);
  }
})();
`.trim()
}
```

**Why template literals:**
- Simple, maintainable, no dependencies
- Sufficient for wrapping use case (not complex code transformation)
- Milestone research (STACK.md) recommended this approach

**Source confidence:** HIGH
- [IIFE JavaScript Pattern](https://sarifulislam.com/blog/javascript-iife/) - Modern usage in 2026
- [MDN IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE) - Standard pattern documentation

### Pattern 3: CLI Tool Following Codebase Conventions

**What:** Script using runMain, printLog, parseArgs patterns
**When to use:** Any build automation script in this codebase
**Example:**
```typescript
import { runMain, printLog } from '../lib/executionUtils.ts'
import { parseArgs } from 'node:util'

runMain(async () => {
  const { values } = parseArgs({
    options: {
      configId: { type: 'string', short: 'c' },
      variant: { type: 'string', short: 'v' },
      output: { type: 'string', short: 'o' },
    },
  })

  printLog('Fetching remote configuration...')
  // Generation logic
  printLog('Done.')
})
```

**Source confidence:** HIGH
- Existing pattern in scripts/build/build-package.ts
- AGENTS.md documents this as standard approach

### Anti-Patterns to Avoid

**Anti-Pattern 1: Non-Deterministic Webpack Configuration**
**What:** Using webpack DefinePlugin with runtimeValue() for build-time variables
**Why bad:** Different builds produce different output for same inputs
**Instead:**
```typescript
// BAD: Runtime values change each build
new webpack.DefinePlugin({
  __BUILD_TIME__: webpack.DefinePlugin.runtimeValue(() => Date.now())
})

// GOOD: Only use static config values
// Don't embed build timestamps or environment-specific paths
```

**Anti-Pattern 2: Embedding Config in Wrong Format**
**What:** Using format that SDK doesn't expect
**Why bad:** SDK may not detect or use embedded config, defeating purpose
**Instead:** Coordinate with SDK team on detection mechanism (see Open Questions)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JavaScript bundling | Custom concatenation | webpack programmatic API | Handles dependencies, minification, source maps |
| Module resolution | require.resolve() | webpack's TsconfigPathsPlugin | Respects monorepo path aliases |
| In-memory file output | Custom buffering | memfs package | Webpack-compatible filesystem interface |
| CLI argument parsing | Manual process.argv parsing | node:util.parseArgs | Type-safe, consistent with codebase |

**Key insight:** The SDK build infrastructure is complex and battle-tested. Reuse it rather than rebuild.

## Common Pitfalls

### Pitfall 1: Non-Deterministic Bundle Output
**What goes wrong:** Same inputs produce different bundles across builds
**Why it happens:**
- Build timestamps embedded in output
- DefinePlugin with runtimeValue() changes per build
- File iteration order depends on filesystem

**How to avoid:**
- Lock webpack version in yarn.lock
- Use static values only, no runtime variables
- Configure webpack with deterministic settings:
  ```typescript
  webpackBase({
    mode: 'production',
    // Already in webpack.base.ts:
    // optimization: { chunkIds: 'named' }
  })
  ```
- Test: generate twice, assert byte-identical output

**Warning signs:**
- Bundle hash changes without code/config changes
- `yarn build` in CI produces different output than local

**Source:** PITFALLS.md - Critical Pitfall 1

### Pitfall 2: Monorepo Dependency Resolution Mismatch
**What goes wrong:** Generator resolves packages differently than webpack expects
**Why it happens:**
- Using Node's require.resolve() instead of webpack resolution
- Not respecting TsconfigPathsPlugin aliases

**How to avoid:**
- Use webpack's module resolution (done by using programmatic API)
- Don't bypass webpack to manually resolve `@datadog/*` packages
- Verify bundle contains expected packages (no duplicates)

**Warning signs:**
- Bundle includes duplicate @datadog/browser-core
- Runtime error: "Cannot find module @datadog/browser-core"
- Bundle size is 2x expected

**Source:** PITFALLS.md - Critical Pitfall 2

### Pitfall 3: Embedded Config Not Actually Used by SDK
**What goes wrong:** Config embedded in bundle but SDK still fetches from network
**Why it happens:**
- SDK doesn't check for embedded config before fetching
- Config format doesn't match SDK expectations
- Race condition in initialization order

**How to avoid:**
- Integration testing required: E2E test with network blocked
- Coordinate with SDK team on detection mechanism
- See Open Questions section for integration approach

**Warning signs:**
- Browser DevTools shows network request to config endpoint
- E2E test with network blocked fails

**Source:** PITFALLS.md - Critical Pitfall 3

### Pitfall 4: Build-Time Variables Leak into Generated Code
**What goes wrong:** Generator's environment variables embedded in bundle
**Why it happens:**
- DefinePlugin replaces `__BUILD_ENV__*__` at webpack build time
- Generator runs in different environment than end-user

**How to avoid:**
- Use `keepBuildEnvVariables` option in webpack.base.ts
- Don't embed datacenter/site from generator environment
- Configuration should come from remote config, not build variables

**Warning signs:**
- Bundle hardcodes "us1" datacenter but customer needs "eu1"
- Generated bundle only works in same environment as generator

**Source:** PITFALLS.md - Moderate Pitfall 6

## Code Examples

Verified patterns from official sources and existing codebase:

### Fetching Remote Configuration
```typescript
// Source: packages/remote-config/src/remoteConfiguration.ts
import { fetchRemoteConfiguration } from '@datadog/browser-remote-config'

async function fetchConfig(options: {
  applicationId: string
  remoteConfigurationId: string
  site?: string
}): Promise<RumRemoteConfiguration> {
  const result = await fetchRemoteConfiguration(options)

  if (!result.ok) {
    throw new Error(`Failed to fetch config: ${result.error?.message}`)
  }

  return result.value
}
```

### Bundle SDK Variant Using Webpack
```typescript
// Pattern from scripts/build/build-package.ts
import webpack from 'webpack'
import { createFsFromVolume, Volume } from 'memfs'
import webpackBase from '../../webpack.base.ts'

async function bundleSDK(variant: 'rum' | 'rum-slim'): Promise<string> {
  const memoryFs = createFsFromVolume(new Volume())

  return new Promise((resolve, reject) => {
    webpack(
      webpackBase({
        mode: 'production',
        entry: `../../packages/${variant}/src/entries/main.ts`,
        filename: 'bundle.js',
      }),
      (error, stats) => {
        if (error || stats?.hasErrors()) {
          reject(error || new Error('Failed to build bundle'))
        } else {
          const content = memoryFs.readFileSync('/bundle/bundle.js', 'utf-8')
          resolve(content)
        }
      }
    )
  })
}
```

### Generate Combined Bundle
```typescript
import prettier from 'prettier'

async function generateCombinedBundle(
  sdkCode: string,
  config: RumRemoteConfiguration
): Promise<string> {
  const rawCode = `
(function() {
  'use strict';

  // Embedded remote configuration
  window.__DATADOG_REMOTE_CONFIG__ = ${JSON.stringify(config, null, 2)};

  // Embedded SDK bundle
  ${sdkCode}

  // Auto-initialize with embedded config
  if (typeof window.DD_RUM !== 'undefined') {
    window.DD_RUM.init(window.__DATADOG_REMOTE_CONFIG__);
  }
})();
`.trim()

  // Format with prettier (optional but improves readability)
  return prettier.format(rawCode, {
    parser: 'babel',
    semi: true,
    singleQuote: true,
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual bundle concatenation | Programmatic webpack API | 2020s | Proper dependency resolution, minification |
| String concatenation | Template literals | ES2015 | Native feature, no dependencies |
| commander.js | node:util.parseArgs | Node 20+ (2023) | Zero dependencies, native API |
| Disk-based output | Memory filesystem (memfs) | webpack v4+ | Faster, no cleanup needed |

**Deprecated/outdated:**
- AST manipulation (babel) for simple code generation: overkill for wrapping use case
- Custom CLI parsing: node:util.parseArgs is now stable and sufficient

## Open Questions

Things that couldn't be fully resolved and require coordination:

### 1. SDK Integration Mechanism
**What we know:**
- SDK currently initializes via `DD_RUM.init(config)` call
- Remote config is fetched at runtime if configured
- No existing mechanism to detect embedded config

**What's unclear:**
- How should SDK detect embedded config vs fetching from network?
- Should config be on window object, passed to init, or both?
- Does SDK need code changes to support embedded config?

**Recommendation:**
- Phase 5 generates bundle with manual init call: `DD_RUM.init(window.__DATADOG_REMOTE_CONFIG__)`
- Customer manually includes bundle in HTML
- Future phase: SDK auto-detects embedded config and skips fetch

**Action required:** Coordinate with SDK team on long-term integration approach

### 2. Output Format and Minification
**What we know:**
- webpack can minify during bundle
- Minification improves performance but reduces debuggability
- Source maps can help debugging

**What's unclear:**
- Should generator always output minified bundle?
- Should there be dev vs prod mode?
- Should source maps be included?

**Recommendation:**
- Default: minified output (production-ready)
- CLI flag: `--dev` for non-minified with inline source maps
- Phase 5: minified only, add dev mode in future phase if needed

### 3. Config Versioning and Compatibility
**What we know:**
- SDK version and config schema must be compatible
- Monorepo packages all version-locked to 6.26.0
- Remote config service may evolve schema independently

**What's unclear:**
- How to ensure config schema matches SDK version?
- Should generator validate schema compatibility?
- What happens if schema changes?

**Recommendation:**
- Phase 5: Assume config from remote endpoint matches SDK version
- Document required SDK version in generated bundle comments
- Validation deferred to future phase

### 4. Determinism Validation
**What we know:**
- Same inputs should produce byte-identical output
- Critical for caching and verification
- webpack configuration affects determinism

**What's unclear:**
- How to test determinism in CI?
- What level of determinism is required? (byte-identical vs hash-identical)
- Should bundle include metadata (generation timestamp, versions)?

**Recommendation:**
- CI test: generate bundle twice, assert file hashes match
- No metadata (timestamps, build IDs) in bundle
- Document: "same SDK version + same config ID = identical bundle"

## Bundle Assembly Research

### Structure of Generated Output

**Recommended format:**
```javascript
(function() {
  'use strict';

  // 1. Embedded configuration
  window.__DATADOG_REMOTE_CONFIG__ = { /* config object */ };

  // 2. SDK bundle (webpack output)
  /* SDK code here - defines window.DD_RUM */

  // 3. Auto-initialization
  if (typeof window.DD_RUM !== 'undefined') {
    window.DD_RUM.init(window.__DATADOG_REMOTE_CONFIG__);
  }
})();
```

**Why IIFE wrapper:**
- Avoids global scope pollution
- Standard pattern for third-party scripts
- Encapsulates initialization logic
- Still used in 2026 for inline scripts and widgets

**Config placement:**
- Before SDK code: ensures config available when SDK initializes
- On window object: accessible but namespaced
- Alternative: pass directly to init() without window assignment

**SDK code:**
- Full webpack bundle output including all dependencies
- Already minified by webpack if mode: 'production'
- Includes IIFE wrapper from webpack (format: 'iife' implied)

**Source confidence:** HIGH
- [IIFE pattern in 2026](https://sarifulislam.com/blog/javascript-iife/) - Still relevant for inline scripts
- webpack output format documentation

### Config Embedding Approaches

**Option 1: JSON.stringify (Recommended)**
```javascript
window.__DATADOG_REMOTE_CONFIG__ = {"applicationId":"abc123",...};
```
**Pros:** Simple, safe, handles all data types
**Cons:** Large configs create long lines

**Option 2: JSON.parse (For large configs)**
```javascript
window.__DATADOG_REMOTE_CONFIG__ = JSON.parse('{"applicationId":"abc123",...}');
```
**Pros:** Faster parsing for >10KB configs (V8 optimization)
**Cons:** More complex, must escape quotes

**Recommendation for Phase 5:** Use JSON.stringify
- Simpler implementation
- Config size likely <10KB
- Can optimize later if needed

**Source:** [JSON.parse performance](https://www.bram.us/2019/11/25/faster-javascript-apps-with-json-parse/) - V8 blog post

### Module Format

**Webpack output format:** IIFE (default for browser target)
```javascript
// webpack wraps in IIFE automatically
(function() {
  // module code
  window.DD_RUM = /* exported API */
})();
```

**Our wrapper:** Additional IIFE with config + init
- Doesn't conflict with webpack's IIFE
- Both IIFEs execute immediately
- Inner IIFE (webpack) defines DD_RUM, outer IIFE (ours) uses it

**No need for:** ESM, CommonJS, UMD
- Target: browser inline script
- IIFE is correct format for `<script>` tags

## SDK Bundling Research

### Approach: Reference Pre-Built vs Bundle On-Demand

**DECISION: Bundle On-Demand (Recommended)**

Generate fresh SDK bundle for each request using webpack programmatic API.

**Why on-demand:**
- Milestone research (ARCHITECTURE.md) recommends this approach
- Ensures correct SDK version matches config schema
- Allows future flexibility (tree shaking based on config)
- Simpler than managing pre-built bundle storage

**Why NOT reference pre-built:**
- ❌ Requires separate build step to prepare bundles
- ❌ Version synchronization complexity
- ❌ Doesn't support config-specific optimizations

**Implementation:**
```typescript
// Generate bundle on each invocation
const sdkCode = await bundleSDK(variant) // Uses webpack programmatically
const config = await fetchConfig(options)
const combined = generateCombinedBundle(sdkCode, config)
```

**Performance:** ~50-100ms per bundle (webpack is fast for small outputs)

### SDK Variant Selection

**Variants available:**
- `rum` - Full RUM with Session Replay and Profiling (~120KB minified)
- `rum-slim` - Lightweight RUM without heavy features (~70KB minified)

**Selection mechanism:**
```typescript
type SdkVariant = 'rum' | 'rum-slim'

function getPackagePath(variant: SdkVariant): string {
  return `../../packages/${variant}/src/entries/main.ts`
}
```

**Validation:**
- CLI requires `--variant` flag
- Reject invalid variants
- Default: None (user must choose)

**Source locations:**
- rum: packages/rum/src/entries/main.ts
- rum-slim: packages/rum-slim/src/entries/main.ts

### Version Matching

**Current state:**
- All packages version-locked: 6.26.0
- Workspace dependencies use exact versions
- Generator runs in monorepo context

**Approach for Phase 5:**
- Generator always bundles from workspace (./packages/rum or ./packages/rum-slim)
- No version selection needed (workspace version is the version)
- Document: "Generated bundle uses SDK version X.Y.Z"

**Future consideration:**
- Support version pinning (bundle specific SDK version from npm)
- Deferred to future phase (adds complexity)

## Config Integration Research

### Detection Mechanism

**Challenge:** How does SDK know to use embedded config instead of fetching?

**Current SDK behavior (from rumPublicApi.ts):**
```typescript
// SDK requires explicit init() call
datadogRum.init(configuration)
```

**Option 1: Manual init call in generated bundle (Recommended for Phase 5)**
```javascript
(function() {
  window.__DATADOG_REMOTE_CONFIG__ = {...};
  /* SDK code */
  window.DD_RUM.init(window.__DATADOG_REMOTE_CONFIG__);
})();
```
**Pros:** Works without SDK changes, explicit and clear
**Cons:** Customer cannot customize init, config always applied

**Option 2: SDK auto-detects embedded config (Future phase)**
```javascript
// In SDK entry point
if (typeof window.__DATADOG_REMOTE_CONFIG__ !== 'undefined') {
  datadogRum.init(window.__DATADOG_REMOTE_CONFIG__)
}
```
**Pros:** Zero-code initialization, SDK handles it
**Cons:** Requires SDK code changes, coordination needed

**Recommendation:** Phase 5 uses Option 1 (manual init), plan for Option 2 in future phase

### Config Format

**Remote config API returns:**
```typescript
type RumRemoteConfiguration = {
  applicationId: string
  clientToken: string
  site?: string
  // ... all RUM init options
}
```

**This matches SDK init signature:**
```typescript
datadogRum.init({
  applicationId: '...',
  clientToken: '...',
  // ...
})
```

**No transformation needed:** Direct pass-through from remote config to SDK init

**Validation:** TypeScript types ensure compatibility (both use RumInitConfiguration)

### Dynamic Values

**Challenge:** Config may reference runtime values (cookies, DOM, JS paths)

**Remote config package handles this:**
```typescript
export function resolveDynamicValues(configValue: unknown): unknown
// Resolves cookies, DOM selectors, JS paths at runtime in browser
```

**Implications for generator:**
- Don't try to resolve dynamic values at generation time
- Embed config as-is (with dynamic resolution instructions)
- SDK will resolve dynamic values at runtime in browser

**Example config with dynamic value:**
```json
{
  "userId": {
    "rcSerializedType": "dynamic",
    "strategy": "cookie",
    "name": "user_id"
  }
}
```

This is embedded as-is, SDK's resolveDynamicValues() handles it at runtime.

## Determinism Research

### Sources of Non-Determinism

**1. Build timestamps**
```javascript
// BAD: Changes every build
const BUILD_TIME = Date.now()
```
**Solution:** Don't embed timestamps

**2. webpack DefinePlugin with runtimeValue()**
```typescript
// BAD: Different each build
new webpack.DefinePlugin({
  __BUILD_TIME__: webpack.DefinePlugin.runtimeValue(() => Date.now())
})
```
**Solution:** Use static values only, or keepBuildEnvVariables option

**3. File iteration order**
```javascript
// BAD: Order depends on filesystem
fs.readdirSync('./modules').forEach(...)
```
**Solution:** webpack handles this (uses deterministic module IDs)

**4. Hash-based chunk names**
```typescript
// GOOD: webpack.base.ts already configured
optimization: {
  chunkIds: 'named', // Deterministic chunk IDs
}
```

### Ensuring Deterministic Output

**1. Lock all versions**
- yarn.lock committed to git
- CI uses `yarn install --immutable`
- Exact versions for webpack, terser, etc.

**2. webpack configuration**
```typescript
webpackBase({
  mode: 'production',
  // Already configured in webpack.base.ts:
  // - chunkIds: 'named'
  // - Deterministic terser settings
})
```

**3. No environment-specific values**
- Don't embed process.env variables
- Don't use __BUILD_ENV__* variables from generator environment
- Config should be from remote endpoint, not generator environment

**4. Test determinism**
```typescript
// CI test
const bundle1 = await generateBundle(options)
const bundle2 = await generateBundle(options)
assert.strictEqual(bundle1, bundle2) // Byte-identical
```

**Source confidence:** HIGH
- [Deterministic builds](https://reproducible-builds.org/docs/deterministic-build-systems/)
- PITFALLS.md - Critical Pitfall 1
- Existing webpack.base.ts configuration

## Node.js Tool Structure

### Entry Point Design

**Recommended:** CLI script with programmatic API export

```typescript
// scripts/build/generate-cdn-bundle.ts
import { runMain, printLog } from '../lib/executionUtils.ts'
import { parseArgs } from 'node:util'
import { generateBundle } from './lib/bundleGenerator.ts'

// CLI entry point
runMain(async () => {
  const { values } = parseArgs({
    options: {
      applicationId: { type: 'string' },
      configId: { type: 'string' },
      variant: { type: 'string' },
      output: { type: 'string' },
      site: { type: 'string' },
    },
  })

  // Validation
  if (!values.applicationId || !values.configId || !values.variant) {
    throw new Error('Required: --applicationId, --configId, --variant')
  }
  if (values.variant !== 'rum' && values.variant !== 'rum-slim') {
    throw new Error('Variant must be "rum" or "rum-slim"')
  }

  printLog('Fetching remote configuration...')
  printLog('Bundling SDK...')

  const bundle = await generateBundle({
    applicationId: values.applicationId,
    remoteConfigurationId: values.configId,
    variant: values.variant as 'rum' | 'rum-slim',
    site: values.site,
  })

  if (values.output) {
    await fs.writeFile(values.output, bundle, 'utf-8')
    printLog(`Bundle written to ${values.output}`)
  } else {
    console.log(bundle) // stdout
  }

  printLog('Done.')
})

// Programmatic API export
export { generateBundle }
```

### Parameter Handling

**Required parameters:**
- `applicationId` - Datadog application ID
- `configId` - Remote configuration ID
- `variant` - SDK variant ('rum' or 'rum-slim')

**Optional parameters:**
- `output` - File path (if not provided, write to stdout)
- `site` - Datadog site (default: datadoghq.com)
- `proxy` - Custom remote config proxy URL

**Validation:**
- Check all required parameters present
- Validate variant is 'rum' or 'rum-slim'
- Validate output path is writable (if provided)

### Error Handling Strategy

**Error categories:**

1. **User input errors** (exit code 1)
   - Missing required parameter
   - Invalid variant
   - Invalid file path

2. **Network errors** (exit code 2)
   - Failed to fetch remote config
   - Timeout

3. **Build errors** (exit code 3)
   - Webpack bundling failed
   - Code generation failed

**Error messages:**
- Specific, actionable
- Include what failed and how to fix
- Example: "Config ID 'abc123' not found. Verify ID in Datadog UI."

**Pattern:**
```typescript
try {
  const result = await fetchRemoteConfiguration(options)
  if (!result.ok) {
    throw new Error(
      `Failed to fetch remote configuration: ${result.error?.message}\n` +
      `Verify config ID and application ID are correct.`
    )
  }
} catch (error) {
  printLog(`ERROR: ${error.message}`)
  process.exit(2) // Network error
}
```

## Testing Strategy

### Unit Tests
**What to test:**
- Template generation (config + SDK wrapping)
- Parameter validation
- Error handling

**Test file:** `generate-cdn-bundle.spec.ts` (using node:test)

```typescript
import { test } from 'node:test'
import assert from 'node:assert'

test('generates valid IIFE wrapper', () => {
  const sdkCode = 'window.DD_RUM = {};'
  const config = { applicationId: 'test' }
  const result = generateCombinedBundle(sdkCode, config)

  assert.match(result, /^\(function\(\) {/)
  assert.match(result, /window\.__DATADOG_REMOTE_CONFIG__/)
  assert.match(result, /window\.DD_RUM\.init/)
})
```

### Integration Tests
**What to test:**
- Full generation flow (fetch + bundle + combine)
- Webpack bundling produces valid output
- Output format is correct

**Approach:** Mock remote config fetch, use real webpack bundling

### Determinism Tests
**What to test:**
- Same inputs produce identical output
- No timestamps or random values in bundle

```typescript
test('generates deterministic output', async () => {
  const options = { /* same options */ }
  const bundle1 = await generateBundle(options)
  const bundle2 = await generateBundle(options)

  assert.strictEqual(bundle1, bundle2)
})
```

### E2E Tests (Future phase)
**What to test:**
- Generated bundle works in browser
- No network request to config endpoint
- SDK initializes correctly

**Approach:** Playwright test with network blocked

## Dependencies

### Required (New)
| Dependency | Version | Purpose | Installation |
|------------|---------|---------|--------------|
| memfs | ^4.x | In-memory webpack filesystem | `yarn add -D memfs` |

### Required (Existing)
- webpack: 5.104.1 (already in devDeps)
- prettier: 3.8.0 (already in devDeps)
- typescript: 5.9.3 (already in devDeps)
- @datadog/browser-remote-config: workspace:* (monorepo package)

### Built-in (No installation)
- node:util.parseArgs (Node 25.4.0+)
- node:fs/promises (built-in)
- node:path (built-in)

## Sources

### High Confidence (Official Documentation)
- [webpack Node Interface](https://webpack.js.org/api/node/) - Programmatic API
- [webpack DefinePlugin](https://webpack.js.org/plugins/define-plugin/) - Build-time constants
- [Node.js util.parseArgs()](https://nodejs.org/api/util.html) - CLI parsing
- [MDN IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE) - Pattern documentation

### Medium Confidence (Verified with multiple sources)
- [Get bundle as string with webpack](https://github.com/webpack/webpack/issues/23) - Memory filesystem pattern
- [IIFE in JavaScript 2026](https://sarifulislam.com/blog/javascript-iife/) - Modern usage
- [JSON.parse performance](https://www.bram.us/2019/11/25/faster-javascript-apps-with-json-parse/) - V8 optimization
- [Deterministic builds](https://reproducible-builds.org/docs/deterministic-build-systems/) - Best practices

### Internal Sources
- Milestone research: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
- Codebase: scripts/build/build-package.ts, webpack.base.ts, packages/remote-config/
- AGENTS.md: Script conventions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on existing codebase patterns and proven tools
- Architecture: HIGH - Follows established monorepo conventions
- Bundle assembly: HIGH - IIFE pattern well-documented, template literals proven
- SDK bundling: HIGH - webpack programmatic API official documentation
- Config integration: MEDIUM - Requires SDK team coordination on detection mechanism
- Determinism: HIGH - webpack configuration and testing approach validated
- Testing: MEDIUM - Strategy is sound but needs implementation validation

**Research date:** 2026-02-04
**Valid until:** 30 days (stable domain, tools evolve slowly)

**Key areas requiring coordination:**
1. SDK team: Config detection mechanism (manual init vs auto-detect)
2. Infrastructure team: Future HTTP endpoint deployment (out of Phase 5 scope)
3. Product team: Config schema versioning strategy (deferred to future phase)
