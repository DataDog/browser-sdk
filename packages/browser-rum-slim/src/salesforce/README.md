# Salesforce Integration

## Overview

Instrument Salesforce Lightning Apps and Experience Cloud sites with Datadog Real User Monitoring using the Datadog RUM Salesforce bundle.

The integration supports Lightning Apps, Experience Cloud Head Markup, and Experience Cloud components. Use only one deployment path per Salesforce app or Experience Cloud site.

## Setup

### Prerequisites

Before you begin, gather the following Datadog RUM values:

- A Datadog RUM Application ID
- A Datadog RUM Client Token
- A Datadog site, such as `datadoghq.com`

You can get those values in Datadog under **Digital Experience > Real User Monitoring > Manage Applications > Set Up Manually**.

You should also enable [Lightning Web Security][1] in the Salesforce org.

### Installation

All deployment paths share the first two steps. Complete them once before configuring a deployment path.

#### 1. Add Static Resource

[Download the Datadog RUM Salesforce bundle][2], then register it as the `datadog_rum` static resource. For example, download it into your project's static resources directory with:

```shell
curl -o staticresources/datadog_rum.js https://www.datadoghq-browser-agent.com/us1/v7/datadog-rum-salesforce.js
```

<!-- xxx tabs xxx -->
<!-- xxx tab "Project metadata" xxx -->

##### Project metadata

Use this option when your Salesforce project is managed from source control. Commit the metadata file with the downloaded bundle.

`staticresources/datadog_rum.resource-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
  <cacheControl>Public</cacheControl>
  <contentType>application/javascript</contentType>
</StaticResource>
```

<!-- xxz tab xxx -->
<!-- xxx tab "Salesforce UI" xxx -->

##### Salesforce UI

Use this option when you configure the static resource directly in Salesforce Setup.

1. Go to **Setup > Static Resources**.
2. Click **New**.
3. Set **Name** to `datadog_rum`.
4. Upload the downloaded RUM JavaScript bundle.
5. Set **Cache Control** to **Public**, then save.

<!-- xxz tab xxx -->
<!-- xxz tabs xxx -->

#### 2. Configure CSP

Allow Salesforce to connect to the Datadog browser intake endpoint for your [Datadog site][4].

<!-- xxx tabs xxx -->
<!-- xxx tab "Project metadata" xxx -->

##### Project metadata

Use this option when your Salesforce project is managed from source control.

`cspTrustedSites/browser_intake_datadoghq_com.cspTrustedSite-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<CspTrustedSite xmlns="http://soap.sforce.com/2006/04/metadata">
  <context>All</context>
  <description>Datadog browser RUM intake for US1</description>
  <endpointUrl>https://browser-intake-datadoghq.com</endpointUrl>
  <isActive>true</isActive>
  <isApplicableToConnectSrc>true</isApplicableToConnectSrc>
</CspTrustedSite>
```

For non-US1 Datadog sites, update `endpointUrl` to match the correct Datadog browser intake endpoint for your region.

<!-- xxz tab xxx -->
<!-- xxx tab "Salesforce UI" xxx -->

##### Salesforce UI

Use this option when you configure the trusted endpoint directly in Salesforce Setup.

1. Go to **Setup > Security > Trusted URLs**.
2. Click **New Trusted URL**.
3. Set **API Name** to `browser_intake_datadoghq_com`.
4. Set **URL** to `https://browser-intake-datadoghq.com` for US1. For other regions, use the endpoint for your [Datadog site][4].
5. Make sure **Active** is checked.
6. Set **CSP Context** to **All**.
7. Under **CSP Directives**, check **connect-src (scripts)**, then save.

<!-- xxz tab xxx -->
<!-- xxz tabs xxx -->

### Configuration

Choose the deployment path that matches your Salesforce app or Experience Cloud site.

<!-- xxx tabs xxx -->
<!-- xxx tab "Lightning App Utility Bar" xxx -->

#### Lightning App Utility Bar

Use for Salesforce Lightning Apps. This path loads a Datadog initializer LWC from the Utility Bar.

##### 1. Create Init Component

Create a Lightning Web Component that loads the Datadog Browser SDK and manually starts views as users navigate within the Lightning application.

A Lightning Web Component bundle requires an HTML template. Create the following file first.

File location: `lwc/datadogInit/datadogInit.html`

```html
<template></template>
```

Create the component JavaScript at `lwc/datadogInit/datadogInit.js`:

