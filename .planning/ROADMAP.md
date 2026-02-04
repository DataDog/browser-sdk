# Roadmap: Remote Config CDN Bundle Generator

## Overview

Milestone 2 builds a Node.js tool that generates browser-ready bundles combining the pre-configured SDK with remote configuration, eliminating the need for runtime config fetches. The tool progresses from core generation capabilities through programmatic API integration, HTTP endpoint wrapping, to production-ready distribution with comprehensive testing.

## Milestones

- ✅ **v1.0 Remote Config Extraction** - Phases 1-4 (shipped Milestone 1)
- 🚧 **v2.0 Remote Config CDN Bundle** - Phases 5-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 Remote Config Extraction (Phases 1-4) - SHIPPED Milestone 1</summary>

### Phase 1: Remote Config Package Setup
**Goal**: Standalone remote config package foundation
**Status**: Complete (Milestone 1)

### Phase 2: Remote Config Logic Extraction
**Goal**: Extract and isolate remote config logic
**Status**: Complete (Milestone 1)

### Phase 3: SDK Integration Update
**Goal**: SDK packages use extracted remote config
**Status**: Complete (Milestone 1)

### Phase 4: Testing & Types
**Goal**: All tests passing with proper TypeScript types
**Status**: Complete (Milestone 1)

</details>

### 🚧 v2.0 Remote Config CDN Bundle (In Progress)

**Milestone Goal:** Enable zero-request SDK initialization by pre-generating bundles with embedded configuration

#### Phase 5: Core Generator

**Goal**: Developer can generate bundled SDK + config code locally via Node.js tool

**Depends on**: Phase 4 (Milestone 1 complete)

**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04, GEN-05, GEN-06

**Success Criteria** (what must be TRUE):
  1. Tool fetches remote configuration using @datadog/browser-remote-config package
  2. Tool generates single JavaScript file containing both SDK and config code
  3. Generated output is deterministic (identical inputs produce byte-identical bundles)
  4. Tool supports both rum and rum-slim SDK variants
  5. Generated bundle can be loaded in browser without additional network requests

**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

#### Phase 6: Programmatic API & Integration

**Goal**: Build tools can integrate generator programmatically and SDK uses embedded config at runtime

**Depends on**: Phase 5

**Requirements**: API-01, API-02, API-03, API-04, API-05, CONFIG-01, CONFIG-02, CONFIG-03, CONFIG-04

**Success Criteria** (what must be TRUE):
  1. Node.js function can be imported and called from any build tool (webpack, vite, custom scripts)
  2. Function accepts configuration object and returns generated JavaScript code as Promise<string>
  3. Function validates inputs and returns descriptive errors for invalid parameters
  4. SDK at runtime uses embedded configuration without making network fetch
  5. Dynamic configuration values (cookies, DOM selectors) remain resolvable at browser runtime

**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

#### Phase 7: HTTP Endpoint

**Goal**: Datadog can host HTTP endpoint for on-demand bundle generation

**Depends on**: Phase 6

**Requirements**: HTTP-01, HTTP-02, HTTP-03, HTTP-04, HTTP-05

**Success Criteria** (what must be TRUE):
  1. HTTP endpoint accepts remote config ID and returns generated bundle
  2. Endpoint accepts SDK variant selection (rum or rum-slim)
  3. Endpoint returns appropriate HTTP status codes for success and error cases
  4. Endpoint handles invalid inputs gracefully with clear error messages
  5. Generated bundles are cache-friendly (content-addressable URLs)

**Plans**: TBD

Plans:
- [ ] 07-01: TBD

#### Phase 8: Distribution & Testing

**Goal**: Package is published to npm with comprehensive tests and documentation

**Depends on**: Phase 7

**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, PKG-01, PKG-02, PKG-03, PKG-04

**Success Criteria** (what must be TRUE):
  1. Generated bundles execute correctly in real browsers (verified by E2E tests)
  2. E2E integration test verifies zero network requests when using embedded config
  3. Error cases are handled gracefully with clear user feedback
  4. Package is published to npm as @datadog/browser-remote-config-generator
  5. Developers can import package programmatically or run as CLI tool

**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Remote Config Package | v1.0 | Complete | Complete | Milestone 1 |
| 2. Config Logic Extraction | v1.0 | Complete | Complete | Milestone 1 |
| 3. SDK Integration Update | v1.0 | Complete | Complete | Milestone 1 |
| 4. Testing & Types | v1.0 | Complete | Complete | Milestone 1 |
| 5. Core Generator | v2.0 | 0/TBD | Not started | - |
| 6. API & Integration | v2.0 | 0/TBD | Not started | - |
| 7. HTTP Endpoint | v2.0 | 0/TBD | Not started | - |
| 8. Distribution & Testing | v2.0 | 0/TBD | Not started | - |
