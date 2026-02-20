# Feature Landscape

**Domain:** Code generator for bundled SDK + remote configuration
**Researched:** 2026-02-04
**Confidence:** HIGH

## Executive Summary

Code generators that produce bundled SDK + configuration outputs serve as build-time tools that transform configuration inputs into optimized, ready-to-deploy JavaScript bundles. Based on research into modern bundler APIs (Rollup, esbuild, Bun), SDK generation practices, and dual-interface tooling patterns, this landscape maps features into table stakes (must-have for v2), differentiators (compelling value-adds), and anti-features (explicit scope cuts).

**Key insight:** Modern bundle generators succeed when they balance three concerns:

1. **Developer ergonomics** - Multiple consumption patterns (CLI, HTTP, programmatic)
2. **Output quality** - Optimized bundles (minification, tree shaking, source maps)
3. **Operational visibility** - Validation, error handling, monitoring hooks

## Table Stakes

Features users expect. Missing = product feels incomplete or unusable.

| Feature                          | Why Expected                                                      | Complexity | Dependencies                       |
| -------------------------------- | ----------------------------------------------------------------- | ---------- | ---------------------------------- |
| **Fetch remote config by ID**    | Core value prop - tool must retrieve config to bundle it          | Low        | @datadog/browser-remote-config     |
| **Bundle SDK variant selection** | Customers choose rum vs rum-slim for bundle size                  | Low        | Existing SDK packages              |
| **Configuration inlining**       | Config must be embedded as literal values in output               | Medium     | Bundler API (esbuild/Rollup)       |
| **Single file output**           | Standard for CDN scripts - one `<script>` tag                     | Low        | Bundler configuration              |
| **Minification**                 | Production bundles always minified - reduces size 40-70%          | Low        | Terser/esbuild minifier            |
| **CLI interface**                | Developers expect `npx @datadog/bundle-generator --config-id=...` | Low        | Commander.js or similar            |
| **Programmatic API**             | Node.js import for build pipeline integration                     | Low        | Export public function             |
| **Input validation**             | Fail fast with clear errors for invalid config IDs                | Low        | Zod/Yup validation                 |
| **Error handling**               | Network failures, invalid configs must surface clearly            | Medium     | Try/catch + custom errors          |
| **Basic logging**                | Progress indication (fetching, bundling, writing)                 | Low        | Console or pino                    |
| **Output to file**               | Write bundle to filesystem path                                   | Low        | fs.writeFile                       |
| **Output to stdout**             | Enable piping to other tools                                      | Low        | process.stdout                     |
| **HTTP endpoint**                | POST /generate accepts config ID, returns bundle                  | Medium     | Express/Fastify server             |
| **Sync bundler API**             | Use esbuild/Rollup programmatically for bundle creation           | Medium     | esbuild.buildSync or rollup.rollup |

**MVP Priority Order:**

1. Fetch remote config + bundle SDK variant
2. Configuration inlining as literals
3. Single file minified output
4. CLI interface
5. Programmatic API
6. Input validation + error handling
7. HTTP endpoint

## Differentiators

Features that set this generator apart. Not expected, but highly valued.

