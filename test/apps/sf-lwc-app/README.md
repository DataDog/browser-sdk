# SF LWC App

Salesforce DX project used to exercise browser-sdk behavior in a real Lightning Web Components runtime.

This app is Lightning-only.

## What It Contains

- A Lightning app named `SF LWC App`
- A trimmed Home page with Datadog test controls
- A `Product Explorer` app page with three hardcoded editable products
- `c:datadogInit` in the utility bar, backed by the `datadog_rum_slim` static resource

## Authentication

The Salesforce flow uses the Salesforce CLI with a JWT keypair. There is no separate manual auth step: `yarn salesforce:deploy-app` and `yarn salesforce:get-url` always (re-)authenticate the `sf-lwc-ci` alias before running, since the JWT private key file used for authentication is deleted right after login and can't be reused to refresh a cached session.

Credentials are set as CI variables.

For local overrides, set the matching environment variables from the repository root:

```sh
export SF_LWC_CLIENT_ID='<connected-app-client-id>'
export SF_LWC_USERNAME='<salesforce-username>'
export SF_LWC_INSTANCE_URL='https://test.salesforce.com'
export SF_LWC_JWT_PRIVATE_KEY_B64='<base64-encoded-private-key>'
```

## Initial App Deploy

The full app deploy is only needed when Salesforce metadata changes or the org is being prepared from scratch:

```sh
yarn salesforce:deploy-app
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
yarn salesforce:get-url
```

The printed URL is authenticated and should be treated as sensitive.
E2E tests don't use this script: they build their own authenticated URL via the JWT/REST flow in
`test/e2e/lib/framework/buildSalesforceLwcUrl.ts`, and inject the RUM configuration on the page as
`window.dd_RUM_CONFIGURATION` instead of a URL query parameter (see `datadogInit.js`).

To open the same app directly in your browser:

```sh
sf org open --target-org sf-lwc-ci --path /lightning/app/c__SF_LWC_App/page/home
```

## Run E2E Tests

Build the SDK and test apps, then run the Salesforce scenario:

```sh
yarn build
yarn build:apps --app sf-lwc-app
yarn test:e2e --project=chromium --grep salesforce
```