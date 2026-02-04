# Architecture Patterns: Remote Config CDN Bundle Generator

**Domain:** Code generation tool for SDK + remote configuration bundling
**Researched:** 2026-02-04
**Confidence:** HIGH

## Recommended Architecture

The generator should be a **standalone package in the monorepo** with dual distribution options (npm package + HTTP endpoint), using template literal code generation and leveraging existing webpack infrastructure.

```
packages/
├── remote-config-generator/   # NEW - Code generation tool
│   ├── src/
│   │   ├── generator/          # Core code generation logic
│   │   │   ├── bundler.ts      # Webpack integration for SDK bundling
│   │   │   ├── template.ts     # Template literal-based code generation
│   │   │   └── embedder.ts     # Config embedding logic
│   │   ├── cli/                # CLI interface
│   │   │   └── index.ts        # Command-line entry point
│   │   ├── server/             # HTTP endpoint (optional)
│   │   │   └── app.ts          # Express server for endpoint
│   │   └── index.ts            # Programmatic API exports
│   ├── package.json
│   └── README.md
├── remote-config/              # EXISTING - Runtime config fetcher
├── rum/                        # EXISTING - Full RUM SDK
├── rum-slim/                   # EXISTING - Lightweight RUM
└── core/                       # EXISTING - Shared utilities
```

### Data Flow

```
Customer Request (CLI or HTTP)
    ↓
1. Parse input (appId, configId, variant: rum|rum-slim)
    ↓
2. Fetch remote config using @datadog/browser-remote-config
    ↓
3. Bundle SDK variant using webpack programmatic API
    ↓
4. Embed config via template literal code generation
    ↓
5. Output single .js file
    ↓
Customer embeds in HTML <script> tag
```

## Component Boundaries

| Component | Responsibility | Dependencies |
|-----------|---------------|--------------|
| Generator Core | Orchestrate bundling + config embedding | @datadog/browser-remote-config, webpack |
| Bundler | Create SDK bundle from source | webpack, existing build infrastructure |
| Template Engine | Generate wrapper code with embedded config | Node.js template literals |
| Config Embedder | Serialize remote config into JS format | JSON.stringify or JSON.parse optimization |
| CLI Interface | Command-line tool for local generation | generator core |
| HTTP Server | Endpoint for on-demand bundle generation | Express, generator core |
| Output Manager | Write/serve generated bundle | fs (CLI) or HTTP response (server) |

## Integration Points with Existing Architecture

### 1. Leveraging @datadog/browser-remote-config

The generator will use the remote-config package as a runtime dependency to fetch configuration:

```typescript
// packages/remote-config-generator/src/generator/configFetcher.ts
import { fetchRemoteConfiguration } from '@datadog/browser-remote-config'

export async function fetchConfig(options: {
  applicationId: string
  remoteConfigurationId: string
  site?: string
}) {
  const result = await fetchRemoteConfiguration(options)

  if (!result.ok) {
    throw new Error(`Failed to fetch config: ${result.error?.message}`)
  }

  return result.value
}
```

**Why this approach:**
- Reuses tested, production-ready code
- Single source of truth for config fetching logic
- No code duplication between runtime SDK and generator

### 2. Bundling SDK Variants Using Webpack

The generator will programmatically invoke webpack to bundle rum or rum-slim, similar to existing build process:

```typescript
// packages/remote-config-generator/src/generator/bundler.ts
import webpack from 'webpack'
import webpackBase from '../../../webpack.base.ts'

export async function bundleSDK(variant: 'rum' | 'rum-slim'): Promise<string> {
  const packagePath = `../../${variant}`

  return new Promise((resolve, reject) => {
    webpack(
      webpackBase({
        mode: 'production',
        entry: `${packagePath}/src/entries/main.ts`,
        filename: `datadog-${variant}-temp.js`,
      }),
      (error, stats) => {
        if (error || stats?.hasErrors()) {
          reject(error || new Error('Webpack bundling failed'))
        } else {
          // Read bundled output from memory or disk
          const bundleCode = fs.readFileSync('./bundle/...')
          resolve(bundleCode)
        }
      }
    )
  })
}
```