| Feature                   | Value Proposition                                                     | Complexity | Notes                                      |
| ------------------------- | --------------------------------------------------------------------- | ---------- | ------------------------------------------ |
| **Tree shaking**          | Remove unused SDK features based on config - can reduce bundle 30-60% | Medium     | Requires ES modules + esbuild/Rollup       |
| **Source map generation** | Debug production bundles with original source mapping                 | Low        | Built into bundlers, just expose option    |
| **Bundle size reporting** | Show size before/after minification, gzip estimate                    | Low        | Builds trust + visibility                  |
| **Configuration preview** | Show resolved config before bundling (dry-run mode)                   | Low        | Call resolveDynamicValues without bundling |
| **Version pinning**       | Specify SDK version to bundle (not just latest)                       | Medium     | Requires version resolution from npm/CDN   |
| **Custom SDK path**       | Use local SDK build instead of published package                      | Low        | Useful for testing unreleased versions     |
| **Compression options**   | Output gzip/brotli alongside raw bundle                               | Low        | zlib.gzipSync, brotli available in Node    |
| **Cache-friendly naming** | Content-hash filenames (bundle.[hash].js)                             | Low        | Hash output content, rename file           |
| **Development mode**      | Non-minified with inline source maps for debugging                    | Low        | Toggle bundler mode                        |
| **Batch generation**      | Generate multiple config variants in one call                         | Medium     | Parallel Promise.all generation            |
| **Health check endpoint** | /health for monitoring (HTTP mode)                                    | Low        | Simple 200 OK response                     |
| **Metrics endpoint**      | /metrics for Prometheus/Datadog (HTTP mode)                           | Medium     | Track generation count, errors, timing     |
| **Validation warnings**   | Warn on suspicious config (100% sample rate, etc.)                    | Low        | Config analysis heuristics                 |
| **Dynamic value preview** | Show what dynamic values (cookies, DOM) will resolve to               | High       | Requires browser context - defer to v3     |

**V2 Recommendations:**

- Tree shaking (high value, medium effort)
- Source maps (quick win)
- Bundle size reporting (builds confidence)
- Configuration preview (debugging aid)
- Development mode (testing support)
- Health + metrics endpoints (operational must-have for hosted service)

**Defer to V3:**

- Dynamic value preview (requires headless browser or client-side context)
- Version pinning (adds complexity, can use latest for v2)
- Batch generation (optimize after seeing usage patterns)

## Anti-Features

Features to explicitly NOT build in v2. Common mistakes or scope creep.

| Anti-Feature                          | Why Avoid                                                                | What to Do Instead                                                               |
| ------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Real-time config updates**          | Adds complexity (WebSocket, polling, invalidation) with limited v2 value | Document regeneration workflow - customers regenerate bundle when config changes |
| **Bundle hosting/CDN**                | Infrastructure burden - this is code generation, not CDN                 | Output files customers host themselves or use Datadog's HTTP endpoint            |
| **GUI/Web UI**                        | Scope creep - CLI + HTTP covers all use cases                            | CLI for developers, HTTP endpoint for UIs to call                                |
| **Multi-bundle orchestration**        | Premature optimization - solve single bundle well first                  | One config ID → one bundle. Batch in v3 if needed                                |
| **Custom bundler plugins**            | Maintenance burden - non-standard SDK modifications                      | Standard SDK as-is. Custom needs = fork SDK                                      |
| **Dynamic config fetching in bundle** | Defeats zero-request value prop                                          | Bundle config at generation time, not runtime                                    |
| **Format transformation**             | Don't convert to AMD, UMD, etc. - just ES module + IIFE                  | Modern browsers use ES modules, legacy can use IIFE                              |
| **Build-time side effects**           | Don't modify global state, write config files, etc.                      | Pure function: inputs → bundle string                                            |
| **Automatic redeployment**            | CI/CD integration is customer's choice                                   | Provide bundle, customers deploy however they want                               |
| **Configuration schema migration**    | Remote config service handles schema versioning                          | Generator consumes current schema only                                           |
| **Bundle signing/verification**       | Security feature better handled by CDN/infrastructure                    | Trust remote config endpoint, use HTTPS                                          |

## Feature Dependencies

```
Core Flow:
fetchRemoteConfiguration() [remote-config package]
  ↓
resolveDynamicValues() [remote-config package]
  ↓
Bundle SDK with config inlined [esbuild/Rollup API]
  ↓
Minify + tree shake [bundler built-in]
  ↓
Output to file/stdout/HTTP response

Interface Layer:
CLI [commander.js] → Core Flow
Programmatic API [exported function] → Core Flow
HTTP Endpoint [Express/Fastify] → Core Flow

Output Enhancements:
Source maps [bundler option]
Bundle size reporting [fs.stat + gzip estimate]
Compression [zlib.gzip]
Cache-friendly naming [crypto.hash]
```

## Complexity Analysis

