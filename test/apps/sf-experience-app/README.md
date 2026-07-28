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

For the canonical Lightning App setup (`datadogInit` in a utility bar), see
`[packages/browser-rum-slim/src/salesforce/README.md](../../../packages/browser-rum-slim/src/salesforce/README.md)`
and `[test/apps/sf-lwc-app/README.md](../sf-lwc-app/README.md)`.

## RUM Setup

### 1. Add the static resource

Copy the Datadog RUM Salesforce bundle into the project as
`force-app/main/default/staticresources/datadog_rum_salesforce.js` and register it with
`datadog_rum_salesforce.resource-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
    <cacheControl>Public</cacheControl>
    <contentType>application/javascript</contentType>
</StaticResource>
```

### 2. Configure CSP for the Datadog intake endpoint

Experience Cloud sites enforce CSP. In **Experience Builder → Settings → Security & Privacy**:

- Change the security level from **Strict CSP** to **Relaxed CSP**
- Add the Datadog browser intake as a trusted site

| Field | Value                                  |
| ----- | -------------------------------------- |
| Name  | `browser_intake_datadoghq_com`         |
| URL   | `https://browser-intake-datadoghq.com` |

For non-US1 Datadog sites, use the intake endpoint for your site.

(In this org the CSP trusted site is already deployed by `sf-lwc-app`; we do not need to add it from this app.)

### 3. Create the Datadog init LWC

This app uses `experienceDatadogInit` (`force-app/main/default/lwc/experienceDatadogInit/`). The
component:

- Loads the `datadog_rum_salesforce` static resource via `lightning/platformResourceLoader`
- Initializes only when `?init=true` is present in the page URL
- Calls `DD_RUM.startView()` on each SPA navigation using `NavigationMixin` and `CurrentPageReference`
- Merges `window.RUM_CONFIGURATION` over default `xxx` credentials at init time

See `experienceDatadogInit.js` for the implementation. A minimal HTML template is required:

```html
<template></template>
```

Component metadata exposes the bundle to Experience Builder:

```xml
<targets>
    <target>lightningCommunity__Page</target>
    <target>lightningCommunity__Default</target>
</targets>
```

This test component does not take `applicationId` / `clientToken` as Experience Builder properties — credentials are injected at runtime via `window.RUM_CONFIGURATION`.

### 4. Add the component to the Experience Builder theme

Open the site in **Experience Builder** (Setup → Apps → App Manager → **Manage** → **Builder**) and
add **Experience Datadog Init** to a region that loads on every page (shared theme, header, footer,
or page template).

Save and **publish** the site.

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
`force-app/main/default/staticresources/datadog_rum_salesforce.js` file.

## Open The Site

```sh
yarn salesforce:get-urls --app experience-cloud
```

The site is configured for unauthenticated/public access, so this prints the published URL directly:
`https://datadog--engrumdev.sandbox.my.site.com/sfexperiencecloud/`.
Append `?init=true` to enable the `experienceDatadogInit` component.
