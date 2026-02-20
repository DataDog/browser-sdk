# Project Research Summary

**Project:** Browser SDK - Remote Config CDN Bundle Generator
**Domain:** Code generation tool for SDK + remote configuration bundling
**Researched:** 2026-02-04
**Confidence:** HIGH

## Executive Summary

The Remote Config CDN Bundle Generator is a code generation tool that combines the Browser SDK with remote configuration into a single, zero-request JavaScript bundle. Research across stack, features, architecture, and pitfalls reveals a clear path: build a **standalone monorepo package** using template literal code generation with esbuild for programmatic bundling, distributed as both an npm package and optional HTTP endpoint.

The recommended approach leverages existing infrastructure rather than reinventing it. Use the existing `@datadog/browser-remote-config` package for fetching configuration, esbuild for fast programmatic bundling (10-100x faster than webpack), and Node.js built-in APIs (`node:util.parseArgs`, `node:fs/promises`) to minimize dependencies. Generate code via template literals with Prettier formatting rather than complex AST manipulation—this keeps the codebase simple and maintainable for what is essentially wrapping a config object with bundled SDK code.

The critical risks center on **deterministic output** (same inputs must always produce identical bundles for caching and verification) and **dependency resolution** in the monorepo context (ensuring the generator resolves packages identically to how webpack builds the SDK). Prevention strategies include content-hash-based URLs, locked dependency versions, and comprehensive integration testing that verifies zero network requests occur when using embedded config. Early-phase decisions around build reproducibility and package architecture are difficult to retrofit later, making Phase 1 architecture choices crucial.

## Key Findings

### Recommended Stack

The stack prioritizes simplicity and existing infrastructure over adding new build tooling. The generator will be a TypeScript Node.js script that orchestrates bundling and config embedding with minimal new dependencies.

**Core technologies:**

- **Template literals (built-in)**: Code generation — native, simple, sufficient for wrapper code without AST complexity
- **esbuild (^0.24.x)**: Programmatic SDK bundling — 10-100x faster than webpack with clean in-memory API
- **Prettier (^3.8.0)**: Format generated code — already in devDeps, ensures clean output
- **node:util.parseArgs**: CLI argument parsing — stable built-in API since Node 20+, zero dependencies
- **@datadog/browser-remote-config**: Fetch remote config — existing dependency, single source of truth

**Critical decision:** Use template literals + Prettier instead of AST manipulation tools (@babel/types, astring). The use case is simple (wrapping config + bundled code), and AST tools add 50x overhead and verbose code for no benefit. Template literals provide readable code generation that's easy to test and maintain.

### Expected Features

Feature research reveals three consumption patterns customers expect: CLI for local development, programmatic API for build integration, and optional HTTP endpoint for on-demand generation.

**Must have (table stakes):**

- Fetch remote config by ID using existing remote-config package
- Bundle SDK variant selection (rum vs rum-slim)
- Configuration inlining as literal values in output
- Single file minified output
- CLI interface with input validation
- Programmatic API for build pipeline integration
- HTTP endpoint for hosted service
- Basic logging and clear error messages

**Should have (competitive):**

- Tree shaking to remove unused SDK features (30-60% size reduction)
- Source map generation for debugging
- Bundle size reporting for transparency
- Development mode (non-minified) for testing
- Health and metrics endpoints for operational monitoring
- Configuration preview (dry-run mode)

**Defer (v2+):**

- Dynamic value preview (requires browser context to resolve cookies/DOM)
- Version pinning (adds complexity, use latest for v2)
- Batch generation (optimize after usage patterns emerge)
- Custom SDK paths (edge case, prioritize published packages)

**Anti-features (explicitly not building):**

- Real-time config updates (adds WebSocket/polling complexity)
- Bundle hosting/CDN infrastructure (customers host or use Datadog endpoint)
- GUI/Web UI (CLI + HTTP covers all use cases)
- Multi-bundle orchestration (solve single bundle first)
- Custom bundler plugins (maintenance burden)

### Architecture Approach