| Complexity Level      | Features                                                                                                                                                    | Estimated Effort |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Low (1-2 days)**    | CLI interface, programmatic API, validation, logging, output to file/stdout, minification, source maps, bundle size reporting, compression, health endpoint | 8-10 days total  |
| **Medium (3-5 days)** | Configuration inlining, HTTP endpoint, error handling, tree shaking, metrics endpoint, version pinning                                                      | 12-20 days total |
| **High (5+ days)**    | Dynamic value preview, custom bundler plugins, multi-region optimization                                                                                    | Defer to v3      |

**V2 Realistic Scope:** 3-4 weeks for table stakes + select differentiators (tree shaking, source maps, bundle reporting, dev mode, metrics)

## MVP Recommendation

**Phase 1: Core Generator (Week 1)**

1. Fetch remote config by ID
2. Bundle SDK variant (rum or rum-slim)
3. Configuration inlining as literals
4. Single minified file output
5. CLI interface with basic validation

**Phase 2: Production Ready (Week 2)** 6. Programmatic API for build tools 7. Comprehensive error handling 8. HTTP endpoint (Express + validation) 9. Source map generation 10. Bundle size reporting

**Phase 3: Operational Excellence (Week 3)** 11. Tree shaking for smaller bundles 12. Health + metrics endpoints 13. Development mode (non-minified) 14. Configuration preview (dry-run) 15. Logging improvements (structured logs)

**Phase 4: Polish (Week 4)** 16. Compression outputs (gzip/brotli) 17. Cache-friendly filenames 18. Validation warnings (config analysis) 19. Documentation + examples 20. E2E testing

**Defer to V3:**

- Dynamic value preview (requires browser context)
- Version pinning (complexity vs value)
- Batch generation (optimize after usage data)
- Custom SDK paths (edge case)
- Format transformations (not needed for modern browsers)

## Integration Patterns

### Self-Hosted (Customer Deploys Package)

**Use Case:** Enterprise customers with strict data governance
**Value:** Full control over infrastructure, no external dependencies
**Requirements:**

- npm package installable via `npm install @datadog/bundle-generator`
- CLI + programmatic API (no HTTP needed)
- Environment variables for configuration (proxy, site, etc.)
- Works offline if config fetched previously

**Example:**

```bash
# CLI
npx @datadog/bundle-generator \
  --config-id=abc123 \
  --variant=rum-slim \
  --output=dist/datadog.bundle.js

# Programmatic (build script)
const { generateBundle } = require('@datadog/bundle-generator')
const bundle = await generateBundle({
  configId: 'abc123',
  variant: 'rum-slim'
})
fs.writeFileSync('dist/datadog.bundle.js', bundle)
```

### Managed Endpoint (Datadog Hosts Service)

**Use Case:** Quick setup, no infrastructure needed
**Value:** Zero installation, just curl the bundle
**Requirements:**

- HTTP POST /generate endpoint
- Authentication (API key header)
- Rate limiting (prevent abuse)
- Health + metrics for Datadog SRE
- CDN caching for generated bundles

**Example:**

```bash
curl -X POST https://cdn.datadoghq.com/bundle/generate \
  -H "DD-API-KEY: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"configId":"abc123","variant":"rum-slim"}' \
  -o datadog.bundle.js
```

### Hybrid (HTTP Endpoint for UI, Package for CI/CD)

**Use Case:** Datadog UI generates bundles for preview, CI/CD regenerates on deploy
**Value:** Best of both - convenience + control
**Requirements:**

- Both modes work identically (same options, same output)
- Bundle reproducibility (same inputs → same output hash)
- Version coordination (UI uses same generator version as package)

## Configuration Surface

**Required:**

- `configId` (string) - Remote configuration ID
- `variant` ('rum' | 'rum-slim') - SDK variant to bundle

**Optional:**

