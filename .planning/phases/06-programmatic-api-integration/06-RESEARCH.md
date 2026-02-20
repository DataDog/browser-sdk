# Phase 6: Programmatic API & Integration - Research

**Researched:** 2026-02-04
**Domain:** Programmatic API for build tool integration and SDK runtime configuration embedding
**Confidence:** HIGH

## Summary

This research investigated how to expose Phase 5's generator as a programmatic API for build tool integration, and how the SDK should detect and use embedded configuration at runtime. The API must be simple, flexible, and work seamlessly with webpack, vite, and custom build scripts.

**Key findings:**

- Phase 5 already exports functions that can serve as programmatic API with minimal changes
- API should be a single async function returning Promise<string> (no complex factory patterns needed)
- SDK needs zero or minimal changes: generated bundle already calls DD_RUM.init() with embedded config
- Build tools typically integrate async generators via custom plugins or build hooks
- TypeScript types already exported from bundleGenerator.ts provide excellent DX
- Testing strategy needs E2E browser validation to verify SDK uses embedded config

**Primary recommendation:** Export existing `generateCombinedBundle()` workflow as high-level API function, enhance with validation and types, add E2E tests to verify SDK runtime behavior.

## 1. Programmatic API Design

### Minimal API Surface

**What works best:** Single async function with options object

```typescript
// Recommended API signature
export async function generateBundle(options: GenerateBundleOptions): Promise<string>

export interface GenerateBundleOptions {
  applicationId: string
  remoteConfigurationId: string
  variant: 'rum' | 'rum-slim'
  site?: string
  datacenter?: string
}
```

**Why this pattern:**

- Simple to call: `const bundle = await generateBundle({ ... })`
- Async-by-nature matches the workflow (fetch config + download SDK)
- Options object is extensible (can add new fields without breaking changes)
- No factory or class needed for stateless operation

**Alternative considered (factory pattern):**

```typescript
// NOT RECOMMENDED - adds complexity for no benefit
const generator = createBundleGenerator({ site: 'datadoghq.com' })
const bundle = await generator.generate({ applicationId, configId, variant })
```

**Why rejected:** No shared state needed between calls, factory adds API complexity

**Source confidence:** HIGH

- Phase 5 implementation already has `fetchConfig()`, `downloadSDK()`, `generateCombinedBundle()`
- Pattern matches Node.js ecosystem conventions (single exported function)

### CLI vs API Parameter Alignment

**Recommendation:** API should be MORE flexible than CLI

**CLI parameters:**

```bash
--applicationId, --configId, --variant, --output, --site
```

**API parameters:**

```typescript
interface GenerateBundleOptions {
  // Required (same as CLI)
  applicationId: string
  remoteConfigurationId: string
  variant: 'rum' | 'rum-slim'

  // Optional configuration
  site?: string
  datacenter?: string // NEW: allow custom datacenter (not in CLI)

  // Advanced options (NOT in CLI)
  customCdnUrl?: string // Override CDN URL for testing/air-gapped environments
}
```

**Rationale:**

- CLI optimizes for common use case (flags for most frequent options)
- API optimizes for flexibility (all options available, even advanced ones)
- Build tools may need features CLI users don't (custom CDN URLs, etc.)

### Async Nature Handling

**Recommendation:** Promise-based (async/await)

```typescript
// Good: Modern async/await pattern
const bundle = await generateBundle({ ... })

// Bad: Callback pattern (outdated)
generateBundle({ ... }, (error, bundle) => { ... })

// Bad: Streaming (overkill for single string output)
generateBundle({ ... }).pipe(destination)
```

**Why Promise:**

- Generator workflow is inherently async (fetch config, download SDK)
- Promise/async-await is standard in modern Node.js (v18+)
- Build tools (webpack, vite) already handle promises well
- Simpler error handling with try/catch

**Source confidence:** HIGH

- Existing Phase 5 code already uses async/await throughout
- Node.js ecosystem standard as of 2024+

### Export Strategy

**Recommendation:** Named export (NOT default export)

```typescript
// Good: Named exports
export { generateBundle, type GenerateBundleOptions }

// Usage
import { generateBundle } from '@datadog/browser-remote-config-generator'
```

**Why named exports:**

