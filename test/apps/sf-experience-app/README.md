# SF Experience App

Salesforce DX project used to exercise browser-sdk behavior in a Salesforce Experience Cloud (Digital
Experiences / LWR) site.

This app deploys to the same org as `sf-lwc-app` (alias `sf-lwc-ci`), site **SF Experience Cloud App**.

## Objective

Test Datadog RUM in [Experience Cloud](https://help.salesforce.com/s/articleView?id=experience.networks_overview.htm&type=5)
using two initialization approaches:

1. **Head markup** — inject the SDK in the LWR template
   ([docs](https://developer.salesforce.com/docs/atlas.en-us.exp_cloud_lwr.meta/exp_cloud_lwr/template_differences_markup.htm))
2. **`experienceDatadogInit` LWC** — load the RUM Salesforce bundle from a static resource and start views on SPA navigation

## What It Contains

- `experienceHomeActions` and `experienceProductExplorer` — page components for manual RUM testing
- `experienceDatadogInit` — loads `datadog_rum_salesforce` and initializes RUM when the URL contains `?init=true`
- `datadog_rum_salesforce` static resource metadata (the `.js` bundle is gitignored and produced by the build)
- `browser_intake_datadoghq_com` CSP trusted site metadata (US1 intake endpoint)

For the canonical RUM integration setup, see
`[packages/browser-rum-slim/src/salesforce/README.md](../../../packages/browser-rum-slim/src/salesforce/README.md)`
and `[test/apps/sf-lwc-app/README.md](../sf-lwc-app/README.md)`.

## Authentication And URLs

Deploy uses the same JWT-based flow as `sf-lwc-app`:

```sh
yarn salesforce:deploy-apps --app experience-cloud
```

Credentials are set as CI variables; for local overrides, set the matching environment variables from
`.env.example` at the repository root.

## Deploy

Build the RUM Salesforce bundle, deploy metadata, and publish the site:

```sh
yarn build:apps --app sf-experience-app
yarn salesforce:deploy-apps --app experience-cloud
```

`yarn salesforce:deploy-apps --app experience-cloud` deploys LWC bundles and publishes **SF Experience
Cloud App** so changes go live.

## Local Bundle

Regular test runs do not deploy the current SDK bundle to Salesforce. To refresh the static resource
locally without deploying:

```sh
yarn build:apps --app sf-experience-app
```

This copies the locally built RUM Salesforce bundle into the gitignored
`force-app/main/default/staticresources/datadog_rum_salesforce.js` file. Playwright fulfills Salesforce
static resource requests with this local file during E2E tests.

## Open The Site

```sh
yarn salesforce:get-urls --app experience-cloud
```

The site is configured for unauthenticated/public access, so this prints the published URL directly:
`https://datadog--engrumdev.sandbox.my.site.com/sfexperiencecloud/`.

Append `?init=true` to enable the `experienceDatadogInit` component.

E2E tests don't use this script: they build their own URL via the JWT/REST flow in
`test/e2e/lib/framework/buildSalesforceUrl.ts`, and inject the RUM configuration on the page as
`window.RUM_CONFIGURATION`.

## Run E2E Tests

Build the SDK and test apps, then run the Salesforce scenario:

```sh
yarn build
yarn build:apps --app sf-experience-app
yarn test:e2e --project=chromium --grep salesforce
```
