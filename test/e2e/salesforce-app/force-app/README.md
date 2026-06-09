# Salesforce DX App — E2E Test Fixture

This Salesforce DX project is the test fixture deployed to a Salesforce org during E2E tests. It contains:

- **`force-app/main/default/lwc/datadogInit/`** — A Lightning Web Component that loads the Datadog RUM SDK from a Salesforce Static Resource and wires up a bridge callback (`window.__ddBrowserSdkExtensionCallback`) so Playwright can intercept RUM events from the Node process.
- **`force-app/main/default/staticresources/`** — Holds the generated RUM slim bundle that gets deployed as a Salesforce Static Resource.

## How it works in CI

Each test run (or parallel CI shard) needs its own copy of the SDK bundle deployed to Salesforce so runs don't interfere with each other. The flow, orchestrated by `scripts/salesforce/run.ts`, is:

1. **Build** — `browser-rum-slim` is bundled and written to `staticresources/` as `datadogRumSf_<runId>_<attempt>_<sha>.resource`.
2. **Deploy** — The LWC component and the generated static resource are deployed to the target Salesforce org (`SF_ORG_ALIAS`, defaults to `engrumdev`).
3. **Test** — Playwright navigates to Salesforce pages. The test setup passes `dd_sf_e2e=<resourceName>:<sha>` in the URL hash, which tells `datadogInit` which static resource to load. Tests wait until a RUM event with the matching `sha` is received before asserting, guaranteeing they exercise the freshly deployed bundle.
4. **Cleanup** — The generated static resource files are removed from the local DX source tree. At the end of the run, stale generated resources older than `DD_SALESFORCE_E2E_STATIC_RESOURCE_TTL_HOURS` (default 24 h) are deleted from the org.

## Local development

```bash
# Run full flow (build + deploy + test)
yarn test:e2e:salesforce

# Skip deploy and reuse the last deployed resource
yarn test:e2e:salesforce --skip-deploy

# Skip the bundle build step (reuse existing bundle)
SKIP_BUNDLE_BUILD=1 yarn test:e2e:salesforce
```

The Salesforce CLI state directories (`.sf/`, `.sfdx/`) are cleaned up automatically after each run and are gitignored.
