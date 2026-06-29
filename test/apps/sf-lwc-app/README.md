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
node scripts/salesforce-lwc-app.ts auth
```

All Salesforce commands default to `sf-lwc-ci`. To use another authenticated alias, set `SF_TARGET_ORG` for the command.

## Initial App Deploy

The full app deploy is only needed when Salesforce metadata changes or the org is being prepared from scratch:

```sh
yarn salesforce:deploy-app
```

This builds the local RUM slim bundle, copies it to the stable `datadog_rum_slim` static resource, deploys the app metadata, and assigns the `SF_LWC_App` permission set.

## Bundle Deploy

After the app exists in the org, deploy only the current RUM slim bundle with:

```sh
yarn salesforce:deploy-bundle
```

This builds the local RUM slim bundle, deploys it as a content-hashed static resource, for example `datadog_rum_slim_012345abcdef`, and writes that resource name to `.sf-e2e/resource-name`.

Tests can load a different deployed bundle by opening Salesforce with `c__datadogResourceName=<resourceName>` in the query string. If the query parameter is absent, `c:datadogInit` falls back to the stable `datadog_rum_slim` static resource.

## Open The App

Open the app with the current hashed resource:

```sh
yarn salesforce:open
```

The printed URL is authenticated and should be treated as sensitive. It opens the app with RUM query parameters shaped like:

```text
/lightning/app/c__SF_LWC_App/page/home?c__datadogResourceName=<resourceName>&c__applicationId=<applicationId>&c__clientToken=<clientToken>&c__env=dev&c__service=browser-sdk-salesforce-e2e&c__site=datadoghq.com
```

To open the app without the generated query parameters:

```sh
sf org open --target-org sf-lwc-ci --path /lightning/app/c__SF_LWC_App/page/home
```

## Run E2E Tests

Deploy the current bundle, then run the Salesforce scenario:

```sh
yarn salesforce:deploy-bundle
FORCE_COLOR=1 PW_BROWSER=chromium yarn test:e2e --project=chromium --grep @salesforce
```

## CI

The `salesforce-e2e` job retrieves Salesforce credentials through `scripts/lib/secrets.ts`, authenticates `sf-lwc-ci`, deploys only the generated hashed bundle, and runs the `@salesforce` Playwright scenario. The regular `e2e` matrix excludes `@salesforce`.