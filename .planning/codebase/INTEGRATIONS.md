# External Integrations

**Analysis Date:** 2026-01-21

## APIs & External Services

**Datadog Intake API:**
- Service: Datadog telemetry ingestion endpoints
  - SDK/Client: Custom `httpRequest` implementation in `packages/core/src/transport/httpRequest.ts`
  - Endpoints: `/api/v2/{logs|rum|replay|profile|exposures|flagevaluation}`
  - Auth: Client token via query parameter (`dd-api-key`)
  - Sites supported: Multiple regions (US1, US3, US5, EU1, AP1, AP2, GovCloud)
  - Default site: `datadoghq.com` (US1)
  - PCI compliance: Special intake host for PCI-compliant logs (`pci.browser-intake-datadoghq.com`)

**Remote Configuration:**
- Service: Datadog remote configuration API
  - Implementation: `packages/rum-core/src/domain/configuration/remoteConfiguration.ts`
  - Purpose: Dynamic feature flag and configuration updates

**Session Replay:**
- Service: Datadog Session Replay ingestion
  - Endpoint: `/api/v2/replay`
  - Compression: Deflate encoding via Web Workers
  - Worker implementation: `packages/worker/src/boot/startWorker.ts`

**Proxy Support:**
- Custom proxy configuration available
  - String proxy: URL-based forwarding with `ddforward` parameter
  - Function proxy: Custom request transformation

## Data Storage

**Databases:**
- None - This is a client-side SDK

**Browser Storage:**
- Cookies
  - Implementation: `packages/core/src/browser/cookie.ts`
  - Usage: Session management, user tracking
  - Options: Secure, SameSite, cross-site, partitioned, domain configuration
  - Cookie names managed by SDK (session IDs, configuration)

**File Storage:**
- Local filesystem only (for development/testing)
- No cloud storage services used by SDK

**Caching:**
- Browser-native caching only
- No external caching services

## Authentication & Identity

**Auth Provider:**
- Custom (Datadog client token authentication)
  - Implementation: Token passed via initialization configuration
  - Transmitted as query parameter (`dd-api-key`)
  - No OAuth or third-party auth services

**Session Management:**
- Cookie-based sessions
  - Session manager: `packages/rum-core/src/domain/rumSessionManager.spec.ts`
  - Tracks user sessions across page loads
  - Configurable session timeout and renewal

## Monitoring & Observability

**Error Tracking:**
- Self-monitoring via Datadog RUM
  - Implementation: `packages/core/src/tools/monitor.ts`
  - Reports SDK errors to configured Datadog instance

**Logs:**
- Custom logging to Datadog Logs API
  - Package: `@datadog/browser-logs`
  - Endpoint: `/api/v2/logs`

**Telemetry:**
- Internal telemetry tracking
  - Types: `packages/core/src/domain/telemetry/telemetryEvent.types.ts`
  - Tracks SDK performance and usage metrics

## CI/CD & Deployment

**Hosting:**
- NPM Registry - Published packages
  - Org: `@datadog/*`
  - Public access for all packages
- Chrome Web Store - Developer extension
  - Upload script: `scripts/deploy/publish-developer-extension.ts`
  - Package: `chrome-webstore-upload` 4.0.3

**CI Pipeline:**
- GitLab CI (primary)
  - Config: `.gitlab-ci.yml`
  - Docker image: `registry.ddbuild.io/ci/browser-sdk:97`
  - Stages: test, browserstack, pre-deploy, deploy, notify
- GitHub Actions (auxiliary)
  - Workflows: CLA, CodeQL, docs deployment, Confluence changelog sync

**Source Maps:**
- Upload to Datadog
  - Script: `scripts/deploy/upload-source-maps.ts`
  - Purpose: Error debugging in production

**BrowserStack:**
- Service: Cross-browser testing platform
  - Client: `browserstack-local` 1.5.8
  - Wrapper: `scripts/test/bs-wrapper.ts`
  - Karma config: `test/unit/karma.bs.conf.js`
  - Playwright config: `test/e2e/playwright.bs.config.ts`

## Environment Configuration

**Required env vars:**
- `DD_API_KEY` or client token - For Datadog intake authentication
- `BROWSERSTACK_USERNAME` - BrowserStack authentication
- `BROWSERSTACK_ACCESS_KEY` - BrowserStack authentication
- Build environment variables injected at compile time (SDK version)

**Secrets location:**
- GitLab CI variables (for deployment)
- Local environment for development
- No `.env` files in repository

## Webhooks & Callbacks

**Incoming:**
- None - Client-side SDK only

**Outgoing:**
- Datadog Intake API endpoints (POST requests)
  - `/api/v2/rum` - RUM events
  - `/api/v2/logs` - Log events
  - `/api/v2/replay` - Session replay segments
  - `/api/v2/profile` - Profiling data
  - `/api/v2/exposures` - Feature flag exposures
  - `/api/v2/flagevaluation` - Feature flag evaluations

**Request Strategies:**
- `fetch` with keepalive - Primary method
- `fetch` without keepalive - Experimental feature fallback
- `sendBeacon` - For page exit events
- Retry strategy: `packages/core/src/transport/sendWithRetryStrategy.ts`

## Third-Party Integrations

**React:**
- Integration package: `@datadog/browser-rum-react`
- Supports React Router v6 and v7
- Automatic view tracking for SPAs

**UI Libraries (Developer Extension):**
- Mantine Core 8.3.12 - UI component library
- Tabler Icons 3.36.1 - Icon set

**CI Visibility:**
- Integration detection: `packages/rum-core/src/domain/contexts/ciVisibilityContext.ts`
- Reads CI environment variables and cookies

**Synthetics:**
- Datadog Synthetics detection
  - Context: `packages/rum-core/src/domain/contexts/syntheticsContext.spec.ts`
  - Special handling for synthetic browser tests

---

*Integration audit: 2026-01-21*