The generator will be a new package `packages/remote-config-generator/` in the existing monorepo, with dual distribution (npm package + optional HTTP server). This additive approach requires no modifications to existing packages.

**Major components:**

1. **Generator Core** — Orchestrates fetching config, bundling SDK, and embedding config via templates
2. **Bundler** — Uses esbuild programmatic API to create in-memory SDK bundle (IIFE format for browsers)
3. **Config Embedder** — Serializes remote config to JavaScript using JSON.stringify (or JSON.parse for large configs >10KB)
4. **CLI Interface** — Command-line tool using node:util.parseArgs for argument handling
5. **HTTP Server** (optional) — Express/Fastify endpoint wrapping generator core for hosted service
6. **Output Manager** — Writes bundles to filesystem (CLI) or returns in HTTP response

**Integration with existing architecture:**

- Leverages `@datadog/browser-remote-config` for fetching (no duplicate logic)
- Uses esbuild instead of webpack for programmatic bundling (webpack continues for standard SDK builds)
- Follows existing script conventions in `scripts/build/` directory
- Uses Yarn workspace protocol for internal dependencies (`workspace:*`)
- Build order: generator built AFTER its dependencies (automatic via Yarn topology)

**Key architectural pattern:** Template literal code generation wraps bundled SDK code with embedded config in an IIFE:

```javascript
;(function () {
  var __DATADOG_REMOTE_CONFIG__ = {
    /* config */
  }
  /* SDK code */
  if (window.DD_RUM) DD_RUM.init(__DATADOG_REMOTE_CONFIG__)
})()
```

### Critical Pitfalls

Research identified 13 domain-specific pitfalls. The top 5 that require architectural prevention from Phase 1:

1. **Non-deterministic bundle output** — Same inputs producing different outputs breaks caching, verification, and debugging. Prevention: lock all inputs (SDK version, bundler version), use deterministic webpack config, content-based hashing only, test reproducibility in CI (build twice, assert byte-identical).

2. **Monorepo dependency resolution mismatch** — Generator resolving packages differently than bundled code expects causes duplicate dependencies or "cannot find module" errors. Prevention: use explicit esbuild resolution matching monorepo structure, lock workspace versions, validate bundle contents post-build.

3. **Embedded config not actually used by SDK** — Config embedded but SDK ignores it and still fetches from network, defeating zero-request purpose. Prevention: integration testing with network blocked, SDK needs new initialization path for embedded config, fail fast if config format invalid.

4. **Tree shaking eliminates embedded configuration** — Bundler removes config as "unused" code, resulting in bundle without config. Prevention: mark config module with side effects, ensure config imported from entry point, test production builds (tree shaking only activates in production mode).

5. **Version mismatch between SDK and config schema** — Pairing SDK v6.26.0 with incompatible config schema causes runtime errors. Prevention: version locking (config schema tied to SDK version), validation at generation time, compatibility matrix documentation.

**Phase-specific warnings:**

- Phase 1 (Bundle Generation): Focus on determinism, dependency resolution, tree shaking prevention
- Phase 2 (SDK Integration): Verify embedded config is actually used (E2E test with network blocked)
- Phase 3 (CLI Tool): Prioritize clear error messages and dual export (CLI + library)
- Phase 4 (HTTP Endpoint): Implement content-hash URLs for cache invalidation from day 1

## Implications for Roadmap

Based on combined research, recommend a 4-phase structure that progresses from core functionality to production hardening to optional hosted service.

### Phase 1: Core Generator (CLI-first)

**Rationale:** Validate core functionality without infrastructure complexity. CLI provides immediate value and can be thoroughly tested locally before adding HTTP complexity.

**Delivers:** Standalone npm package that generates bundles locally via command line

**Addresses features:**

- Fetch remote config by ID
- Bundle SDK variant (rum/rum-slim) programmatically
- Configuration inlining via template literals
- Single minified file output
- CLI interface with parseArgs

**Avoids pitfalls:**

- Non-deterministic output (design for reproducibility from start)
- Dependency resolution mismatch (explicit esbuild configuration)
- Tree shaking eliminates config (proper entry point structure)