- `output` (string) - File path to write (CLI only)
- `minify` (boolean) - Default true, disable for dev mode
- `sourceMap` (boolean | 'inline' | 'external') - Default 'external'
- `treeShake` (boolean) - Default true
- `compress` (boolean | 'gzip' | 'brotli' | 'both') - Default false
- `cacheFilename` (boolean) - Default false (content-hash naming)
- `dryRun` (boolean) - Preview config without bundling
- `applicationId` (string) - Required for fetchRemoteConfiguration
- `site` (string) - Datadog site (datadoghq.com, datadoghq.eu, etc.)
- `remoteConfigurationProxy` (string) - Custom proxy URL
- `logLevel` ('silent' | 'error' | 'warn' | 'info' | 'debug') - Default 'info'

## Success Metrics

**Developer Experience:**

- Time to first bundle < 60 seconds (install + generate)
- Error messages are actionable (not "bundling failed" but "config ID not found")
- CLI output shows progress + results (fetching, bundling, size)

**Output Quality:**

- Bundle size competitive with manual SDK + config (< 5% overhead)
- Tree shaking removes unused features (measured in bundle analysis)
- Source maps correctly map to original SDK source

**Operational Health (HTTP Endpoint):**

- 99.9% uptime SLA
- p50 generation time < 2s, p99 < 10s
- Error rate < 0.1%
- Metrics exposed for Datadog monitoring

## Known Gotchas

### 1. Dynamic Configuration Values

**Problem:** Config can reference cookies, DOM selectors, JS paths that don't exist at generation time
**Solution:**

