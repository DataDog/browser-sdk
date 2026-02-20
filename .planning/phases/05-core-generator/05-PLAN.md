# Phase 5: Core Generator - Execution Plan

<!-- Frontmatter -->

wave: 1
depends_on: []
files_modified:

- scripts/build/generate-cdn-bundle.ts
- scripts/build/lib/bundleGenerator.ts
- scripts/build/lib/bundleGenerator.spec.ts
- scripts/build/generate-cdn-bundle.spec.ts
  autonomous: true

---

## Overview

**Phase Goal:** Developer can generate bundled SDK + config code locally via Node.js tool

**Approach:** Build a CLI tool in `scripts/build/` that downloads pre-built SDK bundles from CDN, fetches remote configuration via `@datadog/browser-remote-config`, and combines them into a single JavaScript file using template literals.

**Key Decisions from Research:**

- Location: `scripts/build/generate-cdn-bundle.ts` following existing patterns (not a separate package yet)
- SDK Bundles: Download pre-built SDK from CDN (e.g., `https://cdn.datadoghq.com/...rum-v7.0.0.min.js`)
- Code generation: Template literals to wrap SDK + config in IIFE
- CLI: `node:util.parseArgs` for argument parsing (existing pattern)
- Determinism: No timestamps, deterministic JSON serialization

---

## Tasks

<task id="1">
  <name>Project Setup and Dependencies</name>
  <description>
    Set up the generator script structure. No new dependencies needed.
    Creates the file scaffolding following existing scripts/build/ patterns.
    Uses node:https for downloading SDK bundles from CDN.
  </description>
  <requirements>GEN-06</requirements>
  <steps>
    1. Create script file: `scripts/build/generate-cdn-bundle.ts`
    2. Create lib file: `scripts/build/lib/bundleGenerator.ts`
    3. Verify typescript and @datadog/browser-remote-config are available
    4. Create basic script structure using runMain pattern
    5. Verify node:https and node:fs/promises are available (built-in)
  </steps>
  <verification>
    - No new dependencies added (uses built-in node:https, node:fs/promises)
    - `yarn typecheck` passes with new files
    - Script file exists and imports resolve correctly
  </verification>
  <files>
    - scripts/build/generate-cdn-bundle.ts (new)
    - scripts/build/lib/bundleGenerator.ts (new)
  </files>
</task>

<task id="2">
  <name>Config Fetching Implementation</name>
  <description>
    Implement remote configuration fetching using @datadog/browser-remote-config package.
    This reuses the existing tested code for fetching and resolving dynamic configuration.
  </description>
  <requirements>GEN-01</requirements>
  <steps>
    1. Import fetchRemoteConfiguration from @datadog/browser-remote-config
    2. Create fetchConfig function that wraps the package's fetchRemoteConfiguration
    3. Handle error cases (network failure, invalid config ID, missing config)
    4. Return typed RumRemoteConfiguration or throw descriptive error
    5. Support site parameter for different Datadog datacenters
  </steps>
  <verification>
    - Function accepts applicationId, remoteConfigurationId, and optional site
    - Function returns RemoteConfigResult or throws on failure
    - Error messages include actionable context
  </verification>
  <files>
    - scripts/build/lib/bundleGenerator.ts (config fetching logic)
  </files>
  <code_example>
```typescript
import { fetchRemoteConfiguration, type RemoteConfigResult } from '@datadog/browser-remote-config'

export interface FetchConfigOptions {
applicationId: string
remoteConfigurationId: string
site?: string
}

export async function fetchConfig(options: FetchConfigOptions): Promise<RemoteConfigResult> {
const result = await fetchRemoteConfiguration(options)

if (!result.ok) {
throw new Error(
`Failed to fetch remote configuration: ${result.error?.message}\n` +
`Verify applicationId "${options.applicationId}" and ` +
`configId "${options.remoteConfigurationId}" are correct.`
)
}

return result
}

````
  </code_example>
</task>

<task id="3">
  <name>SDK Bundle Download from CDN</name>
  <description>
    Implement SDK bundle downloading from Datadog CDN for rum and rum-slim variants.
    Fetches pre-built, minified SDK code without rebuilding.
  </description>
  <requirements>GEN-02, GEN-05</requirements>
  <steps>
    1. Create downloadSDK function accepting variant ('rum' | 'rum-slim')
    2. Construct CDN URL: `https://cdn.datadoghq.com/.../{variant}-v{SDK_VERSION}.min.js`
    3. Use node:https to fetch the bundle from CDN
    4. Return SDK code as string
    5. Handle HTTP errors (404, 5xx) with descriptive messages
    6. Handle network errors with helpful context
  </steps>
  <verification>
    - Function accepts 'rum' or 'rum-slim' variant
    - Function returns Promise<string> with SDK code
    - HTTP errors are caught and re-thrown with context
    - 404 error suggests checking variant and version
    - Network errors include timeout information
  </verification>
  <files>
    - scripts/build/lib/bundleGenerator.ts (SDK download logic)
  </files>
  <code_example>
