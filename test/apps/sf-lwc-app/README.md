# SF LWC App

Salesforce DX project used to exercise browser-sdk behavior in a real Lightning Web Components runtime.

This app is Lightning-only.

## What It Contains

- A Lightning app named `SF LWC App`
- A trimmed Home page with Datadog test controls
- A `Product Explorer` app page with three hardcoded editable products
- `c:datadogInit` in the utility bar, backed by the `datadog_rum_slim` static resource

## Authentication

The Salesforce flow uses the Salesforce CLI. Authenticate once, then deploy/open/test through the CLI alias.

Credentials are set as CI variables.

For local overrides, set the matching environment variables from the repository root:

```sh
export SF_LWC_CLIENT_ID='<connected-app-client-id>'
export SF_LWC_USERNAME='<salesforce-username>'
export SF_LWC_INSTANCE_URL='https://test.salesforce.com'
export SF_LWC_JWT_PRIVATE_KEY_B64='<base64-encoded-private-key>'
```

Then authenticate the default `sf-lwc-ci` alias:

```sh
yarn salesforce:auth
```

## Initial App Deploy

The full app deploy is only needed when Salesforce metadata changes or the org is being prepared from scratch:

```sh
yarn salesforce:deploy-app
```

This builds the local RUM slim bundle, copies it to the stable `datadog_rum_slim` static resource, and deploys the app metadata.

## Local Bundle

After the app exists in the org, regular test runs do not deploy the current SDK bundle to Salesforce.
Build the test apps from the repository root instead:

```sh
yarn build:apps --app sf-lwc-app
```

This copies the locally built RUM slim bundle into the ignored stable `datadog_rum_slim` static resource file.
Playwright fulfills Salesforce static resource requests with this local file during E2E tests.

## Open The App

Print an authenticated URL for the app:

```sh
yarn salesforce:open
```

The printed URL is authenticated and should be treated as sensitive.
During E2E tests, the test setup calls this script with `--proxy` after the local intake server is available, so the generated Salesforce URL includes the `c__datadogInitConfiguration` query parameter.

To open the same app directly in your browser:

```sh
sf org open --target-org sf-lwc-ci --path /lightning/app/c__SF_LWC_App/page/home
```

## Run E2E Tests

Build the SDK and test apps, then run the Salesforce scenario:

```sh
yarn build
yarn build:apps --app sf-lwc-app
FORCE_COLOR=1 PW_BROWSER=chromium yarn test:e2e --project=chromium --grep salesforce
```

## CI

The regular `e2e` job runs the Salesforce scenario in the Chromium matrix entry only. It authenticates `sf-lwc-ci`, opens the deployed Salesforce app, and serves the locally built SDK bundle through Playwright route fulfillment instead of deploying a bundle to Salesforce for each run.