- Better for tree-shaking in bundlers
- More explicit (clear what's being imported)
- Easier to extend API with additional functions later
- TypeScript types and runtime exports share naming

**Alternative (default export):**

```typescript
// NOT RECOMMENDED
export default generateBundle

// Usage - loses name context
import generateBundle from '@datadog/browser-remote-config-generator'
```

**Source confidence:** HIGH

- JavaScript ecosystem best practice (2024+)
- Existing Phase 5 code uses named exports (`scripts/build/lib/bundleGenerator.ts`)

## 2. SDK Configuration Integration

### Current SDK Initialization Flow

**How SDK currently initializes (from rumPublicApi.ts):**

```typescript
// packages/rum-core/src/boot/rumPublicApi.ts (lines 635-638)
init: (initConfiguration) => {
  const errorStack = new Error().stack
  callMonitored(() => strategy.init(initConfiguration, rumPublicApi, errorStack))
}
```

**How SDK is exposed to browser (from main.ts):**

```typescript
// packages/rum/src/entries/main.ts (lines 86-95)
export const datadogRum = makeRumPublicApi(startRum, recorderApi, profilerApi, {
  startDeflateWorker,
  createDeflateEncoder,
  sdkName: 'rum',
})

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
```

**Current initialization in user code:**

```javascript
// User manually calls init()
window.DD_RUM.init({
  applicationId: 'abc123',
  clientToken: 'xyz789',
  site: 'datadoghq.com',
  // ... other config
})
```

### Embedded Config Detection Strategy

**Phase 5 Implementation (ALREADY WORKING):**

The generated bundle from Phase 5 already handles this:

```javascript
;(function () {
  'use strict'

  // 1. Define embedded config
  var __DATADOG_REMOTE_CONFIG__ = {
    /* config JSON */
  }

  // 2. Load SDK (defines window.DD_RUM)
  /* ... SDK code ... */

  // 3. Auto-initialize with embedded config
  if (typeof window !== 'undefined' && typeof window.DD_RUM !== 'undefined') {
    window.DD_RUM.init(__DATADOG_REMOTE_CONFIG__)
  }
})()
```

**Key insight:** SDK doesn't need to change!

- Generated bundle calls `DD_RUM.init()` with embedded config after SDK loads
- SDK's existing `init()` method accepts configuration object
- No SDK code path changes needed

**Why this works:**

1. SDK bundle defines `window.DD_RUM` when executed
2. IIFE continues execution immediately after SDK loads
3. Auto-init code calls `DD_RUM.init()` with embedded config
4. SDK initializes normally using provided config (no network fetch)

**Source confidence:** HIGH

- Phase 5 implementation already generates this pattern
- SDK's `init()` method accepts any RumInitConfiguration object
- No distinction needed between "embedded" vs "manual" config

### SDK Auto-Detection (Future Enhancement)

**Optional future enhancement (NOT needed for Phase 6):**

```typescript
// In SDK entry point (packages/rum/src/entries/main.ts)
// OPTIONAL - NOT REQUIRED FOR PHASE 6

// Auto-detect embedded config
if (typeof window !== 'undefined' && '__DATADOG_REMOTE_CONFIG__' in window) {
  datadogRum.init((window as any).__DATADOG_REMOTE_CONFIG__)
}
```

**Why deferred:**

- Current approach (explicit init call) works perfectly
- SDK change adds complexity and requires coordination
- Customers may want control over when init happens (conditional initialization)
- Phase 6 can succeed without this enhancement

**When to consider:**

- Phase 8 (production hardening) if user feedback indicates need
- If pattern becomes widely adopted and users request it

### Version Mismatch Handling

**Current approach:** No explicit version checking (rely on semver)

**Risks:**

- Config schema from remote endpoint may not match SDK version
- SDK version in generated bundle may be newer/older than config expects

**Mitigation strategy (Phase 6):**

1. **Document SDK version in bundle header** (already done in Phase 5):

   ```javascript
   /**
    * SDK Version: 6.26.0
    */
   ```

2. **Add version to API response** (Phase 6 addition):

   ```typescript
   interface GenerateBundleResult {
     bundle: string
     metadata: {
       sdkVersion: string
       variant: 'rum' | 'rum-slim'
       configId: string
       generatedAt: string // ISO timestamp
     }
   }
   ```

3. **Log warning if version mismatch detected** (SDK enhancement, optional):
   ```typescript
   // In SDK init (optional future enhancement)
   if (config.__sdkVersion && config.__sdkVersion !== SDK_VERSION) {
     display.warn(`Config generated for SDK v${config.__sdkVersion}, running v${SDK_VERSION}`)
   }
   ```

**Phase 6 action:** Return metadata from generateBundle API
**Future action:** SDK runtime validation (deferred to Phase 8)

**Source confidence:** MEDIUM

- Version mismatch is a known issue in SDK ecosystems
- No existing validation in Phase 5 code
- Recommendation based on best practices, not codebase evidence

### Dynamic Values Resolution

**Key requirement:** Dynamic values (cookies, DOM, JS paths) MUST work at runtime

**How remote config handles dynamic values:**

From `packages/remote-config/src/remoteConfiguration.types.ts`:

```typescript
export type DynamicOption =
  | { rcSerializedType: 'dynamic'; strategy: 'js'; path: string; extractor?: SerializedRegex }
  | { rcSerializedType: 'dynamic'; strategy: 'cookie'; name: string; extractor?: SerializedRegex }
  | { rcSerializedType: 'dynamic'; strategy: 'dom'; selector: string; attribute?: string; extractor?: SerializedRegex }
```

**Resolution happens at runtime** in `resolveDynamicValues()`:

```typescript
// packages/remote-config/src/remoteConfiguration.ts (lines 113-146)
export function resolveDynamicValues(configValue: unknown, options = {}): unknown {
  // Recursively resolves cookies, DOM selectors, JS paths
  // Called by SDK at initialization time IN THE BROWSER
}
```

**Implication for Phase 6:**

- Generator should NOT resolve dynamic values (no browser environment)
- Generator should embed dynamic config AS-IS (serialized)
- SDK will resolve at runtime using `resolveDynamicValues()`

**Example embedded config with dynamic values:**

```json
{
  "applicationId": "abc123",
  "user": [
    {
      "key": "id",
      "value": {
        "rcSerializedType": "dynamic",
        "strategy": "cookie",
        "name": "user_id"
      }
    }
  ]
}
```

**At runtime:** SDK's `resolveDynamicValues()` reads cookie `user_id` and sets `user.id`

**Phase 6 verification:** E2E test must verify dynamic values resolve correctly

**Source confidence:** HIGH

- `resolveDynamicValues()` already exists and is tested
- Remote config types explicitly support dynamic values
- Generator just needs to pass through config unchanged

## 3. Build Tool Integration

### Webpack Plugin Pattern

**How webpack plugins typically work:**

```typescript
// Typical webpack plugin pattern
class DatadogBundlePlugin {
  constructor(options) {
    this.options = options
  }

  apply(compiler) {
    compiler.hooks.emit.tapPromise('DatadogBundlePlugin', async (compilation) => {
      // Generate bundle
      const bundle = await generateBundle(this.options)

      // Add to compilation assets
      compilation.assets['datadog-rum-bundle.js'] = {
        source: () => bundle,
        size: () => bundle.length,
      }
    })
  }
}
```

**Usage in webpack.config.js:**

```javascript
const { DatadogBundlePlugin } = require('@datadog/browser-remote-config-generator')

module.exports = {
  plugins: [
    new DatadogBundlePlugin({
      applicationId: 'abc123',
      remoteConfigurationId: 'xyz789',
      variant: 'rum',
    }),
  ],
}
```

**Phase 6 decision:** Do NOT ship webpack plugin

- Users can write their own plugin wrapping `generateBundle()`
- Pattern above is only ~15 lines
- Different use cases want different behaviors (asset name, emit timing, etc.)
- Generic function is more flexible than opinionated plugin

**Source confidence:** MEDIUM

- Based on webpack plugin documentation and common patterns
- No webpack plugins in existing codebase to reference

### Vite Plugin Pattern

**How vite plugins typically work:**

```typescript
// Typical vite plugin pattern
function datadogBundlePlugin(options) {
  return {
    name: 'datadog-bundle',
    async buildStart() {
      const bundle = await generateBundle(options)
      // Vite-specific handling
    },
  }
}
```

**Usage in vite.config.js:**

```javascript
import { generateBundle } from '@datadog/browser-remote-config-generator'

export default {
  plugins: [
    {
      name: 'datadog-bundle',
      async buildStart() {
        const bundle = await generateBundle({
          applicationId: 'abc123',
          remoteConfigurationId: 'xyz789',
          variant: 'rum',
        })
        // Emit or inject bundle
      },
    },
  ],
}
```

**Phase 6 decision:** Do NOT ship vite plugin

- Same rationale as webpack: function is more flexible
- Users can easily wrap function in plugin structure
- Vite plugin API is simpler than webpack (users can handle it)

### Raw Node.js Integration

**Simplest integration: Build script**

```typescript
// scripts/build-datadog-bundle.ts
import { generateBundle } from '@datadog/browser-remote-config-generator'
import { writeFile } from 'node:fs/promises'

const bundle = await generateBundle({
  applicationId: process.env.DATADOG_APP_ID,
  remoteConfigurationId: process.env.DATADOG_CONFIG_ID,
  variant: 'rum',
})

await writeFile('./public/datadog-rum.js', bundle)
console.log('Datadog bundle generated')
```

**Usage:**

```bash
# In package.json scripts
"build:datadog": "tsx scripts/build-datadog-bundle.ts"

# Run before main build
npm run build:datadog && npm run build
```

**Phase 6 priority:** This is the PRIMARY use case

- Most flexible approach
- Works with any build tool
- No framework-specific knowledge needed
- Users control exactly when/how bundle is generated

**Source confidence:** HIGH

- This is how Phase 5 CLI already works
- Standard Node.js pattern

### Bundler-Specific Concerns

**Asset Manifests:**

- Generated bundle is a static asset (like any .js file)
- No special handling needed
- If bundler tracks assets, users can register manually

**Source Maps:**

- Downloaded SDK from CDN includes source maps (separate .map file)
- Phase 6: Document how to download and serve .map file
- Future: Option to inline source map in generated bundle

**Content Hashing:**

- Generated bundle is deterministic (same inputs = same output)
- Hash can be computed from bundle content
- Users can add `[contenthash]` to filename if desired

**Code Splitting:**

- Generated bundle is single IIFE (not splittable)
- This is intentional: zero-request initialization goal
- Users who need code splitting should use standard SDK + separate config

**Phase 6 action:** Document these considerations, no code changes needed

**Source confidence:** MEDIUM

- Based on bundler documentation and common patterns
- No specific evidence in codebase

## 4. Error Handling & Validation

### Validation Layers

**Layer 1: API function input validation**

```typescript
export async function generateBundle(options: GenerateBundleOptions): Promise<string> {
  // Required parameters
  if (!options.applicationId) {
    throw new Error('applicationId is required')
  }
  if (!options.remoteConfigurationId) {
    throw new Error('remoteConfigurationId is required')
  }
  if (!options.variant) {
    throw new Error('variant is required')
  }

  // Variant validation
  if (options.variant !== 'rum' && options.variant !== 'rum-slim') {
    throw new Error(`Invalid variant "${options.variant}". Must be "rum" or "rum-slim".`)
  }

  // Site validation (if provided)
  if (options.site && typeof options.site !== 'string') {
    throw new Error('site must be a string')
  }

  // Continue with generation...
}
```

**Layer 2: Remote config fetch validation** (already implemented)

From `scripts/build/lib/bundleGenerator.ts`:

```typescript
const result = await fetchRemoteConfiguration({ ... })
if (!result.ok) {
  throw new Error(
    `Failed to fetch remote configuration: ${result.error?.message}\n` +
    `Verify applicationId "${options.applicationId}" and ` +
    `configId "${options.remoteConfigurationId}" are correct.`
  )
}
```

**Layer 3: SDK download validation** (already implemented)

```typescript
if (res.statusCode === 404) {
  reject(
    new Error(
      `SDK bundle not found at ${cdnUrl}\n` +
        `Check that variant "${variant}" (major version: v${majorVersion}) is correct.\n` +
        `Full SDK version: ${version}`
    )
  )
}
```

**Phase 6 focus:** Add Layer 1 (input validation) to API function

**Source confidence:** HIGH

- Layer 2 and 3 already exist in Phase 5
- Layer 1 is standard API validation pattern

### Error Message Quality

**Good error messages should:**

1. State what went wrong
2. Explain why it failed
3. Suggest how to fix it

**Examples:**

```typescript
// Bad: Cryptic, no context
throw new Error('Invalid config')

// Good: Specific, actionable
throw new Error(
  'Remote configuration not found (HTTP 404).\n' +
    'Verify:\n' +
    '  1. Application ID "abc123" is correct\n' +
    '  2. Configuration ID "xyz789" exists in Datadog UI\n' +
    '  3. Configuration has been published (not in draft state)'
)

// Bad: Technical jargon
throw new Error('ECONNREFUSED: Connection refused')

// Good: User-friendly explanation
throw new Error(
  'Network error: Could not connect to Datadog servers.\n' +
    'Check your internet connection and firewall settings.\n' +
    'If behind a corporate proxy, set the HTTP_PROXY environment variable.'
)
```

**Phase 6 action:** Review and improve all error messages in bundleGenerator.ts

**Source confidence:** HIGH

- Error message quality is software engineering best practice
- Phase 5 already has good error messages (can be enhanced)

### Schema Validation

**Challenge:** Ensure config schema matches SDK expectations

**Current approach:** No explicit schema validation

- Remote config API returns `RumSdkConfig` type
- SDK accepts `RumInitConfiguration` type
- Types are compatible (both defined in codebase)

**Phase 6 enhancement:** Add runtime schema validation

```typescript
import Ajv from 'ajv'

const ajv = new Ajv()
const validateConfig = ajv.compile(RUM_CONFIG_SCHEMA)

export async function generateBundle(options: GenerateBundleOptions): Promise<string> {
  const config = await fetchConfig(options)

  // Validate config against schema
  if (!validateConfig(config)) {
    throw new Error(
      `Invalid configuration schema:\n` +
        validateConfig.errors?.map((e) => `  - ${e.instancePath}: ${e.message}`).join('\n')
    )
  }

  // Continue with generation...
}
```

**Phase 6 decision:** Add schema validation

- Catches issues early (at generation time, not runtime)
- Better error messages for misconfiguration
- Uses existing Ajv library (already in devDependencies)

**Source confidence:** MEDIUM

- Schema validation is best practice
- Ajv already in package.json (line 59)
- No existing schema validation in Phase 5 code

## 5. Testing Strategy

### Unit Tests (Already Done in Phase 5)

**What's tested:**

- `generateCombinedBundle()` produces valid output
- Deterministic output (same inputs = same output)
- Edge cases (empty SDK, special characters, etc.)

**Coverage:** 17 tests in `bundleGenerator.spec.ts`

**Phase 6 additions:**

- Test new validation logic
- Test error messages for invalid inputs
- Test TypeScript types (compilation tests)

### Integration Tests (Partially Done in Phase 5)

**What's tested:**

- CLI argument parsing and validation
- End-to-end CLI workflow (mock network calls)

**Coverage:** 12 tests in `generate-cdn-bundle.spec.ts`

**Phase 6 additions:**

- Test programmatic API function (not just CLI)
- Test API with various option combinations
- Test error handling in programmatic context

### E2E Tests (NEW for Phase 6)

**Critical requirement:** Verify SDK uses embedded config at runtime

**Test scenario:**

```typescript
// test/e2e/scenario/embedded-config.spec.ts
import { test, expect } from '@playwright/test'
import { generateBundle } from '@datadog/browser-remote-config-generator'

test('SDK uses embedded config without network fetch', async ({ page, context }) => {
  // 1. Generate bundle with known config
  const bundle = await generateBundle({
    applicationId: 'test-app',
    remoteConfigurationId: 'test-config',
    variant: 'rum',
  })

  // 2. Block network requests to config endpoint
  await page.route('**/sdk-configuration.datadoghq.com/**', (route) => route.abort())

  // 3. Serve bundle to page
  await page.addScriptTag({ content: bundle })

  // 4. Verify SDK initialized without network fetch
  const ddRum = await page.evaluate(() => window.DD_RUM)
  expect(ddRum).toBeDefined()

  // 5. Verify SDK has embedded config
  const config = await page.evaluate(() => window.DD_RUM.getInitConfiguration())
  expect(config.applicationId).toBe('test-app')

  // 6. Verify no network request made
  // (would have failed in step 2 if SDK tried to fetch)
})
```

**Test scenarios to cover:**

1. Basic initialization (SDK loads and inits)
2. No network fetch (prove zero-request goal)
3. Dynamic values resolve correctly (cookies, DOM, JS paths)
4. Error handling (invalid config, missing SDK)

**Phase 6 priority:** E2E tests are CRITICAL for Phase 6 success

- Unit tests verify code correctness
- E2E tests verify SDK runtime behavior
- Without E2E, we can't prove embedded config actually works

**Source confidence:** HIGH

- Playwright already used for E2E tests (test/e2e/)
- Pattern matches existing E2E test structure
- Network blocking is standard Playwright feature

### Browser Environment Testing

**Test matrix:**

- Chromium (primary target)
- Firefox (compatibility check)
- WebKit (Safari compatibility)

**Why cross-browser:**

- SDK runs in all modern browsers
- Generated bundle must work everywhere
- Dynamic value resolution may behave differently

**Phase 6 scope:** Chromium only

- Other browsers deferred to Phase 8 (distribution & testing)
- Chromium proves core functionality

**Source confidence:** MEDIUM

- Based on existing Playwright config (browsers.conf.js)
- Standard testing practice

### Test Organization

**Recommended structure:**

```
test/
├── unit/
│   └── (existing Karma/Jasmine tests)
├── e2e/
│   └── scenario/
│       ├── embedded-config.spec.ts        # NEW
│       ├── embedded-config-dynamic.spec.ts # NEW
│       └── embedded-config-errors.spec.ts  # NEW
└── (existing test infrastructure)
```

**Phase 6 deliverable:**

- 3 new E2E test files
- ~10-15 new test cases total
- All tests pass in CI

## 6. TypeScript Types

### Strict vs Loose Types

**Recommendation:** Strict types for primary API, loose for advanced use

```typescript
// Strict types for common use case
export interface GenerateBundleOptions {
  applicationId: string
  remoteConfigurationId: string
  variant: 'rum' | 'rum-slim'
  site?: string
  datacenter?: string
}

// Re-export types from remote-config package
export type { RumRemoteConfiguration, RemoteConfigResult } from '@datadog/browser-remote-config'

// Export SDK variant type
export type SdkVariant = 'rum' | 'rum-slim'
```

**Why strict:**

- Better developer experience (autocomplete, type checking)
- Catches errors at compile time (not runtime)
- Self-documenting API

**Why some loose:**

- Advanced users may need flexibility
- Future SDK variants can be added without breaking changes
- Plugin wrappers may need to extend types

**Source confidence:** HIGH

- TypeScript best practices (2024+)
- Phase 5 already exports types from bundleGenerator.ts

### RumRemoteConfiguration Types

**Already exported from @datadog/browser-remote-config:**

```typescript
// packages/remote-config/src/index.ts
export type { RemoteConfiguration, RumRemoteConfiguration, RemoteConfigResult } from './remoteConfiguration'
```

**Phase 6 action:** Re-export these types from generator API

- Users importing generator should get config types too
- Avoids "type-only import" confusion
- Single import for all related types

### Config Options Customization

**Which options should be customizable?**

```typescript
// Recommended: All options customizable
export interface GenerateBundleOptions {
  // Required
  applicationId: string
  remoteConfigurationId: string
  variant: 'rum' | 'rum-slim'

  // Optional with sensible defaults
  site?: string // Default: 'datadoghq.com'
  datacenter?: string // Default: 'us1'

  // Advanced (for testing/air-gapped)
  customCdnUrl?: string // Override SDK download URL
  remoteConfigurationProxy?: string // Already supported by fetchRemoteConfiguration
}
```

**Rationale:**

- Required fields prevent common mistakes
- Optional fields have sensible defaults
- Advanced fields enable edge cases without complicating API

**Source confidence:** HIGH

- Based on Phase 5 implementation
- Follows API design best practices

### Type Export Strategy

**Recommendation:** Export both types and implementation

```typescript
// src/index.ts
export { generateBundle } from './bundleGenerator'
export type { GenerateBundleOptions, SdkVariant, RumRemoteConfiguration, RemoteConfigResult } from './bundleGenerator'
```

**Why export types:**

- TypeScript users get full type checking
- JavaScript users ignore types (no runtime impact)
- Enables type-safe plugin wrappers

**Source confidence:** HIGH

- TypeScript/JavaScript ecosystem standard

## 7. Performance & Caching

### SDK Bundle Caching

**Challenge:** Downloading SDK from CDN is slow (~100KB, ~500ms)

**Current approach (Phase 5):** No caching

- Every `generateBundle()` call downloads SDK fresh
- Acceptable for one-time generation
- Inefficient for repeated calls (build tool watch mode)

**Phase 6 enhancement:** In-memory cache

```typescript
// Simple in-memory cache
const sdkCache = new Map<string, string>()

export async function downloadSDK(options: SdkVariant | DownloadSDKOptions): Promise<string> {
  const cacheKey = `${variant}-${version}-${datacenter}`

  if (sdkCache.has(cacheKey)) {
    return sdkCache.get(cacheKey)!
  }

  const sdkCode = await downloadFromCDN(url)
  sdkCache.set(cacheKey, sdkCode)
  return sdkCode
}
```

**Benefits:**

- 10-100x faster for repeated calls
- No disk I/O needed
- Memory usage: ~100KB per variant (negligible)

**Risks:**

- Cache persists across Node.js process lifetime
- SDK updates won't be reflected until restart
- Not an issue: version is locked in package.json

**Phase 6 decision:** Add in-memory caching

- Low complexity, high value
- Enables watch mode in build tools
- No configuration needed (automatic)

**Source confidence:** MEDIUM

- No existing caching in Phase 5
- Common pattern in build tools
- Simple implementation

### Batch Generation

**Question:** Should API support generating multiple bundles at once?

```typescript
// Batch API (considered for Phase 6)
export async function generateBundles(
  options: GenerateBundleOptions[]
): Promise<string[]>

// Usage
const bundles = await generateBundles([
  { variant: 'rum', applicationId: 'app1', ... },
  { variant: 'rum-slim', applicationId: 'app2', ... },
])
```

**Phase 6 decision:** Do NOT implement batch API

- Single-bundle generation is sufficient
- Users can parallelize with `Promise.all()` if needed
- Adds API complexity for rare use case
- Can be added later if demand emerges

**Alternative (user-side batching):**

```typescript
const bundles = await Promise.all([
  generateBundle({ variant: 'rum', ... }),
  generateBundle({ variant: 'rum-slim', ... }),
])
```

**Source confidence:** MEDIUM

- Based on API design principles (YAGNI - You Aren't Gonna Need It)
- No evidence of batch use case in requirements

### Memory Usage

**Expected memory footprint:**

- SDK bundle: ~100KB minified
- Config: ~5-10KB JSON
- Generation overhead: ~10-20KB
- Total: ~130KB per bundle

**Phase 6 concern:** Minimal

- Modern Node.js handles 100KB strings easily
- No streaming needed (bundle fits in memory)
- Cache adds ~100KB per variant (still minimal)

**When to optimize:**

- If bundle size exceeds 1MB (not expected)
- If generating thousands of bundles in parallel
- Not a Phase 6 concern

**Source confidence:** HIGH

- Based on actual bundle sizes from Phase 5
- Node.js memory benchmarks

## 8. Documentation & Examples

### Typical Usage Examples

**Example 1: Build script (most common)**

```typescript
// scripts/generate-datadog-bundle.ts
import { generateBundle } from '@datadog/browser-remote-config-generator'
import { writeFile } from 'node:fs/promises'

const bundle = await generateBundle({
  applicationId: process.env.DATADOG_APP_ID!,
  remoteConfigurationId: process.env.DATADOG_CONFIG_ID!,
  variant: 'rum',
})

await writeFile('./public/datadog-rum.js', bundle)
console.log('✓ Datadog bundle generated')
```

**Example 2: Webpack plugin wrapper**

```typescript
// webpack-plugin.ts
import { generateBundle } from '@datadog/browser-remote-config-generator'

class DatadogBundlePlugin {
  constructor(private options: GenerateBundleOptions) {}

  apply(compiler) {
    compiler.hooks.emit.tapPromise('DatadogBundlePlugin', async (compilation) => {
      const bundle = await generateBundle(this.options)
      compilation.assets['datadog-rum-bundle.js'] = {
        source: () => bundle,
        size: () => bundle.length,
      }
    })
  }
}

// webpack.config.js
module.exports = {
  plugins: [
    new DatadogBundlePlugin({
      applicationId: 'abc123',
      remoteConfigurationId: 'xyz789',
      variant: 'rum',
    }),
  ],
}
```

**Example 3: Vite integration**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { generateBundle } from '@datadog/browser-remote-config-generator'
import { writeFile } from 'node:fs/promises'

export default defineConfig({
  plugins: [
    {
      name: 'datadog-bundle',
      async buildStart() {
        const bundle = await generateBundle({
          applicationId: 'abc123',
          remoteConfigurationId: 'xyz789',
          variant: 'rum',
        })
        await writeFile('./public/datadog-rum.js', bundle)
      },
    },
  ],
})
```

**Example 4: CI/CD integration**

```yaml
# .github/workflows/build.yml
- name: Generate Datadog bundle
  run: |
    npx tsx -e "
    import { generateBundle } from '@datadog/browser-remote-config-generator';
    import { writeFile } from 'node:fs/promises';
    const bundle = await generateBundle({
      applicationId: '${{ secrets.DATADOG_APP_ID }}',
      remoteConfigurationId: '${{ secrets.DATADOG_CONFIG_ID }}',
      variant: 'rum'
    });
    await writeFile('./dist/datadog-rum.js', bundle);
    "
```

**Phase 6 deliverable:**

- README.md with all 4 examples
- TypeDoc comments on all exported functions
- Link to Datadog docs for applicationId/configId setup

**Source confidence:** HIGH

- Examples based on common build tool patterns
- Proven patterns from JavaScript ecosystem

### Webpack Documentation

**Key points to document:**

1. **When to generate:** Build time vs runtime

   ```
   Generate during build (recommended):
   - Faster page loads (no runtime fetch)
   - Bundle cached by browser
   - Zero-request initialization

   Generate at runtime (not recommended):
   - Slower page loads (fetch on every visit)
   - Dynamic config changes (if needed)
   ```

2. **Asset handling:**

   ```
   Generated bundle is a static asset:
   - Emit as separate file (datadog-rum-bundle.js)
   - Include in HTML: <script src="/datadog-rum-bundle.js"></script>
   - No need to import from JavaScript modules
   ```

3. **Development vs production:**
   ```
   Development: Generate once, use for all builds
   Production: Generate in CI, commit to repo or deploy
   ```

**Source confidence:** MEDIUM

- Based on webpack best practices
- No webpack-specific code in Phase 5 to reference

### Vite Documentation

**Key points to document:**

1. **Hook timing:**

   ```
   Use buildStart hook (recommended):
   - Runs once per build
   - Fast for development (cached)

   Use configResolved hook (alternative):
   - Runs before buildStart
   - Access to full Vite config
   ```

2. **Public directory:**

   ```
   Output to public/ directory:
   - Vite copies to dist/ automatically
   - No need to emit via plugin API
   ```

3. **HMR (Hot Module Replacement):**
   ```
   Bundle does NOT support HMR:
   - Generated bundle is static (not a module)
   - Changes require full rebuild
   - Acceptable: config rarely changes during development
   ```

**Source confidence:** MEDIUM

- Based on Vite documentation and patterns
- No Vite-specific code in codebase to reference

### Raw Node.js Documentation

**Key points to document:**

1. **Environment variables:**

   ```
   Store credentials in .env file:
   DATADOG_APP_ID=abc123
   DATADOG_CONFIG_ID=xyz789

   Load with dotenv (or native Node.js 20.6+):
   import 'dotenv/config'
   ```

2. **Error handling:**

   ```typescript
   try {
     const bundle = await generateBundle({ ... })
     await writeFile('./output.js', bundle)
   } catch (error) {
     console.error('Failed to generate bundle:', error.message)
     process.exit(1)
   }
   ```

3. **Integration with build process:**
   ```json
   // package.json
   {
     "scripts": {
       "prebuild": "tsx scripts/generate-datadog-bundle.ts",
       "build": "webpack",
       "dev": "concurrently \"tsx --watch scripts/generate-datadog-bundle.ts\" \"webpack serve\""
     }
   }
   ```

**Source confidence:** HIGH

- Standard Node.js patterns
- Matches Phase 5 CLI structure

## Open Questions & Decisions

### 1. Package Publishing Location

**Question:** Where should API be published?

**Option A:** Same package as Phase 5 CLI (`scripts/build/`)

- Pros: Minimal code duplication, already exists
- Cons: Not published to npm, internal use only

**Option B:** New npm package (`@datadog/browser-remote-config-generator`)

- Pros: Public API, semver, npm ecosystem
- Cons: Requires package setup, CI/CD, maintenance

**Phase 6 Decision:** Start with Option A, migrate to Option B in Phase 8

- Phase 6 proves API works
- Phase 8 handles npm publishing and distribution
- No need to publish before API is validated

**Action:** Export API from `scripts/build/lib/bundleGenerator.ts` (already done in Phase 5)

### 2. API Return Type

**Question:** Should API return just string, or metadata too?

**Option A:** Just string

```typescript
async function generateBundle(options): Promise<string>
```

**Option B:** String with metadata

```typescript
interface GenerateBundleResult {
  bundle: string
  metadata: {
    sdkVersion: string
    variant: string
    configId: string
    size: number
  }
}
async function generateBundle(options): Promise<GenerateBundleResult>
```

**Phase 6 Decision:** Option A (just string)

- Simpler API for common use case
- Metadata can be added later without breaking changes (return type becomes union)
- Users can compute size themselves if needed: `bundle.length`

**Future consideration:** Add metadata in Phase 8 if user feedback indicates need

### 3. SDK Runtime Changes

**Question:** Does SDK need code changes to support embedded config?

**Answer:** NO (confirmed by Phase 5 analysis)

- Generated bundle calls `DD_RUM.init()` explicitly
- SDK's existing `init()` method accepts any config object
- No distinction between "embedded" and "manual" config needed

**Phase 6 action:** Verify with E2E tests, no SDK changes required

### 4. Configuration Schema Validation

**Question:** Should generator validate config schema at generation time?

**Arguments for YES:**

- Catches issues early (before deployment)
- Better error messages for misconfiguration
- Prevents runtime errors in production

**Arguments for NO:**

- Adds dependency (Ajv or similar)
- Schema may evolve (maintenance burden)
- SDK already validates at runtime

**Phase 6 Decision:** YES, add basic validation

- Use Ajv (already in devDependencies)
- Validate required fields only (not full schema)
- Defer full schema validation to Phase 8

**Implementation:**

```typescript
// Basic validation
function validateConfig(config: unknown): config is RumRemoteConfiguration {
  return (
    typeof config === 'object' &&
    config !== null &&
    'applicationId' in config &&
    typeof config.applicationId === 'string'
  )
}
```

### 5. Dynamic Config Handling

**Question:** Should generator attempt to resolve dynamic values?

**Answer:** NO (impossible without browser environment)

- Dynamic values (cookies, DOM) don't exist in Node.js
- Generator should pass through config unchanged
- SDK's `resolveDynamicValues()` handles this at runtime

**Phase 6 verification:** E2E test with dynamic config values

### 6. Source Map Support

**Question:** Should generated bundle include source maps?

**Option A:** No source maps (Phase 6)

- Simpler implementation
- Smaller bundle size
- SDK already minified from CDN

**Option B:** Inline source map

```javascript
// Append to generated bundle
//# sourceMappingURL=data:application/json;base64,...
```

**Option C:** Separate .map file

- Best for production (smaller bundle)
- Requires downloading .map from CDN
- More complex implementation

**Phase 6 Decision:** Option A (no source maps)

- Defer to Phase 8 if users request it
- SDK from CDN already minified without maps
- Not critical for initial launch

### 7. Caching Strategy

**Question:** Should SDK downloads be cached?

**Answer:** YES, in-memory cache (Phase 6)

- Fast repeated calls (watch mode)
- No disk I/O
- Invalidates on Node.js restart (acceptable)

**Implementation:** Simple Map with cache key = `${variant}-${version}`

### 8. Error Recovery

**Question:** Should API retry on network failure?

**Arguments for YES:**

- Transient network errors common in CI
- Automatic retry improves reliability

**Arguments for NO:**

- Adds complexity (retry logic)
- Users can implement retry themselves
- Most failures are permanent (404, auth)

**Phase 6 Decision:** NO automatic retry

- Users can wrap API call in retry logic if needed
- Focus on clear error messages instead
- Defer retry logic to Phase 8 if needed

## Dependencies & Constraints

### Required Dependencies (Already Exist)

| Dependency                       | Version      | Purpose       | Source           |
| -------------------------------- | ------------ | ------------- | ---------------- |
| `@datadog/browser-remote-config` | workspace:\* | Fetch config  | Monorepo package |
| `@datadog/browser-core`          | workspace:\* | Core types    | Monorepo package |
| `typescript`                     | 5.9.3        | Type checking | devDependencies  |

### Optional Dependencies (Phase 6 Additions)

| Dependency | Version | Purpose           | When to Add                  |
| ---------- | ------- | ----------------- | ---------------------------- |
| `ajv`      | 8.17.1  | Config validation | Phase 6 (already in devDeps) |

### Node.js Version Constraint

**Minimum:** Node.js 18.19.0 (LTS)

- Required for: native `fetch()`, `node:test`, `util.parseArgs()`
- Codebase standard: Node.js 25.4.0 (latest)
- Phase 6 target: Node.js 18+ (maximum compatibility)

**Source:** package.json volta.node field

### TypeScript Version Constraint

**Version:** TypeScript 5.9.3

- Matches codebase standard
- Supports latest TypeScript features
- Phase 6 action: Ensure API types compile with TS 5.9.3

### Browser SDK Version

**Version:** 6.26.0 (from lerna.json)

- Generator downloads SDK v6 from CDN
- Major version determines CDN URL: `/v6/datadog-rum.js`
- Minor/patch versions don't affect CDN URL

**Phase 6 consideration:** Document version compatibility in README

### Platform Constraints

**Supported:** Linux, macOS, Windows

- API is pure Node.js (platform-independent)
- No platform-specific code

**Not supported:** Browser runtime

- Generator is Node.js only
- Generated bundle is browser-only
- Clear separation of concerns

## Technical Decisions Summary

### Phase 6 Scope (MUST HAVE)

1. Export programmatic API from bundleGenerator.ts
2. Add input validation to API function
3. Add in-memory SDK cache for performance
4. Write E2E tests to verify SDK uses embedded config
5. Add TypeScript types and JSDoc comments
6. Write documentation with webpack/vite/Node.js examples

### Phase 6 Out of Scope (Deferred)

1. Webpack/Vite plugin wrappers (users can write their own)
2. Schema validation (basic validation only in Phase 6)
3. Source map support (deferred to Phase 8)
4. Automatic retry logic (deferred to Phase 8)
5. Batch generation API (YAGNI)
6. npm publishing (Phase 8)

### Key Technical Choices

| Decision     | Choice                 | Rationale                          |
| ------------ | ---------------------- | ---------------------------------- |
| API surface  | Single async function  | Simplest, most flexible            |
| Return type  | Promise<string>        | Matches use case, extensible later |
| Export style | Named exports          | Tree-shaking, clarity              |
| Caching      | In-memory cache        | Fast, no disk I/O                  |
| Validation   | Basic input validation | Catches common errors early        |
| Testing      | E2E with Playwright    | Proves runtime behavior            |
| SDK changes  | None required          | Phase 5 design already works       |

## Success Criteria Validation

From phase context, Phase 6 must achieve:

1. **Node.js function can be imported and called from any build tool**
   - ✅ API is exported async function
   - ✅ Works with webpack, vite, raw Node.js
   - ✅ No framework-specific dependencies

2. **Function accepts configuration object and returns generated JavaScript code**
   - ✅ `GenerateBundleOptions` interface
   - ✅ Returns `Promise<string>`
   - ✅ TypeScript types exported

3. **Function validates inputs and returns descriptive errors**
   - ✅ Input validation in API function
   - ✅ Clear error messages at each layer
   - ✅ Type checking via TypeScript

4. **SDK at runtime uses embedded configuration without making network fetch**
   - ✅ Generated bundle calls `DD_RUM.init()` automatically
   - ✅ E2E tests verify no network fetch
   - ✅ Dynamic values resolve at runtime

5. **Dynamic configuration values (cookies, DOM selectors) remain resolvable at browser runtime**
   - ✅ Config passed through unchanged
   - ✅ SDK's `resolveDynamicValues()` handles at runtime
   - ✅ E2E tests verify dynamic values work

**All success criteria achievable in Phase 6.**

## Next Steps for Planning

1. Break down Phase 6 into tasks:
   - Task 1: Export programmatic API with validation
   - Task 2: Add in-memory caching
   - Task 3: Write E2E tests for embedded config
   - Task 4: Write E2E tests for dynamic values
   - Task 5: Documentation and examples
   - Task 6: TypeScript types and JSDoc

2. Identify dependencies between tasks:
   - Task 1 must complete before Task 3 (need API to test)
   - Task 2 can run in parallel with Task 1
   - Task 4 depends on Task 3 (builds on E2E infrastructure)

3. Estimate complexity:
   - Task 1: 2-3 hours (mostly validation code)
   - Task 2: 1 hour (simple Map cache)
   - Task 3: 2-3 hours (E2E test setup)
   - Task 4: 1-2 hours (extend E2E tests)
   - Task 5: 2-3 hours (write examples and docs)
   - Task 6: 1-2 hours (JSDoc comments)
   - Total: ~10-14 hours

4. Define test strategy:
   - Unit tests: Validate input validation logic
   - Integration tests: Test API end-to-end (mock network)
   - E2E tests: Verify SDK runtime behavior in browser

5. Document API contract:
   - Function signature
   - Parameter types
   - Return type
   - Error conditions
   - Examples

## Metadata

**Confidence breakdown:**

- API design: HIGH (clear requirements, simple pattern)
- Build tool integration: HIGH (standard patterns, documentation exists)
- SDK integration: HIGH (Phase 5 already works, no changes needed)
- Testing strategy: HIGH (Playwright available, clear test scenarios)
- Performance: MEDIUM (caching approach proven, specific benchmarks needed)
- Documentation: HIGH (examples straightforward, standard patterns)

**Research date:** 2026-02-04
**Valid until:** 30 days (stable domain, tools evolve slowly)

**Key coordination points:**

1. E2E tests must run in CI (verify Playwright setup)
2. Documentation should link to Datadog docs (get internal URLs)
3. npm publishing deferred to Phase 8 (no action needed in Phase 6)

**Sources:**

- Phase 5 implementation (scripts/build/lib/bundleGenerator.ts)
- SDK initialization code (packages/rum-core/src/boot/rumPublicApi.ts)
- Remote config types (packages/remote-config/src/remoteConfiguration.types.ts)
- Webpack documentation (webpack.js.org)
- Vite documentation (vitejs.dev)
- Node.js best practices (nodejs.org)
- TypeScript handbook (typescriptlang.org)