**Why webpack over alternatives:**
- Already used by SDK (consistency)
- Existing webpack.base.ts configuration
- Production-tested minification and optimization
- Team familiarity
- Programmatic API well-suited for this use case

**Alternatives considered:**
- **esbuild**: 10-100x faster but SDK already uses webpack; would require parallel build tooling
- **Rollup**: Better for libraries but webpack already configured for SDK
- **Vite**: Optimized for dev server, not programmatic bundling

### 3. Code Generation via Template Literals

Template literal-based generation provides clean, readable output without external dependencies:

```typescript
// packages/remote-config-generator/src/generator/template.ts
export function generateBundle(sdkCode: string, config: RemoteConfiguration): string {
  // Serialize config - use JSON.parse for bundles >10KB (performance optimization)
  const configCode = shouldUseJsonParse(config)
    ? `JSON.parse('${JSON.stringify(config)}')`
    : JSON.stringify(config)

  return `
(function() {
  // Embedded Remote Configuration
  var __DATADOG_REMOTE_CONFIG__ = ${configCode};

  // SDK Code
  ${sdkCode}

  // Auto-initialize with embedded config
  if (typeof DD_RUM !== 'undefined') {
    DD_RUM.init(__DATADOG_REMOTE_CONFIG__.rum);
  }
})();
`.trim()
}

function shouldUseJsonParse(config: any): boolean {
  // JSON.parse is faster for large objects (>10KB)
  // See: https://v8.dev/blog/cost-of-javascript-2019
  const size = JSON.stringify(config).length
  return size > 10 * 1024
}
```

**Why template literals:**
- Native JavaScript feature (no dependencies)
- Readable code generation
- Easy to test and debug
- Performance: tagged templates allow advanced manipulation if needed

### 4. Build Order in Yarn Workspace

The generator package must be built AFTER its dependencies:

```json
// packages/remote-config-generator/package.json
{
  "name": "@datadog/browser-remote-config-generator",
  "dependencies": {
    "@datadog/browser-remote-config": "workspace:*",
    "@datadog/browser-rum": "workspace:*",
    "@datadog/browser-rum-slim": "workspace:*"
  },
  "devDependencies": {
    "webpack": "5.104.1",
    "express": "5.2.1"
  }
}
```

Yarn's topological build (`yarn build` at root) will automatically respect dependency order.

## New vs Modified Components

### New Components