**Research flag:** Standard patterns — code generation and CLI tools are well-documented. Skip additional research.

### Phase 2: Production Hardening

**Rationale:** Before distribution, ensure bundle quality, error handling, and testability meet production standards. Source maps and bundle size reporting build customer confidence.

**Delivers:** Production-ready package with comprehensive error handling and output quality features

**Addresses features:**

- Programmatic API for build tool integration
- Source map generation
- Bundle size reporting
- Input validation with clear error messages
- Comprehensive test coverage (unit, integration, E2E)

**Avoids pitfalls:**

- Embedded config not used (E2E integration test with network blocked)
- Poor error messages (validation feedback and context)
- Development vs production build differences (test both modes)

**Research flag:** Standard patterns — error handling and testing strategies are well-established. Skip additional research.

### Phase 3: Optimization & Distribution

**Rationale:** Optimize bundle output before widespread distribution. Tree shaking provides 30-60% size reduction, making it a high-value feature. Package publishing enables self-hosted use case.

**Delivers:** Optimized bundles with tree shaking, published to npm with dual export (CLI + programmatic API)

**Addresses features:**

- Tree shaking for smaller bundles
- Development mode (non-minified for debugging)
- Configuration preview (dry-run)
- Compression outputs (gzip/brotli)
- Dual package export (correct package.json exports field)

**Avoids pitfalls:**

- Bundle size bloat (webpack-bundle-analyzer validation)
- Incorrect package export format (test as both CLI and library)
- Missing dependency lockfile (commit yarn.lock, validate in CI)

**Research flag:** Standard patterns — tree shaking and npm packaging are well-documented. Skip additional research.

### Phase 4: HTTP Endpoint (Optional)

**Rationale:** After validating core with CLI, add hosted service for customer convenience. This phase requires infrastructure coordination and is optional if customers prefer self-hosting.

**Delivers:** HTTP service wrapping generator core, deployable to Datadog infrastructure

**Addresses features:**

- HTTP POST /generate endpoint
- Health and metrics endpoints
- Rate limiting and authentication
- Cache-friendly URLs (content-hash based)
- API documentation

**Avoids pitfalls:**

- Cache invalidation missing (content-hash in URL from start)
- Build-time variables leak (isolate generator env from bundle env)
- HTTP endpoint abuse (API key auth, rate limiting)

**Research flag:** **Needs deeper research** — infrastructure requirements, authentication strategy, rate limiting approach, and CDN configuration need clarification with Datadog infrastructure team during planning.

### Phase Ordering Rationale

- **CLI before HTTP:** Validates core logic without infrastructure dependencies, lower risk, immediate value
- **Hardening before optimization:** Error handling and testing establish quality baseline before size optimization
- **Optimization before HTTP:** Better to launch hosted service with optimized bundles than retrofit later
- **HTTP as optional:** Customers can use CLI/programmatic API for self-hosting if infrastructure delays HTTP endpoint

**Dependency flow:**

```
Phase 1 (Core) → Phase 2 (Hardening) → Phase 3 (Optimization) → Phase 4 (HTTP)
     ↓              ↓                      ↓                        ↓
   Required       Required                Required                Optional
```

### Research Flags

**Needs research during planning:**

- **Phase 4 (HTTP Endpoint):** Infrastructure team coordination required for:
  - Authentication strategy (API keys vs OAuth vs session tokens)
  - Rate limiting implementation (per-key or IP-based, reasonable limits)
  - CDN provider capabilities (cache headers, URL structure)
  - Deployment architecture (load balancing, autoscaling)
  - Monitoring integration (Datadog metrics, alerting)

**Standard patterns (skip research-phase):**

- **Phase 1 (Core Generator):** Code generation and CLI tools have established best practices
- **Phase 2 (Production Hardening):** Error handling and testing patterns are well-documented
- **Phase 3 (Optimization):** Tree shaking and npm packaging have clear documentation

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                   |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | **HIGH**   | esbuild, template literals, built-in Node.js APIs are well-documented; decision backed by official docs and performance data                            |
| Features     | **HIGH**   | Table stakes derived from bundler APIs (Rollup, esbuild, Bun) and SDK generation research; differentiators validated across multiple sources            |
| Architecture | **HIGH**   | Monorepo integration patterns established in existing codebase; template literal code generation approach is proven and simple                          |
| Pitfalls     | **MEDIUM** | Deterministic builds and dependency resolution well-researched; some pitfalls inferred from general bundler issues rather than domain-specific evidence |

