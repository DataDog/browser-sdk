# SF LWC App

Salesforce DX project used to exercise browser-sdk behavior in a real Lightning Web Components runtime.

This app is Lightning-only.

## What It Contains

- A Lightning app named `SF LWC App`
- A trimmed Home page with Datadog test controls
- A `Product Explorer` app page with three hardcoded editable products
- `c:datadogInit` in the utility bar, backed by the `datadog_rum_slim` static resource

## Authentication

The Salesforce flow uses the Salesforce CLI with a JWT keypair. There is no separate manual auth step: `yarn salesforce:deploy-apps` and `yarn salesforce:get-urls` always (re-)authenticate the `sf-lwc-ci` alias before running, since the JWT private key file used for authentication is deleted right after login and can't be reused to refresh a cached session.

Credentials are set as CI variables.

For local overrides, set the matching environment variables from `.env.example`:

## Initial App Deploy

This app runs from Salesforce metadata already deployed to
the Salesforce org, so any change to that metadata (Apex, LWC markup/config, permission sets, etc.) requires a full
redeploy to take effect.

For E2E testing, deployment is not necesary since we will override the deployed rum_slim bundle with Playwright.

```sh
yarn salesforce:deploy-apps --app lwc
```

This builds the local RUM slim bundle, copies it to the stable `datadog_rum_slim` static resource, and deploys the app metadata.

## Local Bundle

Regular test runs do not deploy the current SDK bundle to Salesforce.
Build the test apps from the repository root instead:

```sh
yarn build:apps --app sf-lwc-app
```

This copies the locally built RUM slim bundle into the ignored stable `datadog_rum_slim` static resource file.
Playwright fulfills Salesforce static resource requests with this local file during E2E tests.

## Open The App

Print an authenticated URL for the app:

```sh
yarn salesforce:get-urls --app lwc
```

The printed URL is authenticated and should be treated as sensitive.
E2E tests don't use this script: they build their own authenticated URL via the JWT/REST flow in
`test/e2e/lib/framework/buildSalesforceLwcUrl.ts`, and inject the RUM configuration on the page as
`window.RUM_CONFIGURATION`.

## Run E2E Tests

Build the SDK and test apps, then run the Salesforce scenario:

```sh
yarn build
yarn build:apps --app sf-lwc-app
yarn test:e2e --project=chromium --grep salesforce
```
