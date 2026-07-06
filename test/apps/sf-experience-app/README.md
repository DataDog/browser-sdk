# SF Experience App

Salesforce DX project used to exercise browser-sdk behavior in a Salesforce Experience Cloud (Digital
Experiences / LWR) site.

This app deploys to the same org as `sf-lwc-app` (alias `sf-lwc-ci`), site "SF Experience Cloud App".

## What It Contains

- Two Lightning Web Components, `experienceHomeActions` (on the Home page) and
  `experienceSecondPageActions` (on the "Actions" page).

## Authentication

Same JWT-based flow as `sf-lwc-app`: `yarn salesforce:deploy-app --app experience-cloud` and
`yarn salesforce:get-url --app experience-cloud`.
Credentials are set as CI variables; for local overrides, set the matching environment variables from
`.env.example` at the repository root.

## Deploy

```sh
yarn salesforce:deploy-app --app experience-cloud
```

This only deploys the LWC bundles.

## Open The Site

```sh
yarn salesforce:get-url --app experience-cloud
```

The site is configured for unauthenticated/public access, so the published URL
(`https://datadog--engrumdev.sandbox.my.site.com/sfexperiencecloud/`) is also reachable directly without going
through this authenticated flow.
