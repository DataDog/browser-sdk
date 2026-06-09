# Salesforce DX App — E2E Test Fixture

This Salesforce DX project is the test fixture deployed to a Salesforce org during E2E tests. It contains:

- **`force-app/main/default/lwc/datadogInit/`** — A Lightning Web Component that loads the Datadog RUM SDK from a Salesforce Static Resource and initializes it with the E2E intake proxy passed in the URL hash.
- **`force-app/main/default/staticresources/`** — Holds the generated RUM slim bundle that gets deployed as a Salesforce Static Resource.

## How it works

Salesforce tests are part of the regular Playwright E2E suite. The setup is:

1. **Build** — `yarn build:apps --app salesforce` bundles `browser-rum-slim`, writes it to `staticresources/` as `datadogRumSf_<runId>_<attempt>_<sha>.resource`, deploys it with the LWC, and writes `.e2e-config.json`.
2. **Test** — `yarn test:e2e` uses the normal E2E local servers and `IntakeRegistry`. Before navigating to Salesforce, the test creates or updates a Salesforce Trusted URL for the actual local intake origin, such as `http://localhost:9234`, with `connect-src` enabled.
3. **Navigate** — Playwright uses frontdoor authentication and passes `dd_sf_e2e` in the URL hash. The LWC reads the static resource name, version, and intake proxy from that hash, then calls `DD_RUM.init()`.
4. **Assert** — Salesforce scenarios assert on the shared `intakeRegistry`, the same way the other E2E tests do.
5. **Cleanup** — Generated static resource files are removed locally after deployment. Stale generated Salesforce static resources and Trusted URLs are deleted by TTL.

## Local development

```bash
# Build and deploy the Salesforce test fixture
yarn build:apps --app salesforce

# Run only Salesforce E2E tests through the normal E2E config
yarn test:e2e -g "Salesforce Lightning"

# Skip the bundle build step during deploy (reuse existing bundle)
SKIP_BUNDLE_BUILD=1 yarn build:apps --app salesforce
```

The Salesforce CLI state directories (`.sf/`, `.sfdx/`) and `.e2e-config.json` are cleaned up or gitignored.