```typescript
import https from 'node:https'

export type SdkVariant = 'rum' | 'rum-slim'

// Current SDK version - should match @datadog/browser-rum package.json version
const SDK_VERSION = '7.0.0'
const CDN_BASE = 'https://cdn.datadoghq.com/bb'

export async function downloadSDK(variant: SdkVariant): Promise<string> {
  const cdnUrl = `${CDN_BASE}/${variant}-v${SDK_VERSION}.min.js`

  return new Promise((resolve, reject) => {
    https.get(cdnUrl, { timeout: 10000 }, (res) => {
      let data = ''

      if (res.statusCode === 404) {
        reject(new Error(
          `SDK bundle not found at ${cdnUrl}\n` +
          `Check that variant "${variant}" and version "${SDK_VERSION}" are correct.`
        ))
        return
      }

      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(
          `Failed to download SDK from CDN: HTTP ${res.statusCode}\n` +
          `URL: ${cdnUrl}`
        ))
        return
      }

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve(data)
      })
    }).on('error', (error) => {
      reject(new Error(
        `Network error downloading SDK from CDN:\n` +
        `URL: ${cdnUrl}\n` +
        `Error: ${error.message}`
      ))
    })
  })
}
````

</code_example>
</task>

<task id="4">
  <name>Code Generation with Template Literals</name>
  <description>
    Implement the bundle assembly logic that combines SDK code and configuration
    into a single JavaScript file wrapped in an IIFE with auto-initialization.
  </description>
  <requirements>GEN-03</requirements>
  <steps>
    1. Create generateCombinedBundle function accepting SDK code and config
    2. Use template literals to create IIFE wrapper
    3. Embed config using JSON.stringify (simple, deterministic)
    4. Include auto-initialization call to DD_RUM.init()
    5. Add comment header with generation metadata (SDK variant, config version, no timestamps)
  </steps>
  <verification>
    - Output is valid JavaScript
    - Output contains embedded config object
    - Output contains SDK code (minified from CDN)
    - Output includes auto-initialization
    - No timestamps in output
    - Output is deterministic (same inputs = same output)
  </verification>
  <files>
    - scripts/build/lib/bundleGenerator.ts (template generation logic)
  </files>
  <code_example>
```typescript
import type { RumRemoteConfiguration } from '@datadog/browser-remote-config'

export interface GenerateBundleOptions {
sdkCode: string
config: RumRemoteConfiguration
variant: SdkVariant
}

export function generateCombinedBundle(options: GenerateBundleOptions): string {
const { sdkCode, config, variant } = options

// Use JSON.stringify for deterministic serialization
// Note: config may contain dynamic values (cookies, DOM selectors)
// that will be resolved at runtime by resolveDynamicValues()
const configJson = JSON.stringify(config, null, 2)

return `/\*\*

- Datadog Browser SDK with Embedded Remote Configuration
- SDK Variant: ${variant}
-
- This bundle includes:
- - Pre-fetched remote configuration
- - Minified SDK code from CDN
-
- No additional network requests needed for SDK initialization.
  \*/
  (function() {
  'use strict';

// Embedded remote configuration
var **DATADOG_REMOTE_CONFIG** = ${configJson};

// SDK bundle (${variant}) - minified from CDN
${sdkCode}

// Auto-initialize with embedded config
if (typeof window !== 'undefined' && typeof window.DD_RUM !== 'undefined') {
window.DD_RUM.init(**DATADOG_REMOTE_CONFIG**.rum);
}
})();
`
}

````
  </code_example>
</task>

<task id="5">
  <name>CLI Entry Point Implementation</name>
  <description>
    Create the command-line interface for the generator tool using node:util.parseArgs.
    Follows existing scripts/build/ patterns (runMain, printLog, parseArgs).
  </description>
  <requirements>GEN-05, GEN-06</requirements>
  <steps>
    1. Create CLI script following build-package.ts pattern
    2. Define CLI arguments: --applicationId, --configId, --variant, --output, --site
    3. Validate required arguments and variant value
    4. Call bundleGenerator functions in sequence
    5. Write output to file or stdout
    6. Handle errors with descriptive messages
  </steps>
  <verification>
    - Script runs with: `npx tsx scripts/build/generate-cdn-bundle.ts --help`
    - Required arguments enforced (applicationId, configId, variant)
    - Variant validated as 'rum' or 'rum-slim'
    - Output written to file or stdout
    - Exit codes: 0 success, 1 user error, 2 network error, 3 build error
  </verification>
  <files>
    - scripts/build/generate-cdn-bundle.ts (CLI entry point)
  </files>
  <code_example>