1. **packages/remote-config-generator/** - Entire package is new
2. **CLI entry point** - `packages/remote-config-generator/src/cli/index.ts`
3. **HTTP server** (optional) - `packages/remote-config-generator/src/server/app.ts`
4. **Template engine** - Code generation logic
5. **Config embedder** - Serialization and embedding

### Modified Components

**None required.** The generator is completely additive and does not modify existing packages.

**Potential future modification:**
- If SDK needs to detect embedded config, add check in `packages/rum/src/entries/main.ts`:
  ```typescript
  if (typeof __DATADOG_REMOTE_CONFIG__ !== 'undefined') {
    // Use embedded config instead of fetching
  }
  ```
  But this is NOT required for Milestone 2 - customers can manually call init.

## Architecture Patterns to Follow

### Pattern 1: Programmatic Webpack Bundling

**What:** Invoke webpack from Node.js code rather than CLI
**When:** Need to generate bundles on-demand with dynamic configuration
**Example:**
```typescript
import webpack from 'webpack'
import webpackConfig from './webpack.config'

async function bundle() {
  return new Promise((resolve, reject) => {
    webpack(webpackConfig, (err, stats) => {
      if (err || stats?.hasErrors()) {
        reject(err || new Error('Build failed'))
      } else {
        resolve(stats)
      }
    })
  })
}
```

**Reference:** Existing `scripts/build/build-package.ts` and `scripts/dev-server.ts`

### Pattern 2: Template Literal Code Generation

**What:** Use template literals for readable, maintainable code generation
**When:** Generating JavaScript code programmatically
**Example:**
```typescript
const code = `
function generated() {
  const config = ${JSON.stringify(data)};
  return config;
}
`
```

**Reference:** [MDN Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)

### Pattern 3: Dual Distribution (npm + HTTP)

**What:** Publish as npm package with optional HTTP server
**When:** Tool useful both locally (CI) and as hosted service
**Architecture:**
```
@datadog/browser-remote-config-generator
├── Programmatic API (exports for library use)
├── CLI (command-line tool via `bin`)
└── HTTP Server (optional, separate deployment)
```

**Example:**
```json
{
  "main": "./dist/index.js",
  "bin": {
    "datadog-bundle-generator": "./dist/cli/index.js"
  }
}
```

### Pattern 4: Monorepo Package Dependencies

**What:** Use workspace protocol for internal dependencies
**When:** Package depends on other packages in same monorepo
**Example:**
```json
{
  "dependencies": {
    "@datadog/browser-remote-config": "workspace:*"
  }
}
```

**Reference:** Existing packages in the monorepo use this pattern

## Anti-Patterns to Avoid

### Anti-Pattern 1: Bundling Both Variants in Single File

**What:** Including both rum and rum-slim code in output, selecting at runtime
**Why bad:** Wastes bandwidth, defeats purpose of rum-slim
**Instead:** Generate separate bundles for each variant

### Anti-Pattern 2: Embedding Config as String Literal Without Optimization

**What:** Always using `const config = { ... }` for large configs
**Why bad:** Slower parsing for large objects (>10KB)
**Instead:** Use JSON.parse() for large configs:
```typescript
// Bad for large configs
const config = { /* 50KB of nested objects */ }

// Good for large configs
const config = JSON.parse('{"..."}') // Faster to parse
```

**Reference:** [Cost of JavaScript 2019 (V8)](https://v8.dev/blog/cost-of-javascript-2019), [JSON.parse Performance](https://www.bram.us/2019/11/25/faster-javascript-apps-with-json-parse/)

### Anti-Pattern 3: Building Custom Bundler from Scratch

**What:** Writing custom module resolution, tree-shaking, minification
**Why bad:** Reinventing well-tested infrastructure, high maintenance cost
**Instead:** Use existing webpack configuration and programmatic API

### Anti-Pattern 4: Synchronous File Operations in HTTP Endpoint

**What:** Using `fs.readFileSync()` in Express route handlers
**Why bad:** Blocks event loop, kills server performance
**Instead:**
- Use async fs operations
- Or cache bundles in memory
- Or use memory-only webpack compilation

## CLI vs HTTP Endpoint Comparison

| Criterion | CLI Tool | HTTP Endpoint |
|-----------|----------|---------------|
| **Use Case** | Local development, CI/CD pipelines | On-demand generation, customer convenience |
| **Distribution** | npm package with `bin` entry | Deployed service (separate infrastructure) |
| **Performance** | Fast (no network overhead) | Slower (network + cold start) |
| **Caching** | Filesystem cache possible | In-memory or CDN cache |
| **Scalability** | Scales with CI workers | Requires load balancing, autoscaling |
| **Maintenance** | Low (just npm updates) | Higher (server infrastructure, monitoring) |
| **Customer Control** | Full (self-hosted) | Limited (depends on Datadog service) |
| **Bundle Size Impact** | None (tool is dev dependency) | None (bundles served dynamically) |

### Recommendation: Start with CLI, Optional HTTP Later

**Phase 1 (Milestone 2):**
1. Build CLI tool as primary interface
2. Publish to npm as `@datadog/browser-remote-config-generator`
3. Customers run locally: `npx @datadog/browser-remote-config-generator --app-id=... --config-id=...`

**Phase 2 (Future milestone):**
1. Add HTTP server using same generator core
2. Deploy to Datadog infrastructure
3. Expose as convenience endpoint: `https://cdn.datadoghq.com/bundle/v1/{appId}/{configId}/rum.js`

