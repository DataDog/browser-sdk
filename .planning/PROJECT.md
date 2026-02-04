# Datadog Browser SDK

## What This Is

Browser SDK for collecting Real User Monitoring (RUM) and logging data from web applications. Provides SDKs for multiple integration methods (npm, CDN, React, etc.) with support for remote configuration and dynamic initialization.

## Core Value

Enable developers to instrument their web applications with minimal setup and zero initial requests to configuration endpoints.

## Requirements

### Validated

- ✓ Remote configuration logic extracted to standalone package (`@datadog/browser-remote-config`) — Milestone 1
- ✓ Customers can fetch remote configuration independently using the remote-config package — Milestone 1
- ✓ All SDK tests passing with remote config extraction — Milestone 1
- ✓ TypeScript types properly exported and maintained — Milestone 1

### Active

**Milestone 2: Remote Config CDN Bundle**

- [ ] Create Node.js tool that generates bundled SDK + config code
- [ ] Package includes both SDK code and remote configuration as single script
- [ ] Customers can embed generated script before SDK loads
- [ ] Zero additional requests needed beyond initial script load
- [ ] Support both rum and rum-slim variants
- [ ] Datadog hosts official endpoint for convenient access
- [ ] Customers can self-host using the package

### Out of Scope

- Real-time config updates in v2 — deferred to future milestone for simplicity
- Mobile SDK variants — web-focused for v2
- Multi-region optimization — can improve after v1 launch

## Context

This SDK evolved from a monolithic codebase. Recent work (Milestone 1) extracted remote configuration into `@datadog/browser-remote-config` package, enabling independent use but requiring a separate request to fetch config before SDK initialization.

Milestone 2 builds on this extraction by creating a code generation tool that allows customers to pre-generate SDK + config bundles, eliminating the fetch request entirely.

**Current environment:**
- Yarn v4 workspace monorepo with packages: core, rum-core, rum, rum-slim, logs, etc.
- Playwright E2E testing framework
- TypeScript with strict mode
- Monolithic V6 → V7 major version transition in progress

## Constraints

- **Backward compatibility**: SDK API must remain stable; no breaking changes to public init methods
- **Bundle size**: Generated bundles should not bloat significantly beyond separate SDK + config
- **Build tooling**: Must work with standard Node.js build tools (webpack, vite, etc.)
- **Hosting**: Datadog endpoint infrastructure must be coordinated with infrastructure team

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Extract remote config to standalone package | Enable independent use by customers | ✓ Good — completed in Milestone 1 |
| Generate bundled SDK + config together | Zero-request initialization | — Pending |
| Support both rum and rum-slim variants | Customer choice for bundle size | — Pending |
| Datadog-hosted + self-hosted options | Convenience + flexibility | — Pending |

---
*Last updated: 2026-02-04 after starting Milestone 2 planning*