```typescript
import { parseArgs } from 'node:util'
import * as fs from 'node:fs/promises'
import { runMain, printLog, printError } from '../lib/executionUtils.ts'
import { fetchConfig, downloadSDK, generateCombinedBundle, type SdkVariant } from './lib/bundleGenerator.ts'

runMain(async () => {
  const { values } = parseArgs({
    options: {
      applicationId: { type: 'string', short: 'a' },
      configId: { type: 'string', short: 'c' },
      variant: { type: 'string', short: 'v' },
      output: { type: 'string', short: 'o' },
      site: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    printHelp()
    return
  }

  // Validate required arguments
  if (!values.applicationId || !values.configId || !values.variant) {
    printError('Missing required arguments: --applicationId, --configId, --variant')
    printHelp()
    process.exit(1)
  }

  // Validate variant
  if (values.variant !== 'rum' && values.variant !== 'rum-slim') {
    printError(`Invalid variant "${values.variant}". Must be "rum" or "rum-slim".`)
    process.exit(1)
  }

  const variant = values.variant as SdkVariant

  try {
    printLog('Fetching remote configuration...')
    const configResult = await fetchConfig({
      applicationId: values.applicationId,
      remoteConfigurationId: values.configId,
      site: values.site,
    })

    printLog(`Downloading SDK (${variant}) from CDN...`)
    const sdkCode = await downloadSDK(variant)

    printLog('Generating combined bundle...')
    const bundle = generateCombinedBundle({
      sdkCode,
      config: configResult.value,
      variant,
    })

    if (values.output) {
      await fs.writeFile(values.output, bundle, 'utf-8')
      printLog(`Bundle written to ${values.output}`)
    } else {
      console.log(bundle)
    }

    printLog('Done.')
  } catch (error) {
    if (error instanceof Error) {
      printError(error.message)
    }
    process.exit(2)
  }
})

function printHelp() {
  console.log(`
Usage: npx tsx scripts/build/generate-cdn-bundle.ts [options]

Options:
  -a, --applicationId  Datadog application ID (required)
  -c, --configId       Remote configuration ID (required)
  -v, --variant        SDK variant: "rum" or "rum-slim" (required)
  -o, --output         Output file path (default: stdout)
  -s, --site           Datadog site (default: datadoghq.com)
  -h, --help           Show this help message

Example:
  npx tsx scripts/build/generate-cdn-bundle.ts \\
    --applicationId abc123 \\
    --configId def456 \\
    --variant rum \\
    --output ./datadog-rum-bundle.js
`)
}
````

</code_example>
</task>

<task id="6">
  <name>Determinism Validation</name>
  <description>
    Implement and verify deterministic output. Same inputs must produce byte-identical bundles.
    This is critical for caching, verification, and reproducibility.
  </description>
  <requirements>GEN-04</requirements>
  <steps>
    1. Review webpack config for non-deterministic sources (runtimeValue, timestamps)
    2. Ensure keepBuildEnvVariables is set correctly
    3. Verify JSON.stringify produces consistent output (key ordering)
    4. Create test that generates bundle twice and asserts equality
    5. Verify no Date.now() or random values in generated code
  </steps>
  <verification>
    - Generate bundle twice with same inputs
    - Assert bundle1 === bundle2 (string equality)
    - Search bundle for timestamp patterns (none should exist)
    - webpack config uses chunkIds: 'named' (already in webpack.base.ts)
  </verification>
  <files>
    - scripts/build/lib/bundleGenerator.ts (ensure deterministic settings)
    - scripts/build/lib/bundleGenerator.spec.ts (determinism tests)
  </files>
  <code_example>
```typescript
// In bundleGenerator.spec.ts
import { test } from 'node:test'
import assert from 'node:assert'
import { generateCombinedBundle, type SdkVariant } from './bundleGenerator.ts'

test('generateCombinedBundle produces deterministic output', () => {
const sdkCode = 'window.DD_RUM = { init: function() {} };'
const config = {
rum: {
applicationId: 'test-app-id',
clientToken: 'test-token',
sessionSampleRate: 100,
}
}
const variant: SdkVariant = 'rum'

const bundle1 = generateCombinedBundle({ sdkCode, config, variant })
const bundle2 = generateCombinedBundle({ sdkCode, config, variant })

assert.strictEqual(bundle1, bundle2, 'Bundles should be byte-identical')
})

