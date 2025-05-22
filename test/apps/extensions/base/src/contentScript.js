import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  applicationId: '1234',
  clientToken: 'abcd',
  // `site` refers to the Datadog site parameter of your organization
  // see https://docs.datadoghq.com/getting_started/site/
  site: 'datad0g.com',
  defaultPrivacyLevel: 'allow',
  trackResources: true,
  trackLongTasks: true,
  allowUntrustedEvents: true,
  /* EXTENSION_INIT_PARAMETER */
})

// The above tag is to find and replace on build.