**Overall confidence:** **HIGH**

### Gaps to Address

While research provides strong foundations, several areas need validation during implementation:

- **SDK initialization path for embedded config:** Needs design discussion with SDK team on how rum/rum-slim should detect and use embedded config instead of fetching. Current packages don't have this code path. Recommend adding optional check in `packages/rum/src/entries/main.ts` for `typeof __DATADOG_REMOTE_CONFIG__ !== 'undefined'`.

- **Remote config schema versioning:** How does the remote config service handle schema evolution? Need to clarify cache invalidation and version compatibility strategy with backend team to design generator's validation logic.

- **Infrastructure requirements for HTTP endpoint:** Phase 4 requires coordination with infrastructure team on authentication, rate limiting, CDN configuration, and deployment architecture. Cannot finalize HTTP endpoint design without these answers.

- **Bundle size validation thresholds:** What's acceptable bundle size overhead? Research suggests <5% overhead is reasonable, but need to measure with actual SDK bundles to set CI thresholds.

- **Dynamic value resolution timing:** How does `@datadog/browser-remote-config` handle dynamic values (cookies, DOM selectors) that don't exist at generation time? Need to verify embedded config preserves dynamic resolution code intact.

## Sources

### Primary (HIGH confidence)

- [Node.js util.parseArgs() documentation](https://nodejs.org/api/util.html) — Stability and API reference for built-in CLI parsing
- [esbuild API documentation](https://esbuild.github.io/api/) — Programmatic bundling with in-memory output
- [Prettier documentation](https://prettier.io/docs/) — Code formatting for generated output
- [Rollup JavaScript API](https://rollupjs.org/javascript-api/) — Alternative bundler patterns (validated esbuild choice)
- [webpack Tree Shaking guide](https://webpack.js.org/guides/tree-shaking/) — Prevention of config elimination
- [webpack DefinePlugin documentation](https://webpack.js.org/plugins/define-plugin/) — Build-time variable handling
- Existing codebase (b-ssi repository) — Scripts patterns, webpack configuration, monorepo structure

### Secondary (MEDIUM confidence)

- [Template literals vs AST for code generation](https://medium.com/singapore-gds/writing-a-typescript-code-generator-templates-vs-ast-ab391e5d1f5e) — Approach comparison justifying template literal choice
- [JavaScript bundler comparison 2025-2026](https://www.index.dev/skill-vs-skill/webpack-vs-rollup-vs-esbuild) — Performance data (10-100x speed claims)
- [Modern JavaScript bundlers comparison](https://strapi.io/blog/modern-javascript-bundlers-comparison-2025) — Feature analysis
- [Cost of JavaScript 2019 (V8)](https://v8.dev/blog/cost-of-javascript-2019) — JSON.parse performance optimization for large configs
- [SDK Best Practices | Speakeasy](https://www.speakeasy.com/blog/sdk-best-practices) — SDK generation patterns
- [Building great SDKs - Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/building-great-sdks) — Feature prioritization
- [Monorepo Dependency Chaos: Proven Hacks](https://dev.to/alex_aslam/monorepo-dependency-chaos-proven-hacks-to-keep-your-codebase-sane-and-your-team-happy-1957) — Dependency resolution pitfalls

### Tertiary (LOW confidence)

- [Deterministic Build Systems](https://reproducible-builds.org/docs/deterministic-build-systems/) — General principles, not specific to JavaScript bundlers
- [Why Cache Invalidation Doesn't Work](https://torvo.com.au/articles/why-cache-invalidation-doesnt-work) — CDN caching strategies
- Community blog posts on bundle optimization — Aggregated best practices, needs validation with actual implementation

---

_Research completed: 2026-02-04_
_Ready for roadmap: yes_
