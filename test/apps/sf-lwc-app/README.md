# SF LWC App

Salesforce DX project used to exercise browser-sdk behavior in a real Lightning Web Components runtime.

This app is Lightning-only.

## What It Contains

- A Lightning app named `SF LWC App`
- A trimmed Home page with Datadog test controls
- A `Product Explorer` app page with three hardcoded editable products
- `c:datadogInit` in the utility bar, backed by the `datadog_rum_slim` static resource

## Deploy

From this directory:

```sh
npm run setup -- -o engrumdev --ignore-conflicts
```

The setup script copies the local RUM slim bundle into the static resource, deploys the app, assigns the app permission set to the target user, and prints the Home URL.

If prompted for a user. Log into 1Password and use `beltran.bulbarella@datadoghq.com.engrumdev`