- Generate bundle with dynamic resolution code intact (don't try to resolve at build time)
- Document that dynamic values resolve at runtime in browser
- Configuration preview mode warns about dynamic values

### 2. SDK Version Drift

**Problem:** Generator uses SDK version X, customer expects version Y
**Solution:**

- Default to latest published SDK version
- Document generator version → SDK version mapping
- V3 feature: support version pinning

### 3. Bundle Size Inflation

**Problem:** Inlining config + SDK together might bloat vs separate files
**Solution:**

- Tree shaking removes unused SDK features
- Minification + compression reduce overhead
- Report size comparison (bundled vs separate)
- Document trade-off: zero requests vs slightly larger initial payload

### 4. Configuration Schema Changes

**Problem:** Remote config schema evolves, generator may be outdated
**Solution:**

- Generator uses @datadog/browser-remote-config (stay in sync)
- Remote config service handles backward compatibility
- Don't duplicate schema validation in generator

### 5. HTTP Endpoint Abuse

**Problem:** Public endpoint could be spammed to generate bundles
**Solution:**

- API key authentication
- Rate limiting per key (e.g., 100 requests/hour)
- Cache generated bundles by config ID hash (serve cached if exists)
- Metrics + alerting for unusual traffic

## Research Sources

### SDK & Bundle Generation Patterns

- [SDK Best Practices | Speakeasy](https://www.speakeasy.com/blog/sdk-best-practices)
- [Review of 8 SDK Generators for APIs in 2025 | Nordic APIs](https://nordicapis.com/review-of-8-sdk-generators-for-apis-in-2025/)
- [Building great SDKs - Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/building-great-sdks)

### Bundler APIs & Optimization

- [Rollup JavaScript API](https://rollupjs.org/javascript-api/)
- [Bun Bundler Documentation](https://bun.com/docs/bundler)
- [esbuild - Extremely fast bundler](https://esbuild.github.io/)
- [Tree Shaking | webpack](https://webpack.js.org/guides/tree-shaking/)
- [How to Reduce JavaScript Bundle Size in 2025](https://dev.to/frontendtoolstech/how-to-reduce-javascript-bundle-size-in-2025-2n77)
- [8 Ways to Optimize Your JavaScript Bundle Size - Codecov](https://about.codecov.io/blog/8-ways-to-optimize-your-javascript-bundle-size/)

### Configuration Inlining & Code Generation

- [Bundle inlining | Parcel](https://parceljs.org/features/bundle-inlining/)
- [Bun Bundler - Environment Variables](https://bun.com/docs/bundler)
- [Building a JavaScript Bundler | Christoph Nakazawa](https://cpojer.net/posts/building-a-javascript-bundler)

### Error Handling & Validation

- [Modern C# Error Handling Patterns You Should Be Using in 2026](https://medium.com/@tejaswini.nareshit/modern-c-error-handling-patterns-you-should-be-using-in-2026-57eacd495123)
- [Express.js Tutorial (2026): Practical, Scalable Patterns](https://thelinuxcode.com/expressjs-tutorial-2026-practical-scalable-patterns-for-real-projects/)

### CLI & HTTP Dual Interface Patterns

- [Top 12 libraries to build CLI tools in Node.js](https://byby.dev/node-command-line-libraries)
- [How to Create a CLI Tool with Node.js](https://oneuptime.com/blog/post/2026-01-22-nodejs-create-cli-tool/view)
- [oclif: The Open CLI Framework](https://oclif.io/)

### CDN & Observability

- [Best practices for monitoring CDN logs | Datadog](https://www.datadoghq.com/blog/monitoring-cdn-logs/)
- [CDN Performance Metrics: What to Track and How to Monitor](https://blog.paessler.com/cdn-performance-metrics)
- [Cache invalidation overview | Cloud CDN | Google Cloud](https://cloud.google.com/cdn/docs/cache-invalidation-overview)

### Source Maps & Debugging

- [Using sourcemaps on production without revealing source code](https://itnext.io/using-sourcemaps-on-production-without-revealing-the-source-code-%EF%B8%8F-d41e78e20c89)
- [JavaScript Debugging with Sourcemaps | TrackJS](https://trackjs.com/blog/debugging-with-sourcemaps/)
- [webpack Devtool Configuration](https://webpack.js.org/configuration/devtool/)

### Self-Hosted vs Managed Services

- [5 Best Self-Hosted No-Code App Builders That Work in 2026](https://emergent.sh/learn/best-self-hosted-no-code-app-builder)
- [Top 7 Open-Source AI Coding Assistants in 2026](https://www.secondtalent.com/resources/open-source-ai-coding-assistants/)

## Confidence Assessment

| Finding                  | Level  | Verification                                       |
| ------------------------ | ------ | -------------------------------------------------- |
| Table stakes features    | HIGH   | Common to all code generators + bundlers           |
| Bundler API patterns     | HIGH   | Official Rollup, esbuild, Bun documentation        |
| Tree shaking benefits    | HIGH   | Multiple sources confirm 30-60% reduction          |
| CLI tooling patterns     | HIGH   | Industry standard (commander.js, oclif)            |
| Source map generation    | HIGH   | Built into all major bundlers                      |
| Error handling patterns  | MEDIUM | General best practices, not bundle-specific        |
| HTTP endpoint needs      | MEDIUM | Inferred from Datadog hosting requirement          |
| Bundle size overhead     | MEDIUM | Needs measurement with actual SDK                  |
| Dynamic value resolution | HIGH   | Confirmed in @datadog/browser-remote-config README |
| Cache invalidation       | MEDIUM | CDN best practices, not bundle-specific            |

## Open Questions for V2 Implementation

1. **Bundler choice:** esbuild (fastest) vs Rollup (better tree shaking) vs Bun (all-in-one)?
   - Recommendation: esbuild for speed, Rollup if tree shaking proves insufficient

2. **HTTP framework:** Express (familiar) vs Fastify (faster) vs Bun.serve (native)?
   - Recommendation: Fastify for performance + good DX

3. **Configuration storage:** How does remote config service invalidate/version configs?
   - Need to clarify with backend team for cache invalidation strategy

4. **Authentication:** API keys vs OAuth vs Datadog session tokens for HTTP endpoint?
   - Need infrastructure team input for Datadog-hosted service

5. **Rate limiting:** Per-API-key limits or IP-based? What's reasonable?
   - Recommendation: Start with 100 requests/hour per API key

6. **Bundle caching:** Cache by config ID hash? For how long? Invalidation strategy?
   - Recommendation: Cache indefinitely, config ID changes → new bundle needed

7. **Monitoring:** Which metrics matter most? What's alertable?
   - Recommendation: Generation latency p99, error rate, bundle size percentiles

---

**Ready for Roadmap:** Feature landscape complete. Table stakes and differentiators clearly defined. Dependencies on existing SDK packages identified. Proceed to phase structure planning.