test('bundle contains no build timestamps', () => {
const sdkCode = 'window.DD_RUM = { init: function() {} };'
const config = { rum: { applicationId: 'test' } }

const bundle = generateCombinedBundle({ sdkCode, config, variant: 'rum' })

// Check for common timestamp patterns
assert.ok(!bundle.includes('Date.now()'), 'Should not contain Date.now()')
assert.ok(!/\d{13}/.test(bundle), 'Should not contain Unix timestamps')
assert.ok(!/202\d-\d{2}-\d{2}/.test(bundle), 'Should not contain ISO dates')
})

````
  </code_example>
</task>

<task id="7">
  <name>Unit and Integration Testing</name>
  <description>
    Create comprehensive tests for the generator logic including unit tests for
    individual functions and integration tests for the full generation flow.
  </description>
  <requirements>GEN-01, GEN-02, GEN-03, GEN-04, GEN-05, GEN-06</requirements>
  <steps>
    1. Create bundleGenerator.spec.ts with unit tests
    2. Test config fetching with mocked responses
    3. Test template generation output structure
    4. Test CLI argument validation
    5. Create integration test for full generation (requires real config or mock)
    6. Verify generated bundle is valid JavaScript (try to parse with Node)
  </steps>
  <verification>
    - `yarn test:script` passes all new tests
    - Unit tests cover: fetchConfig, bundleSDK, generateCombinedBundle
    - Integration test verifies end-to-end flow
    - Generated JavaScript is syntactically valid
  </verification>
  <files>
    - scripts/build/lib/bundleGenerator.spec.ts (unit tests)
    - scripts/build/generate-cdn-bundle.spec.ts (CLI tests)
  </files>
  <code_example>
```typescript
// bundleGenerator.spec.ts
import { test, describe, mock } from 'node:test'
import assert from 'node:assert'
import { generateCombinedBundle } from './bundleGenerator.ts'

describe('generateCombinedBundle', () => {
  test('wraps code in IIFE', () => {
    const bundle = generateCombinedBundle({
      sdkCode: 'window.DD_RUM = {};',
      config: { rum: { applicationId: 'test' } },
      variant: 'rum',
    })

    assert.ok(bundle.startsWith('/**'), 'Should start with comment header')
    assert.ok(bundle.includes('(function() {'), 'Should contain IIFE start')
    assert.ok(bundle.includes('})();'), 'Should contain IIFE end')
  })

  test('includes SDK variant in header', () => {
    const bundle = generateCombinedBundle({
      sdkCode: '',
      config: { rum: { applicationId: 'test' } },
      variant: 'rum-slim',
    })

    assert.ok(bundle.includes('SDK Variant: rum-slim'))
  })

  test('embeds config as JSON', () => {
    const config = { rum: { applicationId: 'my-app', sessionSampleRate: 50 } }
    const bundle = generateCombinedBundle({
      sdkCode: '',
      config,
      variant: 'rum',
    })

    assert.ok(bundle.includes('"applicationId": "my-app"'))
    assert.ok(bundle.includes('"sessionSampleRate": 50'))
  })

  test('includes auto-initialization code', () => {
    const bundle = generateCombinedBundle({
      sdkCode: '',
      config: { rum: { applicationId: 'test' } },
      variant: 'rum',
    })

    assert.ok(bundle.includes('window.DD_RUM.init'))
    assert.ok(bundle.includes('__DATADOG_REMOTE_CONFIG__.rum'))
  })

  test('generates valid JavaScript', () => {
    const bundle = generateCombinedBundle({
      sdkCode: 'window.DD_RUM = { init: function(c) { this.config = c; } };',
      config: { rum: { applicationId: 'test', sessionSampleRate: 100 } },
      variant: 'rum',
    })

    // This will throw if JavaScript is invalid
    assert.doesNotThrow(() => {
      new Function(bundle)
    }, 'Generated code should be valid JavaScript')
  })
})
````

</code_example>
</task>

---

## Task Dependencies

```
Task 1 (Setup)
    │
    ├── Task 2 (Config Fetching) ──┐
    │                               │
    └── Task 3 (Download SDK) ─────┼── Task 4 (Code Generation)
                                   │          │
                                   │          │
                                   └──────────┼── Task 5 (CLI)
                                              │
                                              └── Task 6 (Determinism)
                                                         │
                                                         └── Task 7 (Testing)
