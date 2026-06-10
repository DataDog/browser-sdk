# SF LWC App

Salesforce DX project used to exercise browser-sdk behavior in a real Lightning Web Components runtime.

This app is Lightning-only.

## What It Contains

- A Lightning app named `SF LWC App`
- A trimmed Home page with Datadog test controls
- A `Product Explorer` app page with three hardcoded editable products
- `c:datadogInit` in the utility bar, backed by the `datadog_rum_slim` static resource

## Initial Setup

From the repository root:

```sh
yarn setup:sf-lwc-app -o engrumdev --ignore-conflicts
```

The setup script builds the local RUM slim bundle, copies it to the stable `datadog_rum_slim` static resource, deploys the app, assigns the permission set, deploys a content-hashed Datadog RUM static resource, for example `datadog_rum_slim_012345abcdef`, then prints a Home URL that loads that hashed resource.

e.g: https://datadog--engrumdev.sandbox.lightning.force.com/lightning/page/home?c__datadogResourceName=datadog_rum_slim_7ba7fc5a2990

## Bundle Deploy

After the app exists in the org, deploy only the current RUM slim bundle with:

```sh
yarn deploy:sf-lwc-bundle -o engrumdev --ignore-conflicts
```

This skips the full app deploy and deploys the generated content-hashed static resource.

Tests can load a different deployed bundle by opening Salesforce with `c__datadogResourceName=<resourceName>` in the query string. If the query parameter is absent, `c:datadogInit` falls back to the stable `datadog_rum_slim` static resource.

If prompted for a user. Log into 1Password and use `beltran.bulbarella@datadoghq.com.engrumdev`
