# SF Experience App

Salesforce DX project used to exercise browser-sdk behavior in a Salesforce Experience Cloud (Digital
Experiences / LWR) site.

This app deploys to the same org as `sf-lwc-app` (alias `sf-lwc-ci`), site "SF Experience Cloud App".

## What It Contains

- Two Lightning Web Components, `experienceHomeActions` (on the Home page) and
  `experienceProductExplorer` (on the "Product Explorer" page).
- An `experienceDatadogInit` Lightning Web Component that loads and initializes the local `datadog_rum_slim` static
  resource only when the page URL contains `?init=true`, using default `xxx` credentials overridden by
  `window.RUM_CONFIGURATION`.

## Authentication

Same JWT-based flow as `sf-lwc-app`: `yarn salesforce:deploy-app --app experience-cloud` and
`yarn salesforce:get-url --app experience-cloud`.
Credentials are set as CI variables; for local overrides, set the matching environment variables from
`.env.example` at the repository root.

## Deploy

```sh
yarn salesforce:deploy-app --app experience-cloud
```

This deploys the LWC bundles and publishes the "SF Experience Cloud App" site, so changes go live.

The deploy does not currently source-control the Experience Builder theme metadata for this app. To initialize RUM on
all pages, add `Experience Datadog Init` once to the shared theme/header region in Experience Builder. In
ExperienceBundle source, the equivalent is adding a `c:experienceDatadogInit` component to the active theme's
`themeHeader` region for each layout type used by the site, like the shared theme wiring in
`salesforce/ebikes-lwc/force-app/main/default/experiences/E_Bikes1/themes/jepson.json`.

## Open The Site

```sh
yarn salesforce:get-url --app experience-cloud
```

The site is configured for unauthenticated/public access, so the published URL
(`https://datadog--engrumdev.sandbox.my.site.com/sfexperiencecloud/`) is also reachable directly without going
through this authenticated flow.