```

**Parallel execution possible:**

- Tasks 2 and 3 can run in parallel after Task 1
  - Task 2: Fetch remote config from @datadog/browser-remote-config
  - Task 3: Download SDK from CDN
- Tasks 4, 5, 6, 7 are sequential

---

## Verification Criteria

### Requirement Coverage

| Requirement                     | Task(s)   | Verification                                                      |
| ------------------------------- | --------- | ----------------------------------------------------------------- |
| GEN-01: Fetch remote config     | Task 2    | fetchConfig function works with @datadog/browser-remote-config    |
| GEN-02: Reference SDK bundles   | Task 3    | downloadSDK downloads pre-built SDK from CDN for rum and rum-slim |
| GEN-03: Generate single JS file | Task 4    | generateCombinedBundle returns single file content                |
| GEN-04: Deterministic output    | Task 6    | Same inputs produce identical output (tested)                     |
| GEN-05: Support rum/rum-slim    | Task 3, 5 | CLI accepts --variant, downloadSDK supports both                  |
| GEN-06: Resolve dependencies    | Task 1    | Script structure and imports resolve correctly                    |

### Success Criteria Mapping

| Success Criterion                     | Task(s)   | How Verified                        |
| ------------------------------------- | --------- | ----------------------------------- |
| Tool fetches remote configuration     | Task 2    | Unit test with real/mocked fetch    |
| Tool generates single JavaScript file | Task 4, 5 | CLI outputs single file to --output |
| Output is deterministic               | Task 6    | Test: generate twice, assert equal  |
| Supports rum and rum-slim             | Task 3, 5 | CLI accepts both variants           |
| Bundle works in browser               | Task 7    | Generated JS is syntactically valid |

---

## must_haves

Critical requirements that must be satisfied for phase completion:

- must_have: Deterministic output for identical inputs — enables caching, verification, and reproducibility
- must_have: Uses @datadog/browser-remote-config package — reuses tested code, no duplication
- must_have: Supports both rum and rum-slim variants — customer choice for bundle size
- must_have: Single JavaScript file output — zero additional requests needed
- must_have: Valid JavaScript output — must execute in browser without errors
- must_have: Monorepo dependency resolution works — webpack resolves @datadog/\* packages correctly

---

## Risk Mitigation

### Critical Risks (from PITFALLS.md)

| Risk                                  | Mitigation in Tasks                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Non-deterministic output              | Task 6: explicit tests, no timestamps, deterministic JSON.stringify                  |
| SDK CDN URL incorrect                 | Task 3: descriptive error message with URL if 404, suggests checking variant/version |
| Network timeout                       | Task 3: 10 second timeout with retry information                                     |
| Config not embedded properly          | Task 4: template literal ensures config is in output, not tree-shaken                |
| Dynamic values resolved at build time | Task 4: config passed to template, SDK resolves at runtime                           |

### Testing Strategy

1. **Unit tests** (Task 7): Test each function in isolation
2. **Determinism tests** (Task 6): Generate twice, assert equality
3. **Syntax validation** (Task 7): Parse generated JS with `new Function()`
4. **Integration test** (Task 7): Full flow with mock config

---

## Out of Scope for Phase 5

These items are explicitly NOT part of this phase:

- SDK modifications to detect embedded config (Phase 6)
- HTTP endpoint wrapper (Phase 7)
- npm package publishing (Phase 8)
- Source maps in generated output (v3)
- Bundle size optimization (v3)
- Real-time config updates (out of scope)

---

## Execution Notes

### How to Run

```bash
# Install dependencies
yarn

# Run generator (after implementation)
npx tsx scripts/build/generate-cdn-bundle.ts \
  --applicationId YOUR_APP_ID \
  --configId YOUR_CONFIG_ID \
  --variant rum \
  --output ./datadog-rum-bundle.js

# Run tests
yarn test:script
```

### Expected Output Structure

```javascript
/**
 * Datadog Browser SDK with Embedded Remote Configuration
 * SDK Variant: rum
 */
;(function () {
  'use strict'

  // Embedded remote configuration
  var __DATADOG_REMOTE_CONFIG__ = {
    rum: {
      applicationId: 'abc123',
      sessionSampleRate: 100,
      // ... rest of config
    },
  }

  // SDK bundle (rum)
  // ... webpack-bundled SDK code ...

  // Auto-initialize with embedded config
  if (typeof window !== 'undefined' && typeof window.DD_RUM !== 'undefined') {
    window.DD_RUM.init(__DATADOG_REMOTE_CONFIG__.rum)
  }
})()
```

---

_Plan created: 2026-02-04_
_Phase: 5 of 8 (Core Generator)_
_Milestone: v2.0 Remote Config CDN Bundle_