```javascript
import { LightningElement, api, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRum from '@salesforce/resourceUrl/datadog_rum'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

export default class DatadogInit extends NavigationMixin(LightningElement) {
  @api applicationId
  @api clientToken
  @api site
  @api service
  @api env

  connectedCallback() {
    this.initialize()
  }

  @wire(CurrentPageReference)
  handleCurrentPageReference(pageReference) {
    if (!pageReference) {
      return
    }

    this.initialize()

    if (window.DD_RUM) {
      this.startViewForPageReference(pageReference)
    }
  }

  startViewForPageReference(pageReference) {
    const urlPromise = this[NavigationMixin.GenerateUrl](pageReference)
    urlPromise.then((url) => {
      if (url === lastStartedUrl) {
        return
      }
      lastStartedUrl = url
      const absoluteUrl = new URL(url, window.location.origin).href
      window.DD_RUM.startView({ name: url, url: absoluteUrl })
    })
  }

  initialize() {
    if (!datadogInitialization) {
      datadogInitialization = this.loadDatadogRum()
    }
  }

  loadDatadogRum() {
    return loadScript(this, datadogRum).then(() => {
      const initConfig = {
        applicationId: this.applicationId,
        clientToken: this.clientToken,
        env: this.env,
        service: this.service,
        site: this.site,
        sessionSampleRate: 100,
        trackViewsManually: true,
        trackLongTasks: true,
        trackResources: true,
        trackUserInteractions: true,
      }
      window.DD_RUM.init(initConfig)
      lastStartedUrl = window.location.pathname + window.location.search + window.location.hash
      window.DD_RUM.startView({
        name: lastStartedUrl,
        url: window.location.href,
      })
    })
  }
}
```

##### 2. Add to Utility Bar

Expose the component to the Lightning Utility Bar, then add it to your app's Utility Bar with `eager` set to `true`.

`lwc/datadogInit/datadogInit.js-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
  <apiVersion>64.0</apiVersion>
  <isExposed>true</isExposed>
  <masterLabel>Datadog Init</masterLabel>
  <targets>
    <target>lightning__UtilityBar</target>
  </targets>
  <targetConfigs>
    <targetConfig targets="lightning__UtilityBar">
      <property name="applicationId" type="String" label="Application ID" required="true" />
      <property name="clientToken" type="String" label="Client Token" required="true" />
      <property name="site" type="String" label="Site" />
      <property name="service" type="String" label="Service" />
      <property name="env" type="String" label="Env" />
    </targetConfig>
  </targetConfigs>
</LightningComponentBundle>
```

Add the following `componentInstance` excerpt to your app's existing Utility Bar FlexiPage metadata, for example in `flexipages/MyApp_UtilityBar.flexipage-meta.xml`.

```xml
<componentInstance>
  <componentInstanceProperties>
    <name>eager</name>
    <type>decorator</type>
    <value>true</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>applicationId</name>
    <type>String</type>
    <value>YOUR_DATADOG_APPLICATION_ID</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>clientToken</name>
    <type>String</type>
    <value>YOUR_DATADOG_CLIENT_TOKEN</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>site</name>
    <type>String</type>
    <value>YOUR_DATADOG_SITE</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>service</name>
    <type>String</type>
    <value>YOUR_SERVICE_NAME</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>env</name>
    <type>String</type>
    <value>YOUR_ENV_NAME</value>
  </componentInstanceProperties>
  <componentName>datadogInit</componentName>
  <identifier>datadogInit</identifier>
</componentInstance>
```

<!-- xxz tab xxx -->
<!-- xxx tab "Experience Cloud Head Markup" xxx -->

#### Experience Cloud Head Markup

Use when you can edit Head Markup. This is the most direct Experience Cloud setup.

**Relax CSP in Experience Builder**

1. Open the site in Experience Builder from **Setup > Digital Experiences > All Sites > Builder**.
2. Go to **Settings > Security & Privacy**.
3. Change the security level from **Strict CSP** to **Relaxed CSP**.

##### 1. Add Head Markup

In Experience Builder, go to **Settings > Advanced > Edit Head Markup**, paste the following script, and replace the placeholder values with your Datadog RUM configuration. Save the change, then publish the site.

```html
<script src="/sfsites/c/resource/datadog_rum"></script>
<script>
  window.DD_RUM.onReady(function () {
    window.DD_RUM.init({
      applicationId: '<YOUR_DATADOG_APPLICATION_ID>',
      clientToken: '<YOUR_DATADOG_CLIENT_TOKEN>',
      env: '<YOUR_ENV_NAME>',
      service: '<YOUR_SERVICE_NAME>',
      site: '<YOUR_DATADOG_SITE>',
      sessionSampleRate: 100,
      trackLongTasks: true,
      trackResources: true,
      trackUserInteractions: true,
    })
  })
</script>
```

<!-- xxz tab xxx -->
<!-- xxx tab "Experience Cloud Component" xxx -->

#### Experience Cloud Component

Place an initializer LWC in a shared site region.

##### 1. Create Init Component

Create an LWC that loads the Datadog Browser SDK and manually starts views as users navigate within the Experience Cloud site.

A Lightning Web Component bundle requires an HTML template.

File location: `lwc/datadogInit/datadogInit.html`

```html
<template></template>
```

Create the component JavaScript at `lwc/datadogInit/datadogInit.js`:

```javascript
import { LightningElement, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRum from '@salesforce/resourceUrl/datadog_rum'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

export default class DatadogInit extends NavigationMixin(LightningElement) {
  connectedCallback() {
    this.initialize()
  }

  @wire(CurrentPageReference)
  handleCurrentPageReference(pageReference) {
    if (!pageReference) {
      return
    }

    this.initialize()

    if (window.DD_RUM) {
      this.startViewForPageReference(pageReference)
    }
  }

  startViewForPageReference(pageReference) {
    const urlPromise = this[NavigationMixin.GenerateUrl](pageReference)
    urlPromise.then((url) => {
      if (url === lastStartedUrl) {
        return
      }
      lastStartedUrl = url
      const absoluteUrl = new URL(url, window.location.origin).href
      window.DD_RUM.startView({ name: url, url: absoluteUrl })
    })
  }

  initialize() {
    if (!datadogInitialization) {
      datadogInitialization = this.loadDatadogRum()
    }
  }

  loadDatadogRum() {
    return loadScript(this, datadogRum).then(() => {
      const initConfig = {
        applicationId: '<YOUR_DATADOG_APPLICATION_ID>',
        clientToken: '<YOUR_DATADOG_CLIENT_TOKEN>',
        env: '<YOUR_ENV_NAME>',
        service: '<YOUR_SERVICE_NAME>',
        site: '<YOUR_DATADOG_SITE>',
        sessionSampleRate: 100,
        trackViewsManually: true,
        trackLongTasks: true,
        trackResources: true,
        trackUserInteractions: true,
      }
      window.DD_RUM.init(initConfig)
      lastStartedUrl = window.location.pathname + window.location.search + window.location.hash
      window.DD_RUM.startView({
        name: lastStartedUrl,
        url: window.location.href,
      })
    })
  }
}
```

##### 2. Add to Experience Builder

Expose the component to Experience Builder and place it in a shared region, page template, global header, global footer, or theme/layout area that loads on every page.

`lwc/datadogInit/datadogInit.js-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
  <apiVersion>64.0</apiVersion>
  <isExposed>true</isExposed>
  <masterLabel>Datadog Init</masterLabel>
  <targets>
    <target>lightningCommunity__Page</target>
    <target>lightningCommunity__Default</target>
  </targets>
</LightningComponentBundle>
```

<!-- xxz tab xxx -->
<!-- xxz tabs xxx -->

### Validate the Installation

1. Open the configured Lightning app or published Experience Cloud site in a new browser session.
2. Open browser developer tools.
3. Confirm that the Datadog static resource loads successfully and that no CSP errors appear for the Datadog browser intake endpoint.
4. Navigate between pages.
5. In Datadog RUM Explorer, filter by the configured service and env, then confirm that view events appear as you navigate.

## Salesforce Feature Support Matrix

The following table outlines SDK feature support within the Lightning Web Security (LWS) sandbox environment.

| Feature Area        | Supported   | Notes                                                                     |
| ------------------- | ----------- | ------------------------------------------------------------------------- |
| **View Events**     |             |                                                                           |
| Initial View        | Yes         | Automatic on init.                                                        |
| Manual Tracking     | Yes         | Supported through `startView`.                                            |
| Navigation Timings  | Yes         | Collected via performance API.                                            |
| Web Vitals          | Yes         |                                                                           |
| **Resource Events** |             |                                                                           |
| Fetch / XHR         | Limited (2) | Context payload inaccessible.                                             |
| Other Resources     | Yes         | CSS, images, etc.                                                         |
| APM Correlation     | Limited (2) | Requires header injection.                                                |
| **Action Events**   |             |                                                                           |
| Custom Actions      | Yes         | Supported through `addAction`. (5) Not supported on the Head Markup path. |
| Click Actions       | Yes         | (3) Shadow DOM boundaries apply.                                          |
| Frustration Signals | Yes         |                                                                           |
| Loading Time        | Limited (1) | Network detection may be incomplete.                                      |
| **Error Events**    |             |                                                                           |
| Console / Custom    | Yes         | Captured via instrumentation. (5) Not supported on the Head Markup path.  |
| Runtime Errors      | Limited (4) | Often redacted as "Script error."                                         |
| Unhandled Rejection | No          | Event not supported in LWS.                                               |
| **Other**           |             |                                                                           |
| Vital Events        | Yes         |                                                                           |
| Long Task Events    | Yes         |                                                                           |
| Session Replay      | No          | DOM/Worker constraints prevent support.                                   |

Footnotes:

1. **Loading Time**: Ends when no pending network requests are detected. LWS may hide some fetch/XHR activity.
2. **Limited Context**: Inaccessible sandbox objects mean `beforeSend` cannot access response bodies or full XHR objects.
3. **Selectors**: Due to shadow boundaries, `event.target` may reflect the component host rather than the inner element.
4. **Runtime Errors**: Errors passing through the Lightning shell may lose stack traces and original error objects.
5. **Head Markup limitation**: The Experience Cloud Head Markup path has no component context to call `addAction` or `addError`, so custom actions and custom error tracking are not supported there.

## Troubleshooting

Need help? Contact [Datadog Support][3].

[1]: https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-enable.html
[2]: https://www.datadoghq-browser-agent.com/us1/v7/datadog-rum-salesforce.js
[3]: https://docs.datadoghq.com/help/
[4]: https://docs.datadoghq.com/getting_started/site/#access-the-datadog-site
