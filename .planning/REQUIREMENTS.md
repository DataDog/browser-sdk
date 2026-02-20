# Requirements: Remote Config CDN Bundle Generator

**Defined:** 2026-02-04
**Core Value:** Enable developers to instrument web applications with zero initial requests to configuration endpoints

## v2 Requirements

Milestone 2 delivers a Node.js tool that generates browser-ready bundles combining pre-configured SDK with remote configuration.

### Core Generation

- [ ] **GEN-01**: Tool can fetch remote configuration using @datadog/browser-remote-config package
- [ ] **GEN-02**: Tool can reference CDN-hosted SDK bundles (rum and rum-slim variants)
- [ ] **GEN-03**: Tool generates single JavaScript file combining config + SDK code
- [ ] **GEN-04**: Generated output is deterministic (same input produces identical output)
- [ ] **GEN-05**: Tool supports both rum and rum-slim SDK variants
- [ ] **GEN-06**: Tool properly resolves monorepo dependencies and versions

### Programmatic API

- [ ] **API-01**: Tool exports Node.js function for programmatic use (not just CLI)
- [ ] **API-02**: Function accepts configuration object (remoteConfigId, sdkVariant, etc.)
- [ ] **API-03**: Function returns Promise<string> with generated JavaScript code
- [ ] **API-04**: Function validates inputs and returns descriptive errors
- [ ] **API-05**: API works with any Node.js build tool (webpack, vite, custom scripts)

### HTTP Endpoint

- [ ] **HTTP-01**: Tool can be wrapped as HTTP endpoint for Datadog-hosted service
- [ ] **HTTP-02**: Endpoint accepts remote config ID as query parameter
- [ ] **HTTP-03**: Endpoint accepts SDK variant selection
- [ ] **HTTP-04**: Endpoint returns generated bundle as JavaScript content
- [ ] **HTTP-05**: Endpoint returns appropriate HTTP status codes and error messages

### Configuration Integration

- [ ] **CONFIG-01**: Generated code includes fetched remote configuration
- [ ] **CONFIG-02**: SDK at runtime uses embedded configuration (no second fetch)
- [ ] **CONFIG-03**: Dynamic configuration values (cookies, DOM, JS paths) remain resolvable at runtime
- [ ] **CONFIG-04**: Configuration schema validation matches SDK expectations

### Quality & Testing

- [ ] **TEST-01**: Generated bundles execute correctly in browser (E2E tests)
- [ ] **TEST-02**: Unit tests verify generator logic and output correctness
- [ ] **TEST-03**: Integration tests verify SDK+config work together
- [ ] **TEST-04**: Error cases handled gracefully (invalid config ID, missing SDK version, etc.)

### npm Package

- [ ] **PKG-01**: Tool published to npm as @datadog/browser-remote-config-generator
- [ ] **PKG-02**: Package includes both programmatic API and CLI entry point
- [ ] **PKG-03**: TypeScript types exported for programmatic API
- [ ] **PKG-04**: Package documentation includes usage examples

## v3 Requirements

Deferred to future milestone. Not in current roadmap.

### Optimization

- Bundle size optimization via tree-shaking
- Gzip compression of generated output
- Source maps for generated bundles
- Bundle size reporting and analysis
- Caching for repeated generation requests

### Production Hardening

- Rate limiting for HTTP endpoint
- Authentication for HTTP endpoint (if needed)
- CDN caching headers and strategy
- Monitoring and metrics for HTTP endpoint

## Out of Scope

| Feature                                         | Reason                                                       |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Real-time configuration updates                 | Requires polling infrastructure; v2 is pre-generated bundles |
| Webpack plugin                                  | Generic Node.js function sufficient; plugin can wrap it      |
| Build-time config resolution for dynamic values | Dynamic values (cookies, DOM) must be resolved at runtime    |
| Version pinning/lock files                      | Complexity deferred; customers manage versions               |
| Mobile SDK bundling                             | Web-first; mobile SDKs handled separately                    |

## Traceability

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| GEN-01      | Phase 5 | Pending |
| GEN-02      | Phase 5 | Pending |
| GEN-03      | Phase 5 | Pending |
| GEN-04      | Phase 5 | Pending |
| GEN-05      | Phase 5 | Pending |
| GEN-06      | Phase 5 | Pending |
| API-01      | Phase 6 | Pending |
| API-02      | Phase 6 | Pending |
| API-03      | Phase 6 | Pending |
| API-04      | Phase 6 | Pending |
| API-05      | Phase 6 | Pending |
| CONFIG-01   | Phase 6 | Pending |
| CONFIG-02   | Phase 6 | Pending |
| CONFIG-03   | Phase 6 | Pending |
| CONFIG-04   | Phase 6 | Pending |
| HTTP-01     | Phase 7 | Pending |
| HTTP-02     | Phase 7 | Pending |
| HTTP-03     | Phase 7 | Pending |
| HTTP-04     | Phase 7 | Pending |
| HTTP-05     | Phase 7 | Pending |
| TEST-01     | Phase 8 | Pending |
| TEST-02     | Phase 8 | Pending |
| TEST-03     | Phase 8 | Pending |
| TEST-04     | Phase 8 | Pending |
| PKG-01      | Phase 8 | Pending |
| PKG-02      | Phase 8 | Pending |
| PKG-03      | Phase 8 | Pending |
| PKG-04      | Phase 8 | Pending |

**Coverage:**

- v2 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---

_Requirements defined: 2026-02-04_
_Last updated: 2026-02-04 after roadmap creation for Milestone 2_