**Why this order:**
- Validates core functionality without infrastructure complexity
- CLI provides immediate value
- HTTP endpoint can reuse CLI logic
- Lower risk (no dependency on new infrastructure)

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| **Bundle generation** | On-demand (CLI) | On-demand (CLI) + optional endpoint | Endpoint with aggressive caching |
| **Storage** | Local filesystem | Local + optional CDN | CDN with versioned URLs |
| **Caching strategy** | None (regenerate on change) | Filesystem cache by configId | CDN edge cache, config hash in URL |
| **Infrastructure** | None (npm package) | None or single server | Load-balanced service, edge caching |

## Implementation Phases

Based on architecture analysis, recommend this phase structure:

### Phase 1: Core Generator (CLI-first)
**Focus:** Standalone tool that generates bundles locally
- Set up new package: `packages/remote-config-generator/`
- Implement config fetcher using `@datadog/browser-remote-config`
- Implement webpack bundler for rum/rum-slim
- Implement template-based code generation
- Build CLI interface with argument parsing

**Testing Strategy:**
- Unit tests for template generation
- Integration tests for webpack bundling
- E2E tests for full CLI workflow

### Phase 2: Bundle Optimization
**Focus:** Performance and size optimization
- Implement JSON.parse optimization for large configs
- Add bundle size analysis
- Optimize webpack configuration for generator use case
- Add caching for repeated generations

### Phase 3: HTTP Endpoint (Optional)
**Focus:** Hosted service for convenience
- Build Express server wrapping generator core
- Add request validation and error handling
- Implement in-memory caching
- Deploy to Datadog infrastructure

**Testing Strategy:**
- API contract tests
- Load testing
- Security testing (input validation)

### Phase 4: Distribution & Documentation
**Focus:** Publishing and customer enablement
- Publish to npm
- Document CLI usage
- Document HTTP endpoint (if built)
- Create migration guide from manual init

## Sources

### Bundle Performance
- [Cost of JavaScript 2019 (V8)](https://v8.dev/blog/cost-of-javascript-2019)
- [Faster JavaScript Apps with JSON.parse()](https://www.bram.us/2019/11/25/faster-javascript-apps-with-json-parse/)
- [JSON.parse Performance Improvement](https://medium.com/@kemalpiro/can-json-parse-be-performance-improvement-ba1069951839)

### Bundler Comparison
- [Modern JavaScript Bundlers Comparison 2025](https://strapi.io/blog/modern-javascript-bundlers-comparison-2025)
- [Esbuild vs Rollup vs Webpack for Web Development in 2026](https://www.index.dev/skill-vs-skill/esbuild-vs-webpack-vs-rollup)
- [esbuild - An extremely fast bundler](https://esbuild.github.io/)

### Code Generation
- [MDN Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)
- [Advanced String Manipulation with Tagged Templates](https://claritydev.net/blog/javascript-advanced-string-manipulation-tagged-templates)
- [Node.js Design Patterns 2026](https://nareshit.com/blogs/top-nodejs-design-patterns-2026)

### Distribution Architecture
- [CLI Tool Development with Node.js](https://oneuptime.com/blog/post/2026-01-22-nodejs-create-cli-tool/view)
- [The JS library distribution dilemma: NPM or URL?](https://medium.com/thron-tech/the-js-library-distribution-dilemma-npm-or-url-c63aa5842a4c)
- [Building Modern Web Applications: Node.js Best Practices for 2026](https://www.technology.org/2025/12/22/building-modern-web-applications-node-js-innovations-and-best-practices-for-2026/)
